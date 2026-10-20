//! Canvas rendering off the UI thread (desktop) or in pieces between frames (web). The latest
//! request wins (queued older ones are skipped); the UI shows each finished image, re-projected to
//! the current view, until the next one arrives.
//! The renderer keeps its last image ([`figcraft_render::Retained`]): a pan renders only the
//! uncovered strips and an edit only the areas of the layers that changed.
//!
//! The browser has one thread for the UI and the renderer. A render in one go froze every frame it
//! took (a page of big photos: a second or more), so the web [`Stepper`] draws a few bands of the
//! view per frame, inside a time budget. The bands of what the screen shows come first and the
//! image is handed over as soon as they are done (then patched as the margin's bands follow), so a
//! fast scroll shows the screen after the screen's share of the work, not the whole margin's.
//! The desktop thread runs the same [`Stepper`], a piece at a time between looks at its queue.
//!
//! A render under way is never thrown away for a newer one: what it drew is kept
//! ([`Retained::abandon`]) and the newer one draws the rest along with its own. It is only given
//! up when the newer job's screen isn't in its focus (a scroll has gone past it); otherwise it
//! finishes first, as it shows what is wanted soonest.
//! When nothing waits, the pictures near the view decode ahead ([`figcraft_render::prefetch::Ahead`]).

use std::collections::HashMap;
use std::sync::Arc;

use figcraft_color::ColorProfile;
use figcraft_doc::{Document, NodeId};
use figcraft_render::{Pixmap, Retained, Sliced, View, Work};

#[derive(Clone)]
pub struct Job {
    pub doc: Arc<Document>,
    pub page: NodeId,
    pub view: View,
    pub outline: bool,
    /// Outline mode's options (hidden layers, object bounds).
    pub outline_extras: figcraft_render::Outline,
    /// Layers drawn as outlines (outlines for the selection).
    pub outlined: Vec<NodeId>,
    pub skip: Vec<NodeId>,
    /// Only this layer (the focus view).
    pub solo: Option<NodeId>,
    /// Soft-proof sRGB: stripe the colours sRGB can't show.
    pub proof: bool,
    /// A draft while a zoom is under way: leaves out grain, background blur and glass.
    pub draft: bool,
    /// The open file (its `uid`) the job renders: the renderer keeps one image for each of
    /// several files, so going back to a tab patches its image instead of drawing it again.
    pub uid: u64,
    /// Not what the window shows but what it may show next (a neighbouring tab): it runs when
    /// nothing else waits and is not counted by [`Worker::in_flight`].
    pub background: bool,
    /// Draw it whole, forgetting the kept image (the canvas lost track of what it shows).
    pub fresh: bool,
    /// What the screen shows of `view` (the rest is margin for a pan): drawn first and shown as
    /// soon as it is done. `None`: all of it.
    pub focus: Option<View>,
}

/// The areas of an image that changed, with their pixels.
pub type Patches = Vec<([usize; 2], egui::ColorImage)>;

pub struct Done {
    /// The whole image, ready for a texture (converted off the UI thread); empty when
    /// [`Done::patches`] is there instead.
    pub image: egui::ColorImage,
    /// Only the areas that changed since the last [`Done`] of this file (`serial - 1`), at their
    /// top-left corners: a drag changes a few hundred pixels of a screen of millions, and the
    /// texture upload sends just those.
    pub patches: Option<Patches>,
    /// The image's size in pixels (whole or patched).
    pub size: [usize; 2],
    /// Which render of its file this is (counting from 1) and the one the patches are against.
    pub serial: u64,
    pub base: u64,
    pub uid: u64,
    pub background: bool,
    /// The view the image shows (the requested one snapped outwards to whole device pixels).
    pub view: View,
    pub ms: f64,
    pub work: Work,
    /// The document the image shows, and the layers left out of it.
    pub doc: Arc<Document>,
    pub skip: Vec<NodeId>,
    /// What the renderer counted doing it (copies, patches and why not, timings).
    pub stats: figcraft_render::perf::Snapshot,
    /// Not finished: the screen's part is drawn and more of the margin follows.
    pub partial: bool,
}

