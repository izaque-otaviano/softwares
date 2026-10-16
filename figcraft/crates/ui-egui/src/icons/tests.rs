//! The icon set: every SVG parses and is listed, every icon has art and paints inside its box at
//! every size the UI uses on 1× and 2× displays, and hostile sizes don't panic.

use std::path::{Path, PathBuf};

use egui::{Color32, ColorImage, Rect, Shape, pos2, vec2};

use super::lucide::{self, FILES, MAX_PX, rasterize, stroke_units};
use super::{Icon, paint, source};

fn assets_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../assets/ui/lucide")
}

fn svg_files(dir: &Path, out: &mut Vec<PathBuf>) {
    for e in std::fs::read_dir(dir).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            svg_files(&p, out);
        } else if p.extension().is_some_and(|x| x == "svg") {
            out.push(p);
        }
    }
}

fn opaque(img: &ColorImage) -> usize {
    img.pixels.iter().filter(|c| c.a() > 0).count()
}

/// The pixels with any coverage: (min x, min y, max x, max y).
fn bounds(img: &ColorImage) -> Option<(usize, usize, usize, usize)> {
    let [w, h] = img.size;
    let mut b: Option<(usize, usize, usize, usize)> = None;
    for y in 0..h {
        for x in 0..w {
            if img.pixels[y * w + x].a() > 0 {
                b = Some(b.map_or((x, y, x, y), |(a, c, d, e)| (a.min(x), c.min(y), d.max(x), e.max(y))));
            }
        }
    }
    b
}

#[test]
fn every_embedded_svg_parses_and_draws() {
    assert!(FILES.len() > 100);
    for (key, svg) in FILES {
        for px in [12, 16, 20, 24, 48] {
            let img = rasterize(svg, px, stroke_units(px, 1.0)).unwrap_or_else(|| panic!("{key} does not parse at {px}"));
            assert_eq!(img.size, [px as usize, px as usize]);
            assert!(opaque(&img) >= px as usize / 2, "{key} is blank at {px}");
        }
        // The stroke width is set once on the root element (what `rasterize` overrides).
        assert_eq!(svg.matches("stroke-width=\"2\"").count(), 1, "{key}");
        assert!(svg.contains("viewBox=\"0 0 24 24\""), "{key}: Lucide's 24 grid");
        let lucide = !key.starts_with("original/");
        assert_eq!(svg.starts_with("<!-- @license lucide-static"), lucide, "{key}: Lucide files are unchanged, originals say so");
        if !lucide {
            assert!(svg.starts_with("<!-- FigCraft original icon in Lucide's style"), "{key}");
        }
    }
}

/// Every SVG in the assets folder is embedded, listed in ATTRIBUTION.md, and used by an icon; the
/// ISC licence text sits beside them.
#[test]
fn the_art_on_disk_is_embedded_attributed_and_used() {
    let mut on_disk = Vec::new();
    svg_files(&assets_dir(), &mut on_disk);
    let keys: Vec<String> =
        on_disk.iter().map(|p| p.strip_prefix(assets_dir()).unwrap().with_extension("").to_string_lossy().replace('\\', "/")).collect();
    let mut embedded: Vec<&str> = FILES.iter().map(|(k, _)| *k).collect();
    let mut disk: Vec<&str> = keys.iter().map(String::as_str).collect();
    embedded.sort_unstable();
    disk.sort_unstable();
    assert_eq!(embedded, disk, "assets/ui/lucide and the embedded list differ");
    let attribution = include_str!("../../../../ATTRIBUTION.md");
    for k in &keys {
        assert!(attribution.contains(&format!("`assets/ui/lucide/{k}.svg`")), "{k} has no ATTRIBUTION.md row");
    }
    assert!(attribution.contains("`assets/ui/lucide/LICENSE`"));
    assert!(std::fs::read_to_string(assets_dir().join("LICENSE")).unwrap().starts_with("ISC License"));
    let used: Vec<&str> = Icon::ALL.iter().filter_map(|i| source(*i)).collect();
    for k in &keys {
        assert!(used.contains(&k.as_str()), "{k} is not used by any icon");
    }
}

#[test]
fn every_icon_has_art() {
    for &icon in Icon::ALL {
        match icon {
            Icon::Logo | Icon::Document => assert!(source(icon).is_none()),
            _ => {
                let key = source(icon).unwrap_or_else(|| panic!("{icon:?} has no art"));
                assert!(lucide::file(key).is_some(), "{icon:?}: {key} is not embedded");
            }
        }
    }
}

