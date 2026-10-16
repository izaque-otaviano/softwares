//! Canvas render timings on a heavy e-commerce page (twelve tall screens, 72 photo fills of 48
//! distinct 1600 to 4000 px pictures, ~300 texts, rounded corners with shadows, auto layout):
//! full renders at several zooms, a zoom gesture of drafts and a final render, a long pan, and the
//! first open (decoding). Ignored by default; run in release for realistic numbers:
//! `cargo test --release -p figcraft-engine --lib bench_shop -- --ignored --nocapture`.
//!
//! The views are the ones the canvas asks for: a 1920 × 1080 screen, 25% of overscan around it for
//! a pan (`plan_view` in the UI crate), half-resolution drafts while a zoom is under way.

use std::sync::Arc;
use std::time::Instant;

use figcraft_doc::{Document, NodeId};
use figcraft_render::{Options, Retained, View};

use crate::synthetic_shop::{ShopSpec, shop_document};

const SCREEN: (u32, u32) = (1920, 1080);

fn ms<T>(f: impl FnOnce() -> T) -> (T, f64) {
    let t = Instant::now();
    let v = f();
    (v, t.elapsed().as_secs_f64() * 1000.0)
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v.get(v.len() / 2).copied().unwrap_or(0.0)
}

/// The screen view at `scale` centred on page point `c`.
fn screen(c: (f64, f64), scale: f64) -> View {
    View { origin: (c.0 - f64::from(SCREEN.0) / scale / 2.0, c.1 - f64::from(SCREEN.1) / scale / 2.0), scale, width: SCREEN.0, height: SCREEN.1 }
}

/// What the UI does with a render: the pixmap as a texture image (the work after the render).
fn finish(pix: &figcraft_render::Pixmap, doc: &Document) -> usize {
    egui_free_image(pix, doc)
}

/// Stand-in for `render_worker::screen_image` (the UI crate owns the egui type): the same copy.
fn egui_free_image(pix: &figcraft_render::Pixmap, doc: &Document) -> usize {
    let mut data = pix.data().to_vec();
    if !doc.color_profile.is_srgb() {
        doc.color_profile.conversion_to(figcraft_color::ColorProfile::Srgb).apply_pixels(&mut data);
    }
    data.len()
}

/// A render as the canvas asks for it, the document's colour handling and texture copy included.
fn frame(r: &mut Retained, doc: &Arc<Document>, page: NodeId, v: &View, opts: &Options) -> f64 {
    let t = Instant::now();
    if let Some((_, pix, _)) = r.render(doc, page, v, opts) {
        finish(pix, doc);
    }
    t.elapsed().as_secs_f64() * 1000.0
}

/// The overscan view (25% each side) around `want`.
fn overscan(want: &View) -> View {
    let (gx, gy) = ((f64::from(want.width) * 0.25).round(), (f64::from(want.height) * 0.25).round());
    View {
        origin: (want.origin.0 - gx / want.scale, want.origin.1 - gy / want.scale),
        scale: want.scale,
        width: want.width + 2 * gx as u32,
        height: want.height + 2 * gy as u32,
    }
}

