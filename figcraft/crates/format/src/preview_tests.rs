use std::io::Write;

use figcraft_doc::{Document, previews};

use crate::previews::{member, parse_member, size_for};

fn photo_jpeg(w: u32, h: u32, seed: u8) -> Vec<u8> {
    let img = image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x % 251) as u8 ^ seed, (y % 241) as u8, seed]));
    let mut buf = std::io::Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 80).encode_image(&img).unwrap();
    buf.into_inner()
}

#[test]
fn saving_writes_previews_and_old_style_reading_still_works() {
    let mut doc = Document::new("p");
    let (hash, _, _) = crate::add_image(&mut doc, photo_jpeg(1600, 1200, 7)).unwrap();
    let small = crate::add_image(&mut doc, photo_jpeg(300, 200, 8)).unwrap().0;
    let bytes = crate::save_bytes(&doc, None).unwrap();
    let z = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).unwrap();
    let names: Vec<&str> = z.file_names().filter(|n| n.starts_with("previews/")).collect();
    assert!(names.contains(&member(&hash, 1024, 768).as_str()), "{names:?}");
    assert!(names.contains(&member(&hash, 256, 192).as_str()), "{names:?}");
    assert!(!names.iter().any(|n| n.contains(&small)));
    let (back, issues) = crate::load_bytes(&bytes).unwrap();
    assert!(issues.is_empty(), "{issues:?}");
    assert_eq!(back.images.len(), 2);
    assert!(previews::at_least(&hash, 1000, 700).is_some());
}

#[test]
fn member_names_are_checked() {
    assert_eq!(parse_member("previews/abc123/1024x768"), Some(("abc123", 1024, 768)));
    for bad in [
        "previews/",
        "previews/abc",
        "previews/abc/0x5",
        "previews/a.b/1x1",
        "previews/abc/1x",
        "previews/abc/99999999x1",
        "previews//1x1",
        "previews/abc/1x1x1",
    ] {
        assert_eq!(parse_member(bad), None, "{bad}");
    }
    assert_eq!(size_for(4000, 3000, 1024), (1024, 768));
    assert_eq!(size_for(3000, 4000, 256), (192, 256));
    assert_eq!(size_for(100_000, 1, 256), (256, 1));
}

#[test]
fn hostile_preview_members_are_skipped() {
    let mut doc = Document::new("p");
    let (hash, _, _) = crate::add_image(&mut doc, photo_jpeg(1500, 1100, 3)).unwrap();
    let saved = crate::save_bytes(&doc, None).unwrap();
    // Rebuild the archive with junk previews added under an unseen hash-like name.
    let mut z = zip::ZipArchive::new(std::io::Cursor::new(&saved)).unwrap();
    let mut out = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    for i in 0..z.len() {
        let f = z.by_index(i).unwrap();
        if f.name().starts_with("previews/") {
            continue;
        }
        out.raw_copy_file(f).unwrap();
    }
    let junk: [(&str, Vec<u8>); 4] = [
        ("previews/nosuchimage/10x10", photo_jpeg(10, 10, 1)),
        (&*Box::leak(member(&hash, 900, 660).into_boxed_str()), b"not an image".to_vec()),
        (&*Box::leak(member(&hash, 1400, 1000).into_boxed_str()), photo_jpeg(20, 20, 1)),
        (&*Box::leak(member(&hash, 5000, 5000).into_boxed_str()), photo_jpeg(20, 20, 1)),
    ];
    for (name, data) in junk {
        out.start_file(name, opts).unwrap();
        out.write_all(&data).unwrap();
    }
    let bytes = out.finish().unwrap().into_inner();
    let (back, _) = crate::load_bytes(&bytes).unwrap();
    assert_eq!(back.images.len(), 1);
    assert!(previews::at_least("nosuchimage", 1, 1).is_none());
    assert!(previews::all(&hash).iter().all(|p| p.width <= 1500 && p.width != 900 && p.width != 1400));
    // Random bytes as previews never panic.
    for seed in 0..64u32 {
        let data: Vec<u8> = (0..(seed * 37 % 500)).map(|i| (i.wrapping_mul(seed + 3) % 256) as u8).collect();
        let _ = image::ImageReader::new(std::io::Cursor::new(&data)).with_guessed_format().ok().and_then(|r| r.into_dimensions().ok());
        let _ = parse_member(&format!("previews/{hash}/{}x{}", seed, data.len()));
    }
}
