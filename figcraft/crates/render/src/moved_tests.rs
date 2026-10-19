//! Layers that only moved are copied, not drawn again (`moved`): every render after a move must
//! match a full render of the same view, whatever the layer is placed in, and the moves that can
//! be copied must be (a drag draws a few strips, not the layer).

use std::sync::Arc;

use figcraft_color::{Color, ImageScaleMode, Paint, PaintKind};
use figcraft_doc::{Document, Effect, EffectKind, ImageData, NodeId, NodeKind, Shadow};
use figcraft_geom::Affine;

use crate::retained_tests::assert_same;
use crate::{Options, Retained, View, Work, render_view};

fn jpeg() -> Vec<u8> {
    let mut img = image::RgbImage::new(160, 100);
    for (x, y, p) in img.enumerate_pixels_mut() {
        *p = image::Rgb([(x * 255 / 160) as u8, (y * 255 / 100) as u8, ((x + y) * 255 / 260) as u8]);
    }
    let mut out = std::io::Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Jpeg).unwrap();
    out.into_inner()
}

fn solid(doc: &mut Document, id: NodeId, hex: &str) {
    doc.get_mut(id).unwrap().fills = vec![Paint::solid(Color::from_hex(hex).unwrap())];
}

fn photo(doc: &mut Document, id: NodeId) {
    doc.images.insert("p".into(), ImageData { bytes: Arc::new(jpeg()), width: 160, height: 100 });
    doc.get_mut(id).unwrap().fills = vec![Paint {
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
    }];
}

struct Scene {
    doc: Arc<Document>,
    page: NodeId,
    red: NodeId,
    glass: NodeId,
    screen: NodeId,
    card: NodeId,
    photo: NodeId,
    badge: NodeId,
    shadowed: NodeId,
    group: NodeId,
    under: NodeId,
}

fn scene() -> Scene {
    let mut d = Document::new("moved");
    let page = d.first_page().unwrap();
    // Something under everything the layers move over.
    let under = d.create(page, NodeKind::Rectangle, "Under", 150.0, 30.0, 90.0, 400.0).unwrap();
    solid(&mut d, under, "30A0C0");
    let red = d.create(page, NodeKind::Rectangle, "Red", 20.0, 20.0, 100.0, 60.0).unwrap();
    solid(&mut d, red, "E03030");
    let glass = d.create(page, NodeKind::Rectangle, "Glass", 20.0, 100.0, 100.0, 60.0).unwrap();
    d.get_mut(glass).unwrap().fills = vec![Paint::solid(Color::new(0.2, 0.3, 0.9, 0.5))];
    let shadowed = d.create(page, NodeKind::Rectangle, "Shadowed", 20.0, 180.0, 80.0, 50.0).unwrap();
    solid(&mut d, shadowed, "20A060");
    d.get_mut(shadowed)
        .unwrap()
        .effects
        .push(Effect { kind: EffectKind::DropShadow(Shadow { offset: (6.0, 8.0), radius: 6.0, ..Shadow::default() }), visible: true });
    let group = d.create(page, NodeKind::Group, "Group", 20.0, 250.0, 120.0, 60.0).unwrap();
    for (i, hex) in ["F0B020", "8040D0"].into_iter().enumerate() {
        let r = d.create(group, NodeKind::Rectangle, "G", 20.0 + 60.0 * i as f64, 250.0 + 6.0 * i as f64, 60.0, 50.0).unwrap();
        solid(&mut d, r, hex);
    }
    // A screen (clipping) with a rounded card (clipping, with a shadow) holding a photo and a badge above it.
    let screen = d.create(page, NodeKind::Frame, "Screen", 260.0, 20.0, 320.0, 360.0).unwrap();
    solid(&mut d, screen, "FAFAFA");
    d.get_mut(screen).unwrap().clip = true;
    let card = d.create(screen, NodeKind::Frame, "Card", 20.0, 20.0, 240.0, 300.0).unwrap();
    solid(&mut d, card, "FFFFFF");
    d.get_mut(card).unwrap().clip = true;
    d.get_mut(card).unwrap().corners.radii = [12.0; 4];
    d.get_mut(card)
        .unwrap()
        .effects
        .push(Effect { kind: EffectKind::DropShadow(Shadow { offset: (0.0, 6.0), radius: 10.0, ..Shadow::default() }), visible: true });
    let ph = d.create(card, NodeKind::Rectangle, "Photo", 0.0, 0.0, 240.0, 160.0).unwrap();
    photo(&mut d, ph);
    let badge = d.create(card, NodeKind::Frame, "Badge", 150.0, 20.0, 70.0, 24.0).unwrap();
    solid(&mut d, badge, "E6392E");
    Scene { doc: Arc::new(d), page, red, glass, screen, card, photo: ph, badge, shadowed, group, under }
}

fn move_by(doc: &Arc<Document>, ids: &[NodeId], dx: f64, dy: f64) -> Arc<Document> {
    let mut d = (**doc).clone();
    for id in ids {
        let n = d.get_mut(*id).unwrap();
        n.transform = Affine::translate((dx, dy)) * n.transform;
    }
    Arc::new(d)
}

