//! Switching between open files: a tab shows the picture it had when it was left at once (not an
//! empty canvas or another file's picture) and the render that refines it changes nothing visible;
//! a tab beside the active one is rendered ahead while the canvas is quiet.

use std::time::Instant;

use egui::Modifiers;
use figcraft_doc::Document;
use figcraft_engine::synthetic_shop::{ShopSpec, shop_document};
use figcraft_engine::{DocState, Session};
use serde_json::json;

use crate::canvas_drop_tests::{Cap, diff};

fn shop_doc(photo_px: u32, photos: usize) -> Document {
    let spec = ShopSpec { screens: 2, cards: 3, distinct_photos: photos, photo_px, frosted_header: false };
    let (doc, _) = shop_document(&spec).unwrap();
    doc
}

/// Frames at 60 Hz until the canvas shows document `want`; how long that took (ms).
fn until_shown(c: &mut Cap, want: &std::sync::Arc<Document>) -> f64 {
    let t = Instant::now();
    for _ in 0..600 {
        let f = Instant::now();
        c.frame(vec![], Modifiers::NONE);
        if c.app.canvas.tex_doc_is(want) {
            break;
        }
        c.pace(f);
    }
    t.elapsed().as_secs_f64() * 1000.0
}

struct Tabs {
    c: Cap,
    uid: [u64; 2],
}

/// Two shop pages of their own photos, the first active and rendered.
fn two_tabs(ppp: f32) -> Tabs {
    let mut s = Session::with_document(shop_doc(1600, 4));
    s.docs.push(DocState::new(shop_doc(1200, 3), None));
    s.active = 0;
    let uid = [s.docs[0].uid, s.docs[1].uid];
    let mut c = Cap::new(s, ppp);
    c.settle();
    Tabs { c, uid }
}

fn doc_of(c: &Cap, i: usize) -> std::sync::Arc<Document> {
    c.app.session.docs[i].doc.clone()
}

fn switch(c: &mut Cap, i: usize) {
    c.app.run("doc.switch", json!({"index": i}));
}

#[derive(Debug)]
struct Report {
    /// Opening the second tab for the first time: until its page is on the canvas (ms).
    cold_ms: f64,
    /// Back to the first: the first frame's own time, and until the fresh render is shown (ms).
    back_frame_ms: f64,
    back_refined_ms: f64,
    /// The first frame after switching back against the picture the tab had when it was left,
    /// and the page once the refining render has landed against that too.
    first: crate::canvas_drop_tests::Diff,
    refined: crate::canvas_drop_tests::Diff,
}

fn switch_report(ppp: f32, idle_frames: usize) -> Report {
    let mut t = two_tabs(ppp);
    let img_a = t.c.canvas_image();
    // Quiet time on the first tab: the second is rendered ahead (or not, with none).
    for _ in 0..idle_frames {
        let f = Instant::now();
        t.c.frame(vec![], Modifiers::NONE);
        t.c.pace(f);
    }
    let b = doc_of(&t.c, 1);
    switch(&mut t.c, 1);
    let cold_ms = until_shown(&mut t.c, &b);
    t.c.settle();
    let img_b = t.c.canvas_image();
    // Back to the first.
    let a = doc_of(&t.c, 0);
    switch(&mut t.c, 0);
    let back_frame_ms = t.c.frame(vec![], Modifiers::NONE);
    let (first, _) = diff(&t.c.canvas_image(), &img_a);
    // The render that follows (what the user waited for before): its work and time.
    t.c.settle();
    let (back_work, back_render_ms) = (t.c.app.canvas.render_work, t.c.app.ui.render_ms);
    let back_refined_ms = back_render_ms;
    println!("   back: the render thread did {back_work:?} in {back_render_ms:.1} ms");
    let _ = &a;
    let (refined, _) = diff(&t.c.canvas_image(), &img_a);
    // And forth again: the second tab's picture is as it was.
    switch(&mut t.c, 1);
    t.c.frame(vec![], Modifiers::NONE);
    let (second, _) = diff(&t.c.canvas_image(), &img_b);
    if crate::canvas::LEGACY_TABS.load(std::sync::atomic::Ordering::Relaxed) {
        return Report { cold_ms, back_frame_ms, back_refined_ms, first, refined };
    }
    assert!(second.share() <= 0.0005, "going to the second tab again shows {:.3}% of its pixels changed", second.share() * 100.0);
    Report { cold_ms, back_frame_ms, back_refined_ms, first, refined }
}

#[test]
fn going_back_to_a_tab_shows_its_picture_at_once_and_refining_it_changes_nothing() {
    let r = switch_report(1.0, 0);
    println!("{r:?}");
    assert!(r.first.share() <= 0.0005, "the first frame back shows {:.3}% of the picture changed", r.first.share() * 100.0);
    assert!(r.refined.share() <= 0.0005, "the refined page differs in {:.3}% of its pixels", r.refined.share() * 100.0);
}

#[test]
fn a_tab_beside_the_active_one_is_rendered_ahead_while_the_canvas_is_quiet() {
    let mut t = two_tabs(1.0);
    assert!(!t.c.app.canvas.kept_shots().contains(&t.uid[1]), "nothing of the second tab yet");
    // A second of quiet.
    for _ in 0..90 {
        let f = Instant::now();
        t.c.frame(vec![], Modifiers::NONE);
        t.c.pace(f);
    }
    assert!(t.c.app.canvas.kept_shots().contains(&t.uid[1]), "the second tab was rendered while the first sat there");
    // Switching to it: its picture is there in the first frame, whole.
    let b = doc_of(&t.c, 1);
    switch(&mut t.c, 1);
    t.c.frame(vec![], Modifiers::NONE);
    assert!(t.c.app.canvas.tex_doc_is(&b), "its picture is on the canvas in the first frame");
    let first = t.c.canvas_image();
    t.c.settle();
    let (d, _) = diff(&first, &t.c.canvas_image());
    assert!(d.share() <= 0.0005, "refining it changed {:.3}% of its pixels", d.share() * 100.0);
}

#[test]
#[ignore = "a report: cargo test -p figcraft-ui-egui --lib tab_report -- --ignored --nocapture"]
fn tab_report() {
    for (legacy, ppp, idle) in [(true, 1.0, 0), (false, 1.0, 0), (false, 1.0, 60), (true, 2.0, 0), (false, 2.0, 0), (false, 2.0, 60)] {
        crate::canvas::LEGACY_TABS.store(legacy, std::sync::atomic::Ordering::Relaxed);
        let r = switch_report(ppp, idle);
        println!(
            "{} ppp {ppp}, {idle} quiet frames first: first open {:6.1} ms; back: first frame {:5.1} ms, render thread after {:6.1} ms; picture on the first frame differs {:.3}%, after refining {:.3}%",
            if legacy { "before:" } else { "after: " },
            r.cold_ms,
            r.back_frame_ms,
            r.back_refined_ms,
            r.first.share() * 100.0,
            r.refined.share() * 100.0
        );
    }
}