#[test]
#[ignore = "benchmark"]
fn bench_shop_render() {
    figcraft_text::scan_system_fonts();
    // `SHOP_SCREENS` and `SHOP_PHOTOS` make a smaller page (a quicker look at the pictures).
    let env = |name: &str| std::env::var(name).ok().and_then(|s| s.parse::<usize>().ok());
    let spec = ShopSpec {
        screens: env("SHOP_SCREENS").unwrap_or(ShopSpec::HEAVY.screens),
        distinct_photos: env("SHOP_PHOTOS").unwrap_or(ShopSpec::HEAVY.distinct_photos),
        ..ShopSpec::HEAVY
    };
    let ((doc, page), build) = ms(|| shop_document(&spec).unwrap());
    let photo_mb: f64 = doc.images.values().map(|i| i.bytes.len() as f64).sum::<f64>() / 1e6;
    let decoded_mb: f64 = doc.images.values().map(|i| f64::from(i.width) * f64::from(i.height) * 4.0).sum::<f64>() / 1e6;
    let layers = doc.node_count();
    let doc = Arc::new(doc);
    let bounds = doc.page_content_bounds(page).unwrap();
    println!(
        "shop document: {layers} layers, {} pictures ({photo_mb:.0} MB encoded, {decoded_mb:.0} MB decoded), built in {build:.0} ms",
        doc.images.len()
    );
    // The centre of the first screen's row of cards.
    let first = (bounds.x0 + 720.0, bounds.y0 + 900.0);
    let opts = Options { lod: true, ..Default::default() };

    // First open: nothing decoded yet. The page's first screenful at fit-ish zoom 0.25.
    let (_, cold) = ms(|| figcraft_render::render_view(&doc, page, &screen(first, 0.25), &opts));
    println!("first render, zoom 0.25 (decodes the pictures in view): {cold:.0} ms");
    let (_, cold1) = ms(|| figcraft_render::render_view(&doc, page, &screen(first, 1.0), &opts));
    println!("first render, zoom 1.0 over the same screen (more pictures in view): {cold1:.0} ms");

    // Full renders (nothing retained), parallel bands like the desktop path.
    for scale in [1.0, 0.5, 0.25, 0.1] {
        let v = screen(if scale <= 0.1 { ((bounds.x0 + bounds.x1) / 2.0, (bounds.y0 + bounds.y1) / 2.0) } else { first }, scale);
        let runs: Vec<f64> = (0..5).map(|_| ms(|| figcraft_render::render_view(&doc, page, &v, &opts)).1).collect();
        println!("full render, zoom {scale}: median {:.1} ms (min {:.1})", median(runs.clone()), runs.iter().copied().fold(f64::INFINITY, f64::min));
    }
    // The same on one thread (what the browser does).
    for scale in [1.0, 0.5, 0.25, 0.1] {
        let v = screen(if scale <= 0.1 { ((bounds.x0 + bounds.x1) / 2.0, (bounds.y0 + bounds.y1) / 2.0) } else { first }, scale);
        let runs: Vec<f64> = (0..3).map(|_| ms(|| figcraft_render::render_view_single(&doc, page, &v, &opts)).1).collect();
        println!("single-thread render, zoom {scale}: median {:.1} ms", median(runs));
    }

    // How close the preview is to the exact render (pictures from mip levels, bilinear), and with
    // `SHOP_DUMP=<dir>` the two as PNGs to look at.
    for scale in [1.0, 0.5] {
        let v = screen(first, scale);
        let exact = figcraft_render::render_view_single(&doc, page, &v, &Options { lod: false, ..Default::default() }).unwrap();
        let preview = figcraft_render::render_view_single(&doc, page, &v, &opts).unwrap();
        let sum: u64 = exact.data().iter().zip(preview.data()).map(|(a, b)| u64::from(a.abs_diff(*b))).sum();
        println!("preview vs exact, zoom {scale}: mean difference {:.2} / 255 per channel", sum as f64 / exact.data().len() as f64);
        if let Ok(dir) = std::env::var("SHOP_DUMP") {
            for (name, p) in [("exact", &exact), ("preview", &preview)] {
                let _ = std::fs::write(format!("{dir}/shop-{name}-{scale}.png"), figcraft_render::encode_png(p).unwrap());
            }
        }
    }

    // Where the time goes: the same page without its pictures (solid fills), without effects, without
    // text, on one thread.
    for (name, strip) in [("without pictures", 0), ("without effects", 1), ("without text", 2)] {
        let mut d = (*doc).clone();
        let ids: Vec<NodeId> = d.nodes().map(|n| n.id).collect();
        for id in ids {
            let Some(n) = d.node_mut(id) else { continue };
            match strip {
                0 => {
                    for f in n.fills.iter_mut().filter(|f| matches!(f.kind, figcraft_color::PaintKind::Image(_))) {
                        *f = figcraft_color::Paint::solid(figcraft_color::Color::from_rgb8_const(0x99, 0x99, 0x99));
                    }
                }
                1 => n.effects.clear(),
                _ => n.visible = n.visible && !matches!(n.kind, figcraft_doc::NodeKind::Text(_)),
            }
        }
        for scale in [1.0, 0.25] {
            let v = screen(first, scale);
            let runs: Vec<f64> = (0..3).map(|_| ms(|| figcraft_render::render_view_single(&d, page, &v, &opts)).1).collect();
            println!("single-thread render {name}, zoom {scale}: median {:.1} ms", median(runs));
        }
    }

    // A zoom gesture: 5% a frame for 30 frames about the screen centre from zoom 0.25 (wheel/pinch),
    // each frame a half-resolution draft, then the settled render.
    let zoom_from = 0.25;
    let gesture = |name: &str, draft: bool| {
        let mut r = Retained::default();
        // The view before the gesture, as the canvas had it.
        frame(&mut r, &doc, page, &overscan(&screen(first, zoom_from)), &opts);
        let mut times = Vec::new();
        for i in 1..=30 {
            let z = zoom_from * 1.05f64.powi(i);
            let want = screen(first, z);
            // Half resolution: half the scale, half the pixels.
            let half = View { origin: want.origin, scale: z / 2.0, width: SCREEN.0 / 2, height: SCREEN.1 / 2 };
            times.push(frame(&mut r, &doc, page, &half, &Options { draft, ..opts.clone() }));
        }
        let settled = frame(&mut r, &doc, page, &overscan(&screen(first, zoom_from * 1.05f64.powi(30))), &opts);
        let total: f64 = times.iter().sum();
        println!(
            "zoom gesture {name}: {} drafts, mean {:.1} ms, worst {:.1} ms, total {total:.0} ms; settled render {settled:.0} ms",
            times.len(),
            total / times.len() as f64,
            times.iter().copied().fold(0.0, f64::max)
        );
    };
    gesture("(half-resolution drafts)", false);
    gesture("(drafts without grain, backdrop blur and glass, bilinear pictures)", true);

    // A pan: 24 device pixels a frame for 300 frames, the overscan reused until its margin is half
    // spent (what `plan_view` does), retained renders.
    for scale in [1.0, 0.5, 0.25] {
        let mut r = Retained::default();
        let mut have: Option<View> = None;
        let (mut total, mut worst, mut renders) = (0.0f64, 0.0f64, 0usize);
        // Warm: the first overscan view (not counted).
        let start = screen(first, scale);
        let mut cur = overscan(&start);
        frame(&mut r, &doc, page, &cur, &opts);
        have.replace(cur.clone());
        for i in 0..300 {
            let want = View { origin: (start.origin.0, start.origin.1 + f64::from(i) * 24.0 / scale), ..start.clone() };
            let h = have.as_ref().map(|h| (h.origin, h.width, h.height));
            let spare = h.map(|(o, w, hh)| {
                let top = (want.origin.1 - o.1) * scale;
                let left = (want.origin.0 - o.0) * scale;
                (left, top, f64::from(w) - left - f64::from(want.width), f64::from(hh) - top - f64::from(want.height))
            });
            // Ask again once a pan has used half its margin (margin = 25% of the screen).
            let renew = spare.is_none_or(|(l, t, rt, b)| l < 240.0 || t < 135.0 || rt < 240.0 || b < 135.0);
            if renew {
                // The next view keeps more margin ahead of the pan (down).
                cur = overscan(&want);
                cur.origin.1 += 0.5 * f64::from(want.height) * 0.25 / scale;
                let t = frame(&mut r, &doc, page, &cur, &opts);
                total += t;
                worst = worst.max(t);
                renders += 1;
                have = Some(cur.clone());
            }
        }
        println!("pan 300 frames, zoom {scale}: {renders} renders, {total:.0} ms on the render thread (worst {worst:.0} ms)");
    }

    // A page with a frosted header (background blur): what a draft leaves out. Four screens.
    let frosted = ShopSpec { screens: 4, distinct_photos: 12, frosted_header: true, ..spec };
    let (fdoc, fpage) = shop_document(&frosted).unwrap();
    let fb = fdoc.page_content_bounds(fpage).unwrap();
    let fc = (fb.x0 + 720.0, fb.y0 + 900.0);
    for scale in [1.0, 0.5] {
        let v = screen(fc, scale);
        // Warm the pictures, then time on one thread.
        figcraft_render::render_view_single(&fdoc, fpage, &v, &opts);
        for (name, draft) in [("final", false), ("draft", true)] {
            let o = Options { draft, ..opts.clone() };
            let runs: Vec<f64> = (0..3).map(|_| ms(|| figcraft_render::render_view_single(&fdoc, fpage, &v, &o)).1).collect();
            println!("frosted header, single-thread {name} render, zoom {scale}: median {:.1} ms", median(runs));
        }
    }
}
