//! The mip pyramid: which level a picture shows from, the levels themselves, and the cache that
//! holds them under a byte budget.

use std::sync::Arc;

use figcraft_color::{ColorProfile, ImageFilters, ImageScaleMode, Paint};
use figcraft_doc::{Document, ImageData, NodeKind};
use tiny_skia::Pixmap;

use crate::mips::{Cache, Source, level_for, max_level, reduce_half};
use crate::{Options, View};

/// A smooth colour field with fine detail, as PNG bytes.
fn png(w: u32, h: u32, seed: u32) -> Vec<u8> {
    let img = image::RgbaImage::from_fn(w, h, |x, y| {
        let fine = if (x / 2 + y / 2) % 2 == 0 { 24 } else { 0 };
        image::Rgba([((x * 255 / w) as u8).wrapping_add(seed as u8), ((y * 255 / h) as u8).saturating_add(fine), (x * y / 64) as u8, 255])
    });
    let mut out = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png).unwrap();
    out
}

fn data(w: u32, h: u32, seed: u32) -> ImageData {
    ImageData { bytes: Arc::new(png(w, h, seed)), width: w, height: h }
}

fn src<'a>(hash: &'a str, d: &'a ImageData, f: &'a ImageFilters) -> Source<'a> {
    Source { hash, data: Some(d), filters: f, profile: ColorProfile::Srgb }
}

#[test]
fn the_level_is_the_deepest_one_that_is_never_magnified() {
    // At half size or more the picture itself.
    for s in [0.5, 0.75, 1.0, 4.0] {
        assert_eq!(level_for(s), 0, "{s}");
    }
    // Under half: the level whose pixels are a screen pixel or less.
    assert_eq!(level_for(0.49), 1);
    assert_eq!(level_for(0.26), 1);
    assert_eq!(level_for(0.25), 2);
    assert_eq!(level_for(0.2), 2);
    assert_eq!(level_for(0.125), 3);
    assert_eq!(level_for(0.1), 3);
    assert_eq!(level_for(0.06), 4);
    // Never magnified: a level's pixel covers at most one screen pixel.
    for k in 1..400 {
        let s = f64::from(k) / 800.0;
        let l = level_for(s);
        assert!(s * f64::from(1u32 << l) <= 1.0 + 1e-9, "{s} → {l}");
        if s < 0.5 {
            assert!(s * f64::from(1u32 << l) > 0.5 - 1e-9, "{s} → {l} is shallower than it could be");
        }
    }
    // Junk is level 0.
    for s in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 0.0, -1.0] {
        assert_eq!(level_for(s), 0, "{s}");
    }
    assert!(level_for(1e-300) <= 14);
}

#[test]
fn levels_stop_before_a_side_gets_tiny() {
    assert_eq!(max_level(4000, 3000), 8);
    assert_eq!(max_level(16, 16), 1);
    assert_eq!(max_level(15, 400), 0);
    assert_eq!(max_level(1, 1), 0);
    assert_eq!(max_level(0, 0), 0);
    assert_eq!(max_level(16_384, 16_384), 11);
}

#[test]
fn halving_averages_two_by_two_and_drops_an_odd_edge() {
    let mut p = Pixmap::new(5, 3).unwrap();
    for (i, px) in p.data_mut().chunks_exact_mut(4).enumerate() {
        let v = (i * 10) as u8;
        px.copy_from_slice(&[v, v, v, 255]);
    }
    let h = reduce_half(&p).unwrap();
    assert_eq!((h.width(), h.height()), (2, 1));
    // Pixels 0, 1, 5, 6 → values 0, 10, 50, 60: mean 30.
    assert_eq!(h.data()[..4], [30, 30, 30, 255]);
    // Pixels 2, 3, 7, 8 → 20, 30, 70, 80: mean 50.
    assert_eq!(h.data()[4..8], [50, 50, 50, 255]);
    // Premultiplied: a half-transparent pixel next to a clear one keeps its colour share.
    let mut q = Pixmap::new(2, 2).unwrap();
    q.data_mut().copy_from_slice(&[100, 0, 0, 200, 0, 0, 0, 0, 100, 0, 0, 200, 0, 0, 0, 0]);
    assert_eq!(reduce_half(&q).unwrap().data(), [50, 0, 0, 100]);
    // Too small to halve.
    assert!(reduce_half(&Pixmap::new(1, 9).unwrap()).is_none());
}

