//! Decoded pictures with a mip pyramid, in a cache with a byte budget.
//!
//! A photo of 4000 × 3000 pixels shown 300 pixels wide is a 13× downscale: reading it straight
//! from the full-size pixels strides through 48 MB for every canvas pixel and aliases. Canvas
//! previews draw it from a *level* instead, a copy reduced by a power of two ([`level_for`] picks
//! the one whose pixels are at most one screen pixel), made once from the level above it with a
//! box filter. Exports and anything at 1:1 or closer take level 0, the picture as decoded.
//!
//! The cache holds every level of every picture in one least-recently-used list under a byte
//! budget ([`budget`]), so a document of dozens of photos can't take all the memory: the big
//! level 0 of pictures out of view goes first, the small levels the view uses stay. Building a
//! level locks its picture, so the bands of a parallel render that need the same photo decode it
//! once, not once each.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use figcraft_color::{ColorProfile, ImageFilters};
use figcraft_doc::ImageData;
use tiny_skia::Pixmap;

/// Levels stop when a side would get under this many pixels.
pub const SMALLEST_SIDE: u32 = 8;
/// Never more levels than this (a 16k side halves to 8 in 11).
const MAX_LEVELS: u32 = 14;
/// A picture decoded for a level deeper than this also keeps this one (a sixteenth of the pixels):
/// a view can zoom in from far out without decoding it again, up to pictures showing at a quarter
/// of their size.
pub const FLOOR: u32 = 2;

/// The most bytes [`Cache::prefetch`] has decoding at once.
#[cfg(not(target_arch = "wasm32"))]
const PARALLEL_DECODE_BYTES: u64 = 512 << 20;

/// The bytes the cache may hold: pictures beyond it are dropped, least recently used first.
#[cfg(not(target_arch = "wasm32"))]
pub const DEFAULT_BUDGET: usize = 256 << 20;
/// The browser's tab has less to give.
#[cfg(target_arch = "wasm32")]
pub const DEFAULT_BUDGET: usize = 96 << 20;

/// The deepest level a `w` × `h` picture has: its sides stay at [`SMALLEST_SIDE`] or more.
pub fn max_level(w: u32, h: u32) -> u32 {
    let mut level = 0;
    while level < MAX_LEVELS && (w >> (level + 1)) >= SMALLEST_SIDE && (h >> (level + 1)) >= SMALLEST_SIDE {
        level += 1;
    }
    level
}

/// The level to draw a picture from when it shows at `scale` screen pixels per picture pixel: the
/// deepest one whose pixels are still at most a screen pixel (so it is never magnified), 0 for
/// anything at half size or more.
pub fn level_for(scale: f64) -> u32 {
    if !(scale.is_finite() && scale > 0.0) || scale >= 0.5 {
        return 0;
    }
    // 1 / scale > 2: the floor of its log2, exact for the powers of two themselves.
    let l = (1.0 / scale).log2().floor();
    if l.is_finite() { l.clamp(0.0, f64::from(MAX_LEVELS)) as u32 } else { 0 }
}

/// A picture level out of the cache.
#[derive(Clone)]
pub struct Picture {
    pub pixmap: Arc<Pixmap>,
    /// The level: the pixmap is the picture reduced `2^level` times.
    pub level: u32,
    /// The picture's size at level 0.
    pub full: (u32, u32),
}

impl Picture {
    /// A picture that has no levels (an animation frame, a video picture): level 0 as it is.
    pub fn whole(pixmap: Arc<Pixmap>) -> Picture {
        let full = (pixmap.width(), pixmap.height());
        Picture { pixmap, level: 0, full }
    }

    /// How many level pixels a level 0 pixel makes up: the factor from a level's pixels to the
    /// picture's.
    pub fn shrink(&self) -> f32 {
        (1u64 << self.level.min(31)) as f32
    }
}

/// What a cached picture is made from.
#[derive(Clone, Copy)]
pub struct Source<'a> {
    pub hash: &'a str,
    pub data: Option<&'a ImageData>,
    pub filters: &'a ImageFilters,
    pub profile: ColorProfile,
}

type SrcKey = (String, [i32; 7], ColorProfile);

#[derive(Clone, PartialEq, Eq, Hash)]
struct Key {
    src: SrcKey,
    level: u32,
    /// With a transparent 1-pixel border (Fit and Crop placements spread transparency).
    padded: bool,
}

struct Slot {
    pixmap: Arc<Pixmap>,
    /// When it was last used (the cache's clock).
    used: u64,
}

#[derive(Default)]
struct Inner {
    map: HashMap<Key, Slot>,
    bytes: usize,
    clock: u64,
    /// Each picture's size at level 0, kept after its pixels are dropped (so a request for a
    /// level can be clamped without decoding).
    sizes: HashMap<SrcKey, (u32, u32)>,
    /// One lock per picture being built.
    locks: HashMap<SrcKey, Arc<Mutex<()>>>,
}

