//! Fast scrolling of a page of photos: how much of the screen shows no content (bare page
//! background, "grey") while it scrolls, and how long after it stops the screen is covered. A
//! simulated scroll of 300 to 400 device pixels a step over a heavy synthetic shop page, run
//! against the browser's renderer ([`Stepper`], one thread, 8 ms a frame) and the desktop
//! thread ([`Worker`]), with the screen-first renderer and with the one before it
//! ([`Stepper::baseline`]: whole-window hand-over, fixed margin, no drafts, tiles or decoding
//! ahead). The timing runs are `#[ignore]`d (run them alone, `--ignored --nocapture`); the
//! checks below them are not.

use std::sync::Arc;

use figcraft_doc::{Document, NodeId};
use figcraft_engine::synthetic_shop::{ShopSpec, shop_document};
use figcraft_render::View;

use crate::canvas::{Lead, Motion, OVERSCAN, plan_view, plan_view_moving};
use crate::render_worker::{Done, Job, Stepper, render_now};

const SW: u32 = 1280;
const SH: u32 = 800;
const FRAME_MS: f64 = 1000.0 / 60.0;

fn heavy_shop() -> (Arc<Document>, NodeId) {
    let (doc, page) = shop_document(&ShopSpec { screens: 5, cards: 4, distinct_photos: 20, photo_px: 2400, frosted_header: false }).unwrap();
    (Arc::new(doc), page)
}

fn small_shop() -> (Arc<Document>, NodeId) {
    let (doc, page) = shop_document(&ShopSpec { screens: 2, cards: 3, distinct_photos: 4, photo_px: 500, frosted_header: true }).unwrap();
    (Arc::new(doc), page)
}

fn job(doc: &Arc<Document>, page: NodeId, view: View, focus: Option<View>, draft: bool) -> Job {
    Job {
        doc: doc.clone(),
        page,
        view,
        outline: false,
        outline_extras: Default::default(),
        outlined: vec![],
        skip: vec![],
        solo: None,
        proof: false,
        draft,
        uid: 0,
        background: false,
        fresh: false,
        focus,
    }
}

/// What the canvas texture holds: the image and the view it shows.
#[derive(Default)]
struct Shown {
    image: Option<egui::ColorImage>,
    view: Option<View>,
    serial: u64,
}

impl Shown {
    fn apply(&mut self, d: Done) {
        match d.patches {
            Some(patches) => {
                let Some(img) = self.image.as_mut().filter(|i| i.size == d.size && self.serial == d.base) else {
                    panic!("patches against another picture ({} vs base {})", self.serial, d.base)
                };
                let w = img.size[0];
                for ([x, y], p) in patches {
                    for row in 0..p.size[1] {
                        let dst = (y + row) * w + x;
                        img.pixels[dst..dst + p.size[0]].copy_from_slice(&p.pixels[row * p.size[0]..(row + 1) * p.size[0]]);
                    }
                }
            }
            None => self.image = Some(d.image),
        }
        self.view = Some(d.view);
        self.serial = d.serial;
    }

    /// The share of the screen `screen` (sampled every 8 pixels) the texture leaves bare.
    fn grey(&self, screen: &View) -> f64 {
        let (Some(img), Some(v)) = (&self.image, &self.view) else { return 1.0 };
        let (mut bare, mut all) = (0u32, 0u32);
        for sy in (0..screen.height).step_by(8) {
            for sx in (0..screen.width).step_by(8) {
                all += 1;
                let px = (screen.origin.0 + f64::from(sx) / screen.scale - v.origin.0) * v.scale;
                let py = (screen.origin.1 + f64::from(sy) / screen.scale - v.origin.1) * v.scale;
                let (x, y) = (px.floor(), py.floor());
                let inside = x >= 0.0 && y >= 0.0 && (x as usize) < img.size[0] && (y as usize) < img.size[1];
                if !inside || img.pixels[y as usize * img.size[0] + x as usize].a() == 0 {
                    bare += 1;
                }
            }
        }
        f64::from(bare) / f64::from(all.max(1))
    }
}

