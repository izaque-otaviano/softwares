//! A render in pieces (the browser's, between frames) comes out as the render in one go.

use std::sync::Arc;

use figcraft_color::{Color, ImageScaleMode, Paint};
use figcraft_doc::{Document, Effect, EffectKind, ImageData, NodeId, NodeKind, Shadow};
use figcraft_geom::Affine;

use crate::{Options, Pixmap, Retained, Sliced, View, Work};

fn png(w: u32, h: u32) -> Vec<u8> {
    let img = image::RgbaImage::from_fn(w, h, |x, y| image::Rgba([(x * 255 / w) as u8, (y * 255 / h) as u8, ((x / 8 + y / 8) % 2 * 90) as u8, 255]));
    let mut out = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png).unwrap();
    out
}

/// A tall page: a picture, shapes with a drop shadow, a rotated rectangle and a glass panel
/// (background blur) over them, so bands cut effects at their edges.
fn scene(hash: &str, glass: bool) -> (Arc<Document>, NodeId) {
    let mut d = Document::new("sliced");
    let p = d.first_page().unwrap();
    d.images.insert(hash.into(), ImageData { bytes: Arc::new(png(640, 480)), width: 640, height: 480 });
    let pic = d.create(p, NodeKind::Rectangle, "Pic", 10.0, 10.0, 220.0, 160.0).unwrap();
    d.get_mut(pic).unwrap().fills = vec![Paint::image(hash, ImageScaleMode::Fill)];
    d.get_mut(pic)
        .unwrap()
        .effects
        .push(Effect { kind: EffectKind::DropShadow(Shadow { offset: (0.0, 8.0), radius: 10.0, ..Shadow::default() }), visible: true });
    let card = d.create(p, NodeKind::Frame, "Card", 20.0, 200.0, 200.0, 160.0).unwrap();
    d.get_mut(card).unwrap().fills = vec![Paint::solid(Color::from_hex("F2F2F2").unwrap())];
    d.get_mut(card).unwrap().corners.radii = [14.0; 4];
    d.get_mut(card)
        .unwrap()
        .effects
        .push(Effect { kind: EffectKind::DropShadow(Shadow { offset: (0.0, 6.0), radius: 14.0, ..Shadow::default() }), visible: true });
    let r = d.create(p, NodeKind::Rectangle, "R", 0.0, 0.0, 120.0, 90.0).unwrap();
    d.get_mut(r).unwrap().fills = vec![Paint::solid(Color::from_hex("3C8CE6").unwrap())];
    d.get_mut(r).unwrap().transform = Affine::translate((90.0, 380.0)) * Affine::rotate(0.4);
    if glass {
        let g = d.create(p, NodeKind::Rectangle, "Glass", 30.0, 330.0, 190.0, 90.0).unwrap();
        d.get_mut(g).unwrap().fills = vec![Paint::solid(Color::new(1.0, 1.0, 1.0, 0.3))];
        d.get_mut(g).unwrap().effects.push(Effect { kind: EffectKind::BackgroundBlur(figcraft_doc::Blur::uniform(6.0)), visible: true });
    }
    (Arc::new(d), p)
}

fn view(y: f64) -> View {
    View { origin: (0.0, y), scale: 1.0, width: 260, height: 480 }
}

fn opts() -> Options {
    Options { background: Some(Color::WHITE), lod: true, ..Default::default() }
}

/// Run every piece, one at a time.
fn run_all(s: &mut Sliced) -> usize {
    let mut steps = 0;
    while !s.step(&mut || false) {
        steps += 1;
        assert!(steps < 10_000, "never done");
    }
    steps + 1
}

