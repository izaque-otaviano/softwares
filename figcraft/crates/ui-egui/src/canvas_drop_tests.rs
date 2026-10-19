//! What a drag looks like, frame by frame, on a page of photos: the app is driven headless through
//! egui at a real 60 Hz pace (the render thread runs between frames) and every frame is rasterised
//! the way a GPU would show it ([`Raster`](crate::present::raster_tests::Raster)). Measured:
//! the UI frame time of the moves, how many pictures the canvas got of them, and how much the
//! canvas changes when the button is released (the last frame of the drag against the first frame
//! after the drop and against the settled page): nothing should, a drop that redraws looks like an
//! error.
//!
//! `FIGCRAFT_SNAPSHOTS=/some/dir cargo test -p figcraft-ui-egui --lib drop_report -- --nocapture`
//! writes the three pictures and their difference for every case.

use std::time::{Duration, Instant};

use egui::epaint::ClippedShape;
use egui::{Event, Modifiers, PointerButton, Pos2, Rect, TextureId, vec2};
use figcraft_doc::NodeId;
use figcraft_engine::Session;
use figcraft_engine::synthetic_shop::{ShopSpec, shop_document};
use serde_json::json;

use crate::present::raster_tests::Raster;
use crate::{FigApp, NoServices};

/// The app and what it drew, at `ppp` pixels per point.
pub(crate) struct Cap {
    pub ctx: egui::Context,
    pub app: FigApp,
    raster: Raster,
    last: Vec<ClippedShape>,
    freed: Vec<TextureId>,
    time: f64,
    size: egui::Vec2,
    ppp: f32,
}

impl Cap {
    pub fn new(s: Session, ppp: f32) -> Self {
        let ctx = egui::Context::default();
        ctx.set_pixels_per_point(ppp);
        let mut c = Self {
            ctx,
            app: FigApp::new(s, Box::new(NoServices)),
            raster: Raster::default(),
            last: Vec::new(),
            freed: Vec::new(),
            time: 0.0,
            size: vec2(1440.0, 900.0),
            ppp,
        };
        c.app.ui.home = false;
        for _ in 0..3 {
            c.frame(vec![], Modifiers::NONE);
        }
        c
    }

    /// One frame; its UI time in ms (the rasteriser's own work not counted).
    pub fn frame(&mut self, mut events: Vec<Event>, modifiers: Modifiers) -> f64 {
        self.time += 1.0 / 60.0;
        events.insert(0, Event::ModifiersChanged(modifiers));
        let input =
            egui::RawInput { screen_rect: Some(Rect::from_min_size(Pos2::ZERO, self.size)), time: Some(self.time), events, ..Default::default() };
        let app = &mut self.app;
        let t = Instant::now();
        let mut out = self.ctx.run_ui(input, |ui| app.ui(ui));
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        self.raster.free(std::mem::take(&mut self.freed));
        self.raster.feed(&out.textures_delta);
        self.freed = out.textures_delta.free.iter().copied().collect();
        out.textures_delta.clear();
        self.last = out.shapes.clone();
        ms
    }

    /// The canvas as the last frame showed it, in device pixels.
    pub fn canvas_image(&self) -> image::RgbaImage {
        // Only what draws the page (the canvas texture and a drag's sprite): the selection's
        // handles and labels change on a drop and are not the page.
        let keep = self.app.canvas.content_textures();
        let shapes: Vec<ClippedShape> =
            self.last.iter().filter(|c| matches!(&c.shape, egui::Shape::Mesh(m) if keep.contains(&m.texture_id))).cloned().collect();
        let prims = self.ctx.tessellate(shapes, self.ppp);
        let (w, h) = ((self.size.x * self.ppp) as usize, (self.size.y * self.ppp) as usize);
        let full = self.raster.draw(&prims, self.ppp, (w, h), egui::Color32::from_rgb(0xf5, 0xf5, 0xf5));
        let r = self.app.canvas.rect;
        let (x, y) = ((r.min.x * self.ppp) as u32, (r.min.y * self.ppp) as u32);
        let (cw, ch) = (((r.width() * self.ppp) as u32).min(full.width() - x), ((r.height() * self.ppp) as u32).min(full.height() - y));
        image::imageops::crop_imm(&full, x, y, cw, ch).to_image()
    }