#[test]
fn a_level_is_the_picture_reduced_and_clamped() {
    let cache = Cache::new(64 << 20);
    let (d, f) = (data(256, 192, 0), ImageFilters::default());
    let s = src("a", &d, &f);
    let l0 = cache.picture(&s, 0, false).unwrap();
    assert_eq!((l0.pixmap.width(), l0.pixmap.height(), l0.level, l0.full), (256, 192, 0, (256, 192)));
    let l2 = cache.picture(&s, 2, false).unwrap();
    assert_eq!((l2.pixmap.width(), l2.pixmap.height(), l2.level, l2.full), (64, 48, 2, (256, 192)));
    assert_eq!(l2.shrink(), 4.0);
    // Deeper than the picture has: its deepest (side stays at 8 or more: 192 >> 4 = 12, >> 5 = 6).
    let deep = cache.picture(&s, 9, false).unwrap();
    assert_eq!(deep.level, 4);
    assert_eq!((deep.pixmap.width(), deep.pixmap.height()), (16, 12));
    // The levels asked for are held, not the ones made on the way to them.
    for l in [0, 2, 4] {
        assert!(cache.holds(&s, l), "level {l}");
    }
    for l in [1, 3] {
        assert!(!cache.holds(&s, l), "level {l}");
    }
    // A level is the average of the one above: the mean colour is kept (to rounding).
    let mean = |p: &Pixmap| {
        let n = (p.width() * p.height()) as f64;
        (0..3).map(|c| p.data().chunks_exact(4).map(|px| f64::from(px[c])).sum::<f64>() / n).collect::<Vec<_>>()
    };
    for (a, b) in mean(&l0.pixmap).iter().zip(mean(&deep.pixmap)) {
        assert!((a - b).abs() < 2.0, "{a} vs {b}");
    }
    // The same level again is the same pixels, not a copy.
    assert!(Arc::ptr_eq(&l2.pixmap, &cache.picture(&s, 2, false).unwrap().pixmap));
}

#[test]
fn a_padded_level_has_a_clear_border_and_is_kept_apart() {
    let cache = Cache::new(64 << 20);
    let (d, f) = (data(128, 96, 1), ImageFilters::default());
    let s = src("p", &d, &f);
    let plain = cache.picture(&s, 1, false).unwrap();
    let padded = cache.picture(&s, 1, true).unwrap();
    assert_eq!((padded.pixmap.width(), padded.pixmap.height()), (plain.pixmap.width() + 2, plain.pixmap.height() + 2));
    assert_eq!(padded.pixmap.pixel(0, 0).unwrap().alpha(), 0);
    assert_eq!(padded.pixmap.pixel(1, 1).unwrap(), plain.pixmap.pixel(0, 0).unwrap());
    assert!(Arc::ptr_eq(&padded.pixmap, &cache.picture(&s, 1, true).unwrap().pixmap));
}

