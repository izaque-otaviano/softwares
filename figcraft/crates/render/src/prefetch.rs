//! Decoding ahead of a canvas render: which pictures (and which of their mip levels) a view will
//! draw, so they decode in parallel, one thread for each, instead of one after another in the
//! order the render meets them (or all at once in the same picture, once per band).

use figcraft_color::{ColorProfile, ImageFilters, PaintKind};
use figcraft_doc::{Document, Node, NodeId};
use figcraft_geom::{Affine, Rect};

use crate::mips::{self, Source};
use crate::{Options, View};

/// A picture level a render will draw from.
#[derive(Clone, Debug, PartialEq)]
pub struct Need {
    pub hash: String,
    pub filters: ImageFilters,
    pub level: u32,
}

/// Deepest nesting looked into.
const MAX_DEPTH: usize = 128;

/// The picture levels the layers of `page` that reach into `view` draw from at its zoom, each
/// once. A layer is reached when its own box meets the view; the children of a clipping frame
/// that misses the view aren't looked at. Over-approximate: a hidden-by-mask picture counts.
pub fn needs(doc: &Document, page: NodeId, view: &View, opts: &Options) -> Vec<Need> {
    let mut out = Vec::new();
    if doc.images.is_empty() || !opts.lod || opts.outline_mode {
        return out;
    }
    let Some(p) = doc.node(page) else { return out };
    let screen = Rect::new(0.0, 0.0, f64::from(view.width), f64::from(view.height));
    for c in &p.children {
        walk(doc, *c, view.transform(), &screen, &mut out, 0);
    }
    out
}

fn walk(doc: &Document, id: NodeId, parent: Affine, screen: &Rect, out: &mut Vec<Need>, depth: usize) {
    let Some(n) = doc.node(id) else { return };
    if depth > MAX_DEPTH || !n.visible || n.is_mask {
        return;
    }
    let xf = parent * n.transform;
    let reach = n.paint_reach();
    let dev = figcraft_geom::transform_rect_bbox(xf, n.local_rect().inflate(reach, reach));
    let meets = !dev.intersect(*screen).is_zero_area() || dev.width() == 0.0 || dev.height() == 0.0;
    if !meets && n.clip && n.kind.is_frame_like() {
        return;
    }
    if meets {
        own(doc, n, xf, out);
    }
    if !n.hides_contents() {
        for c in &n.children {
            walk(doc, *c, xf, screen, out, depth + 1);
        }
    }
}

/// The levels the image paints of `n` (drawn through `xf`) use.
fn own(doc: &Document, n: &Node, xf: Affine, out: &mut Vec<Need>) {
    let scale = xf.determinant().abs().sqrt();
    for p in n.fills.iter().chain(&n.strokes).filter(|p| p.visible && p.opacity > 0.0) {
        let PaintKind::Image(img) = &p.kind else { continue };
        let Some(data) = doc.images.get(&img.image) else { continue };
        let level = crate::images::paint_level(img, data, n.width, n.height, scale);
        let need = Need { hash: img.image.clone(), filters: img.filters, level };
        if !out.contains(&need) {
            out.push(need);
        }
    }
}

/// Decode the levels `list` names, in parallel where there are threads, so the render that follows
/// finds them held.
pub fn run(doc: &Document, profile: ColorProfile, list: &[Need]) {
    let sources: Vec<(Source, u32)> =
        list.iter().map(|n| (Source { hash: &n.hash, data: doc.images.get(&n.hash), filters: &n.filters, profile }, n.level)).collect();
    mips::global().prefetch(&sources);
}

/// The levels of `list` not held yet.
pub fn missing(doc: &Document, list: &[Need]) -> Vec<Need> {
    list.iter()
        .filter(|n| {
            let s = Source { hash: &n.hash, data: doc.images.get(&n.hash), filters: &n.filters, profile: doc.color_profile };
            !mips::global().holds(&s, n.level)
        })
        .cloned()
        .collect()
}
