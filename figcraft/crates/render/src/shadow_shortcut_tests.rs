//! Drop shadows skipped where the layer hides them and cast from the layer's outline instead of
//! its pixels (see `draw::shadows_hidden`, `draw::casts_from_shape`) give the pixels of the long
//! way round: every kind of layer that takes a shortcut, at several zooms, cut by the view's edge
//! and with the view inside it.

use std::sync::Arc;

use figcraft_color::{Color, ImageScaleMode, Paint, PaintKind};
use figcraft_doc::{Document, Effect, EffectKind, ImageData, NodeId, NodeKind, Shadow};

use crate::draw::NO_SHADOW_SHORTCUTS;
use crate::{Options, View, render_view_single};

fn jpeg() -> Vec<u8> {
    let mut img = image::RgbImage::new(120, 80);
    for (x, y, p) in img.enumerate_pixels_mut() {
        *p = image::Rgb([(x * 2) as u8, (y * 3) as u8, ((x + y) % 255) as u8]);
    }
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Jpeg).unwrap();
    out.into_inner()
}

fn shadow(d: &mut Document, id: NodeId, s: Shadow) {
    d.get_mut(id).unwrap().effects.push(Effect { kind: EffectKind::DropShadow(s), visible: true });
}

fn solid(d: &mut Document, id: NodeId, hex: &str) {
    d.get_mut(id).unwrap().fills = vec![Paint::solid(Color::from_hex(hex).unwrap())];
}

/// A page of layers with shadows: plain and rounded rectangles, a photo, an ellipse, a clipping
/// rounded card holding a photo and a badge, a spread shadow, one shown behind, a translucent fill
/// (no shortcut) and a stroked layer (no shortcut).
fn page() -> (Arc<Document>, NodeId) {
    let mut d = Document::new("shadows");
    let page = d.first_page().unwrap();
    d.images.insert("p".into(), ImageData { bytes: Arc::new(jpeg()), width: 120, height: 80 });
    let image = || Paint {
        kind: PaintKind::Image(figcraft_color::ImagePaint {
            image: "p".into(),
            scale_mode: ImageScaleMode::Fill,
            scale: 1.0,
            rotation: 0,
            crop: None,
            filters: Default::default(),
        }),
        opacity: 1.0,
        visible: true,
        blend: Default::default(),
    };
    let s = |offset: (f64, f64), radius: f64| Shadow { offset, radius, color: Color::new(0.0, 0.0, 0.0, 0.4), ..Shadow::default() };
    let r = d.create(page, NodeKind::Rectangle, "Plain", 20.0, 20.0, 120.0, 80.0).unwrap();
    solid(&mut d, r, "E03030");
    shadow(&mut d, r, s((0.0, 6.0), 12.0));
    let r = d.create(page, NodeKind::Rectangle, "Rounded", 180.0, 20.0, 120.0, 80.0).unwrap();
    solid(&mut d, r, "3060E0");
    d.get_mut(r).unwrap().corners.radii = [16.0, 4.0, 24.0, 0.0];
    shadow(&mut d, r, s((5.0, -3.0), 8.0));
    shadow(&mut d, r, s((0.0, 10.0), 20.0));
    let r = d.create(page, NodeKind::Rectangle, "Photo", 340.0, 20.0, 120.0, 80.0).unwrap();
    d.get_mut(r).unwrap().fills = vec![image()];
    shadow(&mut d, r, s((0.0, 4.0), 6.0));
    let e = d.create(page, NodeKind::Ellipse { start: 0.0, sweep: std::f64::consts::TAU, inner: 0.0 }, "Ellipse", 20.0, 140.0, 100.0, 70.0).unwrap();
    solid(&mut d, e, "20A060");
    shadow(&mut d, e, s((3.0, 3.0), 5.0));
    let card = d.create(page, NodeKind::Frame, "Card", 160.0, 130.0, 200.0, 240.0).unwrap();
    solid(&mut d, card, "FFFFFF");
    d.get_mut(card).unwrap().clip = true;
    d.get_mut(card).unwrap().corners.radii = [14.0; 4];
    shadow(&mut d, card, s((0.0, 8.0), 24.0));
    let ph = d.create(card, NodeKind::Rectangle, "Card photo", -10.0, -10.0, 220.0, 130.0).unwrap();
    d.get_mut(ph).unwrap().fills = vec![image()];
    let badge = d.create(card, NodeKind::Frame, "Badge", 120.0, 16.0, 64.0, 24.0).unwrap();
    solid(&mut d, badge, "E6392E");
    d.get_mut(badge).unwrap().corners.radii = [12.0; 4];
    let r = d.create(page, NodeKind::Rectangle, "Spread", 400.0, 140.0, 80.0, 60.0).unwrap();
    solid(&mut d, r, "F0B020");
    shadow(&mut d, r, Shadow { spread: 6.0, ..s((2.0, 4.0), 8.0) });
    let r = d.create(page, NodeKind::Rectangle, "Behind", 400.0, 240.0, 80.0, 60.0).unwrap();
    solid(&mut d, r, "8040D0");
    shadow(&mut d, r, Shadow { show_behind: true, ..s((4.0, 4.0), 6.0) });
    let r = d.create(page, NodeKind::Rectangle, "Translucent", 20.0, 260.0, 100.0, 60.0).unwrap();
    d.get_mut(r).unwrap().fills = vec![Paint::solid(Color::new(0.2, 0.5, 0.9, 0.5))];
    shadow(&mut d, r, s((0.0, 6.0), 10.0));
    let r = d.create(page, NodeKind::Rectangle, "Stroked", 20.0, 360.0, 100.0, 60.0).unwrap();
    solid(&mut d, r, "30A0C0");
    d.get_mut(r).unwrap().strokes = vec![Paint::solid(Color::from_hex("102030").unwrap())];
    d.get_mut(r).unwrap().stroke.weight = 4.0;
    shadow(&mut d, r, s((0.0, 6.0), 10.0));
    (Arc::new(d), page)
}