/// A render of a document in `profile` as a texture image for the screen (sRGB).
pub fn screen_image(pix: &Pixmap, profile: ColorProfile) -> egui::ColorImage {
    let size = [pix.width() as usize, pix.height() as usize];
    if profile.is_srgb() {
        return egui::ColorImage::from_rgba_premultiplied(size, pix.data());
    }
    let mut data = pix.data().to_vec();
    profile.conversion_to(ColorProfile::Srgb).apply_pixels(&mut data);
    egui::ColorImage::from_rgba_premultiplied(size, &data)
}

/// Soft proof: grey diagonal stripes over the pixels whose colours sRGB can't show.
fn mark_outside_srgb(image: &mut egui::ColorImage, pix: &Pixmap, profile: ColorProfile) {
    let w = image.size[0].max(1);
    let clipped = profile.conversion_to(ColorProfile::Srgb).clipped_pixels(pix.data());
    for (i, (px, out)) in image.pixels.iter_mut().zip(clipped).enumerate() {
        if out && ((i % w) + (i / w)) % 8 < 4 {
            *px = egui::Color32::from_gray(128);
        }
    }
}

/// What the canvas renders: a preview, so what's too small to see in detail at this zoom is
/// approximated.
fn options(job: &Job) -> figcraft_render::Options {
    figcraft_render::Options {
        outline_mode: job.outline,
        outline: job.outline_extras,
        outlined: job.outlined.clone(),
        skip: job.skip.clone(),
        solo: job.solo,
        lod: true,
        draft: job.draft,
        ..Default::default()
    }
}

/// What the renderer keeps of one open file.
struct Kept {
    retained: Retained,
    /// When it was last used (the set's clock).
    used: u64,
    /// Renders of the file so far.
    serial: u64,
    /// The kept image is not the one last handed over (a render given up before it was shown):
    /// the next one goes whole, not as changes.
    whole_next: bool,
}

/// One kept image for each of the last few open files, under a byte budget: coming back to a tab
/// finds its image and re-renders only what changed since.
pub struct RetainedSet {
    map: HashMap<u64, Kept>,
    clock: u64,
    budget: usize,
    /// The bytes of tiles each file keeps ([`figcraft_render::retained::Tiles`]).
    tile_budget: usize,
}

/// The bytes of kept images: a 4K window's render with its margin is some 75 MB.
#[cfg(not(target_arch = "wasm32"))]
pub const KEPT_BUDGET: usize = 384 << 20;
#[cfg(target_arch = "wasm32")]
pub const KEPT_BUDGET: usize = 96 << 20;

impl Default for RetainedSet {
    fn default() -> Self {
        Self::new(KEPT_BUDGET)
    }
}

impl RetainedSet {
    pub fn new(budget: usize) -> Self {
        Self { map: HashMap::new(), clock: 0, budget, tile_budget: figcraft_render::retained::TILE_BUDGET }
    }

    fn get(&mut self, uid: u64) -> &mut Kept {
        self.clock += 1;
        let clock = self.clock;
        let tiles = self.tile_budget;
        let k = self.map.entry(uid).or_insert_with(|| {
            let mut retained = Retained::default();
            if tiles != figcraft_render::retained::TILE_BUDGET {
                retained.set_tile_budget(tiles);
            }
            Kept { retained, used: clock, serial: 0, whole_next: false }
        });
        k.used = clock;
        k
    }

    /// Drop the least recently used images while over the budget (never `keep`'s).
    fn trim(&mut self, keep: u64) {
        loop {
            let total: usize = self.map.values().map(|k| k.retained.bytes()).sum();
            if total <= self.budget {
                return;
            }
            let Some(oldest) = self.map.iter().filter(|(u, _)| **u != keep).min_by_key(|(_, k)| k.used).map(|(u, _)| *u) else { return };
            self.map.remove(&oldest);
        }
    }