#[test]
fn the_line_is_seven_tenths_of_a_point_at_every_size() {
    for ppp in [1.0f32, 1.5, 2.0, 3.0] {
        for pts in [10u32, 12, 14, 16, 18, 20, 24, 32] {
            let px = (pts as f32 * ppp).floor() as u32;
            let s = stroke_units(px, ppp);
            assert!(s.is_finite() && (0.25..=3.0).contains(&s), "{px} px at {ppp}: {s}");
            // Grid units back to points on screen.
            let phys = s * px as f32 / 24.0;
            assert!(phys >= 0.99 || s >= 3.0, "{pts} pt at {ppp}x: {phys} px line");
            if ppp >= 1.5 && s < 3.0 {
                assert!((phys / ppp - 0.7).abs() < 0.02, "{pts} pt at {ppp}x: {} pt line", phys / ppp);
            }
        }
    }
    // Junk display scales and sizes fall back to something drawable.
    for ppp in [0.0, -1.0, f32::NAN, f32::INFINITY] {
        let s = stroke_units(24, ppp);
        assert!(s.is_finite() && s > 0.0, "{ppp}: {s}");
    }
    assert!(stroke_units(0, 2.0).is_finite());
}

#[test]
fn junk_input_does_not_panic() {
    assert!(rasterize("not svg", 16, 2.0).is_none());
    assert!(rasterize("", 0, 2.0).is_none());
    let (_, svg) = FILES[0];
    for px in [0, 1, 7, MAX_PX, MAX_PX + 1, u32::MAX] {
        for stroke in [0.0, -3.0, f32::NAN, f32::INFINITY, 1e9, 2.0] {
            let img = rasterize(svg, px, stroke).unwrap();
            assert_eq!(img.size[0], px.clamp(1, MAX_PX) as usize);
        }
    }
    for (side, ppp) in [(0.0, 1.0), (-4.0, 1.0), (f32::NAN, 1.0), (f32::INFINITY, 1.0), (16.0, 0.0), (16.0, f32::NAN), (1e30, 2.0), (0.4, 1.0)] {
        let px = lucide::pixels(side, ppp);
        assert!(px.is_none_or(|p| (1..=MAX_PX).contains(&p)), "{side} {ppp}: {px:?}");
    }
}

/// Paint every icon in `size`-point boxes at `ppp` pixels per point; the picture drawn lies inside
/// its box, is on the pixel grid and isn't blank.
fn gallery_at(ppp: f32, size: f32) {
    let ctx = egui::Context::default();
    ctx.set_pixels_per_point(ppp);
    let mut boxes = Vec::new();
    let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
        for (i, &icon) in Icon::ALL.iter().enumerate() {
            // A box at an odd place (not on the pixel grid) and a tint with some transparency.
            let r = Rect::from_min_size(pos2(3.3 + (i % 12) as f32 * (size + 5.7), 7.7 + (i / 12) as f32 * (size + 5.1)), vec2(size, size));
            paint(ui.painter(), r, icon, Color32::from_rgba_unmultiplied(200, 120, 20, 230));
            boxes.push((icon, r));
        }
    });
    out.textures_delta.clear();
    let meshes: Vec<&egui::Mesh> = out
        .shapes
        .iter()
        .filter_map(|s| match &s.shape {
            Shape::Mesh(m) => Some(&**m),
            _ => None,
        })
        .collect();
    assert_eq!(meshes.len(), Icon::ALL.len(), "one picture per icon at {size} px, {ppp}x");
    for (m, (icon, r)) in meshes.iter().zip(&boxes) {
        let drawn = Rect::from_points(&m.vertices.iter().map(|v| v.pos).collect::<Vec<_>>());
        // (The owner's logo and document mark round to the nearest pixel instead: half a pixel.)
        let slack = if matches!(icon, Icon::Logo | Icon::Document) { 0.5 / ppp } else { 0.0 };
        assert!(r.expand(slack + 1e-3).contains_rect(drawn), "{icon:?} at {size} px, {ppp}x: {drawn:?} not inside {r:?}");
        assert!(drawn.width() >= size - 1.0 / ppp - 1e-3, "{icon:?}: drawn {drawn:?} smaller than its {size} px box");
        // Whole physical pixels (the box itself is off the grid, the icon isn't), unless it was
        // centred exactly to stay in its box.
        let on_grid = |v: f32| ((v * ppp) - (v * ppp).round()).abs() < 1e-3;
        if on_grid(drawn.min.x) && on_grid(drawn.min.y) {
            assert!(on_grid(drawn.max.x) && on_grid(drawn.max.y), "{icon:?}: {drawn:?}");
        }
        for v in &m.vertices {
            assert!(v.color.a() > 0);
        }
        assert_ne!(m.texture_id, egui::TextureId::default());
    }
}

#[test]
fn every_icon_paints_inside_its_box_at_every_size_and_scale() {
    for ppp in [1.0, 2.0, 1.5] {
        for size in [16.0, 20.0, 24.0] {
            gallery_at(ppp, size);
        }
    }
    // The compact sizes too.
    gallery_at(1.0, 12.0);
    gallery_at(2.0, 10.0);
}