/// Per row: the mean channel difference and how many pixels differ by more than 2 (bands cut a
/// curve's anti-aliasing a hair differently; a band artifact differs along a whole row).
fn assert_close(a: &Pixmap, b: &Pixmap, what: &str) {
    assert_eq!((a.width(), a.height()), (b.width(), b.height()), "{what}");
    let row = a.width() as usize * 4;
    for (y, (x, z)) in a.data().chunks(row).zip(b.data().chunks(row)).enumerate() {
        let sum: f64 = x.iter().zip(z).map(|(p, q)| f64::from(p.abs_diff(*q))).sum();
        let off = x.chunks(4).zip(z.chunks(4)).filter(|(p, q)| p.iter().zip(*q).any(|(c, d)| c.abs_diff(*d) > 2)).count();
        assert!(
            sum / (row as f64) < 0.25 && off * 20 <= a.width() as usize,
            "{what}: row {y} differs ({off} pixels, {:.2} on average)",
            sum / row as f64
        );
    }
}

#[test]
fn a_render_in_pieces_matches_the_render_in_one_go() {
    // The second view ends inside the glass panel's reach: the margin bands draw past a band's
    // edge stops at the view's, where a whole render ends too.
    for (glass, height) in [(false, 480), (true, 480), (true, 424)] {
        let (doc, page) = scene(&format!("sliced-a-{glass}-{height}"), glass);
        let view = View { height, ..view(0.0) };
        let whole = Retained::default().render(&doc, page, &view, &opts()).map(|(_, p, w)| (p.clone(), w)).unwrap();
        assert_eq!(whole.1, Work::Full);
        let mut r = Retained::default();
        let mut s = r.begin(&doc, page, &view, &opts(), 32).unwrap();
        let (_, total) = s.progress();
        assert!(total > 8, "{total} pieces: the view should be cut into bands (and the picture decoded first)");
        let steps = run_all(&mut s);
        assert_eq!(steps, total, "one piece per step when asked to stop after each");
        let (v, pix, work) = r.finish(s).unwrap();
        assert_eq!(work, Work::Full);
        assert_eq!((v.width, v.height), (261, height + 1), "snapped like a render in one go");
        assert_close(pix, &whole.0, &format!("glass {glass}"));
    }
}

#[test]
fn a_step_runs_until_the_caller_says_to_stop() {
    let (doc, page) = scene("sliced-b", false);
    let mut r = Retained::default();
    let mut s = r.begin(&doc, page, &view(0.0), &opts(), 64).unwrap();
    let (_, total) = s.progress();
    // Three pieces, then stop.
    let mut left = 3;
    let done = s.step(&mut || {
        left -= 1;
        left > 0
    });
    assert!(!done);
    assert_eq!(s.progress().0, 3);
    // Always at least one piece, whatever the budget.
    s.step(&mut || false);
    assert_eq!(s.progress().0, 4);
    // Until the end.
    assert!(s.step(&mut || true));
    assert_eq!(s.progress(), (total, total));
    // An unfinished render can't be kept.
    let (doc2, page2) = scene("sliced-b2", false);
    let mut r2 = Retained::default();
    let unfinished = r2.begin(&doc2, page2, &view(0.0), &opts(), 64).unwrap();
    assert!(r2.finish(unfinished).is_none());
}

#[test]
fn pictures_decode_in_their_own_pieces_before_any_drawing() {
    let hash = "sliced-c-unique-picture";
    let (doc, page) = scene(hash, false);
    let src = crate::mips::Source {
        hash,
        data: doc.images.get(hash),
        filters: &figcraft_color::ImageFilters::default(),
        profile: figcraft_color::ColorProfile::Srgb,
    };
    assert!(!crate::mips::global().holds(&src, 0) && !crate::mips::global().holds(&src, 1));
    let mut r = Retained::default();
    let mut s = r.begin(&doc, page, &view(0.0), &opts(), 64).unwrap();
    // The first piece decodes the picture (a 640 × 480 picture shown 220 wide: level 1 → 0 and 1 held).
    s.step(&mut || false);
    assert!(crate::mips::global().holds(&src, 1), "decoded by the first piece");
    assert!(s.progress().0 == 1);
    // A render of another stretch of the page whose picture is held has no decode piece.
    let mut again = Retained::default().begin(&doc, page, &view(0.0), &opts(), 64).unwrap();
    assert_eq!(again.progress().1, s.progress().1 - 1);
    run_all(&mut again);
}