    /// Forget the images of files that are not open any more.
    pub fn retain(&mut self, open: impl Fn(u64) -> bool) {
        self.map.retain(|u, _| open(*u));
    }

    /// Files with a kept image.
    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }

    pub fn bytes(&self) -> usize {
        self.map.values().map(|k| k.retained.bytes()).sum()
    }
}

/// A patch of more than this share of the image is sent as the whole image.
const MAX_PATCH_SHARE: f64 = 0.5;

/// The pixels of `pix` in `r` (`[x, y, w, h]`) as a texture image.
fn crop_image(pix: &Pixmap, r: [u32; 4], profile: ColorProfile) -> Option<egui::ColorImage> {
    let rect = figcraft_render::IntRect::from_xywh(i32::try_from(r[0]).ok()?, i32::try_from(r[1]).ok()?, r[2], r[3])?;
    Some(screen_image(&pix.clone_rect(rect)?, profile))
}

/// The finished render of `job`, held in `kept`, as what the canvas needs to show it.
fn done(job: &Job, kept: &mut Kept, view: View, work: Work, ms: f64, stats: figcraft_render::perf::Snapshot) -> Option<Done> {
    let whole = std::mem::take(&mut kept.whole_next);
    let rects = if whole { None } else { kept.retained.dirty().map(<[_]>::to_vec) };
    let pix = kept.retained.image()?;
    Some(publish(job, &mut kept.serial, pix, rects, view, work, ms, stats, false))
}

/// `pix` (a render of `job`) as a [`Done`]: only the areas `rects` (changed since the last one
/// shown) where they are few enough, else the whole image.
#[allow(clippy::too_many_arguments)]
fn publish(
    job: &Job,
    serial: &mut u64,
    pix: &Pixmap,
    rects: Option<Vec<[u32; 4]>>,
    view: View,
    work: Work,
    ms: f64,
    stats: figcraft_render::perf::Snapshot,
    partial: bool,
) -> Done {
    let size = [pix.width() as usize, pix.height() as usize];
    *serial += 1;
    let (serial, base) = (*serial, *serial - 1);
    let meta = |image, patches| Done {
        image,
        patches,
        size,
        serial,
        base,
        uid: job.uid,
        view: view.clone(),
        ms,
        work,
        doc: job.doc.clone(),
        skip: job.skip.clone(),
        background: job.background,
        stats,
        partial,
    };
    // The grey stripes of a soft proof run across the whole image: no patches for it.
    if !job.proof
        && let Some(rects) = rects
    {
        let area: u64 = rects.iter().map(|r| u64::from(r[2]) * u64::from(r[3])).sum();
        if area as f64 <= MAX_PATCH_SHARE * (size[0] * size[1]) as f64 {
            let patches: Option<Patches> =
                rects.iter().map(|r| Some(([r[0] as usize, r[1] as usize], crop_image(pix, *r, job.doc.color_profile)?))).collect();
            if let Some(p) = patches {
                return meta(egui::ColorImage::default(), Some(p));
            }
        }
    }
    let mut image = screen_image(pix, job.doc.color_profile);
    if job.proof {
        mark_outside_srgb(&mut image, pix, job.doc.color_profile);
    }
    meta(image, None)
}

/// Copy `patches` into `image` (a whole image of the same size).
#[cfg(not(target_arch = "wasm32"))]
fn apply_patches(image: &mut egui::ColorImage, patches: Patches) {
    let w = image.size[0];
    for ([x, y], p) in patches {
        let pw = p.size[0];
        for row in 0..p.size[1] {
            let (Some(src), Some(dst)) = (p.pixels.get(row * pw..(row + 1) * pw), image.pixels.get_mut((y + row) * w + x..(y + row) * w + x + pw))
            else {
                continue;
            };
            dst.copy_from_slice(src);
        }
    }
}