/// The art itself at the sizes in use: some coverage, inside the picture, and (Lucide keeps a
/// 2 unit margin) not touching the edge rows except for the few icons that run to the edge.
#[test]
fn every_icon_draws_something_inside_its_square() {
    for &icon in Icon::ALL {
        let Some(svg) = source(icon).and_then(lucide::file) else { continue };
        for px in [16u32, 20, 24, 32, 40, 48] {
            let img = rasterize(svg, px, stroke_units(px, 1.0)).unwrap();
            let n = opaque(&img);
            let area = (px * px) as usize;
            assert!(n * 100 >= area, "{icon:?} at {px}: only {n}/{area} pixels");
            assert!(n * 100 <= area * 85, "{icon:?} at {px}: {n}/{area} pixels is a blob");
            let (x0, y0, x1, y1) = bounds(&img).unwrap();
            // (A line is thin one way.)
            assert!(x1 - x0 > px as usize / 3 || y1 - y0 > px as usize / 3, "{icon:?} at {px}: tiny {:?}", (x0, y0, x1, y1));
        }
    }
}

#[test]
fn hostile_boxes_paint_nothing_and_dont_panic() {
    let ctx = egui::Context::default();
    let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
        let big = 1.0e9;
        let sizes = [0.0, -4.0, f32::NAN, f32::INFINITY, f32::NEG_INFINITY, 0.3, 14.0, 5000.0, big];
        for &icon in Icon::ALL {
            for side in sizes {
                paint(ui.painter(), Rect::from_min_size(pos2(1.3, 2.7), vec2(side, side)), icon, Color32::WHITE);
                paint(ui.painter(), Rect::from_min_size(pos2(f32::NAN, 2.7), vec2(16.0, 16.0)), icon, Color32::WHITE);
                paint(ui.painter(), Rect::from_min_size(pos2(1.0, 2.0), vec2(side, 16.0)), icon, Color32::WHITE);
                paint(ui.painter(), Rect::from_center_size(pos2(f32::INFINITY, 0.0), vec2(16.0, 16.0)), icon, Color32::WHITE);
            }
            // Fully transparent tint: nothing to draw.
            paint(ui.painter(), Rect::from_min_size(pos2(0.0, 0.0), vec2(16.0, 16.0)), icon, Color32::TRANSPARENT);
        }
    });
    out.textures_delta.clear();
    // The big sizes are drawn from the largest mask (the owner's logo, from its own, is bigger).
    let max_side = out
        .shapes
        .iter()
        .filter_map(|s| match &s.shape {
            Shape::Mesh(m) => Some(Rect::from_points(&m.vertices.iter().map(|v| v.pos).collect::<Vec<_>>()).width()),
            _ => None,
        })
        .fold(0.0f32, f32::max);
    assert!(max_side <= 1024.0 + 1e-3, "{max_side}");
    assert!(lucide::textures(&ctx).len() <= Icon::ALL.len() * 4, "hostile sizes don't fill the cache");
}

/// Hostile display scales: a tiny or huge pixels-per-point still paints sanely.
#[test]
fn odd_display_scales_dont_panic() {
    for ppp in [0.25, 0.5, 1.0 / 3.0, 3.0, 4.0, 8.0] {
        let ctx = egui::Context::default();
        ctx.set_pixels_per_point(ppp);
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
            for &icon in Icon::ALL {
                for side in [1.0, 8.0, 16.0, 24.0, 64.0] {
                    paint(ui.painter(), Rect::from_min_size(pos2(0.7, 0.2), vec2(side, side)), icon, Color32::WHITE);
                }
            }
        });
        out.textures_delta.clear();
    }
}

/// Painting the same icon again (the next frame) reuses its texture: nothing is rasterised again.
#[test]
fn textures_are_cached_per_icon_and_size() {
    let ctx = egui::Context::default();
    let draw = |ctx: &egui::Context| {
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
            for &icon in &[Icon::Plus, Icon::Search, Icon::Close] {
                for side in [16.0, 20.0] {
                    paint(ui.painter(), Rect::from_min_size(pos2(0.0, 0.0), vec2(side, side)), icon, Color32::WHITE);
                }
            }
        });
        let sent = out.textures_delta.set.len();
        out.textures_delta.clear();
        sent
    };
    // (The first frame also sends the font atlas.)
    assert!(draw(&ctx) >= 6);
    assert_eq!(draw(&ctx), 0);
    assert_eq!(lucide::textures(&ctx).len(), 6);
}

/// The icon's tint multiplies the white mask: the colour is the caller's, per state.
#[test]
fn the_tint_is_the_callers_colour() {
    let ctx = egui::Context::default();
    let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
        paint(ui.painter(), Rect::from_min_size(pos2(0.0, 0.0), vec2(16.0, 16.0)), Icon::Eye, Color32::from_rgb(10, 20, 30));
    });
    out.textures_delta.clear();
    let Some(Shape::Mesh(m)) = out.shapes.first().map(|s| &s.shape) else { panic!("{:?}", out.shapes) };
    assert!(m.vertices.iter().all(|v| v.color == Color32::from_rgb(10, 20, 30)));
}