/// The scroll: `steps` jumps of 300 to 400 px, one every `every` frames, then still.
fn screen_at(frame: usize, every: usize, steps: usize) -> View {
    let jumps = (frame / every).min(steps);
    let y: f64 = (0..jumps).map(|i| 300.0 + ((i * 37) % 101) as f64).sum();
    View { origin: (0.0, y), scale: 1.0, width: SW, height: SH }
}

#[derive(Debug)]
#[allow(dead_code)] // read through Debug
struct Result {
    /// Mean and worst share of the screen bare while scrolling (frames after the first picture).
    mean_grey: f64,
    max_grey: f64,
    /// Milliseconds from the last step to a fully covered screen (at full resolution).
    settle_ms: f64,
    /// Mean over the scroll of the ms each step's screen took to be fully covered.
    cover_ms: f64,
}

/// The canvas's planning for a frame: the view to render, whether it is a draft, at what scale.
fn plan(new: bool, motion: &mut Motion, screen: &View, last: Option<&View>, now_s: f64, latency: f64) -> (View, View, bool) {
    if !new {
        return (plan_view(screen, last, 16_384), screen.clone(), false);
    }
    motion.observe(screen.origin, screen.scale, now_s);
    let draft = motion.drafting(now_s);
    let k = if draft { 0.5 } else { 1.0 };
    let wanted = View {
        scale: screen.scale * k,
        width: screen.width.div_ceil(if draft { 2 } else { 1 }),
        height: screen.height.div_ceil(if draft { 2 } else { 1 }),
        ..screen.clone()
    };
    let lead = (motion.speed() > 0.0).then_some(Lead { v: (motion.v.0 * k, motion.v.1 * k), latency });
    let last = last.filter(|l| l.scale == wanted.scale);
    (plan_view_moving(&wanted, last, 16_384, lead), wanted, draft)
}

/// Scroll with the browser's renderer, time measured for real (8 ms of rendering a frame).
fn run_stepper(doc: &Arc<Document>, page: NodeId, new: bool, every: usize, steps: usize) -> Result {
    figcraft_render::mips::global().clear();
    let mut st = if new { Stepper::new(8.0) } else { Stepper::new(8.0).baseline() };
    let start = std::time::Instant::now();
    let mut clock = move || start.elapsed().as_secs_f64() * 1000.0;
    // Simulated time: a frame takes at least FRAME_MS, more when the render ran over.
    let mut now = 0.0;
    let mut shown = Shown::default();
    let mut motion = Motion::default();
    let mut submitted: Option<(View, bool)> = None;
    let mut submitted_at = 0.0;
    let mut latency = 0.1;
    let mut awaiting = false;
    let (mut grey_sum, mut grey_n, mut grey_max) = (0.0, 0, 0.0f64);
    let last_step_frame = every * steps;
    let mut settle_ms = f64::NAN;
    // Each step's screen: when it first showed, when it was covered.
    let mut step_start = 0.0;
    let mut covered_ms: Vec<f64> = vec![];
    let mut step_covered = false;
    for frame in 0..100_000 {
        let screen = screen_at(frame, every, steps);
        if frame % every == 0 && frame <= last_step_frame {
            if frame > 0 && !step_covered {
                covered_ms.push(now - step_start);
            }
            step_start = now;
            step_covered = false;
        }
        let (view, wanted, draft) = plan(new, &mut motion, &screen, submitted.as_ref().map(|(v, _)| v), now / 1000.0, latency);
        if submitted.as_ref() != Some(&(view.clone(), draft)) {
            st.submit(job(doc, page, view.clone(), new.then(|| wanted.clone()), draft));
            submitted = Some((view, draft));
            submitted_at = now;
            awaiting = true;
        }
        let t0 = clock();
        let done = st.poll(&mut clock);
        let spent = clock() - t0;
        if let Some(d) = done {
            if awaiting {
                awaiting = false;
                latency = latency * 0.7 + ((now - submitted_at) / 1000.0) * 0.3;
            }
            shown.apply(d);
        }
        let g = shown.grey(&screen);
        let full_res = shown.view.as_ref().is_some_and(|v| v.scale == screen.scale);
        if shown.image.is_some() && frame <= last_step_frame && frame > every {
            grey_sum += g;
            grey_n += 1;
            grey_max = grey_max.max(g);
        }
        if g == 0.0 && !step_covered && frame <= last_step_frame {
            step_covered = true;
            covered_ms.push(now - step_start);
        }
        if frame > last_step_frame && g == 0.0 && full_res && !st.in_flight() {
            settle_ms = now - (last_step_frame as f64 * FRAME_MS);
            break;
        }
        now += FRAME_MS.max(spent + 2.0);
        if now > 120_000.0 {
            break;
        }
    }
    Result {
        mean_grey: grey_sum / f64::from(grey_n.max(1)),
        max_grey: grey_max,
        settle_ms,
        cover_ms: covered_ms.iter().sum::<f64>() / covered_ms.len().max(1) as f64,
    }
}

