//! Canvas rendering off the UI thread (desktop) or in pieces between frames (web). The latest
//! request wins (queued older ones are skipped); the UI shows each finished image, re-projected to
//! the current view, until the next one arrives.
//! The renderer keeps its last image ([`figcraft_render::Retained`]): a pan renders only the
//! uncovered strips and an edit only the areas of the layers that changed.
//!
//! The browser has one thread for the UI and the renderer. A render in one go froze every frame it
//! took (a page of big photos: a second or more), so the web [`Stepper`] draws a few bands of the
//! view per frame, inside a time budget, and hands the image over when the last band is done.

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
}

/// One kept image for each of the last few open files, under a byte budget: coming back to a tab
/// finds its image and re-renders only what changed since.
pub struct RetainedSet {
    map: HashMap<u64, Kept>,
    clock: u64,
    budget: usize,
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
        Self { map: HashMap::new(), clock: 0, budget }
    }

    fn get(&mut self, uid: u64) -> &mut Kept {
        self.clock += 1;
        let clock = self.clock;
        let k = self.map.entry(uid).or_insert_with(|| Kept { retained: Retained::default(), used: clock, serial: 0 });
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
fn done(job: &Job, kept: &mut Kept, view: View, work: Work, ms: f64) -> Option<Done> {
    let pix = kept.retained.image()?;
    let size = [pix.width() as usize, pix.height() as usize];
    kept.serial += 1;
    let (serial, base) = (kept.serial, kept.serial - 1);
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
    };
    // The grey stripes of a soft proof run across the whole image: no patches for it.
    if !job.proof
        && let Some(rects) = kept.retained.dirty()
    {
        let area: u64 = rects.iter().map(|r| u64::from(r[2]) * u64::from(r[3])).sum();
        if area as f64 <= MAX_PATCH_SHARE * (size[0] * size[1]) as f64 {
            let patches: Option<Patches> =
                rects.iter().map(|r| Some(([r[0] as usize, r[1] as usize], crop_image(pix, *r, job.doc.color_profile)?))).collect();
            if let Some(p) = patches {
                return Some(meta(egui::ColorImage::default(), Some(p)));
            }
        }
    }
    let mut image = screen_image(pix, job.doc.color_profile);
    if job.proof {
        mark_outside_srgb(&mut image, pix, job.doc.color_profile);
    }
    Some(meta(image, None))
}

impl Done {
    #[cfg(not(target_arch = "wasm32"))]
    /// Fold a newer render of the same file into this one: a client that missed this one gets the
    /// changes of both.
    fn absorb(mut self, newer: Done) -> Done {
        match (self.patches.take(), newer.patches) {
            (Some(mut mine), Some(theirs)) if self.size == newer.size && self.serial == newer.base => {
                mine.extend(theirs);
                Done { patches: Some(mine), base: self.base, ..newer }
            }
            (_, patches) => Done { patches, ..newer },
        }
    }
}

fn run(job: &Job, set: &mut RetainedSet) -> Option<Done> {
    #[cfg(not(target_arch = "wasm32"))]
    let t0 = std::time::Instant::now();
    let kept = set.get(job.uid);
    if job.fresh {
        kept.retained.clear();
    }
    let (view, _, work) = kept.retained.render(&job.doc, job.page, &job.view, &options(job))?;
    #[cfg(not(target_arch = "wasm32"))]
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    #[cfg(target_arch = "wasm32")]
    let ms = 0.0;
    let d = done(job, kept, view, work, ms);
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
}

/// Renders jobs in pieces, a few milliseconds a call: the browser's worker (it is the same code on
/// every target, so desktop tests exercise it). A job is never abandoned for a newer one: a
/// half-finished render leaves nothing for the next to patch, and the next would start over.
/// Newer jobs wait (the newest only), and run when the one under way is done.
pub struct Stepper {
    set: RetainedSet,
    pending: Option<Job>,
    running: Option<Running>,
    /// Rows a piece of the next render covers (sized from how long rows took).
    rows: u32,
    budget_ms: f64,
    /// Jobs submitted so far.
    submitted: u64,
}

impl Default for Stepper {
    fn default() -> Self {
        Self::new(FRAME_BUDGET_MS)
    }
}

impl Stepper {
    pub fn new(budget_ms: f64) -> Self {
        Self { set: RetainedSet::default(), pending: None, running: None, rows: 48, budget_ms, submitted: 0 }
    }