impl Done {
    #[cfg(not(target_arch = "wasm32"))]
    /// Fold a newer render of the same file into this one: a client that missed this one gets the
    /// changes of both.
    fn absorb(mut self, newer: Done) -> Done {
        match (self.patches.take(), newer.patches) {
            (Some(mut mine), Some(theirs)) if self.size == newer.size && self.serial == newer.base => {
                mine.extend(theirs);
                let stats = self.stats.plus(&newer.stats);
                Done { patches: Some(mine), base: self.base, stats, ..newer }
            }
            // A whole image, then changes to it: the whole image with the changes.
            (None, Some(theirs)) if self.size == newer.size && self.serial == newer.base && !self.image.pixels.is_empty() => {
                let mut image = std::mem::take(&mut self.image);
                apply_patches(&mut image, theirs);
                let stats = self.stats.plus(&newer.stats);
                Done { image, patches: None, base: self.base, stats, ..newer }
            }
            (_, patches) => Done { patches, stats: self.stats.plus(&newer.stats), ..newer },
        }
    }
}

fn run(job: &Job, set: &mut RetainedSet) -> Option<Done> {
    #[cfg(not(target_arch = "wasm32"))]
    let t0 = std::time::Instant::now();
    let counted = figcraft_render::perf::Snapshot::now();
    let kept = set.get(job.uid);
    if job.fresh {
        kept.retained.clear();
    }
    let (view, _, work) = kept.retained.render(&job.doc, job.page, &job.view, &options(job))?;
    #[cfg(not(target_arch = "wasm32"))]
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    #[cfg(target_arch = "wasm32")]
    let ms = 0.0;
    let stats = figcraft_render::perf::Snapshot::now().since(&counted);
    let d = done(job, kept, view, work, ms, stats);
    set.trim(job.uid);
    d
}

/// Time a frame may spend rendering in the browser (ms): what is left of a 60 Hz frame after the
/// UI, with room for a band that runs long.
pub const FRAME_BUDGET_MS: f64 = 8.0;

/// A render under way.
struct Running {
    job: Job,
    sliced: Sliced,
    /// Milliseconds spent on it so far.
    ms: f64,
    /// What the renderer counted for it so far.
    stats: figcraft_render::perf::Snapshot,
    /// The pieces run when it was last handed over unfinished (`None`: not yet).
    shown: Option<usize>,
    /// The caller's tag for it ([`Stepper::submit_tagged`]).
    tag: u64,
}

/// How far around the view pictures decode ahead, in view sizes each way.
const AHEAD_VIEWS: f64 = 3.0;

/// Renders jobs in pieces, a few milliseconds a call: the browser's worker, and the desktop
/// thread's (one piece a call). The screen's pieces come first and are handed over as soon as they
/// are done; see the module docs for when a job under way gives way to a newer one.
pub struct Stepper {
    set: RetainedSet,
    pending: Option<(Job, u64)>,
    running: Option<Running>,
    /// Rows a piece of the next render covers (sized from how long rows took); `None`: each area
    /// in one piece (the desktop, whose renderer splits it across threads itself).
    rows: Option<u32>,
    budget_ms: f64,
    /// Jobs submitted so far.
    submitted: u64,
    /// The newest tag of a window job finished or dropped.
    finished_tag: u64,
    /// Background jobs finished or dropped.
    background_done: u64,
    /// Pictures decoding ahead while nothing else runs.
    ahead: Option<figcraft_render::prefetch::Ahead>,
    /// Renders given up for a newer one (their drawing kept).
    pub abandoned: u64,
    /// Pixels copied from kept tiles instead of drawn, so far.
    pub tiled: u64,
    /// Decode pictures ahead when idle; give a render up for a newer one; show it unfinished.
    /// All on; off only to measure without them.
    pub features: bool,
}

impl Default for Stepper {
    fn default() -> Self {
        Self::new(FRAME_BUDGET_MS)
    }
}