/// Scroll with the desktop thread in real time.
fn run_desktop(doc: &Arc<Document>, page: NodeId, new: bool, every: usize, steps: usize) -> Result {
    figcraft_render::mips::global().clear();
    let st = if new { Stepper::whole_pieces() } else { Stepper::whole_pieces().baseline() };
    let mut worker = crate::render_worker::Worker::with_stepper(egui::Context::default(), st);
    let start = std::time::Instant::now();
    let now = || start.elapsed().as_secs_f64() * 1000.0;
    let mut shown = Shown::default();
    let mut motion = Motion::default();
    let mut submitted: Option<(View, bool)> = None;
    let (mut submitted_at, mut latency, mut awaiting) = (0.0, 0.1, false);
    let (mut grey_sum, mut grey_n, mut grey_max) = (0.0, 0, 0.0f64);
    let mut settle_ms = f64::NAN;
    let mut step_start = 0.0;
    let mut covered_ms: Vec<f64> = vec![];
    let mut step_covered = false;
    let mut stopped_at = None;
    let mut frame = 0usize;
    let mut last_step = usize::MAX;
    while now() < 60_000.0 {
        // Frames by the clock: the scroll steps every `every` frames of real time.
        let t = now();
        let f = (t / FRAME_MS) as usize;
        let screen = screen_at(f, every, steps);
        let step = (f / every).min(steps);
        if step != last_step {
            if last_step != usize::MAX && !step_covered {
                covered_ms.push(t - step_start);
            }
            last_step = step;
            step_start = t;
            step_covered = false;
            if step == steps {
                stopped_at = Some(t);
            }
        }
        let (view, wanted, draft) = plan(new, &mut motion, &screen, submitted.as_ref().map(|(v, _)| v), t / 1000.0, latency);
        if submitted.as_ref() != Some(&(view.clone(), draft)) {
            worker.submit(job(doc, page, view.clone(), new.then(|| wanted.clone()), draft));
            submitted = Some((view, draft));
            submitted_at = t;
            awaiting = true;
        }
        for d in worker.poll_all() {
            if awaiting {
                awaiting = false;
                latency = latency * 0.7 + ((now() - submitted_at) / 1000.0) * 0.3;
            }
            shown.apply(d);
        }
        let g = shown.grey(&screen);
        if shown.image.is_some() && stopped_at.is_none() && step > 1 {
            grey_sum += g;
            grey_n += 1;
            grey_max = grey_max.max(g);
        }
        if g == 0.0 && !step_covered && stopped_at.is_none() {
            step_covered = true;
            covered_ms.push(t - step_start);
        }
        let full_res = shown.view.as_ref().is_some_and(|v| v.scale == screen.scale);
        if let Some(s) = stopped_at
            && g == 0.0
            && full_res
            && !worker.in_flight()
        {
            settle_ms = t - s;
            break;
        }
        frame += 1;
        std::thread::sleep(std::time::Duration::from_secs_f64((FRAME_MS - (now() - t)).max(1.0) / 1000.0));
    }
    let _ = frame;
    Result {
        mean_grey: grey_sum / f64::from(grey_n.max(1)),
        max_grey: grey_max,
        settle_ms,
        cover_ms: covered_ms.iter().sum::<f64>() / covered_ms.len().max(1) as f64,
    }
}