#[test]
fn the_cache_stays_under_its_byte_budget_dropping_the_least_recently_used() {
    // Each 64 × 64 picture is 16 KiB at level 0 (and 4 KiB at level 1…); room for about four of
    // them.
    let budget = 70 << 10;
    let cache = Cache::new(budget);
    let f = ImageFilters::default();
    let ds: Vec<ImageData> = (0..8).map(|i| data(64, 64, i)).collect();
    let names: Vec<String> = (0..8).map(|i| format!("pic{i}")).collect();
    for (n, d) in names.iter().zip(&ds) {
        let p = cache.picture(&src(n, d, &f), 0, false);
        assert!(p.is_some());
        assert!(cache.bytes() <= budget, "{} bytes after {n}", cache.bytes());
    }
    // The newest are held, the oldest gone.
    assert!(cache.holds(&src(&names[7], &ds[7], &f), 0));
    assert!(cache.holds(&src(&names[6], &ds[6], &f), 0));
    assert!(!cache.holds(&src(&names[0], &ds[0], &f), 0));
    assert!(!cache.holds(&src(&names[1], &ds[1], &f), 0));
    // Using a picture keeps it: touch pic4, add two more, and pic4 outlives pic5.
    let held = |i: usize| cache.holds(&src(&names[i], &ds[i], &f), 0);
    assert!(held(4));
    cache.picture(&src(&names[4], &ds[4], &f), 0, false).unwrap();
    for i in [0, 1] {
        cache.picture(&src(&names[i], &ds[i], &f), 0, false).unwrap();
    }
    assert!(held(4), "touched, so newer than pic5");
    assert!(!held(5));
    assert!(cache.bytes() <= budget);
    // What was dropped comes back when asked for.
    assert!(cache.picture(&src(&names[5], &ds[5], &f), 0, false).is_some());
}

#[test]
fn deep_levels_of_many_pictures_stay_held_under_a_budget_too_small_for_their_big_ones() {
    // Thirty 128 × 128 pictures: 64 KiB each at level 0, 1 KiB at level 3 (and 4 KiB at the floor,
    // level 2, which they keep too). A 160 KiB budget holds two of the big ones, all thirty of the
    // small (what a zoomed-out view draws from).
    let cache = Cache::new(160 << 10);
    let f = ImageFilters::default();
    let ds: Vec<ImageData> = (0..30).map(|i| data(128, 128, i)).collect();
    let names: Vec<String> = (0..30).map(|i| format!("many{i}")).collect();
    for (n, d) in names.iter().zip(&ds) {
        cache.picture(&src(n, d, &f), 3, false).unwrap();
    }
    for (n, d) in names.iter().zip(&ds) {
        assert!(cache.holds(&src(n, d, &f), 3), "{n} was dropped");
    }
    assert!(cache.bytes() <= 160 << 10);
}

#[test]
fn a_deep_level_keeps_the_floor_so_zooming_in_needs_no_decode() {
    let cache = Cache::new(64 << 20);
    let (d, f) = (data(512, 512, 5), ImageFilters::default());
    let s = src("floor", &d, &f);
    cache.picture(&s, 5, false).unwrap();
    assert!(cache.holds(&s, 5) && cache.holds(&s, crate::mips::FLOOR));
    assert!(!cache.holds(&s, 0) && !cache.holds(&s, 1) && !cache.holds(&s, 3) && !cache.holds(&s, 4));
    // Zooming in to level 3 is made from the floor: the pixels are those of a reduction of it.
    let l3 = cache.picture(&s, 3, false).unwrap();
    let floor = cache.picture(&s, crate::mips::FLOOR, false).unwrap();
    assert_eq!(l3.pixmap.data(), reduce_half(&floor.pixmap).unwrap().data());
    // Shallower than the floor: asked for, so kept; a deep request keeps no more than that.
    let (d2, f2) = (data(512, 512, 6), ImageFilters::default());
    let s2 = src("floor-b", &d2, &f2);
    cache.picture(&s2, 1, false).unwrap();
    assert!(cache.holds(&s2, 1) && !cache.holds(&s2, 0) && !cache.holds(&s2, 2));
}