#[test]
fn a_pan_in_pieces_patches_only_the_new_strip_and_matches() {
    let (doc, page) = scene("sliced-d", true);
    let mut r = Retained::default();
    let mut first = r.begin(&doc, page, &view(0.0), &opts(), 32).unwrap();
    run_all(&mut first);
    r.finish(first).unwrap();
    // Down 60 pixels.
    let mut pan = r.begin(&doc, page, &view(60.0), &opts(), 32).unwrap();
    run_all(&mut pan);
    let (_, kept, work) = r.finish(pan).unwrap();
    assert!(matches!(work, Work::Partial { pixels } if pixels < 261 * 481 / 2), "{work:?}");
    let kept = kept.clone();
    let (_, fresh, _) = Retained::default().render(&doc, page, &view(60.0), &opts()).map(|(v, p, w)| (v, p.clone(), w)).unwrap();
    assert_close(&kept, &fresh, "pan in pieces");
    // Nothing moved: nothing to do.
    let mut same = r.begin(&doc, page, &view(60.0), &opts(), 32).unwrap();
    assert!(same.is_done());
    assert_eq!(same.progress(), (0, 0));
    assert!(same.step(&mut || false));
    assert_eq!(r.finish(same).unwrap().2, Work::Reused);
}

#[test]
fn a_huge_backdrop_blur_or_grain_draws_in_one_piece() {
    let (mut d, page) = {
        let (doc, page) = scene("sliced-e", true);
        (Arc::unwrap_or_clone(doc), page)
    };
    let g = d.find_by_name("Glass", None)[0];
    d.get_mut(g).unwrap().effects = vec![Effect { kind: EffectKind::BackgroundBlur(figcraft_doc::Blur::uniform(500.0)), visible: true }];
    let doc = Arc::new(d);
    let s = Retained::default().begin(&doc, page, &view(0.0), &opts(), 32).unwrap();
    let draws = s.progress().1;
    // At most the picture's decode and the one draw.
    assert!(draws <= 2, "{draws} pieces");
    // Grain too.
    let (mut d2, page2) = {
        let (doc, page) = scene("sliced-f", false);
        (Arc::unwrap_or_clone(doc), page)
    };
    let card = d2.find_by_name("Card", None)[0];
    d2.get_mut(card).unwrap().effects.push(Effect {
        kind: EffectKind::Noise(figcraft_doc::Noise { size: 1.0, density: 0.3, color: Color::BLACK, ..Default::default() }),
        visible: true,
    });
    let s2 = Retained::default().begin(&Arc::new(d2), page2, &view(0.0), &opts(), 32).unwrap();
    assert!(s2.progress().1 <= 2, "{} pieces", s2.progress().1);
}

#[test]
fn dropping_a_render_in_pieces_makes_the_next_one_whole() {
    let (doc, page) = scene("sliced-g", false);
    let mut r = Retained::default();
    r.render(&doc, page, &view(0.0), &opts()).unwrap();
    drop(r.begin(&doc, page, &view(30.0), &opts(), 32).unwrap());
    let (_, _, work) = r.render(&doc, page, &view(30.0), &opts()).unwrap();
    assert_eq!(work, Work::Full);
}

#[test]
fn junk_views_and_row_counts_are_safe() {
    let (doc, page) = scene("sliced-h", false);
    let mut r = Retained::default();
    let junk = View { origin: (f64::NAN, f64::INFINITY), scale: 0.0, width: u32::MAX, height: 0 };
    assert!(r.begin(&doc, page, &junk, &opts(), 0).is_none());
    for rows in [0, 1, u32::MAX] {
        let mut s = r.begin(&doc, page, &view(0.0), &opts(), rows).unwrap();
        run_all(&mut s);
        assert!(r.finish(s).is_some());
        r.clear();
    }
}