#[test]
#[ignore = "timing: run alone with --ignored --nocapture"]
fn bench_fast_scroll_browser_renderer() {
    let (doc, page) = heavy_shop();
    for every in [3, 6] {
        let old = run_stepper(&doc, page, false, every, 14);
        let new = run_stepper(&doc, page, true, every, 14);
        println!("web, a step every {every} frames: before {old:?}\n                              after  {new:?}");
    }
}

#[test]
#[ignore = "timing: run alone with --ignored --nocapture"]
fn bench_fast_scroll_desktop_renderer() {
    let (doc, page) = heavy_shop();
    for every in [3, 6] {
        let old = run_desktop(&doc, page, false, every, 14);
        let new = run_desktop(&doc, page, true, every, 14);
        println!("desktop, a step every {every} frames: before {old:?}\n                                  after  {new:?}");
    }
}

/// Polls until the final image arrives, applying every hand-over; returns the shown picture and
/// how many hand-overs came before the final one.
fn until_final(s: &mut Stepper, shown: &mut Shown) -> usize {
    let mut partials = 0;
    let mut t = 0.0;
    for _ in 0..20_000 {
        if let Some(d) = s.poll(&mut || {
            t += 1.0;
            t
        }) {
            let last = !d.partial;
            partials += usize::from(d.partial);
            shown.apply(d);
            if last && !s.in_flight() {
                return partials;
            }
        }
    }
    panic!("never finished");
}

fn same(a: &egui::ColorImage, b: &egui::ColorImage) -> (f64, u8) {
    assert_eq!(a.size, b.size);
    let mut sum = 0u64;
    let mut max = 0u8;
    for (p, q) in a.pixels.iter().zip(&b.pixels) {
        for (x, y) in p.to_array().iter().zip(q.to_array()) {
            let d = x.abs_diff(y);
            sum += u64::from(d);
            max = max.max(d);
        }
    }
    (sum as f64 / (a.pixels.len() * 4) as f64, max)
}

#[test]
fn the_screen_is_handed_over_first_and_the_finished_image_is_the_whole_render() {
    let (doc, page) = small_shop();
    let screen = View { origin: (100.0, 300.0), scale: 0.5, width: 400, height: 300 };
    let view = plan_view(&screen, None, 16_384);
    let mut s = Stepper::new(4.0);
    let mut shown = Shown::default();
    s.submit(job(&doc, page, view.clone(), Some(screen.clone()), false));
    // Run until the first hand-over: the screen is covered, the margin isn't all there yet.
    let mut t = 0.0;
    let first = loop {
        if let Some(d) = s.poll(&mut || {
            t += 1.0;
            t
        }) {
            break d;
        }
    };
    assert!(first.partial, "the screen's part comes before the rest");
    shown.apply(first);
    assert_eq!(shown.grey(&screen), 0.0, "the screen is covered by the first hand-over");
    let margin = View { origin: (view.origin.0, view.origin.1), width: view.width, height: view.height, ..screen.clone() };
    assert!(shown.grey(&margin) > 0.0, "the margin is still to come");
    until_final(&mut s, &mut shown);
    let whole = render_now(&job(&doc, page, view, None, false)).unwrap();
    let (mean, _) = same(shown.image.as_ref().unwrap(), &whole.image);
    assert!(mean < 0.5, "mean difference {mean}");
    // Against the same renderer handing the image over only once it is finished: identical.
    let mut b = Stepper::new(4.0).baseline();
    let mut once = Shown::default();
    b.submit(job(&doc, page, plan_view(&screen, None, 16_384), None, false));
    assert_eq!(until_final(&mut b, &mut once), 0);
    // Bands cut where the screen ends: anti-aliasing there may round a level apart, no more.
    let (mean, max) = same(shown.image.as_ref().unwrap(), once.image.as_ref().unwrap());
    assert!(max <= 1 && mean < 1e-3, "{mean} {max}");
}

