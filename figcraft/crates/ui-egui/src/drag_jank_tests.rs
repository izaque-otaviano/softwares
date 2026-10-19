//! Where the time of a canvas drag goes, frame by frame: the whole UI frame, the engine's pointer
//! handling in it (the move handler, the preview's edit, the normalisation, the comparison), the
//! renders of the moves (and whether the moved pixels were copied or drawn, and why not), on a
//! photo-heavy page of ~700 layers and on a page of 5,000 plain layers, at several zooms and
//! pixel densities, with a shadow, in a clipping card, inside an auto layout frame, and with
//! several pointer events a frame.
//!
//! `cargo test -p figcraft-ui-egui --lib drag_jank_report -- --ignored --nocapture` prints the
//! table (`--release` for the numbers that matter; `FIGCRAFT_CASE=name` for one case). The other
//! tests here hold the drag to what it costs now.

use std::time::Instant;

use egui::{Event, Modifiers, PointerButton, Pos2, vec2};
use figcraft_doc::NodeId;
use figcraft_engine::Session;
use figcraft_engine::perf::Snapshot as Engine;
use figcraft_render::perf::Snapshot as Render;
use serde_json::json;

use crate::canvas_drop_tests::Cap;

fn id_of(v: &serde_json::Value) -> NodeId {
    figcraft_engine::params::id_of(&v["id"]).unwrap()
}

fn named(s: &Session, name: &str) -> NodeId {
    s.doc().unwrap().nodes().find(|n| n.name == name).map(|n| n.id).unwrap()
}

/// The heavy shop page (12 screens, ~720 layers) with pictures small enough for a test run.
fn heavy_shop() -> Session {
    use figcraft_engine::synthetic_shop::{ShopSpec, shop_document};
    let spec = ShopSpec { distinct_photos: 12, photo_px: 1200, ..ShopSpec::HEAVY };
    let (doc, page) = shop_document(&spec).unwrap();
    let mut s = Session::with_document(doc);
    s.execute("page.select", &json!({"id": page})).unwrap();
    s
}

/// A plain red rectangle on the heavy shop page.
fn shop_rect() -> (Session, Vec<NodeId>) {
    let mut s = heavy_shop();
    let r = id_of(&s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 220, "height": 150, "props": {"fill": "#e03030"}})).unwrap());
    (s, vec![r])
}

/// The same with a drop shadow.
fn shop_shadow() -> (Session, Vec<NodeId>) {
    let (mut s, ids) = shop_rect();
    s.execute("effect.add", &json!({"ids": ids, "type": "dropShadow"})).unwrap();
    (s, ids)
}

/// A product photo in its clipping card.
fn shop_photo() -> (Session, Vec<NodeId>) {
    let s = heavy_shop();
    let p = named(&s, "Photo");
    (s, vec![p])
}

/// A price inside a card's vertical auto layout frame.
fn shop_al_child() -> (Session, Vec<NodeId>) {
    let s = heavy_shop();
    let p = named(&s, "Price");
    (s, vec![p])
}

/// A rectangle on a page of 5,000 plain layers.
fn large_rect() -> (Session, Vec<NodeId>) {
    let (doc, _) = figcraft_engine::synthetic::large_document(5000).unwrap();
    let mut s = Session::with_document(doc);
    let r = id_of(&s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 220, "height": 150, "props": {"fill": "#e03030"}})).unwrap());
    (s, vec![r])
}

pub(crate) struct Scenario {
    pub name: &'static str,
    pub ppp: f32,
    pub zoom: f64,
    /// Pointer events the frame carries (the frame's step split among them: the same path).
    pub events_per_frame: u32,
    pub build: fn() -> (Session, Vec<NodeId>),
}

pub(crate) const SCENARIOS: &[Scenario] = &[
    Scenario { name: "shop rect z1", ppp: 1.0, zoom: 1.0, events_per_frame: 1, build: shop_rect },
    Scenario { name: "shop rect z1 ppp2", ppp: 2.0, zoom: 1.0, events_per_frame: 1, build: shop_rect },
    Scenario { name: "shop rect z1.37", ppp: 1.0, zoom: 1.37, events_per_frame: 1, build: shop_rect },
    Scenario { name: "shop shadow z1", ppp: 1.0, zoom: 1.0, events_per_frame: 1, build: shop_shadow },
    Scenario { name: "shop photo in card z1", ppp: 1.0, zoom: 1.0, events_per_frame: 1, build: shop_photo },
    Scenario { name: "shop auto layout child", ppp: 1.0, zoom: 1.0, events_per_frame: 1, build: shop_al_child },
    Scenario { name: "shop rect z1 3ev/frame", ppp: 1.0, zoom: 1.0, events_per_frame: 3, build: shop_rect },
    Scenario { name: "5k rect z1", ppp: 1.0, zoom: 1.0, events_per_frame: 1, build: large_rect },
    Scenario { name: "5k rect z1 3ev/frame", ppp: 1.0, zoom: 1.0, events_per_frame: 3, build: large_rect },
];