impl Stepper {
    pub fn new(budget_ms: f64) -> Self {
        Self {
            set: RetainedSet::default(),
            pending: None,
            running: None,
            rows: Some(48),
            budget_ms,
            submitted: 0,
            finished_tag: 0,
            background_done: 0,
            ahead: None,
            abandoned: 0,
            tiled: 0,
            features: true,
        }
    }

    /// The desktop thread's: one area a piece (the renderer uses every core on it), one piece a
    /// call.
    pub fn whole_pieces() -> Self {
        Self { rows: None, ..Self::new(0.0) }
    }

    pub fn submit(&mut self, job: Job) {
        self.submit_tagged(job, 0);
    }

    /// Submit `job` with a tag (the newest finished one is [`Stepper::finished_tag`]).
    pub fn submit_tagged(&mut self, job: Job, tag: u64) {
        // What the window shows comes before what it may show next.
        if job.background && self.pending.as_ref().is_some_and(|(p, _)| !p.background) {
            self.background_done += 1;
            return;
        }
        if let Some((old, t)) = self.pending.take() {
            if old.background {
                self.background_done += 1;
            } else {
                self.finished_tag = self.finished_tag.max(t);
            }
        }
        self.pending = Some((job, tag));
        self.submitted += 1;
    }

    pub fn in_flight(&self) -> bool {
        self.pending.as_ref().is_some_and(|(j, _)| !j.background) || self.running.as_ref().is_some_and(|r| !r.job.background)
    }

    /// Whether a background job waits or runs.
    pub fn background_busy(&self) -> bool {
        self.pending.as_ref().is_some_and(|(j, _)| j.background) || self.running.as_ref().is_some_and(|r| r.job.background)
    }

    /// Whether there is anything to do (a job, or pictures to decode ahead).
    pub fn busy(&self) -> bool {
        self.pending.is_some() || self.running.is_some() || self.ahead.as_ref().is_some_and(|a| a.left() > 0)
    }

    pub fn finished_tag(&self) -> u64 {
        self.finished_tag
    }

    pub fn background_done(&self) -> u64 {
        self.background_done
    }

    /// Rows a piece of the next render covers.
    pub fn rows(&self) -> u32 {
        self.rows.unwrap_or(0)
    }

    /// The kept images.
    pub fn kept(&self) -> &RetainedSet {
        &self.set
    }

    /// The renderer as it was before rendering the screen first: no tiles, no decoding ahead,
    /// never giving a render up (measuring the difference).
    pub fn baseline(mut self) -> Self {
        self.set.tile_budget = 0;
        self.features = false;
        self
    }

    /// Drop the render under way (a panic left it half drawn): its file's kept image too.
    pub fn recover(&mut self) {
        if let Some(r) = self.running.take() {
            let kept = self.set.get(r.job.uid);
            kept.retained.clear();
            kept.whole_next = true;
            if r.job.background {
                self.background_done += 1;
            } else {
                self.finished_tag = self.finished_tag.max(r.tag);
            }
        }
        self.ahead = None;
    }

