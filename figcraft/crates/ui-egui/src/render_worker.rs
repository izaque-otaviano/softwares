//! Canvas rendering off the UI thread (desktop) or in pieces between frames (web). The latest
//! request wins (queued older ones are skipped); the UI shows each finished image, re-projected to
//! the current view, until the next one arrives.
//! The renderer keeps its last image ([`figcraft_render::Retained`]): a pan renders only the
//! uncovered strips and an edit only the areas of the layers that changed.
//!
//! The browser has one thread for the UI and the renderer. A render in one go froze every frame it
//! took (a page of big photos: a second or more), so the web [`Stepper`] draws a few bands of the
//! view per frame, inside a time budget, and hands the image over when the last band is done.

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
}

pub struct Done {
    /// The image, ready for a texture (converted off the UI thread).
    pub image: egui::ColorImage,
    /// The view the image shows (the requested one snapped outwards to whole device pixels).
    pub view: View,
    pub ms: f64,
    pub work: Work,
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

/// The finished render of `job` as a texture image.
fn done(job: &Job, view: View, pix: &Pixmap, work: Work, ms: f64) -> Done {
    let mut image = screen_image(pix, job.doc.color_profile);
    if job.proof {
        mark_outside_srgb(&mut image, pix, job.doc.color_profile);
    }
    Done { image, view, ms, work }
}

fn run(job: &Job, retained: &mut Retained) -> Option<Done> {
    #[cfg(not(target_arch = "wasm32"))]
    let t0 = std::time::Instant::now();
    let (view, pix, work) = retained.render(&job.doc, job.page, &job.view, &options(job))?;
    #[cfg(not(target_arch = "wasm32"))]
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    #[cfg(target_arch = "wasm32")]
    let ms = 0.0;
    Some(done(job, view, pix, work, ms))
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
    retained: Retained,
    pending: Option<Job>,
    running: Option<Running>,
    /// Rows a piece of the next render covers (sized from how long rows took).
    rows: u32,
    budget_ms: f64,
}

impl Default for Stepper {
    fn default() -> Self {
        Self::new(FRAME_BUDGET_MS)
    }
}

impl Stepper {
    pub fn new(budget_ms: f64) -> Self {
        Self { retained: Retained::default(), pending: None, running: None, rows: 48, budget_ms }
    }

    pub fn submit(&mut self, job: Job) {
        self.pending = Some(job);
    }

    pub fn in_flight(&self) -> bool {
        self.pending.is_some() || self.running.is_some()
    }

    /// Rows a piece of the next render covers.
    pub fn rows(&self) -> u32 {
        self.rows
    }

    /// Run pieces of the render under way (starting the newest job when none is) for about the
    /// budget, `clock` giving milliseconds. The image when its last piece has run.
    pub fn poll(&mut self, clock: &mut dyn FnMut() -> f64) -> Option<Done> {
        if self.running.is_none() {
            let job = self.pending.take()?;
            let sliced = self.retained.begin(&job.doc, job.page, &job.view, &options(&job), self.rows)?;
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
        let (view, pix, work) = self.retained.finish(sliced)?;
        Some(done(&job, view, pix, work, ms))
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub struct Worker {
    tx: std::sync::mpsc::Sender<(u64, Job)>,
    rx: std::sync::mpsc::Receiver<Done>,
    /// Jobs submitted so far.
    submitted: u64,
    /// The newest job the thread is done with: rendered (or skipped for a newer one) and the UI
    /// woken for it.
    finished: Arc<std::sync::atomic::AtomicU64>,
}

#[cfg(not(target_arch = "wasm32"))]
impl Worker {
    pub fn new(ctx: egui::Context) -> Self {
        let (tx, jobs) = std::sync::mpsc::channel::<(u64, Job)>();
        let (done_tx, rx) = std::sync::mpsc::channel::<Done>();
        let finished = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let done_with = finished.clone();
        // The window that renders with it (each window has its own worker).
        let viewport = ctx.viewport_id();
        let spawned = std::thread::Builder::new().name("figcraft-render".into()).spawn(move || {
            let mut retained = Retained::default();
            while let Ok((mut seq, mut job)) = jobs.recv() {
                // Skip to the newest queued job.
                while let Ok(newer) = jobs.try_recv() {
                    (seq, job) = newer;
                }
                let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| run(&job, &mut retained)));
                let done = match res {
                    Ok(d) => d,
                    Err(_) => {
                        // Don't build on an image a panic may have left half drawn.
                        retained.clear();
                        None
                    }
                };
                if let Some(d) = done
                    && done_tx.send(d).is_err()
                {
                    break;
                }
                ctx.request_repaint_of(viewport);
                done_with.store(seq, std::sync::atomic::Ordering::Release);
            }
        });
        if let Err(e) = spawned {
            log::error!("render thread: {e}");
        }
        Self { tx, rx, submitted: 0, finished }
    }

    pub fn submit(&mut self, job: Job) {
        if self.tx.send((self.submitted + 1, job)).is_ok() {
            self.submitted += 1;
        }
    }

    /// Whether a submitted job is still rendering or hasn't woken the UI yet (a finished image
    /// may still wait for [`Self::poll`]).
    pub fn in_flight(&self) -> bool {
        self.finished.load(std::sync::atomic::Ordering::Acquire) < self.submitted
    }

    pub fn poll(&mut self) -> Option<Done> {
        let mut last = None;
        while let Ok(d) = self.rx.try_recv() {
            last = Some(d);
        }
        last
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
    pub fn poll(&mut self) -> Option<Done> {
        let start = self.start;
        let done = self.stepper.poll(&mut || start.elapsed().as_secs_f64() * 1000.0);
        if done.is_none() && self.stepper.in_flight() {
            // More pieces to run: the next frame runs them.
            self.ctx.request_repaint();
        }
        done
    }
}

/// Render synchronously from scratch (tests, screenshots).
pub fn render_now(job: &Job) -> Option<Done> {
    run(job, &mut Retained::default())
}