/// Milliseconds of nanoseconds.
fn ms(ns: u64) -> f64 {
    ns as f64 / 1e6
}

/// p50 and p95 of `v` (ms).
pub(crate) fn pct(v: &[f64]) -> (f64, f64) {
    if v.is_empty() {
        return (0.0, 0.0);
    }
    let mut s = v.to_vec();
    s.sort_by(f64::total_cmp);
    let at = |q: f64| s[((s.len() as f64 * q) as usize).min(s.len() - 1)];
    (at(0.5), at(0.95))
}

#[derive(Debug, Default)]
pub(crate) struct Measured {
    pub moves: u32,
    /// Per frame: the whole UI frame, the engine's pointer handling, the move handler before the
    /// preview, the preview's edit (clone + closure), the normalisation, the comparison.
    pub frame_ms: Vec<f64>,
    pub pointer_ms: Vec<f64>,
    pub move_ms: Vec<f64>,
    pub edit_ms: Vec<f64>,
    pub normalize_ms: Vec<f64>,
    pub compare_ms: Vec<f64>,
    /// Per shown render: its time in the render thread.
    pub render_ms: Vec<f64>,
    pub engine: Engine,
    pub render: Render,
    pub renders_shown: u64,
    pub landed: (f64, f64),
}

pub(crate) fn run(sc: &Scenario) -> Measured {
    let (s, ids) = (sc.build)();
    let mut c = Cap::new(s, sc.ppp);
    c.app.session.execute("select.set", &json!({"ids": ids})).unwrap();
    let b = c.app.session.doc().unwrap().bounds_of(&ids).unwrap();
    {
        let ds = c.app.session.ds_mut().unwrap();
        ds.view.zoom = sc.zoom;
        ds.view.cx = b.center().x;
        ds.view.cy = b.center().y;
    }
    c.settle();
    let before = c.app.session.doc().unwrap().bounds_of(&ids).unwrap();
    let at = c.app.session.doc().unwrap().world_bounds(ids[0]).unwrap().center();
    let p = c.app.to_screen(at.x, at.y);
    let button = |pos: Pos2, pressed: bool| Event::PointerButton { pos, button: PointerButton::Primary, pressed, modifiers: Modifiers::NONE };
    c.frame(vec![Event::PointerMoved(p)], Modifiers::NONE);
    c.frame(vec![button(p, true)], Modifiers::NONE);
    // Past the drag slop before the measured moves.
    c.frame(vec![Event::PointerMoved(p + vec2(6.0, 2.0))], Modifiers::NONE);
    c.settle();
    let mut m = Measured::default();
    let e0 = Engine::now();
    let r0 = c.app.canvas.render_stats;
    let shown0 = c.app.canvas.renders_shown;
    let moves = 60u32;
    let mut last = p;
    let mut frame_no = 0u32;
    for _ in 0..moves {
        let t = Instant::now();
        let mut events = Vec::new();
        frame_no += 1;
        for j in 1..=sc.events_per_frame {
            let at = (frame_no - 1) as f32 + j as f32 / sc.events_per_frame as f32;
            last = p + vec2(6.0 + 3.0 * at, 2.0 + at);
            events.push(Event::PointerMoved(last));
        }
        let e = Engine::now();
        let shown = c.app.canvas.renders_shown;
        let ms_frame = c.frame(events, Modifiers::NONE);
        let d = Engine::now().since(&e);
        m.frame_ms.push(ms_frame);
        m.pointer_ms.push(ms(d.POINTER_NS));
        m.move_ms.push(ms(d.MOVE_NS));
        m.edit_ms.push(ms(d.PREVIEW_EDIT_NS));
        m.normalize_ms.push(ms(d.NORMALIZE_NS));
        m.compare_ms.push(ms(d.PREVIEW_COMPARE_NS));
        if c.app.canvas.renders_shown > shown {
            m.render_ms.push(c.app.ui.render_ms);
        }
        c.pace(t);
    }
    m.moves = moves;
    m.engine = Engine::now().since(&e0);
    c.frame(vec![Event::PointerMoved(last)], Modifiers::NONE);
    c.settle();
    m.render = c.app.canvas.render_stats.since(&r0);
    m.renders_shown = c.app.canvas.renders_shown - shown0;
    c.frame(vec![button(last, false)], Modifiers::NONE);
    c.settle();
    let sel = c.app.session.ds().unwrap().selection.clone();
    let after = c.app.session.doc().unwrap().bounds_of(&sel).unwrap_or(before);
    m.landed = (after.x0 - before.x0, after.y0 - before.y0);
    m
}