    /// Run pieces of the render under way (starting the newest job when none is) for about the
    /// budget, `clock` giving milliseconds. The image when its last piece has run, or the
    /// screen's part of it as soon as that is drawn (then the margin's as it comes).
    pub fn poll(&mut self, clock: &mut dyn FnMut() -> f64) -> Option<Done> {
        let counted = figcraft_render::perf::Snapshot::now();
        // A newer job for the window whose screen the render under way doesn't cover (a scroll
        // went past it): give that one up, keeping what it drew.
        if let (Some(r), Some((p, _))) = (&self.running, &self.pending)
            && self.features
            && !r.job.background
            && !p.background
            && r.job.uid == p.uid
            && p.focus.as_ref().is_some_and(|f| !r.sliced.covers(f))
            && let Some(r) = self.running.take()
        {
            self.abandoned += 1;
            self.finished_tag = self.finished_tag.max(r.tag);
            let kept = self.set.get(r.job.uid);
            if r.shown.is_none() {
                kept.whole_next = true;
            }
            kept.retained.abandon(r.sliced);
        }
        if self.running.is_none() {
            let Some((job, tag)) = self.pending.take() else {
                // Nothing to render: decode the pictures around the view.
                let start = clock();
                if let Some(a) = self.ahead.as_mut() {
                    while a.step(if self.rows.is_none() { 4 } else { 1 }) && clock() - start < self.budget_ms {}
                }
                return None;
            };
            let kept = self.set.get(job.uid);
            if job.fresh {
                kept.retained.clear();
                kept.whole_next = false;
            }
            let Some(sliced) = kept.retained.begin_focused(&job.doc, job.page, &job.view, &options(&job), self.rows, job.focus.as_ref()) else {
                if job.background {
                    self.background_done += 1;
                } else {
                    self.finished_tag = self.finished_tag.max(tag);
                }
                return None;
            };
            self.tiled += sliced.tiled();
            if !job.background && self.features {
                let around = job.focus.as_ref().unwrap_or(&job.view);
                if !self.ahead.as_ref().is_some_and(|a| a.is_for(&job.doc) && a.left() > 0) {
                    self.ahead = Some(figcraft_render::prefetch::Ahead::new(&job.doc, job.page, around, &options(&job), AHEAD_VIEWS));
                }
            }
            self.running = Some(Running { job, sliced, ms: 0.0, stats: figcraft_render::perf::Snapshot::now().since(&counted), shown: None, tag });
        }
        let run = self.running.as_mut()?;
        let start = clock();
        let deadline = start + self.budget_ms;
        let stepping = figcraft_render::perf::Snapshot::now();
        // Stop at the end of the screen's pieces, to hand them over at once.
        let focus_pending = !run.sliced.focus_done();
        let finished = {
            let sliced = &mut run.sliced;
            let mut more = || clock() < deadline;
            if focus_pending {
                // One piece at a time (the clock read after each, as `step` does).
                loop {
                    let done = sliced.step(&mut || false);
                    let go = more();
                    if done || sliced.focus_done() || !go {
                        break done;
                    }
                }
            } else {
                sliced.step(&mut more)
            }
        };
        run.stats = run.stats.plus(&figcraft_render::perf::Snapshot::now().since(&stepping));
        run.ms += (clock() - start).max(0.0);
        if !finished {
            // Hand over what is drawn: the whole image the first time, then what was drawn since.
            let job = &run.job;
            if job.background || job.proof || !run.sliced.showable() || !run.sliced.focus_done() {
                return None;
            }
            let from = run.shown;
            if from == Some(run.sliced.ran()) {
                return None;
            }
            run.shown = Some(run.sliced.ran());
            let rects = from.map(|f| run.sliced.drawn(f));
            let kept = self.set.get(run.job.uid);
            let rects = if std::mem::take(&mut kept.whole_next) { None } else { rects };
            let view = run.sliced.view().clone();
            let (ms, stats) = (run.ms, run.stats);
            return Some(publish(&run.job, &mut kept.serial, run.sliced.image(), rects, view, Work::Full, ms, stats, true));
        }
        let Running { job, sliced, ms, stats, shown, tag } = self.running.take()?;
        if job.background {
            self.background_done += 1;
        } else {
            self.finished_tag = self.finished_tag.max(tag);
        }
        // The next render's pieces: about three quarters of a budget each.
        let rows = sliced.rows();
        if let Some(r) = self.rows.as_mut()
            && rows > 0
            && ms > 0.0
            && ms.is_finite()
        {
            let per_row = ms / rows as f64;
            let fit = (self.budget_ms * 0.75 / per_row)
                .clamp(f64::from(figcraft_render::retained::MIN_ROWS), f64::from(figcraft_render::retained::MAX_ROWS));
            *r = (f64::from(*r) * 0.5 + fit * 0.5) as u32;
        }
        let since_shown = shown.map(|f| sliced.drawn(f));
        let kept = self.set.get(job.uid);
        let finishing = figcraft_render::perf::Snapshot::now();
        let (view, _, work) = kept.retained.finish(sliced)?;
        let stats = stats.plus(&figcraft_render::perf::Snapshot::now().since(&finishing));
        let d = match since_shown {
            // Shown unfinished: only what was drawn since.
            Some(rects) if !kept.whole_next => {
                let pix = kept.retained.image()?;
                Some(publish(&job, &mut kept.serial, pix, Some(rects), view, work, ms, stats, false))
            }
            _ => done(&job, kept, view, work, ms, stats),
        };
        self.set.trim(job.uid);
        d
    }
}