/// Render `moves` one after another (a drag) through a retained image and compare each with a full
/// render. The work of each.
fn drag(s: &Scene, ids: &[NodeId], moves: &[(f64, f64)], scale: f64, lod: bool) -> Vec<Work> {
    let opts = Options { lod, ..Default::default() };
    let v = View { origin: (0.0, 0.0), scale, width: 700, height: 520 };
    let mut r = Retained::default();
    let mut doc = s.doc.clone();
    r.render(&doc, s.page, &v, &opts).unwrap();
    let mut work = Vec::new();
    for (i, (dx, dy)) in moves.iter().enumerate() {
        doc = move_by(&doc, ids, *dx, *dy);
        let (shown, pix, w) = r.render(&doc, s.page, &v, &opts).unwrap();
        let pix = pix.clone();
        let full = render_view(&doc, s.page, &shown, &opts).unwrap();
        assert_same(&pix, &full, &format!("move {i} by ({dx}, {dy}) at {scale}: {w:?}"));
        work.push(w);
    }
    work
}

const STEPS: [(f64, f64); 6] = [(3.0, 1.0), (2.0, 2.0), (-4.0, 3.0), (7.0, -2.0), (1.0, 6.0), (-5.0, -4.0)];

fn pixels(w: &Work) -> u64 {
    match w {
        Work::Partial { pixels } => *pixels,
        Work::Reused => 0,
        Work::Full => u64::MAX,
    }
}

#[test]
fn an_opaque_rectangle_that_moves_is_copied() {
    let s = scene();
    for lod in [false, true] {
        let work = drag(&s, &[s.red], &STEPS, 1.0, lod);
        for w in &work {
            // The layer is 6000 pixels; only the strips it uncovers and its edges are drawn.
            assert!(pixels(w) < 8000, "drew {w:?} for a move of a 100 x 60 rectangle");
        }
    }
}

#[test]
fn a_photo_in_a_clipping_rounded_card_with_a_shadow_moves_exactly() {
    let s = scene();
    for lod in [false, true] {
        let work = drag(&s, &[s.photo], &[(3.0, 1.0), (2.0, 2.0), (-4.0, 3.0), (7.0, -2.0)], 1.0, lod);
        // 240 x 160 = 38400 pixels; the badge above it blocks copying where they meet, nothing
        // else does, so the layer is drawn only where the badge is, where it uncovered and at the
        // card's rounded corners (17-18k pixels a move before the card's clip cut the areas and
        // its corners stopped insetting whole edges; 9.5-13k after).
        println!("photo in a card: {work:?}");
        assert!(work.iter().all(|w| pixels(w) < 15_000), "{work:?}");
    }
}

#[test]
fn a_photo_dragged_out_of_its_clipping_card_is_cut_where_the_card_cuts_it() {
    let s = scene();
    // Far to the right, past the card's edge, then back and below it.
    drag(&s, &[s.photo], &[(60.0, 0.0), (80.0, 10.0), (-200.0, 40.0), (0.0, 120.0), (-30.0, -150.0)], 1.0, false);
}

#[test]
fn a_photo_with_a_badge_above_it_is_not_copied_over_the_badge() {
    let s = scene();
    // The badge is a sibling above the photo: wherever it is, the photo's pixels aren't its own.
    drag(&s, &[s.photo], &[(-60.0, 0.0), (0.0, 0.0001), (30.0, 40.0), (0.0, -20.0)], 1.0, false);
    // And the badge itself moving over the photo.
    drag(&s, &[s.badge], &STEPS, 1.0, false);
}

#[test]
fn a_layer_with_opacity_or_a_shadow_or_none_of_them_moves_exactly() {
    let s = scene();
    drag(&s, &[s.glass], &STEPS, 1.0, false);
    drag(&s, &[s.shadowed], &STEPS, 1.0, false);
    drag(&s, &[s.group], &STEPS, 1.0, false);
    drag(&s, &[s.card], &STEPS, 1.0, false);
    drag(&s, &[s.screen], &STEPS, 1.0, false);
}

#[test]
fn a_layer_over_other_layers_covers_them_the_same_way_it_uncovers_them() {
    let s = scene();
    // The red rectangle slides over the strip under it, and off the page's corner.
    drag(&s, &[s.red], &[(40.0, 0.0), (40.0, 0.0), (40.0, 0.0), (-200.0, -30.0), (500.0, 600.0)], 1.0, false);
    drag(&s, &[s.under, s.red], &STEPS, 1.0, false);
}

#[test]
fn a_move_that_is_not_whole_pixels_is_drawn_not_copied() {
    let s = scene();
    let work = drag(&s, &[s.red], &[(3.5, 1.25), (0.3, 0.3)], 1.0, false);
    assert!(work.iter().all(|w| pixels(w) > 5000), "{work:?}");
    // At two device pixels per unit, half a unit is one pixel: copied again.
    let work = drag(&s, &[s.red], &[(3.5, 1.5), (0.5, 0.5), (-2.5, 1.0)], 2.0, false);
    assert!(work.iter().all(|w| pixels(w) < 24_000), "{work:?}");
}

#[test]
fn a_move_at_other_zooms_matches_a_full_render() {
    let s = scene();
    for scale in [0.5, 1.0, 1.5, 2.0, 0.25] {
        drag(&s, &[s.photo], &[(4.0, 2.0), (4.0, 2.0), (-6.0, 3.0), (2.0, -2.0)], scale, true);
        drag(&s, &[s.red], &[(4.0, 2.0), (-8.0, 4.0)], scale, false);
    }
}