fn row(name: &str, v: &[f64]) -> String {
    let (p50, p95) = pct(v);
    format!("{name:<11}{p50:7.2}/{p95:<7.2}")
}

pub(crate) fn report_line(sc: &Scenario, m: &Measured) -> String {
    let e = &m.engine;
    let r = &m.render;
    let reasons: Vec<String> = r.reasons().iter().map(|(w, n)| format!("{} {n}", w.name())).collect();
    format!(
        "{:<26} {} {} {} {} {} {} | pointer calls {} previews {} moves {} gathers {} layout frames {} snap {:.2} ms | renders shown {}: {} | copied {} drawn {} [{}]; plan {:.2} patch-plan {:.2} patch-draw {:.2} full {:.2} ms; {} rects {} kpx; shadow {:.1} image {:.1} image-fill {:.1} clip {:.1} text {:.1} prefetch {:.1} ms; reused/partial/full {}/{}/{} | landed ({:.1}, {:.1})",
        sc.name,
        row("frame", &m.frame_ms),
        row("pointer", &m.pointer_ms),
        row("move", &m.move_ms),
        row("edit", &m.edit_ms),
        row("normalize", &m.normalize_ms),
        row("compare", &m.compare_ms),
        e.POINTER_CALLS,
        e.PREVIEWS,
        e.MOVES,
        e.GATHERS,
        e.LAYOUT_FRAMES,
        ms(e.SNAP_NS),
        m.renders_shown,
        row("render", &m.render_ms),
        r.copied,
        r.not_copied.iter().sum::<u64>(),
        reasons.join(", "),
        ms(r.plan_ns),
        ms(r.patch_plan_ns),
        ms(r.patch_draw_ns),
        ms(r.full_ns),
        r.patch_rects,
        r.patch_pixels / 1000,
        ms(r.shadow_ns),
        ms(r.image_ns),
        ms(r.image_fill_ns),
        ms(r.clip_ns),
        ms(r.text_ns),
        ms(r.prefetch_ns),
        r.reused,
        r.partial,
        r.full,
        m.landed.0,
        m.landed.1,
    )
}

#[test]
#[ignore = "a report: cargo test --release -p figcraft-ui-egui --lib drag_jank_report -- --ignored --nocapture"]
fn drag_jank_report() {
    figcraft_render::perf::set_detail(true);
    let only = std::env::var("FIGCRAFT_CASE").ok();
    println!("drag ({}): ms p50/p95 per frame of 60 moves", if cfg!(debug_assertions) { "debug" } else { "release" });
    for sc in SCENARIOS.iter().filter(|s| only.as_deref().is_none_or(|o| s.name.contains(o))) {
        let m = run(sc);
        println!("{}", report_line(sc, &m));
    }
}

/// Several pointer moves in one frame run the move handler once (the frame's last position).
#[test]
fn pointer_moves_in_one_frame_are_handled_once() {
    let sc = SCENARIOS.iter().find(|s| s.name == "shop rect z1 3ev/frame").unwrap();
    let m = run(sc);
    assert_eq!(m.engine.MOVES, u64::from(m.moves), "{} moves handled for {} frames", m.engine.MOVES, m.moves);
    assert_eq!(m.engine.PREVIEWS, u64::from(m.moves));
    assert!((m.landed.0 - 186.0).abs() < 1e-6 && (m.landed.1 - 62.0).abs() < 1e-6, "landed {:?}", m.landed);
}

/// Snap targets are gathered once per gesture, not per move.
#[test]
fn snap_targets_are_gathered_once_per_drag() {
    let sc = SCENARIOS.iter().find(|s| s.name == "shop rect z1").unwrap();
    let m = run(sc);
    assert_eq!(m.engine.GATHERS, 0, "gathered {} times during the moves", m.engine.GATHERS);
    assert_eq!(m.engine.MOVES, 60);
}

/// A free move solves no auto layout frame; a move inside one solves that frame alone.
#[test]
fn a_free_move_solves_no_auto_layout() {
    let free = run(SCENARIOS.iter().find(|s| s.name == "shop rect z1").unwrap());
    assert_eq!(free.engine.LAYOUT_FRAMES, 0, "{} auto layout frames solved by a free move", free.engine.LAYOUT_FRAMES);
    let inside = run(SCENARIOS.iter().find(|s| s.name == "shop auto layout child").unwrap());
    assert!(inside.engine.LAYOUT_FRAMES <= 2 * 60, "{} frames solved for 60 moves in a list", inside.engine.LAYOUT_FRAMES);
}

