//! The browser's renderer draws in pieces between frames: the same image as a render in one go, a
//! few milliseconds at a time, one job at a time.

use std::sync::Arc;

use figcraft_doc::{Document, NodeId};
use figcraft_engine::synthetic_shop::{ShopSpec, shop_document};
use figcraft_render::View;

use crate::render_worker::{Done, Job, Stepper, render_now};

fn shop() -> (Arc<Document>, NodeId) {
    let (doc, page) = shop_document(&ShopSpec { screens: 2, cards: 3, distinct_photos: 4, photo_px: 500, frosted_header: true }).unwrap();
    (Arc::new(doc), page)
}

fn job(doc: &Arc<Document>, page: NodeId, view: View) -> Job {
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
        draft: false,
        uid: 0,
        background: false,
        fresh: false,
        focus: None,
    }
}

fn view(x: f64, y: f64, scale: f64) -> View {
    View { origin: (x, y), scale, width: 700, height: 500 }
}

/// A clock that moves `tick` ms each time it is read.
struct Clock {
    now: f64,
    tick: f64,
    reads: usize,
}

impl Clock {
    fn new(tick: f64) -> Self {
        Self { now: 0.0, tick, reads: 0 }
    }
    fn read(&mut self) -> f64 {
        self.now += self.tick;
        self.reads += 1;
        self.now
    }
}

/// Polls until an image arrives; returns it and how many polls it took.
fn until_done(s: &mut Stepper, clock: &mut Clock) -> (Done, usize) {
    for polls in 1..5000 {
        if let Some(d) = s.poll(&mut || clock.read()) {
            return (d, polls);
        }
    }
    panic!("never finished");
}

fn mean_diff(a: &egui::ColorImage, b: &egui::ColorImage) -> f64 {
    assert_eq!(a.size, b.size);
    let sum: u64 =
        a.pixels.iter().zip(&b.pixels).map(|(p, q)| p.to_array().iter().zip(q.to_array()).map(|(x, y)| u64::from(x.abs_diff(y))).sum::<u64>()).sum();
    sum as f64 / (a.pixels.len() * 4) as f64
}

#[test]
fn a_render_takes_several_frames_and_comes_out_as_the_render_in_one_go() {
    let (doc, page) = shop();
    // Zoom 0.3 over the first screen: photos at several levels, shadows, text.
    let j = job(&doc, page, view(0.0, 0.0, 0.3));
    let mut s = Stepper::new(8.0);
    s.submit(j.clone());
    assert!(s.in_flight());
    // Each read of the clock costs 2 ms: about three pieces a poll.
    let (done, polls) = until_done(&mut s, &mut Clock::new(2.0));
    assert!(polls > 2, "{polls} polls: a frame's budget should not draw it all");
    assert!(!s.in_flight());
    let whole = render_now(&j).unwrap();
    assert_eq!(done.view, whole.view);
    let diff = mean_diff(&done.image, &whole.image);
    assert!(diff < 0.5, "mean difference {diff}");
}

#[test]
fn every_poll_runs_a_piece_however_small_the_budget() {
    let (doc, page) = shop();
    let mut s = Stepper::new(0.0);
    s.submit(job(&doc, page, view(0.0, 0.0, 0.3)));
    let mut clock = Clock::new(1.0);
    // No budget at all: one piece a poll, so it still finishes.
    let (_, polls) = until_done(&mut s, &mut clock);
    assert!(polls > 5, "{polls}");
    // And a roomy one does it in one.
    let mut s2 = Stepper::new(1e9);
    s2.submit(job(&doc, page, view(0.0, 0.0, 0.31)));
    assert_eq!(until_done(&mut s2, &mut Clock::new(0.001)).1, 1);
}

#[test]
fn a_newer_job_waits_for_the_one_under_way() {
    let (doc, page) = shop();
    let a = job(&doc, page, view(0.0, 0.0, 0.3));
    let b = job(&doc, page, view(40.0, 0.0, 0.3));
    let mut s = Stepper::new(8.0);
    s.submit(a.clone());
    let mut clock = Clock::new(2.0);
    assert!(s.poll(&mut || clock.read()).is_none());
    // B arrives while A is half drawn; so does a newer C, which replaces B in the queue.
    s.submit(b.clone());
    let c = job(&doc, page, view(80.0, 0.0, 0.3));
    s.submit(c.clone());
    let (first, _) = until_done(&mut s, &mut clock);
    assert_eq!(first.view, render_now(&a).unwrap().view, "A finishes first, not abandoned");
    assert!(s.in_flight(), "C is next");
    let (second, _) = until_done(&mut s, &mut clock);
    assert_eq!(second.view, render_now(&c).unwrap().view, "then the newest");
    assert!(!s.in_flight());
}

#[test]
fn a_pan_after_a_render_patches_only_the_strip() {
    let (doc, page) = shop();
    let mut s = Stepper::new(8.0);
    let mut clock = Clock::new(1.0);
    s.submit(job(&doc, page, view(0.0, 0.0, 0.3)));
    assert!(matches!(until_done(&mut s, &mut clock).0.work, figcraft_render::Work::Full));
    s.submit(job(&doc, page, view(0.0, 60.0, 0.3)));
    let (done, _) = until_done(&mut s, &mut clock);
    assert!(matches!(done.work, figcraft_render::Work::Partial { .. }), "{:?}", done.work);
}

#[test]
fn pieces_are_sized_from_how_long_rows_take() {
    let (doc, page) = shop();
    // Slow rows: the pieces shrink to the least.
    let mut slow = Stepper::new(8.0);
    for i in 0..4 {
        slow.submit(job(&doc, page, view(0.0, 0.0, 0.3 + f64::from(i) * 0.01)));
        until_done(&mut slow, &mut Clock::new(50.0));
    }
    assert!(slow.rows() < 32, "{}: pieces of 48 rows took far too long", slow.rows());
    // Fast ones: they grow (up to the most).
    let mut fast = Stepper::new(8.0);
    for i in 0..6 {
        fast.submit(job(&doc, page, view(0.0, 0.0, 0.3 + f64::from(i) * 0.01)));
        until_done(&mut fast, &mut Clock::new(0.0001));
    }
    assert!(fast.rows() > 100, "{}", fast.rows());
    // Junk jobs are dropped, not a panic.
    let mut s = Stepper::new(8.0);
    s.submit(job(&doc, page, View { origin: (f64::NAN, 0.0), scale: 0.0, width: u32::MAX, height: 0 }));
    assert!(s.poll(&mut || 0.0).is_none());
    assert!(!s.in_flight());
}
