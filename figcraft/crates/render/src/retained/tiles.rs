//! Blocks (tiles) of finished canvas renders, kept so that scrolling back to a region copies its
//! pixels instead of drawing them again.
//!
//! Tiles sit on the absolute device-pixel grid of their zoom ([`TILE`] pixels a side), so a pan
//! finds them wherever the view is. They are only taken from finished renders, away from the
//! frame's edges (a background blur there reads a backdrop that ends at the edge) and outside
//! layers whose look depends on where a render cuts them (grain): a tile is exactly what a render
//! of a bigger view would show there. An edit drops the tiles of the areas it touches (the same
//! areas the retained patch redraws); anything that can't be narrowed down drops them all.

use std::collections::HashMap;
use std::sync::Arc;

use figcraft_doc::{Document, NodeId};
use tiny_skia::Pixmap;

use super::{MAX_CHANGED, Px, Sensitive, changed_areas, in_pattern_source, to_px};
use crate::Options;

/// Device pixels a side.
pub const TILE: i64 = 128;
const TILE_BYTES: usize = (TILE * TILE * 4) as usize;

/// The bytes of tiles kept for one file.
#[cfg(not(target_arch = "wasm32"))]
pub const TILE_BUDGET: usize = 192 << 20;
#[cfg(target_arch = "wasm32")]
pub const TILE_BUDGET: usize = 40 << 20;

/// What the tiles were drawn with (besides the zoom, which is part of each tile's key).
#[derive(Clone, PartialEq)]
struct Settings {
    page: NodeId,
    outline: bool,
    outline_extras: crate::Outline,
    outlined: Vec<NodeId>,
    lod: bool,
    solo: Option<NodeId>,
    background: Option<figcraft_color::Color>,
    fonts: u64,
    profile: figcraft_color::ColorProfile,
    backdrop_blur: u64,
}

struct Tile {
    data: Vec<u8>,
    used: u64,
}

/// See the module docs.
pub struct Tiles {
    doc: Option<Arc<Document>>,
    settings: Option<Settings>,
    sens: Option<Arc<Sensitive>>,
    /// (zoom bits, column, row) → pixels (premultiplied RGBA, [`TILE`]² of them).
    map: HashMap<(u64, i64, i64), Tile>,
    clock: u64,
    budget: usize,
}

impl Default for Tiles {
    fn default() -> Self {
        Self::new(TILE_BUDGET)
    }
}

impl Tiles {
    pub fn new(budget: usize) -> Self {
        Self { doc: None, settings: None, sens: None, map: HashMap::new(), clock: 0, budget }
    }