#[test]
fn what_was_just_asked_for_stays_even_when_it_alone_is_over_budget() {
    let cache = Cache::new(1000);
    let (d, f) = (data(64, 64, 3), ImageFilters::default());
    let s = src("big", &d, &f);
    let p = cache.picture(&s, 0, false).unwrap();
    assert_eq!(p.pixmap.width(), 64);
    assert!(cache.holds(&s, 0));
    // A deeper level fits better; the first one goes once something newer needs the room.
    let l3 = cache.picture(&s, 3, false).unwrap();
    assert!(cache.holds(&s, 3));
    assert_eq!(l3.pixmap.width(), 8);
    assert!(!cache.holds(&s, 0), "the big level goes first");
    // Level 0 can be made again after it is dropped.
    assert_eq!(cache.picture(&s, 0, false).unwrap().pixmap.width(), 64);
}

#[test]
fn threads_asking_for_one_picture_share_one_decode() {
    let cache = Cache::new(64 << 20);
    let (d, f) = (data(512, 384, 4), ImageFilters::default());
    let s = src("shared", &d, &f);
    let got: Vec<Arc<Pixmap>> = std::thread::scope(|sc| {
        let handles: Vec<_> = (0..8).map(|_| sc.spawn(|| cache.picture(&s, 2, false).unwrap().pixmap)).collect();
        handles.into_iter().map(|h| h.join().unwrap()).collect()
    });
    for p in &got {
        assert!(Arc::ptr_eq(p, &got[0]), "built more than once");
    }
    assert_eq!(cache.len(), 1, "level 2, once");
    assert!(!cache.holds(&s, 0), "the decode behind it isn't kept");
}

#[test]
fn junk_pictures_are_none_not_a_panic() {
    let cache = Cache::new(1 << 20);
    let f = ImageFilters::default();
    let junk = ImageData { bytes: Arc::new(vec![1, 2, 3, 4]), width: 0, height: 0 };
    assert!(cache.picture(&src("junk", &junk, &f), 3, false).is_none());
    assert!(cache.picture(&Source { hash: "missing", data: None, filters: &f, profile: ColorProfile::Srgb }, 0, true).is_none());
    assert!(cache.is_empty());
}

// --- drawing from a level ------------------------------------------------------------------

/// A page with one rectangle of `w` × `h` filled with image `hash` (a `pw` × `ph` picture).
fn scene(hash: &str, pw: u32, ph: u32, w: f64, h: f64, mode: ImageScaleMode) -> (Document, figcraft_doc::NodeId) {
    let mut d = Document::new("mips");
    let p = d.first_page().unwrap();
    d.images.insert(hash.into(), data(pw, ph, 7));
    let r = d.create(p, NodeKind::Rectangle, "R", 10.0, 10.0, w, h).unwrap();
    d.get_mut(r).unwrap().fills = vec![Paint::image(hash, mode)];
    (d, p)
}

fn view(scale: f64, w: f64, h: f64) -> View {
    View { origin: (0.0, 0.0), scale, width: (w * scale) as u32 + 20, height: (h * scale) as u32 + 20 }
}

/// Mean absolute channel difference between two renders.
fn mean_diff(a: &Pixmap, b: &Pixmap) -> f64 {
    assert_eq!((a.width(), a.height()), (b.width(), b.height()));
    let sum: u64 = a.data().iter().zip(b.data()).map(|(x, y)| u64::from(x.abs_diff(*y))).sum();
    sum as f64 / a.data().len() as f64
}

#[test]
fn a_preview_of_a_shrunk_photo_matches_the_exact_render_closely() {
    for mode in [ImageScaleMode::Fill, ImageScaleMode::Fit, ImageScaleMode::Crop] {
        // 1200 × 800 shown 300 × 200 at 1:1 zoom: a quarter size, level 2.
        let hash = format!("close-{mode:?}");
        let (d, p) = scene(&hash, 1200, 800, 300.0, 200.0, mode);
        let v = view(1.0, 300.0, 200.0);
        let exact = crate::render_view_single(&d, p, &v, &Options { background: Some(figcraft_color::Color::WHITE), ..Default::default() }).unwrap();
        let preview =
            crate::render_view_single(&d, p, &v, &Options { background: Some(figcraft_color::Color::WHITE), lod: true, ..Default::default() })
                .unwrap();
        assert!(
            crate::mips::global()
                .holds(&Source { hash: &hash, data: d.images.get(&hash), filters: &ImageFilters::default(), profile: ColorProfile::Srgb }, 2)
        );
        let diff = mean_diff(&exact, &preview);
        // The picture has 2-pixel checker detail the exact render aliases and the level averages,
        // so they differ a little; a misplaced or mis-scaled level would differ by far more.
        assert!(diff < 4.0, "{mode:?}: mean difference {diff}");
        assert!(diff > 0.0, "{mode:?}: the preview should draw from a reduced level");
    }
}