    /// A pace of 60 frames a second: the render thread gets its time between frames.
    pub fn pace(&self, frame_start: Instant) {
        let left = Duration::from_micros(16_667).saturating_sub(frame_start.elapsed());
        std::thread::sleep(left);
    }

    /// Frames until the render worker has nothing in flight and the page is showing it.
    pub fn settle(&mut self) {
        for _ in 0..600 {
            self.frame(vec![], Modifiers::NONE);
            std::thread::sleep(Duration::from_millis(8));
            if self.app.worker.as_ref().is_some_and(|w| !w.in_flight()) {
                self.frame(vec![], Modifiers::NONE);
                return;
            }
        }
    }
}

/// How two pictures differ.
#[derive(Debug, Default, Clone, Copy)]
pub(crate) struct Diff {
    pub pixels: usize,
    /// Pixels with a channel off by more than 1/255, and by more than 8/255.
    pub over1: usize,
    pub over8: usize,
    pub max: u8,
}

impl Diff {
    pub fn share(&self) -> f64 {
        self.over1 as f64 / self.pixels.max(1) as f64
    }
}

pub(crate) fn diff(a: &image::RgbaImage, b: &image::RgbaImage) -> (Diff, image::RgbaImage) {
    let (w, h) = (a.width().min(b.width()), a.height().min(b.height()));
    let mut d = Diff { pixels: (w * h) as usize, ..Default::default() };
    let mut out = image::RgbaImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            let (p, q) = (a.get_pixel(x, y).0, b.get_pixel(x, y).0);
            let m = (0..3).map(|k| p[k].abs_diff(q[k])).max().unwrap_or(0);
            d.max = d.max.max(m);
            d.over1 += usize::from(m > 1);
            d.over8 += usize::from(m > 8);
            out.put_pixel(x, y, image::Rgba(if m > 1 { [255, 0, 0, 255] } else { [m * 60, m * 60, m * 60, 255] }));
        }
    }
    (d, out)
}

/// What a drag measured.
#[derive(Debug)]
pub(crate) struct Report {
    pub first_ms: f64,
    pub mean_ms: f64,
    pub max_ms: f64,
    pub moves: u32,
    /// Pictures the canvas showed during the moves.
    pub shown: u64,
    /// The last frame of the drag against the first frame after the drop, and the settled page.
    pub first: Diff,
    pub settled: Diff,
    /// Where the layer ended up against where the pointer put it (page units).
    pub landed: (f64, f64),
    /// Frames (of the moves) that began with the canvas already showing the previous move: the
    /// picture follows the pointer one frame behind at most.
    pub caught_up: u32,
    /// The slowest and mean render of the moves in the render thread (ms).
    pub render_max_ms: f64,
    pub render_mean_ms: f64,
    /// Texture bytes uploaded during the moves, against the size of the whole image.
    pub uploaded: u64,
    pub image_bytes: u64,
}

pub(crate) struct Case {
    pub name: &'static str,
    pub ppp: f32,
    pub zoom: f64,
    pub alt: bool,
    pub snap: bool,
    /// Release while the pointer is still moving (else it rests for a few frames first).
    pub release_moving: bool,
    /// Points the pointer moves right each frame (down: a third of that).
    pub step: f32,
    pub build: fn() -> (Session, Vec<NodeId>),
}

pub(crate) fn shop() -> Session {
    let spec = ShopSpec { screens: 2, cards: 3, distinct_photos: 4, photo_px: 1600, frosted_header: false };
    let (doc, page) = shop_document(&spec).unwrap();
    let mut s = Session::with_document(doc);
    s.execute("page.select", &json!({"id": page})).unwrap();
    s
}

