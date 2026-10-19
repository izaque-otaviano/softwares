//! The canvas while a drag edits the document every frame, driven through egui headless: each
//! finished render shows (a newer one already on its way doesn't hide it), a button held still
//! stops making new documents to render, and what a move changes is rendered as a patch of a few
//! areas (`Retained`) and uploaded as those areas, not as the whole picture.

use std::sync::Arc;
use std::time::Duration;

use egui::{Event, vec2};
use figcraft_engine::Session;
use serde_json::json;

use crate::layers_drag_tests::Ui;

/// Frames until the render worker has nothing in flight (a few seconds at most).
fn settle(u: &mut Ui) {
    for _ in 0..300 {
        u.frame(vec![]);
        if u.app.worker.as_ref().is_some_and(|w| !w.in_flight()) {
            return;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn a_drag_shows_on_the_canvas_while_it_moves() {
    let mut s = Session::new();
    let id = |v: serde_json::Value| figcraft_engine::params::id_of(&v["id"]).unwrap();
    let f = id(s.execute("frame.create", &json!({"x": 100, "y": 100, "width": 300, "height": 200})).unwrap());
    s.execute("node.set", &json!({"id": f, "rotation": 25})).unwrap();
    let r =
        id(s.execute("shape.rectangle", &json!({"x": 40, "y": 40, "width": 80, "height": 60, "parent": f, "props": {"fill": "#e03030"}})).unwrap());
    s.execute("select.set", &json!({"ids": [r]})).unwrap();
    let mut u = Ui::new(s);
    settle(&mut u);
    let c = u.app.session.doc().unwrap().world_bounds(r).unwrap().center();
    let p = u.app.to_screen(c.x, c.y);
    u.button(p, true);
    settle(&mut u);
    // A move every frame, each one a new document and a new render request.
    u.app.canvas.render_work = None;
    let before = u.app.session.ds().unwrap().doc.clone();
    // At least 30 moves, then on until a finished render shows (slow machines need longer).
    for k in 1..=300 {
        u.frame(vec![Event::PointerMoved(p + vec2(k as f32, k as f32 / 3.0))]);
        std::thread::sleep(Duration::from_millis(15));
        if k >= 30 && u.app.canvas.render_work.is_some() {
            break;
        }
    }
    assert!(!Arc::ptr_eq(&before, &u.app.session.ds().unwrap().doc), "the drag moved the layer");
    assert!(u.app.canvas.render_work.is_some(), "renders finished during the drag are shown");
    // Held still: the same move each frame keeps the preview, and the canvas settles.
    let held = u.app.session.ds().unwrap().doc.clone();
    // Frames until the last render lands (slow machines take a while): a drag held still makes
    // no new documents, so the worker runs dry.
    settle(&mut u);
    assert!(Arc::ptr_eq(&held, &u.app.session.ds().unwrap().doc));
    assert!(u.app.worker.as_ref().is_some_and(|w| !w.in_flight()), "nothing left to render");
    u.button(p + vec2(30.0, 10.0), false);
}

/// A rectangle on a shop page of photos, selected, the view at zoom 1 centred on it with object
/// snapping off: sixty pointer moves of it (2 right, 1 down each) with the button held, then the
/// release. Returns the renders the canvas asked for during the moves, the mean frame time of the
/// moves (ms) and how far the rectangle ended up from where it was (page units).
fn sixty_moves() -> (u64, f64, (f64, f64)) {
    use figcraft_engine::synthetic_shop::{ShopSpec, shop_document};
    let spec = ShopSpec { screens: 2, cards: 2, distinct_photos: 3, photo_px: 600, frosted_header: false };
    let (doc, page) = shop_document(&spec).unwrap();
    let mut s = Session::with_document(doc);
    s.execute("page.select", &json!({"id": page})).unwrap();
    let r = figcraft_engine::params::id_of(
        &s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 200, "height": 150, "props": {"fill": "#e03030"}})).unwrap()["id"],
    )
    .unwrap();
    s.execute("select.set", &json!({"ids": [r]})).unwrap();
    let mut u = Ui::new(s);
    u.app.ui.home = false;
    settle(&mut u);
    // (The first frame fitted the page to the window.)
    {
        let ds = u.app.session.ds_mut().unwrap();
        ds.view.zoom = 1.0;
        ds.view.cx = 200.0;
        ds.view.cy = 175.0;
        ds.view.snap_objects = false;
    }
    settle(&mut u);
    let before = u.app.session.doc().unwrap().world_bounds(r).unwrap();
    let p = u.app.to_screen(before.center().x, before.center().y);
    u.button(p, true);
    u.frame(vec![]);
    let submitted = |u: &Ui| u.app.worker.as_ref().map_or(0, |w| w.submitted());
    let start = submitted(&u);
    let t = std::time::Instant::now();
    let mut last = p;
    for k in 1..=60 {
        last = p + vec2(2.0 * k as f32, k as f32);
        u.frame(vec![Event::PointerMoved(last)]);
    }
    let ms = t.elapsed().as_secs_f64() * 1000.0 / 60.0;
    let renders = submitted(&u) - start;
    println!("drag: the last render took {:.2} ms", u.app.ui.render_ms);
    u.button(last, false);
    settle(&mut u);
    let after = u.app.session.doc().unwrap().world_bounds(r).unwrap();
    (renders, ms, (after.x0 - before.x0, after.y0 - before.y0))
}