fn render(doc: &Document, page: NodeId, view: &View, shortcuts: bool) -> tiny_skia::Pixmap {
    NO_SHADOW_SHORTCUTS.with(|c| c.set(!shortcuts));
    let p = render_view_single(doc, page, view, &Options::default()).unwrap();
    NO_SHADOW_SHORTCUTS.with(|c| c.set(false));
    p
}

/// The largest difference of any channel, and how many channels differ by more than 2.
fn differ(a: &tiny_skia::Pixmap, b: &tiny_skia::Pixmap) -> (u8, usize) {
    let mut max = 0;
    let mut over = 0;
    for (x, y) in a.data().iter().zip(b.data()) {
        let d = x.abs_diff(*y);
        max = max.max(d);
        over += usize::from(d > 2);
    }
    (max, over)
}

#[test]
fn shadow_shortcuts_draw_what_the_long_way_does() {
    let (doc, page) = page();
    let views = [
        // The whole page, at 1×, 1.37× and 2×.
        View { origin: (0.0, 0.0), scale: 1.0, width: 520, height: 460 },
        View { origin: (0.0, 0.0), scale: 1.37, width: 720, height: 640 },
        View { origin: (0.0, 0.0), scale: 2.0, width: 1040, height: 920 },
        // Cut through the layers by the view's edges (half of a shadow off screen).
        View { origin: (75.0, 50.0), scale: 1.0, width: 200, height: 150 },
        View { origin: (205.5, 160.25), scale: 1.37, width: 160, height: 120 },
        // Inside the card: its shadow can't show.
        View { origin: (180.0, 150.0), scale: 2.0, width: 300, height: 380 },
        View { origin: (170.0, 300.0), scale: 1.0, width: 180, height: 60 },
        // Beside layers, where only their shadows reach.
        View { origin: (482.0, 130.0), scale: 1.0, width: 30, height: 200 },
        View { origin: (165.0, 200.0), scale: 1.0, width: 190, height: 20 },
    ];
    for (i, v) in views.iter().enumerate() {
        let (fast, slow) = (render(&doc, page, v, true), render(&doc, page, v, false));
        let (max, over) = differ(&fast, &slow);
        if i < 3 {
            // Nothing cut: the same pixels.
            assert!(max <= 2 && over == 0, "view {v:?}: shortcuts differ by up to {max} ({over} channels over 2)");
        } else {
            // A layer cut by the view is rasterised in a layer cut elsewhere (no margin for a
            // shadow that isn't drawn from it): its anti-aliased edge can come out a little
            // different, as between a patch and a full render (`retained_tests::assert_same`).
            crate::retained_tests::assert_same(&fast, &slow, &format!("view {v:?}"));
        }
    }
}

#[test]
fn a_strip_inside_a_card_with_a_shadow_casts_no_shadow() {
    let (doc, page) = page();
    // Rows across the card's middle, clear of its rounded corners.
    let v = View { origin: (165.0, 200.0), scale: 1.0, width: 190, height: 20 };
    let cast = |shortcuts| {
        let before = crate::perf::Snapshot::now();
        render(&doc, page, &v, shortcuts);
        crate::perf::Snapshot::now().since(&before).shadows
    };
    // The long way casts the card's, and those of the layers whose shadows' margins reach the
    // strip (the ones that take no shortcut); only the card's is hidden behind the card.
    let (slow, fast) = (cast(false), cast(true));
    assert_eq!(slow - fast, 1, "the card's shadow was cast for a strip inside it ({slow} the long way, {fast} with shortcuts)");
}