    pub fn submit(&mut self, job: Job) {
        // What the window shows comes before what it may show next.
        if job.background && self.pending.as_ref().is_some_and(|p| !p.background) {
            return;
        }
        self.pending = Some(job);
        self.submitted += 1;
    }

    pub fn in_flight(&self) -> bool {
        self.pending.as_ref().is_some_and(|j| !j.background) || self.running.as_ref().is_some_and(|r| !r.job.background)
    }

    /// Rows a piece of the next render covers.
    pub fn rows(&self) -> u32 {
        self.rows
    }

    /// The kept images.
    pub fn kept(&self) -> &RetainedSet {
        &self.set
    }

    /// Run pieces of the render under way (starting the newest job when none is) for about the
    /// budget, `clock` giving milliseconds. The image when its last piece has run.
    pub fn poll(&mut self, clock: &mut dyn FnMut() -> f64) -> Option<Done> {
        if self.running.is_none() {
            let job = self.pending.take()?;
            let kept = self.set.get(job.uid);
            if job.fresh {
                kept.retained.clear();
            }
            let sliced = kept.retained.begin(&job.doc, job.page, &job.view, &options(&job), self.rows)?;
            self.running = Some(Running { job, sliced, ms: 0.0 });
        }
        let run = self.running.as_mut()?;
        let start = clock();
        let deadline = start + self.budget_ms;
        let finished = run.sliced.step(&mut || clock() < deadline);
        run.ms += (clock() - start).max(0.0);
        if !finished {
            return None;
        }
        let Running { job, sliced, ms } = self.running.take()?;
        // The next render's pieces: about three quarters of a budget each.
        let rows = sliced.rows();
        if rows > 0 && ms > 0.0 && ms.is_finite() {
            let per_row = ms / rows as f64;
            let fit = (self.budget_ms * 0.75 / per_row)
                .clamp(f64::from(figcraft_render::retained::MIN_ROWS), f64::from(figcraft_render::retained::MAX_ROWS));
            self.rows = (f64::from(self.rows) * 0.5 + fit * 0.5) as u32;
        }
        let kept = self.set.get(job.uid);
        let (view, _, work) = kept.retained.finish(sliced)?;
        let d = done(&job, kept, view, work, ms);
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
            let mut set = RetainedSet::default();
            // Background jobs wait here, the newest for each file.
            let mut later: Vec<Job> = Vec::new();
            let mut skipped_later = 0u64;
            'jobs: loop {
                let mut show: Option<(u64, Job)> = None;
                let mut take = |m: Msg, show: &mut Option<(u64, Job)>, later: &mut Vec<Job>| match m {
                    Msg::Show(seq, job) => *show = Some((seq, job)),
                    Msg::Next(job) => {
                        if let Some(at) = later.iter().position(|j| j.uid == job.uid) {
                            later.remove(at);
                            skipped_later += 1;
                        }
                        later.push(job);
                    }
                };
                // Wait for work (not while background jobs are waiting), then take everything queued.
                if later.is_empty() {
                    match jobs.recv() {
                        Ok(m) => take(m, &mut show, &mut later),
                        Err(_) => break 'jobs,
                    }
                }
                while let Ok(m) = jobs.try_recv() {
                    take(m, &mut show, &mut later);
                }
                if skipped_later > 0 {
                    next_with.fetch_add(skipped_later, Ordering::AcqRel);
                    skipped_later = 0;
                }
                // The window's own file first (skipping to the newest request), else a background job.
                let (seq, job) = match show {
                    Some(x) => x,
                    None if !later.is_empty() => (0, later.remove(0)),
                    None => continue,
                };
                let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&job, &mut set)));
                let done = match res {
                    Ok(d) => d,
                    Err(_) => {
                        // Don't build on an image a panic may have left half drawn.
                        set.get(job.uid).retained.clear();
                        None
                    }
                };
                if let Some(d) = done
                    && done_tx.send(d).is_err()
                {
                    break;
                }
                ctx.request_repaint_of(viewport);
                if job.background {
                    next_with.fetch_add(1, Ordering::AcqRel);
                } else {
                    done_with.store(seq, Ordering::Release);
                }
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
        self.stepper.pending.as_ref().is_some_and(|j| j.background) || self.stepper.running.as_ref().is_some_and(|r| r.job.background)
    }
    pub fn submitted(&self) -> u64 {
        self.stepper.submitted
    }
    pub fn poll_all(&mut self) -> Vec<Done> {
        let start = self.start;
        let done = self.stepper.poll(&mut || start.elapsed().as_secs_f64() * 1000.0);
        if done.is_none() && self.stepper.in_flight() {
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