/// Pictures with their mip levels under a byte budget.
pub struct Cache {
    inner: Mutex<Inner>,
    budget: usize,
}

fn fkey(f: &ImageFilters) -> [i32; 7] {
    let q = |v: f32| (v * 1000.0).round() as i32;
    [q(f.exposure), q(f.contrast), q(f.saturation), q(f.temperature), q(f.tint), q(f.highlights), q(f.shadows)]
}

fn src_key(s: &Source) -> SrcKey {
    (s.hash.to_string(), fkey(s.filters), s.profile)
}

/// The process's cache.
pub fn global() -> &'static Cache {
    static C: OnceLock<Cache> = OnceLock::new();
    C.get_or_init(|| Cache::new(DEFAULT_BUDGET))
}

impl Cache {
    pub fn new(budget: usize) -> Cache {
        Cache { inner: Mutex::new(Inner::default()), budget }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The bytes the cache holds.
    pub fn bytes(&self) -> usize {
        self.lock().bytes
    }

    /// The pictures (and levels) the cache holds.
    pub fn len(&self) -> usize {
        self.lock().map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Whether level `level` of the picture is held (unpadded).
    pub fn holds(&self, s: &Source, level: u32) -> bool {
        self.lock().map.contains_key(&Key { src: src_key(s), level, padded: false })
    }

    /// Drop everything.
    pub fn clear(&self) {
        let mut g = self.lock();
        g.map.clear();
        g.sizes.clear();
        g.bytes = 0;
    }

    /// The picture at `level` (clamped to the deepest it has), decoded, filtered and converted to
    /// the document's colour space, built and kept if it wasn't. `None` when it isn't in the
    /// document or doesn't decode.
    pub fn picture(&self, s: &Source, level: u32, padded: bool) -> Option<Picture> {
        let src = src_key(s);
        let wanted = |g: &Inner| g.sizes.get(&src).map_or(level, |(w, h)| level.min(max_level(*w, *h)));
        // Held already: the fast path every frame takes.
        {
            let mut g = self.lock();
            let level = wanted(&g);
            if let Some(p) = g.touch(&Key { src: src.clone(), level, padded }) {
                let full = g.sizes.get(&src).copied().unwrap_or((p.width() << level.min(16), p.height() << level.min(16)));
                return Some(Picture { pixmap: p, level, full });
            }
        }
        // Not held: one thread builds it, the others wait for it.
        let lock = {
            let mut g = self.lock();
            if g.locks.len() > 1024 {
                g.locks.retain(|_, l| Arc::strong_count(l) > 1);
            }
            g.locks.entry(src.clone()).or_default().clone()
        };
        let _building = lock.lock().unwrap_or_else(PoisonError::into_inner);
        let plain = self.build(s, &src, level)?;
        if !padded {
            return Some(plain);
        }
        let key = Key { src: src.clone(), level: plain.level, padded: true };
        if let Some(p) = self.lock().touch(&key) {
            return Some(Picture { pixmap: p, ..plain });
        }
        let out = Arc::new(crate::images::pad(&plain.pixmap)?);
        self.lock().insert(key, out.clone(), self.budget);
        Some(Picture { pixmap: out, ..plain })
    }

    /// The unpadded level, built from the nearest finer one held or from a decode. Called with the
    /// picture's lock held.
    ///
    /// Only the level asked for is kept, and [`FLOOR`] when it is deeper (the finer ones it was made
    /// from are dropped unless they were asked for before): the big levels are what fills a
    /// budget, and a view that needs level 5 of fifty photos has no use for their level 0. Zooming
    /// in as far as the floor makes the finer levels from it; past it decodes once more.
    fn build(&self, s: &Source, src: &SrcKey, level: u32) -> Option<Picture> {
        let (mut at, mut cur, full) = {
            let mut g = self.lock();
            let level = g.sizes.get(src).map_or(level, |(w, h)| level.min(max_level(*w, *h)));
            let key = |l: u32| Key { src: src.clone(), level: l, padded: false };
            // Held after all (built while this thread waited for the lock), or a finer level to start from.
            let found = (0..=level).rev().find_map(|l| g.touch(&key(l)).map(|p| (l, p)));
            match (found, g.sizes.get(src).copied()) {
                (Some((l, p)), Some(full)) if l == level => return Some(Picture { pixmap: p, level, full }),
                (Some((l, p)), Some(full)) => (l, p, full),
                _ => {
                    drop(g);
                    // Decoding takes a while: not with the cache locked.
                    let pm = Arc::new(decode_level0(s)?);
                    let full = (pm.width(), pm.height());
                    let mut g = self.lock();
                    if g.sizes.len() > 4096 {
                        g.sizes.clear();
                    }
                    g.sizes.insert(src.clone(), full);
                    if level == 0 {
                        g.insert(key(0), pm.clone(), self.budget);
                    }
                    (0, pm, full)
                }
            }
        };
        let level = level.min(max_level(full.0, full.1));
        if at == level {
            return Some(Picture { pixmap: cur, level, full });
        }
        while at < level {
            cur = Arc::new(reduce_half(&cur)?);
            at += 1;
            if at == FLOOR && at < level {
                self.lock().insert(Key { src: src.clone(), level: at, padded: false }, cur.clone(), self.budget);
            }
        }
        self.lock().insert(Key { src: src.clone(), level, padded: false }, cur.clone(), self.budget);
        Some(Picture { pixmap: cur, level: at, full })
    }

    /// Make level `level` of each of `list` ready, in parallel where there are threads. Decodes
    /// that would hold more than [`PARALLEL_DECODE_BYTES`] at once run in rounds: a page of
    /// 40-megapixel photos must not take a thread's worth of each at the same time.
    pub fn prefetch(&self, list: &[(Source, u32)]) {
        #[cfg(not(target_arch = "wasm32"))]
        {
            use rayon::prelude::*;
            // What decoding a picture holds at once: the decoder's pixels and the pixmap made of them.
            let cost = |s: &Source| s.data.map_or(0, |d| (u64::from(d.width) * u64::from(d.height) * 8).min(u64::from(u32::MAX) * 8));
            let mut round: Vec<&(Source, u32)> = Vec::new();
            let mut held = 0u64;
            let run = |round: &mut Vec<&(Source, u32)>| {
                round.par_iter().for_each(|(s, level)| {
                    let _ = self.picture(s, *level, false);
                });
                round.clear();
            };
            for entry in list {
                let c = cost(&entry.0);
                if !round.is_empty() && held + c > PARALLEL_DECODE_BYTES {
                    run(&mut round);
                    held = 0;
                }
                round.push(entry);
                held += c;
            }
            run(&mut round);
        }
        #[cfg(target_arch = "wasm32")]
        for (s, level) in list {
            let _ = self.picture(s, *level, false);
        }
    }
}

impl Inner {
    /// The held picture `key`, marked as just used.
    fn touch(&mut self, key: &Key) -> Option<Arc<Pixmap>> {
        self.clock += 1;
        let clock = self.clock;
        let slot = self.map.get_mut(key)?;
        slot.used = clock;
        Some(slot.pixmap.clone())
    }

    /// Keep `pixmap` as `key`, then drop the least recently used pictures while the cache is over
    /// `budget` (never `key` itself: what was just asked for stays, even when it alone is over).
    fn insert(&mut self, key: Key, pixmap: Arc<Pixmap>, budget: usize) {
        self.clock += 1;
        let bytes = pixmap.data().len();
        if let Some(old) = self.map.insert(key.clone(), Slot { pixmap, used: self.clock }) {
            self.bytes = self.bytes.saturating_sub(old.pixmap.data().len());
        }
        self.bytes += bytes;
        if self.bytes <= budget {
            return;
        }
        let mut by_age: Vec<(u64, Key)> = self.map.iter().filter(|(k, _)| **k != key).map(|(k, s)| (s.used, k.clone())).collect();
        by_age.sort_unstable_by_key(|(used, _)| *used);
        for (_, k) in by_age {
            if self.bytes <= budget {
                break;
            }
            if let Some(gone) = self.map.remove(&k) {
                self.bytes = self.bytes.saturating_sub(gone.pixmap.data().len());
            }
        }
    }
}

/// Level 0 of the picture: decoded, filtered, in the document's colour space.
fn decode_level0(s: &Source) -> Option<Pixmap> {
    crate::images::decode_filtered(s.data?, s.filters, s.profile)
}

/// `src` reduced to half its size each way: every pixel the average of the 2 × 2 it replaces
/// (premultiplied, so transparent edges don't bleed their colour). An odd last row or column is
/// dropped. `None` when a side is under 2.
pub fn reduce_half(src: &Pixmap) -> Option<Pixmap> {
    let (w, h) = (src.width() / 2, src.height() / 2);
    if w == 0 || h == 0 {
        return None;
    }
    let mut dst = Pixmap::new(w, h)?;
    let stride = src.width() as usize * 4;
    // A pair of source rows for each row of the result (an odd last row is left out).
    for (out, rows) in dst.data_mut().chunks_exact_mut(w as usize * 4).zip(src.data().chunks_exact(stride * 2)) {
        let (top, bottom) = rows.split_at(stride);
        let (top, bottom, out) = (top.as_chunks::<8>().0, bottom.as_chunks::<8>().0, out.as_chunks_mut::<4>().0);
        for ((d, t), b) in out.iter_mut().zip(top).zip(bottom) {
            for c in 0..4 {
                let sum = u32::from(t[c]) + u32::from(t[c + 4]) + u32::from(b[c]) + u32::from(b[c + 4]);
                d[c] = ((sum + 2) >> 2) as u8;
            }
        }
    }
    Some(dst)
}