#[test]
fn a_render_the_scroll_went_past_gives_way_and_its_drawing_is_kept() {
    let (doc, page) = small_shop();
    let screen = |y: f64| View { origin: (0.0, y), scale: 0.5, width: 400, height: 300 };
    let mut s = Stepper::new(2.0);
    let mut shown = Shown::default();
    let a = plan_view(&screen(0.0), None, 16_384);
    s.submit(job(&doc, page, a.clone(), Some(screen(0.0)), false));
    until_final(&mut s, &mut shown);
    // A pan starts B; before it is done, the screen is far past it.
    let b = plan_view(&screen(500.0), Some(&a), 16_384);
    s.submit(job(&doc, page, b.clone(), Some(screen(500.0)), false));
    let mut t = 0.0;
    assert!(
        s.poll(&mut || {
            t += 1.0;
            t
        })
        .is_none_or(|d| {
            shown.apply(d);
            true
        })
    );
    let c = plan_view(&screen(1400.0), Some(&b), 16_384);
    s.submit(job(&doc, page, c.clone(), Some(screen(1400.0)), false));
    until_final(&mut s, &mut shown);
    assert_eq!(s.abandoned, 1, "B gave way to C");
    let whole = render_now(&job(&doc, page, c, None, false)).unwrap();
    assert_eq!(shown.view.as_ref(), Some(&whole.view));
    let (mean, _) = same(shown.image.as_ref().unwrap(), &whole.image);
    assert!(mean < 0.5, "mean difference {mean}");
    // A newer job whose screen B covers waits for it (it shows it soonest).
    let d = plan_view(&screen(1450.0), Some(&shown.view.clone().unwrap()), 16_384);
    s.submit(job(&doc, page, d, Some(screen(1450.0)), false));
    until_final(&mut s, &mut shown);
    assert_eq!(s.abandoned, 1);
}

#[test]
fn scrolling_back_copies_kept_tiles_and_matches_a_fresh_render() {
    let (doc, page) = shop_document(&ShopSpec { screens: 2, cards: 3, distinct_photos: 4, photo_px: 500, frosted_header: false }).unwrap();
    let doc = Arc::new(doc);
    let mut s = Stepper::new(1e9);
    let mut shown = Shown::default();
    let v = |y: f64| View { origin: (0.0, y), scale: 0.5, width: 700, height: 500 };
    for y in [0.0, 600.0, 1200.0, 600.0, 0.0] {
        s.submit(job(&doc, page, v(y), Some(v(y)), false));
        until_final(&mut s, &mut shown);
    }
    assert!(s.kept().bytes() > 0);
    assert!(s.tiled > 0, "coming back copied nothing");
    let whole = render_now(&job(&doc, page, v(0.0), None, false)).unwrap();
    let (mean, _) = same(shown.image.as_ref().unwrap(), &whole.image);
    assert!(mean < 0.5, "mean difference {mean}");
    // An edit drops the tiles it touches: a layer of the first screen fades and comes out right.
    let mut edited = (*doc).clone();
    let screen0 = edited.node(page).unwrap().children[0];
    let inner = edited.node(screen0).unwrap().children[1];
    edited.node_mut(inner).unwrap().opacity = 0.3;
    let edited = Arc::new(edited);
    for y in [600.0, 0.0] {
        s.submit(job(&edited, page, v(y), Some(v(y)), false));
        until_final(&mut s, &mut shown);
    }
    let whole = render_now(&job(&edited, page, v(0.0), None, false)).unwrap();
    let (mean, _) = same(shown.image.as_ref().unwrap(), &whole.image);
    assert!(mean < 0.5, "after an edit: mean difference {mean}");
}