/// Moves whose final position is on a whole device pixel are copied, not drawn: at zoom 1 on a
/// 1× and a 2× screen, and with a shadow (its soft pixels drawn, the opaque box copied).
#[test]
fn whole_pixel_moves_copy_their_pixels() {
    for name in ["shop rect z1", "shop rect z1 ppp2", "shop shadow z1"] {
        let m = run(SCENARIOS.iter().find(|s| s.name == name).unwrap());
        let drawn: u64 = m.render.not_copied.iter().sum();
        println!("{name}: copied {} drawn {} {:?}", m.render.copied, drawn, m.render.reasons());
        assert!(
            m.render.copied >= m.renders_shown / 2,
            "{name}: {} of {} renders copied ({:?})",
            m.render.copied,
            m.renders_shown,
            m.render.reasons()
        );
        assert_eq!(m.render.full, 0, "{name}: {} full renders during the drag", m.render.full);
    }
}

/// A photo dragged in its rounded card (with a shadow) on the heavy page redraws strips: what it
/// uncovered and the card's corners, not the photo's whole box out to the card's shadow (about
/// 71,000 pixels a render before, 23,000 after; at most a few shadows cast per render, from
/// the outline).
#[test]
fn a_photo_dragged_in_its_card_redraws_strips_not_the_card() {
    let m = run(SCENARIOS.iter().find(|s| s.name == "shop photo in card z1").unwrap());
    let renders = (m.render.partial + m.render.full).max(1);
    println!("photo in card: {:?}", m.render);
    assert_eq!(m.render.full, 0);
    assert_eq!(m.render.copied, m.render.partial, "every patch copied the photo: {:?}", m.render.reasons());
    assert!(m.render.patch_pixels / renders < 40_000, "{} pixels drawn a render", m.render.patch_pixels / renders);
    assert!(m.render.shadows <= 8 * renders, "{} shadows cast in {renders} renders", m.render.shadows);
}

/// The areas a render draws (and copies) for each step of a photo dragged in its card, straight
/// through the retained renderer: what the strips are made of.
#[test]
#[ignore = "a listing: cargo test -p figcraft-ui-egui --lib photo_patch_areas -- --ignored --nocapture"]
fn photo_patch_areas() {
    figcraft_render::perf::set_detail(true);
    use figcraft_engine::tools::{PointerEvent, PointerKind};
    let (mut s, ids) = shop_photo();
    s.execute("select.set", &json!({"ids": ids})).unwrap();
    let page = s.page().unwrap();
    let b = s.doc().unwrap().world_bounds(ids[0]).unwrap();
    let c = b.center();
    let view = figcraft_render::View { origin: (c.x - 960.0, c.y - 540.0), scale: 1.0, width: 1920, height: 1080 };
    let opts = figcraft_render::Options { lod: true, ..Default::default() };
    let mut r = figcraft_render::Retained::default();
    let doc = s.ds().unwrap().doc.clone();
    r.render(&doc, page, &view, &opts).unwrap();
    s.pointer(&PointerEvent::at(PointerKind::Down, c.x, c.y, 1.0)).unwrap();
    s.pointer(&PointerEvent::at(PointerKind::Move, c.x + 6.0, c.y + 2.0, 1.0)).unwrap();
    let doc = s.ds().unwrap().doc.clone();
    r.render(&doc, page, &view, &opts).unwrap();
    for k in 1..=8 {
        s.pointer(&PointerEvent::at(PointerKind::Move, c.x + 6.0 + 3.0 * k as f64, c.y + 2.0 + k as f64, 1.0)).unwrap();
        let doc = s.ds().unwrap().doc.clone();
        let r0 = Render::now();
        let t = Instant::now();
        let (_, _, work) = r.render(&doc, page, &view, &opts).unwrap();
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        let d = Render::now().since(&r0);
        let rects: Vec<String> = r.dirty().unwrap_or(&[]).iter().map(|q| format!("{}x{}@{},{}", q[2], q[3], q[0], q[1])).collect();
        println!(
            "step {k}: {work:?} {ms:.1} ms, {} rects, {} shadows cast {:.1} ms, image-fill {:.1} ms; {}",
            d.patch_rects,
            d.shadows,
            ms_f(d.shadow_ns),
            ms_f(d.image_fill_ns),
            rects.join(" ")
        );
    }
}

fn ms_f(ns: u64) -> f64 {
    ns as f64 / 1e6
}