fn named(s: &Session, name: &str) -> NodeId {
    s.doc().unwrap().nodes().find(|n| n.name == name).map(|n| n.id).unwrap()
}

fn id_of(v: &serde_json::Value) -> NodeId {
    figcraft_engine::params::id_of(&v["id"]).unwrap()
}

/// A product photo inside its card (a clipping frame with rounded corners, a badge above it).
pub(crate) fn photo() -> (Session, Vec<NodeId>) {
    let s = shop();
    let p = named(&s, "Photo");
    (s, vec![p])
}

/// The hero banner photo of the first screen.
pub(crate) fn hero() -> (Session, Vec<NodeId>) {
    let s = shop();
    let p = named(&s, "Hero");
    (s, vec![p])
}

/// A rectangle with a drop shadow on the page of photos.
pub(crate) fn shadow_rect() -> (Session, Vec<NodeId>) {
    let mut s = shop();
    let r = id_of(&s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 220, "height": 150, "props": {"fill": "#e03030"}})).unwrap());
    s.execute("effect.add", &json!({"ids": [r], "type": "dropShadow"})).ok();
    (s, vec![r])
}

/// Two rectangles grouped.
pub(crate) fn group() -> (Session, Vec<NodeId>) {
    let mut s = shop();
    let a = id_of(&s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 120, "height": 90, "props": {"fill": "#e03030"}})).unwrap());
    let b = id_of(&s.execute("shape.rectangle", &json!({"x": 260, "y": 140, "width": 100, "height": 120, "props": {"fill": "#3050e0"}})).unwrap());
    s.execute("select.set", &json!({"ids": [a, b]})).unwrap();
    s.execute("object.group", &json!({})).ok();
    let g = s.ds().unwrap().selection.clone();
    (s, g)
}

/// Two rectangles selected together.
pub(crate) fn two() -> (Session, Vec<NodeId>) {
    let mut s = shop();
    let a = id_of(&s.execute("shape.rectangle", &json!({"x": 100, "y": 100, "width": 120, "height": 90, "props": {"fill": "#e03030"}})).unwrap());
    let b = id_of(&s.execute("shape.rectangle", &json!({"x": 260, "y": 140, "width": 100, "height": 120, "props": {"fill": "#3050e0"}})).unwrap());
    (s, vec![a, b])
}

pub(crate) const CASES: &[Case] = &[
    Case { name: "photo-in-card", ppp: 1.0, zoom: 0.5, alt: false, snap: false, release_moving: false, step: 1.0, build: photo },
    Case { name: "hero-photo", ppp: 1.0, zoom: 0.5, alt: false, snap: false, release_moving: false, step: 3.0, build: hero },
    Case { name: "rect-shadow", ppp: 1.0, zoom: 1.0, alt: false, snap: false, release_moving: false, step: 3.0, build: shadow_rect },
    Case { name: "rect-shadow-released-moving", ppp: 1.0, zoom: 1.0, alt: false, snap: false, release_moving: true, step: 3.0, build: shadow_rect },
    Case { name: "photo-zoom-0.6", ppp: 1.0, zoom: 0.6, alt: false, snap: false, release_moving: false, step: 1.0, build: photo },
    Case { name: "rect-shadow-zoom-1.37", ppp: 1.0, zoom: 1.37, alt: false, snap: false, release_moving: false, step: 3.0, build: shadow_rect },
    Case { name: "rect-shadow-retina", ppp: 2.0, zoom: 1.0, alt: false, snap: false, release_moving: false, step: 3.0, build: shadow_rect },
    Case { name: "group", ppp: 1.0, zoom: 1.0, alt: false, snap: false, release_moving: false, step: 3.0, build: group },
    Case { name: "two-layers", ppp: 1.0, zoom: 1.0, alt: false, snap: false, release_moving: false, step: 3.0, build: two },
    Case { name: "alt-duplicate", ppp: 1.0, zoom: 1.0, alt: true, snap: false, release_moving: false, step: 3.0, build: shadow_rect },
    Case { name: "snapping", ppp: 1.0, zoom: 1.0, alt: false, snap: true, release_moving: false, step: 3.0, build: shadow_rect },
];