#[cfg(not(target_arch = "wasm32"))]
enum Msg {
    Show(u64, Job),
    Next(Job),
}

#[cfg(not(target_arch = "wasm32"))]
pub struct Worker {
    tx: std::sync::mpsc::Sender<Msg>,
    rx: std::sync::mpsc::Receiver<Done>,
    /// Jobs for the window's own file submitted so far.
    submitted: u64,
    /// The newest of them the thread is done with: rendered (or skipped for a newer one) and the
    /// UI woken for it.
    finished: Arc<std::sync::atomic::AtomicU64>,
    /// Background jobs sent and finished (or dropped).
    next_sent: u64,
    next_done: Arc<std::sync::atomic::AtomicU64>,
}

#[cfg(not(target_arch = "wasm32"))]
impl Worker {
    pub fn new(ctx: egui::Context) -> Self {
        Self::with_stepper(ctx, Stepper::whole_pieces())
    }

    /// A worker whose thread runs `st` (tests measure it with features off).
    pub fn with_stepper(ctx: egui::Context, st: Stepper) -> Self {
        use std::sync::atomic::Ordering;
        let (tx, jobs) = std::sync::mpsc::channel::<Msg>();
        let (done_tx, rx) = std::sync::mpsc::channel::<Done>();
        let finished = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let done_with = finished.clone();
        let next_done = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let next_with = next_done.clone();
        // The window that renders with it (each window has its own worker).
        let viewport = ctx.viewport_id();
        let spawned = std::thread::Builder::new().name("figcraft-render".into()).spawn(move || {
            let mut st = st;
            let start = std::time::Instant::now();
            // Background jobs wait here, the newest for each file.
            let mut later: Vec<Job> = Vec::new();
            let mut skipped_later = 0u64;
            let mut reported_bg = 0u64;
            let mut skipped_total = 0u64;
            'jobs: loop {
                let mut take = |m: Msg, st: &mut Stepper, later: &mut Vec<Job>| match m {
                    // The window's own file: the newest request replaces any waiting one.
                    Msg::Show(seq, job) => st.submit_tagged(job, seq),
                    Msg::Next(job) => {
                        if let Some(at) = later.iter().position(|j| j.uid == job.uid) {
                            later.remove(at);
                            skipped_later += 1;
                        }
                        later.push(job);
                    }
                };
                // Wait for work when there is none, then take everything queued (between pieces).
                if !st.busy() && later.is_empty() {
                    match jobs.recv() {
                        Ok(m) => take(m, &mut st, &mut later),
                        Err(_) => break 'jobs,
                    }
                }
                loop {
                    match jobs.try_recv() {
                        Ok(m) => take(m, &mut st, &mut later),
                        Err(std::sync::mpsc::TryRecvError::Empty) => break,
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => break 'jobs,
                    }
                }
                // Background jobs run when the window's file has nothing waiting.
                if !st.in_flight() && !st.background_busy() && !later.is_empty() {
                    st.submit_tagged(later.remove(0), 0);
                }
                let before = st.finished_tag();
                let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| st.poll(&mut || start.elapsed().as_secs_f64() * 1000.0)));
                let done = match res {
                    Ok(d) => d,
                    Err(_) => {
                        // Don't build on an image a panic may have left half drawn.
                        st.recover();
                        None
                    }
                };
                let woke = done.is_some();
                if let Some(d) = done
                    && done_tx.send(d).is_err()
                {
                    break;
                }
                skipped_total += std::mem::take(&mut skipped_later);
                let bg = st.background_done() + skipped_total;
                if woke || st.finished_tag() != before || bg != reported_bg {
                    ctx.request_repaint_of(viewport);
                }
                if bg != reported_bg {
                    next_with.fetch_add(bg - reported_bg, Ordering::AcqRel);
                    reported_bg = bg;
                }
                done_with.fetch_max(st.finished_tag(), Ordering::AcqRel);
            }
        });
        if let Err(e) = spawned {
            log::error!("render thread: {e}");
        }
        Self { tx, rx, submitted: 0, finished, next_sent: 0, next_done }
    }

    pub fn submit(&mut self, job: Job) {
        if job.background {
            if self.tx.send(Msg::Next(job)).is_ok() {
                self.next_sent += 1;
            }
        } else if self.tx.send(Msg::Show(self.submitted + 1, job)).is_ok() {
            self.submitted += 1;
        }
    }

    /// Whether a submitted job is still rendering or hasn't woken the UI yet (a finished image
    /// may still wait for [`Self::poll`]). Background jobs don't count.
    pub fn in_flight(&self) -> bool {
        self.finished.load(std::sync::atomic::Ordering::Acquire) < self.submitted
    }

    /// Whether a background job is still waiting or rendering.
    pub fn background_busy(&self) -> bool {
        self.next_done.load(std::sync::atomic::Ordering::Acquire) < self.next_sent
    }

    /// Jobs submitted so far (tests count the renders a gesture asks for).
    pub fn submitted(&self) -> u64 {
        self.submitted
    }

    /// The finished renders, one for each file (renders of a file that were not collected one by
    /// one are folded into one).
    pub fn poll_all(&mut self) -> Vec<Done> {
        let mut out: Vec<Done> = Vec::new();
        while let Ok(d) = self.rx.try_recv() {
            match out.iter().position(|o| o.uid == d.uid && o.background == d.background) {
                Some(i) => {
                    let older = out.remove(i);
                    out.insert(i, older.absorb(d));
                }
                None => out.push(d),
            }
        }
        out
    }

    pub fn poll(&mut self) -> Option<Done> {
        self.poll_all().pop()
    }
}