    pub fn bytes(&self) -> usize {
        self.map.len() * TILE_BYTES
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn clear(&mut self) {
        self.map.clear();
        self.doc = None;
        self.settings = None;
        self.sens = None;
    }

    /// Bring the tiles up to `doc` drawn with `opts`: drop those an edit since touched (all of
    /// them when the drawing settings changed). Whether tiles can be used for this render at all
    /// (not for drafts, nor while an editor leaves layers out).
    pub(crate) fn sync(&mut self, doc: &Arc<Document>, page: NodeId, opts: &Options, fonts: u64, sens: &Arc<Sensitive>) -> bool {
        if opts.draft || !opts.skip.is_empty() || self.budget == 0 {
            return false;
        }
        let settings = Settings {
            page,
            outline: opts.outline_mode,
            outline_extras: opts.outline,
            outlined: opts.outlined.clone(),
            lod: opts.lod,
            solo: opts.solo,
            background: opts.background,
            fonts,
            profile: doc.color_profile,
            backdrop_blur: sens.backdrop_blur.to_bits(),
        };
        if self.settings.as_ref() != Some(&settings) || opts.outline.hidden {
            self.map.clear();
            self.settings = Some(settings);
            self.doc = Some(doc.clone());
            self.sens = Some(sens.clone());
            return !opts.outline.hidden;
        }
        let Some(old) = self.doc.clone() else {
            self.doc = Some(doc.clone());
            self.sens = Some(sens.clone());
            return true;
        };
        if !Arc::ptr_eq(&old, doc) {
            let old_sens = self.sens.clone().unwrap_or_else(|| sens.clone());
            if self.invalidate(&old, &old_sens, doc, sens, page).is_none() {
                self.map.clear();
            }
            self.doc = Some(doc.clone());
            self.sens = Some(sens.clone());
        }
        true
    }

    /// Drop the tiles the changes from `old` to `doc` touch; `None` when that can't be narrowed.
    fn invalidate(&mut self, old: &Document, old_sens: &Sensitive, doc: &Document, sens: &Sensitive, page: NodeId) -> Option<()> {
        let changed = doc.changed_ids(old, MAX_CHANGED)?;
        let mut areas = Vec::new();
        for id in &changed {
            if in_pattern_source(doc, sens, *id) || in_pattern_source(old, old_sens, *id) {
                return None;
            }
            changed_areas(old, page, *id, &mut areas)?;
            changed_areas(doc, page, *id, &mut areas)?;
        }
        // Grainy layers that came or went change how they are cut: their areas too.
        areas.extend(sens.areas.iter().chain(&old_sens.areas).copied());
        if areas.is_empty() {
            return Some(());
        }
        let blur = sens.backdrop_blur.max(old_sens.backdrop_blur);
        self.map.retain(|(bits, tx, ty), _| {
            let scale = f64::from_bits(*bits);
            let reach = crate::backdrop_reach(blur, scale).ceil();
            let reach = if reach.is_finite() { reach.min(1e6) as i64 } else { i64::MAX / 4 };
            let cell = Px { x0: tx * TILE, y0: ty * TILE, x1: (tx + 1) * TILE, y1: (ty + 1) * TILE };
            !areas.iter().any(|r| {
                to_px(*r, scale, (0, 0)).is_none_or(|p| {
                    let p = Px {
                        x0: p.x0.saturating_sub(reach),
                        y0: p.y0.saturating_sub(reach),
                        x1: p.x1.saturating_add(reach),
                        y1: p.y1.saturating_add(reach),
                    };
                    p.x0 < cell.x1 && cell.x0 < p.x1 && p.y0 < cell.y1 && cell.y0 < p.y1
                })
            })
        });
        Some(())
    }

    /// The cells (column range, row range) fully inside frame rectangle `area` of a frame whose
    /// top-left device pixel is `px`.
    fn cells(area: Px, px: (i64, i64)) -> (std::ops::Range<i64>, std::ops::Range<i64>) {
        let (ax0, ay0, ax1, ay1) = (area.x0 + px.0, area.y0 + px.1, area.x1 + px.0, area.y1 + px.1);
        (
            ax0.div_euclid(TILE) + i64::from(ax0.rem_euclid(TILE) != 0)..ax1.div_euclid(TILE),
            ay0.div_euclid(TILE) + i64::from(ay0.rem_euclid(TILE) != 0)..ay1.div_euclid(TILE),
        )
    }

    /// The area of a frame `w` × `h` at `px` tiles may be taken from or copied into: away from
    /// the edges by the backdrop reach.
    fn usable(w: i64, h: i64, reach: i64) -> Px {
        let m = reach.max(0) + 1;
        Px { x0: m, y0: m, x1: w - m, y1: h - m }
    }

    /// Keep the tiles of finished frame `pix` (top-left device pixel `px`, at `scale`) not held
    /// yet; `reach` is how far background blurs read (device pixels).
    pub(crate) fn store(&mut self, pix: &Pixmap, px: (i64, i64), scale: f64, reach: i64, sens: &Sensitive) {
        let (w, h) = (i64::from(pix.width()), i64::from(pix.height()));
        let usable = Self::usable(w, h, reach);
        if usable.x1 <= usable.x0 || usable.y1 <= usable.y0 {
            return;
        }
        let avoid: Vec<Px> = sens.areas.iter().filter_map(|r| to_px(*r, scale, px)).collect();
        let bits = scale.to_bits();
        let (cols, rows) = Self::cells(usable, px);
        let Ok(row_bytes) = usize::try_from(w * 4) else { return };
        let data = pix.data();
        for ty in rows {
            for tx in cols.clone() {
                if self.map.contains_key(&(bits, tx, ty)) {
                    if let Some(t) = self.map.get_mut(&(bits, tx, ty)) {
                        self.clock += 1;
                        t.used = self.clock;
                    }
                    continue;
                }
                let (x0, y0) = (tx * TILE - px.0, ty * TILE - px.1);
                let cell = Px { x0, y0, x1: x0 + TILE, y1: y0 + TILE };
                if avoid.iter().any(|a| a.x0 < cell.x1 && cell.x0 < a.x1 && a.y0 < cell.y1 && cell.y0 < a.y1) {
                    continue;
                }
                let mut tile = Vec::with_capacity(TILE_BYTES);
                let ok = (y0..y0 + TILE).all(|y| {
                    let (Ok(yy), Ok(xx)) = (usize::try_from(y), usize::try_from(x0 * 4)) else { return false };
                    let at = yy * row_bytes + xx;
                    match data.get(at..at + (TILE * 4) as usize) {
                        Some(s) => {
                            tile.extend_from_slice(s);
                            true
                        }
                        None => false,
                    }
                });
                if ok {
                    self.clock += 1;
                    self.map.insert((bits, tx, ty), Tile { data: tile, used: self.clock });
                }
            }
        }
        self.trim();
    }

    fn trim(&mut self) {
        let max = self.budget / TILE_BYTES;
        if self.map.len() <= max {
            return;
        }
        let mut ages: Vec<u64> = self.map.values().map(|t| t.used).collect();
        ages.sort_unstable();
        let cut = ages.get(self.map.len() - max).copied().unwrap_or(u64::MAX);
        self.map.retain(|_, t| t.used >= cut);
    }

    /// Copy held tiles into `damage` areas of `pix` (a frame at `px`, `scale`), a band of tile
    /// rows at a time; returns what is left to draw and the pixels copied. Only bands whose every
    /// cell is held (and away from the frame's edges) are copied, so what is left stays a few
    /// bands.
    pub(crate) fn fill(&mut self, pix: &mut Pixmap, px: (i64, i64), scale: f64, reach: i64, damage: Vec<Px>) -> (Vec<Px>, u64) {
        if self.map.is_empty() {
            return (damage, 0);
        }
        let (w, h) = (i64::from(pix.width()), i64::from(pix.height()));
        let usable = Self::usable(w, h, reach);
        let bits = scale.to_bits();
        let Ok(row_bytes) = usize::try_from(w * 4) else { return (damage, 0) };
        let mut left = Vec::new();
        let mut copied = 0u64;
        for whole in damage {
            // Whole tile columns inside the area (and away from the frame's edges) may come from
            // tiles; the columns either side are drawn.
            let (u0, u1) = (whole.x0.max(usable.x0) + px.0, whole.x1.min(usable.x1) + px.0);
            let (cc0, cc1) = (u0.div_euclid(TILE) + i64::from(u0.rem_euclid(TILE) != 0), u1.div_euclid(TILE));
            let d = Px { x0: cc0 * TILE - px.0, x1: cc1 * TILE - px.0, ..whole };
            if cc1 <= cc0 || d.y1 <= d.y0 {
                left.push(whole);
                continue;
            }
            if whole.x0 < d.x0 {
                left.push(Px { x1: d.x0, ..whole });
            }
            if whole.x1 > d.x1 {
                left.push(Px { x0: d.x1, ..whole });
            }
            let (c0, c1) = (cc0, cc1 - 1);
            let (r0, r1) = ((d.y0 + px.1).div_euclid(TILE), (d.y1 - 1 + px.1).div_euclid(TILE));
            // Start of the run of bands left to draw.
            let mut run: Option<i64> = None;
            for r in r0..=r1 {
                let (y0, y1) = ((r * TILE - px.1).max(d.y0), ((r + 1) * TILE - px.1).min(d.y1));
                let held = y0 >= usable.y0 && y1 <= usable.y1 && (c0..=c1).all(|c| self.map.contains_key(&(bits, c, r)));
                if !held {
                    run.get_or_insert(y0);
                    continue;
                }
                if let Some(from) = run.take() {
                    left.push(Px { y0: from, y1: y0, ..d });
                }
                let data = pix.data_mut();
                for c in c0..=c1 {
                    let Some(t) = self.map.get_mut(&(bits, c, r)) else { continue };
                    self.clock += 1;
                    t.used = self.clock;
                    let (cx0, cy0) = (c * TILE - px.0, r * TILE - px.1);
                    let (x0, x1) = (cx0.max(d.x0), (cx0 + TILE).min(d.x1));
                    let (Ok(n), Ok(sx), Ok(dx)) = (usize::try_from((x1 - x0) * 4), usize::try_from((x0 - cx0) * 4), usize::try_from(x0 * 4)) else {
                        continue;
                    };
                    for yy in y0..y1 {
                        let (Ok(sy), Ok(dy)) = (usize::try_from(yy - cy0), usize::try_from(yy)) else { continue };
                        let s = sy * (TILE * 4) as usize + sx;
                        let at = dy * row_bytes + dx;
                        if let (Some(src), Some(dst)) = (t.data.get(s..s + n), data.get_mut(at..at + n)) {
                            dst.copy_from_slice(src);
                        }
                    }
                }
                copied += ((y1 - y0) * (d.x1 - d.x0)).max(0) as u64;
            }
            if let Some(from) = run {
                left.push(Px { y0: from, ..d });
            }
        }
        (left, copied)
    }
}
