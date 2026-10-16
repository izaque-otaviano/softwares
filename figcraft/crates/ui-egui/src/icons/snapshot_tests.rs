//! Pictures of the icon set and of the app where it shows them, drawn headless with a tiny
//! software rasteriser (premultiplied sRGB blending, bilinear texture sampling): the dock, the
//! left rail, the right panel for a selected frame, the tab area, a flyout menu and the whole
//! gallery. They are written, at 2× (HiDPI), into the directory named by `FIGCRAFT_SNAPSHOTS`;
//! the test does nothing when that is unset:
//! `FIGCRAFT_SNAPSHOTS=/some/dir cargo test -p figcraft-ui-egui --lib icon_snapshots`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use egui::epaint::{ClippedPrimitive, Primitive};
use egui::{Color32, ColorImage, Pos2, Rect, TextureId, pos2, vec2};
use figcraft_engine::Session;
use serde_json::json;

use super::{Icon, paint};

#[derive(Default)]
struct Raster {
    textures: HashMap<TextureId, ColorImage>,
}

impl Raster {
    fn feed(&mut self, delta: &egui::TexturesDelta) {
        for (id, deltas) in &delta.set {
            for d in deltas {
                let egui::ImageData::Color(img) = &d.image;
                match d.pos {
                    None => {
                        self.textures.insert(*id, ColorImage::clone(img));
                    }
                    Some([x0, y0]) => {
                        let Some(dst) = self.textures.get_mut(id) else { continue };
                        for y in 0..img.size[1] {
                            for x in 0..img.size[0] {
                                if x0 + x < dst.size[0] && y0 + y < dst.size[1] {
                                    dst.pixels[(y0 + y) * dst.size[0] + x0 + x] = img.pixels[y * img.size[0] + x];
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn sample(&self, id: TextureId, uv: Pos2) -> [f32; 4] {
        let Some(t) = self.textures.get(&id) else { return [1.0; 4] };
        let (w, h) = (t.size[0] as f32, t.size[1] as f32);
        let (fx, fy) = (uv.x * w - 0.5, uv.y * h - 0.5);
        let (x0, y0) = (fx.floor(), fy.floor());
        let (tx, ty) = (fx - x0, fy - y0);
        let at = |x: f32, y: f32| {
            let (x, y) = ((x.max(0.0) as usize).min(t.size[0] - 1), (y.max(0.0) as usize).min(t.size[1] - 1));
            let c = t.pixels[y * t.size[0] + x];
            [f32::from(c.r()) / 255.0, f32::from(c.g()) / 255.0, f32::from(c.b()) / 255.0, f32::from(c.a()) / 255.0]
        };
        let (a, b, c, d) = (at(x0, y0), at(x0 + 1.0, y0), at(x0, y0 + 1.0), at(x0 + 1.0, y0 + 1.0));
        let mut out = [0.0; 4];
        for k in 0..4 {
            out[k] = (a[k] * (1.0 - tx) + b[k] * tx) * (1.0 - ty) + (c[k] * (1.0 - tx) + d[k] * tx) * ty;
        }
        out
    }

    /// The `region` (physical pixels: x, y, width, height) of the frame drawn at `ppp` over `bg`.
    fn draw(&self, prims: &[ClippedPrimitive], ppp: f32, region: [usize; 4], bg: Color32) -> image::RgbaImage {
        let [rx, ry, rw, rh] = region;
        let mut buf = vec![[f32::from(bg.r()) / 255.0, f32::from(bg.g()) / 255.0, f32::from(bg.b()) / 255.0, 1.0]; rw * rh];
        for p in prims {
            let Primitive::Mesh(m) = &p.primitive else { continue };
            let clip = Rect::from_min_max(p.clip_rect.min * ppp, p.clip_rect.max * ppp);
            let cx0 = (clip.min.x.floor().max(rx as f32)) as usize;
            let cy0 = (clip.min.y.floor().max(ry as f32)) as usize;
            let cx1 = (clip.max.x.ceil().max(0.0) as usize).min(rx + rw);
            let cy1 = (clip.max.y.ceil().max(0.0) as usize).min(ry + rh);
            for tri in m.indices.chunks_exact(3) {
                let v = |i: u32| m.vertices.get(i as usize).copied();
                let (Some(a), Some(b), Some(c)) = (v(tri[0]), v(tri[1]), v(tri[2])) else { continue };
                let (pa, pb, pc) = (a.pos * ppp, b.pos * ppp, c.pos * ppp);
                let area = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
                if area.abs() < 1e-6 {
                    continue;
                }
                let x0 = (pa.x.min(pb.x).min(pc.x).floor().max(cx0 as f32)) as usize;
                let y0 = (pa.y.min(pb.y).min(pc.y).floor().max(cy0 as f32)) as usize;
                let x1 = (pa.x.max(pb.x).max(pc.x).ceil().min(cx1 as f32)) as usize;
                let y1 = (pa.y.max(pb.y).max(pc.y).ceil().min(cy1 as f32)) as usize;
                for y in y0..y1 {
                    for x in x0..x1 {
                        let q = Pos2::new(x as f32 + 0.5, y as f32 + 0.5);
                        let w0 = ((pb.x - q.x) * (pc.y - q.y) - (pb.y - q.y) * (pc.x - q.x)) / area;
                        let w1 = ((pc.x - q.x) * (pa.y - q.y) - (pc.y - q.y) * (pa.x - q.x)) / area;
                        let w2 = 1.0 - w0 - w1;
                        if w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4 {
                            continue;
                        }
                        let uv = Pos2::new(w0 * a.uv.x + w1 * b.uv.x + w2 * c.uv.x, w0 * a.uv.y + w1 * b.uv.y + w2 * c.uv.y);
                        let col =
                            |f: fn(Color32) -> u8| (w0 * f32::from(f(a.color)) + w1 * f32::from(f(b.color)) + w2 * f32::from(f(c.color))) / 255.0;
                        let (vr, vg, vb, va) = (col(|c| c.r()), col(|c| c.g()), col(|c| c.b()), col(|c| c.a()));
                        let t = self.sample(m.texture_id, uv);
                        let (sr, sg, sb, sa) = (vr * t[0], vg * t[1], vb * t[2], va * t[3]);
                        let dst = &mut buf[(y - ry) * rw + (x - rx)];
                        *dst = [sr + dst[0] * (1.0 - sa), sg + dst[1] * (1.0 - sa), sb + dst[2] * (1.0 - sa), sa + dst[3] * (1.0 - sa)];
                    }
                }
            }
        }
        let mut img = image::RgbaImage::new(rw as u32, rh as u32);
        for (i, px) in buf.iter().enumerate() {
            let q = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
            img.put_pixel((i % rw) as u32, (i / rw) as u32, image::Rgba([q(px[0]), q(px[1]), q(px[2]), 255]));
        }
        img
    }
}

/// The app (or any egui drawing) driven headless at `ppp`, remembering its last frame.
struct Shot {
    ctx: egui::Context,
    app: crate::FigApp,
    raster: Raster,
    last: Vec<egui::epaint::ClippedShape>,
    freed: Vec<TextureId>,
    time: f64,
    size: egui::Vec2,
    ppp: f32,
}

impl Shot {
    fn new(s: Session, ppp: f32) -> Self {
        let mut me = Self {
            ctx: egui::Context::default(),
            app: crate::FigApp::new(s, Box::new(crate::NoServices)),
            raster: Raster::default(),
            last: Vec::new(),
            freed: Vec::new(),
            time: 0.0,
            size: vec2(1440.0, 900.0),
            ppp,
        };
        me.ctx.set_pixels_per_point(ppp);
        me.frames(4);
        me
    }

    fn frames(&mut self, n: usize) {
        for _ in 0..n {
            self.time += 1.0 / 60.0;
            let input = egui::RawInput { screen_rect: Some(Rect::from_min_size(Pos2::ZERO, self.size)), time: Some(self.time), ..Default::default() };
            let app = &mut self.app;
            let mut out = self.ctx.run_ui(input, |ui| app.ui(ui));
            self.raster.free(std::mem::take(&mut self.freed));
            self.raster.feed(&out.textures_delta);
            self.freed = out.textures_delta.free.iter().copied().collect();
            out.textures_delta.clear();
            self.last = out.shapes.clone();
        }
    }

    /// `region` of the last frame (points), at the display scale.
    fn save(&self, dir: &Path, name: &str, region: Rect) {
        save_region(&self.ctx, &self.raster, &self.last, self.ppp, self.size, dir, name, region);
    }
}

impl Raster {
    fn free(&mut self, ids: impl IntoIterator<Item = TextureId>) {
        for id in ids {
            self.textures.remove(&id);
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn save_region(
    ctx: &egui::Context,
    raster: &Raster,
    shapes: &[egui::epaint::ClippedShape],
    ppp: f32,
    size: egui::Vec2,
    dir: &Path,
    name: &str,
    region: Rect,
) {
    let prims = ctx.tessellate(shapes.to_vec(), ppp);
    let region = region.intersect(Rect::from_min_size(Pos2::ZERO, size));
    let px = |v: f32| (v * ppp).round().max(0.0) as usize;
    let (x, y) = (px(region.min.x), px(region.min.y));
    let (w, h) = (px(region.width()).max(1), px(region.height()).max(1));
    let img = raster.draw(&prims, ppp, [x, y, w, h], Color32::from_gray(40));
    let _ = std::fs::create_dir_all(dir);
    img.save(dir.join(name)).unwrap_or_else(|e| panic!("{name}: {e}"));
}

fn snapshot_dir() -> Option<PathBuf> {
    std::env::var_os("FIGCRAFT_SNAPSHOTS").map(Into::into)
}

/// A file with a selected frame holding a rectangle, a label and a nested auto-layout frame.
fn demo() -> Session {
    let mut s = Session::new();
    s.execute("file.new", &json!({"name": "Brand system"})).unwrap();
    let id = |v: serde_json::Value| crate::present_tests::id(&v);
    let f = id(s.execute("frame.create", &json!({"x": 100, "y": 100, "width": 420, "height": 320, "name": "Home"})).unwrap());
    s.execute("fill.set", &json!({"ids": [f], "color": "#F8F8F8"})).unwrap();
    s.execute("shape.rectangle", &json!({"parent": f, "x": 24, "y": 24, "width": 372, "height": 140, "props": {"name": "Hero", "fill": "#0D99FF"}}))
        .unwrap();
    s.execute("text.create", &json!({"parent": f, "text": "Welcome", "x": 24, "y": 190})).unwrap();
    s.execute("select.set", &json!({"ids": [f]})).unwrap();
    s
}

/// The gallery: every icon at 16, 20 and 24 points (2×), light and dark, labelled.
fn gallery(dir: &Path, name: &str, dark: bool) {
    let ctx = egui::Context::default();
    ctx.set_pixels_per_point(2.0);
    let t = if dark { crate::theme::Tokens::dark() } else { crate::theme::Tokens::light() };
    crate::theme::apply(&ctx, t);
    let cols = 10usize;
    let (cw, ch) = (112.0f32, 66.0f32);
    let rows = Icon::ALL.len().div_ceil(cols);
    let size = vec2(cols as f32 * cw + 20.0, rows as f32 * ch + 20.0);
    let input = egui::RawInput { screen_rect: Some(Rect::from_min_size(Pos2::ZERO, size)), ..Default::default() };
    let mut raster = Raster::default();
    let mut out = ctx.run_ui(input.clone(), |ui| {
        ui.painter().rect_filled(Rect::from_min_size(Pos2::ZERO, size), 0.0, t.panel);
        for (i, icon) in Icon::ALL.iter().enumerate() {
            let (x, y) = (10.0 + (i % cols) as f32 * cw, 10.0 + (i / cols) as f32 * ch);
            for (dx, side) in [(0.0, 16.0), (22.0, 20.0), (50.0, 24.0)] {
                paint(ui.painter(), Rect::from_min_size(pos2(x + dx, y), vec2(side, side)), *icon, t.icon);
            }
            ui.painter().text(pos2(x, y + 32.0), egui::Align2::LEFT_TOP, format!("{icon:?}"), egui::FontId::proportional(9.0), t.text);
        }
    });
    // (A second frame: the icon textures made in the first are drawn once they exist.)
    raster.feed(&out.textures_delta);
    let shapes = out.shapes.clone();
    out.textures_delta.clear();
    save_region(&ctx, &raster, &shapes, 2.0, size, dir, name, Rect::from_min_size(Pos2::ZERO, size));
}

#[test]
fn icon_snapshots() {
    let Some(dir) = snapshot_dir() else { return };
    gallery(&dir, "gallery-light.png", false);
    gallery(&dir, "gallery-dark.png", true);

    let mut s = Shot::new(demo(), 2.0);
    s.frames(4);
    // The dock, and its Shape tools flyout.
    s.save(&dir, "dock.png", Rect::from_min_size(pos2(380.0, 820.0), vec2(700.0, 80.0)));
    s.app.ui.tool_flyout = Some("shape");
    // (The flyout fades in.)
    s.frames(40);
    s.save(&dir, "flyout.png", Rect::from_min_size(pos2(380.0, 640.0), vec2(700.0, 260.0)));
    s.app.ui.tool_flyout = None;
    // The tab area, the rail with File / Assets / Variables and the layers panel beside it.
    s.frames(2);
    s.save(&dir, "top-left.png", Rect::from_min_size(Pos2::ZERO, vec2(760.0, 110.0)));
    s.save(&dir, "rail.png", Rect::from_min_size(Pos2::ZERO, vec2(330.0, 460.0)));
    // The right panel for the selected frame.
    s.save(&dir, "right-panel.png", Rect::from_min_size(pos2(1130.0, 40.0), vec2(310.0, 860.0)));
    // The Assets tab.
    s.app.ui.left_tab = crate::LeftTab::Assets;
    s.frames(3);
    s.save(&dir, "assets.png", Rect::from_min_size(Pos2::ZERO, vec2(330.0, 460.0)));
    // The tools of the shape and drawing groups in use: another tool selected.
    s.app.run("tool.set", json!({"tool": "ellipse"}));
    s.frames(3);
    s.save(&dir, "dock-ellipse.png", Rect::from_min_size(pos2(380.0, 820.0), vec2(700.0, 80.0)));
}