/// Run `case`: select, press on the layer, 40 moves at 60 Hz (3 points right, 1 down each),
/// release, and compare.
pub(crate) fn run_case(case: &Case, dir: Option<&std::path::Path>) -> Report {
    let (s, ids) = (case.build)();
    let mut c = Cap::new(s, case.ppp);
    c.app.session.execute("select.set", &json!({"ids": ids})).unwrap();
    let b = c.app.session.doc().unwrap().bounds_of(&ids).unwrap();
    {
        let ds = c.app.session.ds_mut().unwrap();
        ds.view.zoom = case.zoom;
        ds.view.cx = b.center().x;
        ds.view.cy = b.center().y;
        ds.view.snap_objects = case.snap;
    }
    c.settle();
    let mods = if case.alt { Modifiers::ALT } else { Modifiers::NONE };
    let before = c.app.session.doc().unwrap().bounds_of(&ids).unwrap();
    // Press on the layer's centre (or its first layer's).
    // (A group is pressed on its first layer: the gap between layers is the page's.)
    let first = c.app.session.doc().unwrap().node(ids[0]).and_then(|n| n.children.first().copied()).unwrap_or(ids[0]);
    let at = c.app.session.doc().unwrap().world_bounds(first).unwrap().center();
    let p = c.app.to_screen(at.x, at.y);
    let button = |pos: Pos2, pressed: bool| Event::PointerButton { pos, button: PointerButton::Primary, pressed, modifiers: mods };
    c.frame(vec![Event::PointerMoved(p)], mods);
    c.frame(vec![button(p, true)], mods);
    let (mut sum, mut max, mut first_ms) = (0.0, 0.0f64, 0.0);
    let shown0 = c.app.canvas.renders_shown;
    let up0 = c.app.canvas.uploaded_bytes;
    let (mut caught_up, mut rsum, mut rmax, mut rn) = (0u32, 0.0f64, 0.0f64, 0u32);
    let moves = 40;
    let mut last = p;
    for k in 1..=moves {
        let t = Instant::now();
        if k > 1 {
            let shows_latest = c.app.canvas.tex_doc_is(&c.app.session.ds().unwrap().doc);
            caught_up += u32::from(shows_latest);
        }
        last = p + vec2(case.step * k as f32, (case.step / 3.0).round().max(1.0) * k as f32);
        let ms = c.frame(vec![Event::PointerMoved(last)], mods);
        if k == 1 {
            first_ms = ms;
        }
        sum += ms;
        max = max.max(ms);
        if c.app.canvas.renders_shown > shown0 + u64::from(rn) {
            rn += 1;
            rsum += c.app.ui.render_ms;
            rmax = rmax.max(c.app.ui.render_ms);
        }
        c.pace(t);
    }
    let shown = c.app.canvas.renders_shown - shown0;
    let uploaded = c.app.canvas.uploaded_bytes - up0;
    let tex = c.app.canvas.picture_size();
    let image_bytes = (tex[0] * tex[1] * 4) as u64;
    if !case.release_moving {
        // The pointer rests: the picture catches up with it (however slow the machine).
        c.frame(vec![Event::PointerMoved(last)], mods);
        c.settle();
    }
    let img_before = c.canvas_image();
    c.frame(vec![button(last, false)], mods);
    let img_first = c.canvas_image();
    c.settle();
    let img_final = c.canvas_image();
    let (first, d1) = diff(&img_before, &img_first);
    let (settled, d2) = diff(&img_before, &img_final);
    if let Some(dir) = dir {
        let _ = std::fs::create_dir_all(dir);
        for (n, im) in [("before", &img_before), ("first", &img_first), ("final", &img_final), ("diff-first", &d1), ("diff-final", &d2)] {
            let _ = im.save(dir.join(format!("{}-{n}.png", case.name)));
        }
    }
    let after = c.app.session.doc().unwrap().bounds_of(&c.app.session.ds().unwrap().selection.clone()).unwrap_or(before);
    Report {
        first_ms,
        mean_ms: sum / f64::from(moves),
        max_ms: max,
        moves,
        shown,
        first,
        settled,
        landed: (after.x0 - before.x0, after.y0 - before.y0),
        caught_up,
        render_max_ms: rmax,
        render_mean_ms: rsum / f64::from(rn.max(1)),
        uploaded,
        image_bytes,
    }
}

