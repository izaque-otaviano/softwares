//! Reduced copies ("previews") of big pictures, by the content hash of the picture they reduce.
//!
//! A `.figcraft` file keeps one or two previews of every photo larger than
//! [`MIN_SOURCE_SIDE`] (`previews/<hash>/<w>x<h>` archive members). The canvas draws a photo
//! that shows small from a preview, so it decodes a few hundred kilobytes instead of the whole
//! photo; exports always use the photo. Pictures are content-addressed, so the registry is one
//! per process and shared by every open document.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

/// Pictures with a longer side up to this have no previews.
pub const MIN_SOURCE_SIDE: u32 = 1024;
/// The longer sides previews are made at.
pub const SIDES: [u32; 2] = [256, 1024];
/// The most previews one picture keeps.
pub const MAX_PER_IMAGE: usize = 4;
/// The most bytes one preview may take (encoded).
pub const MAX_PREVIEW_BYTES: usize = 4 << 20;
/// The most bytes the registry holds; inserts past it are refused.
const MAX_TOTAL_BYTES: usize = 512 << 20;

/// One encoded preview (JPEG or PNG).
#[derive(Clone, Debug, PartialEq)]
pub struct Preview {
    pub width: u32,
    pub height: u32,
    pub bytes: Arc<Vec<u8>>,
}

#[derive(Default)]
struct Registry {
    map: HashMap<String, Vec<Preview>>,
    bytes: usize,
}

fn registry() -> &'static Mutex<Registry> {
    static R: OnceLock<Mutex<Registry>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(Registry::default()))
}

/// Keep `p` as a preview of picture `hash` (`full_w` × `full_h`). Refused (`false`) when it is
/// empty, too large, not smaller than the picture, or the registry is full.
pub fn insert(hash: &str, full_w: u32, full_h: u32, p: Preview) -> bool {
    if p.width == 0
        || p.height == 0
        || p.width > full_w
        || p.height > full_h
        || (p.width == full_w && p.height == full_h)
        || p.bytes.is_empty()
        || p.bytes.len() > MAX_PREVIEW_BYTES
    {
        return false;
    }
    let mut r = registry().lock().unwrap_or_else(PoisonError::into_inner);
    if r.bytes.saturating_add(p.bytes.len()) > MAX_TOTAL_BYTES {
        return false;
    }
    let len = p.bytes.len();
    let list = r.map.entry(hash.to_string()).or_default();
    if list.len() >= MAX_PER_IMAGE || list.iter().any(|q| q.width == p.width && q.height == p.height) {
        return false;
    }
    list.push(p);
    list.sort_by_key(|q| q.width);
    r.bytes += len;
    true
}

/// Every preview of picture `hash`, smallest first.
pub fn all(hash: &str) -> Vec<Preview> {
    registry().lock().unwrap_or_else(PoisonError::into_inner).map.get(hash).cloned().unwrap_or_default()
}

/// Whether picture `hash` has any preview.
pub fn has(hash: &str) -> bool {
    registry().lock().unwrap_or_else(PoisonError::into_inner).map.get(hash).is_some_and(|l| !l.is_empty())
}

/// The smallest preview of `hash` at least `w` × `h` pixels (never one that would be magnified).
pub fn at_least(hash: &str, w: u32, h: u32) -> Option<Preview> {
    let r = registry().lock().unwrap_or_else(PoisonError::into_inner);
    r.map.get(hash)?.iter().find(|p| p.width >= w && p.height >= h).cloned()
}

/// Whether a `w` × `h` picture should have previews.
pub fn wanted(w: u32, h: u32) -> bool {
    w.max(h) > MIN_SOURCE_SIDE
}
