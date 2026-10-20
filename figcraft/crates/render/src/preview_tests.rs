//! Pictures drawn small come from a stored preview, look like the photo's own level, and the
//! photo is decoded only when no preview is big enough.

use std::sync::Arc;

use figcraft_color::{ColorProfile, ImageFilters};
use figcraft_doc::ImageData;
use figcraft_doc::previews::{self, Preview};

use crate::mips::{Cache, Source};

fn photo(w: u32, h: u32) -> image::RgbImage {
    image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x * 255 / w) as u8, (y * 255 / h) as u8, ((x / 7 + y / 5) % 64) as u8 * 3]))
}

fn jpeg(img: &image::RgbImage) -> Vec<u8> {
    let mut buf = std::io::Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 85).encode_image(img).unwrap();
    buf.into_inner()
}

fn mean_diff(a: &tiny_skia::Pixmap, b: &tiny_skia::Pixmap) -> f64 {
    assert_eq!((a.width(), a.height()), (b.width(), b.height()));
    let sum: u64 = a.data().iter().zip(b.data()).map(|(x, y)| u64::from(x.abs_diff(*y))).sum();
    sum as f64 / a.data().len() as f64
}

#[test]
fn a_small_level_comes_from_the_preview_and_matches_the_photo() {
    let (w, h) = (2400, 1600);
    let full = photo(w, h);
    let data = ImageData { bytes: Arc::new(jpeg(&full)), width: w, height: h };
    let small = image::imageops::resize(&full, 1024, 683, image::imageops::FilterType::Triangle);
    let hash = "previewtestphoto1";
    assert!(previews::insert(hash, w, h, Preview { width: 1024, height: 683, bytes: Arc::new(jpeg(&small)) }));
    let f = ImageFilters::default();
    let s = Source { hash, data: Some(&data), filters: &f, profile: ColorProfile::Srgb };
    let via = Cache::new(64 << 20).picture(&s, 2, false).unwrap();
    assert_eq!((via.pixmap.width(), via.pixmap.height()), (600, 400));
    assert_eq!(via.full, (w, h));
    // The same level made from the photo itself (no preview under this hash).
    let s2 = Source { hash: "previewtestphoto1-none", ..s };
    let direct = Cache::new(64 << 20).picture(&s2, 2, false).unwrap();
    let d = mean_diff(&via.pixmap, &direct.pixmap);
    assert!(d < 4.0, "mean difference {d}");
}

#[test]
fn a_preview_is_never_magnified() {
    let (w, h) = (2400, 1600);
    let data = ImageData { bytes: Arc::new(jpeg(&photo(w, h))), width: w, height: h };
    let hash = "previewtestphoto2";
    let tiny = image::imageops::resize(&photo(w, h), 256, 171, image::imageops::FilterType::Triangle);
    assert!(previews::insert(hash, w, h, Preview { width: 256, height: 171, bytes: Arc::new(jpeg(&tiny)) }));
    assert!(previews::at_least(hash, 600, 400).is_none());
    assert!(previews::at_least(hash, 150, 100).is_some());
    // Level 1 (1200 px) needs more than the preview: it is made from the photo, exactly.
    let f = ImageFilters::default();
    let s = Source { hash, data: Some(&data), filters: &f, profile: ColorProfile::Srgb };
    let p = Cache::new(64 << 20).picture(&s, 1, false).unwrap();
    assert_eq!((p.pixmap.width(), p.pixmap.height()), (1200, 800));
    // A preview as big as the photo, or bigger, is refused.
    assert!(!previews::insert(hash, w, h, Preview { width: w, height: h, bytes: Arc::new(vec![1]) }));
    assert!(!previews::insert(hash, w, h, Preview { width: w + 1, height: 10, bytes: Arc::new(vec![1]) }));
}

/// Measured, not asserted: decoding a 4000 × 3000 photo against its 1024 preview
/// (`cargo test -p figcraft-render --release preview_decode_cost -- --ignored --nocapture`).
#[test]
#[ignore]
fn preview_decode_cost() {
    let (w, h) = (4000, 3000);
    let full = photo(w, h);
    let big = jpeg(&full);
    let small = jpeg(&image::imageops::resize(&full, 1024, 768, image::imageops::FilterType::Triangle));
    let time = |b: &[u8]| {
        let t = std::time::Instant::now();
        for _ in 0..5 {
            let _ = crate::images::decode(b).unwrap();
        }
        t.elapsed().as_secs_f64() * 1000.0 / 5.0
    };
    println!("photo {} KB: {:.1} ms; preview {} KB: {:.1} ms", big.len() / 1024, time(&big), small.len() / 1024, time(&small));
}