#[test]
fn a_picture_shown_at_half_size_or_more_renders_exactly_in_a_preview() {
    // 400 × 300 shown 300 × 225: three quarters, no reduction.
    let (d, p) = scene("near", 400, 300, 300.0, 225.0, ImageScaleMode::Fill);
    let v = view(1.0, 300.0, 225.0);
    let exact = crate::render_view_single(&d, p, &v, &Options::default()).unwrap();
    let preview = crate::render_view_single(&d, p, &v, &Options { lod: true, ..Default::default() }).unwrap();
    assert_eq!(exact.data(), preview.data());
}

#[test]
fn exports_never_draw_from_a_level() {
    let (d, p) = scene("export-exact", 1200, 800, 300.0, 200.0, ImageScaleMode::Fill);
    let id = d.node(p).unwrap().children[0];
    let png = crate::render_node(&d, id, 1.0).unwrap();
    // The same view through the exact path (no preview options).
    let b = crate::export_bounds(&d, id).unwrap();
    let v = View { origin: (b.x0, b.y0), scale: 1.0, width: png.width(), height: png.height() };
    let mut exact = Pixmap::new(v.width, v.height).unwrap();
    crate::render_nodes_into(&d, &[id], &v, &mut exact);
    assert_eq!(png.data(), exact.data());
    assert!(
        !crate::mips::global().holds(
            &Source { hash: "export-exact", data: d.images.get("export-exact"), filters: &ImageFilters::default(), profile: ColorProfile::Srgb },
            2
        ),
        "an export has no use for a reduced level"
    );
}

#[test]
fn the_level_is_placed_where_the_picture_goes() {
    use crate::paint::{Detail, Prepared, prepare_with};
    // 1600 × 1200 on a 200 × 150 box: an eighth, level 3, whose 200 × 150 pixels fit the box 1:1.
    let (d, _) = scene("placed", 1600, 1200, 200.0, 150.0, ImageScaleMode::Fill);
    let paint = Paint::image("placed", ImageScaleMode::Fill);
    let Some(Prepared::Pattern { pixmap, transform, .. }) = prepare_with(&paint, 200.0, 150.0, 1.0, &d, 0.0, Detail { mip: true, draft: false })
    else {
        panic!("an image paint prepares a pattern")
    };
    assert_eq!((pixmap.width(), pixmap.height()), (200, 150));
    assert!(
        (transform.sx - 1.0).abs() < 1e-6 && (transform.sy - 1.0).abs() < 1e-6 && transform.tx.abs() < 1e-3 && transform.ty.abs() < 1e-3,
        "{transform:?}"
    );
    // Without the option: the picture, scaled down by an eighth.
    let Some(Prepared::Pattern { pixmap, transform, .. }) = prepare_with(&paint, 200.0, 150.0, 1.0, &d, 0.0, Detail::default()) else {
        panic!("pattern")
    };
    assert_eq!((pixmap.width(), pixmap.height()), (1600, 1200));
    assert!((transform.sx - 0.125).abs() < 1e-6, "{transform:?}");
}