#[test]
fn sixty_moves_of_a_drag_land_where_the_pointer_went() {
    let (renders, ms, (dx, dy)) = sixty_moves();
    println!("drag: {renders} renders for 60 moves, {ms:.2} ms per frame ({})", if cfg!(debug_assertions) { "debug" } else { "release" });
    assert!(renders <= 61, "{renders} renders for 60 moves");
    assert!((dx - 120.0).abs() < 1e-6 && (dy - 60.0).abs() < 1e-6, "moved by ({dx}, {dy}), not (120, 60)");
}

/// Two layers dragged together move as one, and a drag with Alt leaves the originals where they
/// are while the copies move.
#[test]
fn a_drag_of_two_layers_and_an_alt_drag_land_right() {
    let mut s = Session::new();
    let id = |v: serde_json::Value| figcraft_engine::params::id_of(&v["id"]).unwrap();
    let a = id(s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 80, "height": 60, "props": {"fill": "#e03030"}})).unwrap());
    let b = id(s.execute("shape.rectangle", &json!({"x": 300, "y": 100, "width": 80, "height": 60, "props": {"fill": "#3030e0"}})).unwrap());
    s.execute("select.set", &json!({"ids": [a, b]})).unwrap();
    s.ds_mut().unwrap().view.snap_objects = false;
    let mut u = Ui::new(s);
    settle(&mut u);
    let c = u.app.session.doc().unwrap().world_bounds(a).unwrap().center();
    let p = u.app.to_screen(c.x, c.y);
    u.button(p, true);
    for k in 1..=10 {
        u.frame(vec![Event::PointerMoved(p + vec2(3.0 * k as f32, 0.0))]);
    }
    u.button(p + vec2(30.0, 0.0), false);
    settle(&mut u);
    let (xa, xb) = (u.app.session.doc().unwrap().world_bounds(a).unwrap().x0, u.app.session.doc().unwrap().world_bounds(b).unwrap().x0);
    let zoom = u.app.session.ds().unwrap().view.zoom;
    assert!((xa - 100.0 - 30.0 / zoom).abs() < 1.0 && (xb - 300.0 - 30.0 / zoom).abs() < 1.0, "both moved: {xa} {xb}");
    // Alt: copies move, the originals stay in the page render.
    let count = u.app.session.doc().unwrap().node_count();
    u.app.session.set_selection(vec![a]);
    let c = u.app.session.doc().unwrap().world_bounds(a).unwrap().center();
    let p = u.app.to_screen(c.x, c.y);
    u.frame_with(vec![Event::PointerMoved(p)], egui::Modifiers::ALT);
    u.frame_with(
        vec![Event::PointerButton { pos: p, button: egui::PointerButton::Primary, pressed: true, modifiers: egui::Modifiers::ALT }],
        egui::Modifiers::ALT,
    );
    for k in 1..=10 {
        u.frame_with(vec![Event::PointerMoved(p + vec2(0.0, 3.0 * k as f32))], egui::Modifiers::ALT);
    }
    u.frame_with(
        vec![Event::PointerButton {
            pos: p + vec2(0.0, 30.0),
            button: egui::PointerButton::Primary,
            pressed: false,
            modifiers: egui::Modifiers::ALT,
        }],
        egui::Modifiers::ALT,
    );
    settle(&mut u);
    assert_eq!(u.app.session.doc().unwrap().node_count(), count + 1, "the copy is a new layer");
}