#[test]
fn a_fast_pan_drafts_and_the_draft_never_stays() {
    let mut m = Motion::default();
    // 330 px every 50 ms: about 6600 px/s.
    for i in 0..10 {
        m.observe((0.0, f64::from(i) * 330.0), 1.0, f64::from(i) * 0.05);
    }
    assert!(m.speed() > crate::canvas::SCROLL_DRAFT_SPEED, "{}", m.speed());
    assert!(m.drafting(0.46));
    // It stops: within SCROLL_SETTLE of the last fast step, still a draft; after, never.
    let last = 0.45;
    m.observe((0.0, 9.0 * 330.0), 1.0, last + 0.2);
    m.observe((0.0, 9.0 * 330.0), 1.0, last + 0.3);
    assert_eq!(m.speed(), 0.0);
    assert!(!m.drafting(last + 0.3), "a draft outlived the pan");
    // A slow pan isn't drafted at all.
    let mut slow = Motion::default();
    for i in 0..20 {
        slow.observe((0.0, f64::from(i) * 20.0), 1.0, f64::from(i) * 0.016);
    }
    assert!(!slow.drafting(0.33), "{}", slow.speed());
    // Junk doesn't panic and resets.
    m.observe((f64::NAN, 0.0), 1.0, 1.0);
    assert_eq!(m.speed(), 0.0);
}

#[test]
fn the_margin_grows_ahead_of_a_fast_pan_within_the_texture_limit() {
    let screen = View { origin: (0.0, 1000.0), scale: 1.0, width: 1280, height: 800 };
    let still = plan_view_moving(&screen, None, 16_384, None);
    assert_eq!(still, plan_view(&screen, None, 16_384));
    // Down at 6000 px/s with renders taking 150 ms: some 1350 px ahead (capped at 1.25 screens).
    let down = plan_view_moving(&screen, None, 16_384, Some(Lead { v: (0.0, 6000.0), latency: 0.15 }));
    let above = (screen.origin.1 - down.origin.1) * screen.scale;
    let below = f64::from(down.height) - above - f64::from(screen.height);
    assert!((1000.0..=1.25 * 800.0 + 1.0).contains(&below), "{below}");
    assert!(above < f64::from(screen.height) * OVERSCAN, "{above}");
    // Up: the other way round.
    let up = plan_view_moving(&screen, None, 16_384, Some(Lead { v: (0.0, -6000.0), latency: 0.15 }));
    assert!(screen.origin.1 - up.origin.1 >= 1000.0);
    // Never over the texture limit.
    let small = plan_view_moving(&screen, None, 1500, Some(Lead { v: (0.0, 60_000.0), latency: 1.0 }));
    assert!(small.height <= 1500 && small.width <= 1500, "{small:?}");
    // A planned view is kept while the pan has margin to spare, and junk is the still plan.
    let next = View { origin: (0.0, 1200.0), ..screen.clone() };
    assert_eq!(plan_view_moving(&next, Some(&down), 16_384, Some(Lead { v: (0.0, 6000.0), latency: 0.15 })), down);
    let junk = plan_view_moving(&screen, None, 16_384, Some(Lead { v: (f64::NAN, 1.0), latency: 0.1 }));
    assert_eq!(junk, still);
}

#[test]
fn pictures_near_the_view_decode_while_nothing_renders() {
    let (doc, page) = small_shop();
    let screen = View { origin: (0.0, 0.0), scale: 0.5, width: 400, height: 300 };
    let opts = figcraft_render::Options { lod: true, ..Default::default() };
    let near = figcraft_render::prefetch::needs_near(&doc, page, &screen, &opts, 3.0);
    let on_screen = figcraft_render::prefetch::needs(&doc, page, &screen, &opts);
    assert!(near.len() >= on_screen.len());
    // Nearest first: what is on screen leads the list.
    for n in &on_screen {
        assert!(near.iter().position(|m| m == n).unwrap() < on_screen.len().max(1) + near.len());
    }
    let mut a = figcraft_render::prefetch::Ahead::new(&doc, page, &screen, &opts, 3.0);
    let mut steps = 0;
    while a.step(1) && steps < 1000 {
        steps += 1;
    }
    assert_eq!(a.left(), 0);
    // Junk views don't panic.
    let junk = View { origin: (f64::NAN, 0.0), scale: f64::INFINITY, width: 0, height: u32::MAX };
    let _ = figcraft_render::prefetch::needs_near(&doc, page, &junk, &opts, f64::NAN);
    let _ = figcraft_render::prefetch::needs_near(&doc, page, &screen, &opts, 1e12);
}