#[test]
fn tiles_take_only_levels_that_divide_the_picture() {
    use crate::images::paint_level;
    let mut paint = figcraft_color::ImagePaint {
        image: "t".into(),
        scale_mode: ImageScaleMode::Tile,
        scale: 1.0,
        rotation: 0,
        crop: None,
        filters: ImageFilters::default(),
    };
    // 1000 = 8 × 125: three levels divide it; 750 = 2 × 375: one.
    let even = ImageData { bytes: Arc::new(vec![]), width: 1000, height: 800 };
    let odd = ImageData { bytes: Arc::new(vec![]), width: 750, height: 800 };
    assert_eq!(paint_level(&paint, &even, 100.0, 100.0, 0.05), 3);
    assert_eq!(paint_level(&paint, &odd, 100.0, 100.0, 0.05), 1);
    paint.scale_mode = ImageScaleMode::Fill;
    assert!(paint_level(&paint, &odd, 100.0, 100.0, 0.05) >= 1);
}

// --- decoding ahead ------------------------------------------------------------------------

#[test]
fn the_pictures_a_view_draws_are_found_with_their_levels() {
    use crate::prefetch::{missing, needs};
    let (mut d, p) = scene("ahead-a", 1200, 800, 300.0, 200.0, ImageScaleMode::Fill);
    // A second picture far below the first, on another layer.
    d.images.insert("ahead-b".into(), data(800, 800, 9));
    let far = d.create(p, NodeKind::Rectangle, "Far", 10.0, 5000.0, 400.0, 400.0).unwrap();
    d.get_mut(far).unwrap().fills = vec![Paint::image("ahead-b", ImageScaleMode::Fit)];
    let opts = Options { lod: true, ..Default::default() };
    let in_view = needs(&d, p, &view(1.0, 300.0, 200.0), &opts);
    assert_eq!(in_view.len(), 1, "{in_view:?}");
    assert_eq!((in_view[0].hash.as_str(), in_view[0].level), ("ahead-a", 2));
    // Zoomed out to a tenth: the same picture from a deeper level.
    let tenth = View { origin: (0.0, 0.0), scale: 0.1, width: 200, height: 100 };
    assert_eq!(needs(&d, p, &tenth, &opts)[0].level, 5);
    // Both when the view takes in both.
    let tall = View { origin: (0.0, 0.0), scale: 0.5, width: 400, height: 3000 };
    assert_eq!(needs(&d, p, &tall, &opts).len(), 2);
    // Nothing to decode for exact renders, outline mode or a hidden layer.
    assert!(needs(&d, p, &view(1.0, 300.0, 200.0), &Options::default()).is_empty());
    assert!(needs(&d, p, &view(1.0, 300.0, 200.0), &Options { lod: true, outline_mode: true, ..Default::default() }).is_empty());
    let r = d.node(p).unwrap().children[0];
    d.get_mut(r).unwrap().visible = false;
    assert!(needs(&d, p, &view(1.0, 300.0, 200.0), &opts).is_empty());
    // `missing` leaves out what is held.
    let (d2, p2) = scene("ahead-held", 600, 400, 150.0, 100.0, ImageScaleMode::Fill);
    let want = needs(&d2, p2, &view(1.0, 150.0, 100.0), &opts);
    assert_eq!(missing(&d2, &want).len(), 1);
    crate::prefetch::run(&d2, ColorProfile::Srgb, &want);
    assert!(missing(&d2, &want).is_empty());
}

#[test]
fn a_render_finds_its_pictures_decoded_by_the_prefetch() {
    // The prefetch decodes the level the render then draws from: no second level appears.
    let (d, p) = scene("ahead-render", 1200, 800, 300.0, 200.0, ImageScaleMode::Fill);
    let src = Source { hash: "ahead-render", data: d.images.get("ahead-render"), filters: &ImageFilters::default(), profile: ColorProfile::Srgb };
    assert!(!crate::mips::global().holds(&src, 2));
    crate::render_view(&d, p, &view(1.0, 300.0, 200.0), &Options { lod: true, ..Default::default() }).unwrap();
    assert!(crate::mips::global().holds(&src, 2));
    assert!(!crate::mips::global().holds(&src, 0), "the big decode behind the level isn't kept");
}