#[test]
#[ignore = "a report: cargo test -p figcraft-ui-egui --lib drop_report -- --ignored --nocapture"]
fn drop_report() {
    let dir = std::env::var_os("FIGCRAFT_SNAPSHOTS").map(std::path::PathBuf::from);
    let only = std::env::var("FIGCRAFT_CASE").ok();
    for case in CASES.iter().filter(|c| only.as_deref().is_none_or(|o| c.name.contains(o))) {
        let r = run_case(case, dir.as_deref());
        println!(
            "{:<24} first move {:6.1} ms, mean {:5.2}, max {:6.1}; {:2} of {} moves shown; drop: first frame {:6.3}% px >1 ({:6.3}% >8, max {}), settled {:6.3}% ({:6.3}% >8, max {}); landed ({:.1}, {:.1}); caught up {}/39; render mean {:.1} max {:.1} ms; uploaded {:.1} MB ({:.1}x the image)",
            case.name,
            r.first_ms,
            r.mean_ms,
            r.max_ms,
            r.shown,
            r.moves,
            r.first.share() * 100.0,
            r.first.over8 as f64 / r.first.pixels.max(1) as f64 * 100.0,
            r.first.max,
            r.settled.share() * 100.0,
            r.settled.over8 as f64 / r.settled.pixels.max(1) as f64 * 100.0,
            r.settled.max,
            r.landed.0,
            r.landed.1,
            r.caught_up,
            r.render_mean_ms,
            r.render_max_ms,
            r.uploaded as f64 / 1e6,
            r.uploaded as f64 / r.image_bytes.max(1) as f64,
        );
    }
}

/// Dropping a layer changes nothing on the canvas: the picture of the last frame of the drag is the
/// picture of the settled page (a redraw on release looks like an error), the layer lands where the
/// pointer put it, and a drag uploads a few areas of the texture, not the whole picture each frame.
#[test]
fn a_drop_leaves_the_canvas_as_it_was() {
    let names = ["rect-shadow", "rect-shadow-retina", "rect-shadow-zoom-1.37", "group", "two-layers", "snapping", "photo-in-card"];
    for case in CASES.iter().filter(|c| names.contains(&c.name)) {
        let r = run_case(case, None);
        println!(
            "{}: first {:?} settled {:?} shown {} of {} uploaded {} of {}",
            case.name, r.first, r.settled, r.shown, r.moves, r.uploaded, r.image_bytes
        );
        assert!(r.first.share() <= 0.0005, "{}: the first frame after the drop differs in {:.3}% of pixels", case.name, r.first.share() * 100.0);
        assert!(
            r.settled.share() <= 0.0005,
            "{}: the settled page differs from the last drag frame in {:.3}% of pixels",
            case.name,
            r.settled.share() * 100.0
        );
        assert!(r.uploaded <= 8 * r.image_bytes.max(1), "{}: {} bytes uploaded for a picture of {}", case.name, r.uploaded, r.image_bytes);
        let (dx, dy) = r.landed;
        assert!(dx > 10.0 && dy > 0.0, "{}: the layer moved by ({dx}, {dy})", case.name);
    }
}