#[cfg(target_arch = "wasm32")]
pub struct Worker {
    ctx: egui::Context,
    stepper: Stepper,
    start: web_time::Instant,
}

#[cfg(target_arch = "wasm32")]
impl Worker {
    pub fn new(ctx: egui::Context) -> Self {
        Self { ctx, stepper: Stepper::default(), start: web_time::Instant::now() }
    }
    pub fn submit(&mut self, job: Job) {
        self.stepper.submit(job);
        // The next frame starts it.
        self.ctx.request_repaint();
    }
    pub fn in_flight(&self) -> bool {
        self.stepper.in_flight()
    }
    pub fn background_busy(&self) -> bool {
        self.stepper.background_busy()
    }
    pub fn submitted(&self) -> u64 {
        self.stepper.submitted
    }
    pub fn poll_all(&mut self) -> Vec<Done> {
        let start = self.start;
        let done = self.stepper.poll(&mut || start.elapsed().as_secs_f64() * 1000.0);
        if done.is_none() && self.stepper.busy() {
            // More pieces to run: the next frame runs them.
            self.ctx.request_repaint();
        }
        done.into_iter().collect()
    }
    pub fn poll(&mut self) -> Option<Done> {
        self.poll_all().pop()
    }
}

/// Render synchronously from scratch (tests, screenshots).
pub fn render_now(job: &Job) -> Option<Done> {
    run(job, &mut RetainedSet::default())
}
