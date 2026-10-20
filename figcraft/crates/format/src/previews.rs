//! Previews of big pictures in the archive: `previews/<hash>/<w>x<h>` members, made at save for
//! pictures that lack them ([`figcraft_doc::previews`]). Files without them open as before; older
//! FigCraft builds ignore the members.

use figcraft_doc::ImageData;
use figcraft_doc::previews::{self, Preview};
use std::io::{Read, Seek};
use std::sync::Arc;

/// The most preview members read from one archive.
pub const MAX_MEMBERS: usize = 4096;

/// The archive member name of a `w` × `h` preview of `hash`.
pub fn member(hash: &str, w: u32, h: u32) -> String {
    format!("previews/{hash}/{w}x{h}")
}

/// `(hash, w, h)` of a preview member name; `None` for anything malformed.
pub fn parse_member(name: &str) -> Option<(&str, u32, u32)> {
    let rest = name.strip_prefix("previews/")?;
    let (hash, size) = rest.split_once('/')?;
    if hash.is_empty() || hash.len() > 128 || !hash.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return None;
    }
    let (w, h) = size.split_once('x')?;
    if w.len() > 5 || h.len() > 5 {
        return None;
    }
    let (w, h) = (w.parse().ok()?, h.parse().ok()?);
    (w > 0 && h > 0).then_some((hash, w, h))
}

/// The size of a preview of a `w` × `h` picture with longer side `side` (keeping its aspect).
pub fn size_for(w: u32, h: u32, side: u32) -> (u32, u32) {
    let long = w.max(h).max(1);
    let scale = |v: u32| ((u64::from(v) * u64::from(side)).div_ceil(u64::from(long)) as u32).clamp(1, v.max(1));
    (scale(w), scale(h))
}

/// Make the previews picture `img` should have (none for small or undecodable pictures). JPEG
/// (quality 80) for opaque pictures, PNG when they have alpha.
pub fn make(img: &ImageData) -> Vec<Preview> {
    if !previews::wanted(img.width, img.height) || img.width > 16_384 || img.height > 16_384 {
        return Vec::new();
    }
    let Some(dec) = image::ImageReader::new(std::io::Cursor::new(img.bytes.as_slice())).with_guessed_format().ok().and_then(|r| r.decode().ok())
    else {
        return Vec::new();
    };
    let alpha = dec.color().has_alpha();
    let mut out = Vec::new();
    let mut src = dec;
    // Largest first, each made from the one before (cheaper than from the photo each time).
    for side in previews::SIDES.iter().rev() {
        let (w, h) = size_for(img.width, img.height, *side);
        if w >= img.width && h >= img.height {
            continue;
        }
        let small = src.resize_exact(w, h, image::imageops::FilterType::Triangle);
        let mut buf = std::io::Cursor::new(Vec::new());
        let ok = if alpha {
            small.write_to(&mut buf, image::ImageFormat::Png).is_ok()
        } else {
            let rgb = small.to_rgb8();
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 80).encode_image(&rgb).is_ok()
        };
        if ok {
            out.push(Preview { width: w, height: h, bytes: Arc::new(buf.into_inner()) });
        }
        src = small;
    }
    out.reverse();
    out
}

/// Make and register the previews of every picture in `images` that wants them and has none.
pub fn ensure<'a>(images: impl IntoIterator<Item = (&'a String, &'a ImageData)>) {
    for (hash, img) in images {
        ensure_one(hash, img);
    }
}

/// [`ensure`] for one picture; `true` when previews were made.
pub fn ensure_one(hash: &str, img: &ImageData) -> bool {
    if !previews::wanted(img.width, img.height) || previews::has(hash) {
        return false;
    }
    let made = make(img);
    let any = !made.is_empty();
    for p in made {
        previews::insert(hash, img.width, img.height, p);
    }
    any
}

/// Read the preview members of archive `z` for the pictures in `images`, checking each: a known
/// picture, a size smaller than it with its aspect, a decodable header of that size, bounded bytes.
/// Bad members are skipped (previews are only a cache).
pub fn read<R: Read + Seek>(z: &mut zip::ZipArchive<R>, images: &std::collections::BTreeMap<String, ImageData>) {
    let names: Vec<String> = z.file_names().filter(|n| n.starts_with("previews/")).take(MAX_MEMBERS).map(str::to_string).collect();
    for name in names {
        let Some((hash, w, h)) = parse_member(&name) else { continue };
        let Some(img) = images.get(hash) else { continue };
        if w > img.width || h > img.height || !previews::wanted(img.width, img.height) {
            continue;
        }
        let Ok(bytes) = crate::read_member(z, &name, previews::MAX_PREVIEW_BYTES as u64) else { continue };
        let dims = image::ImageReader::new(std::io::Cursor::new(&bytes)).with_guessed_format().ok().and_then(|r| r.into_dimensions().ok());
        if dims != Some((w, h)) {
            continue;
        }
        previews::insert(hash, img.width, img.height, Preview { width: w, height: h, bytes: Arc::new(bytes) });
    }
}
