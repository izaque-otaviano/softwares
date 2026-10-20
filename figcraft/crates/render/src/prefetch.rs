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
    let mut near = Vec::new();
    for c in &p.children {
        walk(doc, *c, view.transform(), &screen, &screen, &mut near, 0);
    }
    out.extend(near.into_iter().map(|(n, _)| n));
    out
}

/// The picture levels of the layers within `grow` view sizes of `view` (each way), nearest the
/// view first (by device-pixel distance; 0 for what is in it), each once.
pub fn needs_near(doc: &Document, page: NodeId, view: &View, opts: &Options, grow: f64) -> Vec<Need> {
    if doc.images.is_empty() || !opts.lod || opts.outline_mode || !grow.is_finite() {
        return Vec::new();
    }
    let Some(p) = doc.node(page) else { return Vec::new() };
    let (w, h) = (f64::from(view.width), f64::from(view.height));
    let g = grow.clamp(0.0, 64.0);
    let screen = Rect::new(0.0, 0.0, w, h);
    let area = Rect::new(-w * g, -h * g, w * (1.0 + g), h * (1.0 + g));
    let mut near = Vec::new();
    for c in &p.children {
        walk(doc, *c, view.transform(), &area, &screen, &mut near, 0);
    }
    near.sort_by(|a, b| a.1.total_cmp(&b.1));
    near.into_iter().map(|(n, _)| n).collect()
}

/// Device-pixel distance between two rectangles (0 when they meet).
fn gap(a: &Rect, b: &Rect) -> f64 {
    let dx = (b.x0 - a.x1).max(a.x0 - b.x1).max(0.0);
    let dy = (b.y0 - a.y1).max(a.y0 - b.y1).max(0.0);
    dx.max(dy)
}

/// Decodes the pictures around a view ahead of need, a few at a time, nearest first, while the
/// picture cache has room: what a scroll reaches next is held by the time it shows.
pub struct Ahead {
    doc: std::sync::Arc<Document>,
    queue: Vec<Need>,
    next: usize,
}

impl Ahead {
    /// The pictures within `grow` view sizes of `view`.
    pub fn new(doc: &std::sync::Arc<Document>, page: NodeId, view: &View, opts: &Options, grow: f64) -> Ahead {
        Ahead { doc: doc.clone(), queue: needs_near(doc, page, view, opts, grow), next: 0 }
    }

    /// Whether it decodes for `doc`.
    pub fn is_for(&self, doc: &std::sync::Arc<Document>) -> bool {
        std::sync::Arc::ptr_eq(&self.doc, doc)
    }

    /// Decode up to `n` pictures not held yet. Whether any are left (false once done, or once the
    /// cache is three quarters full: decoding more would push out what is on screen).
    pub fn step(&mut self, n: usize) -> bool {
        let cache = mips::global();
        if cache.bytes() >= cache.budget() / 4 * 3 {
            self.next = self.queue.len();
            return false;
        }
        let mut batch = Vec::new();
        while batch.len() < n.max(1) {
            let Some(need) = self.queue.get(self.next) else { break };
            self.next += 1;
            if !missing(&self.doc, std::slice::from_ref(need)).is_empty() {
                batch.push(need.clone());
            }
        }
        if !batch.is_empty() {
            run(&self.doc, self.doc.color_profile, &batch);
        }
        self.next < self.queue.len()
    }

    /// Pictures left to look at.
    pub fn left(&self) -> usize {
        self.queue.len().saturating_sub(self.next)
    }
}

fn walk(doc: &Document, id: NodeId, parent: Affine, screen: &Rect, shown: &Rect, out: &mut Vec<(Need, f64)>, depth: usize) {
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
        own(doc, n, xf, gap(&dev, shown), out);
    }
    if !n.hides_contents() {
        for c in &n.children {
            walk(doc, *c, xf, screen, shown, out, depth + 1);
        }
    }
}

/// The levels the image paints of `n` (drawn through `xf`) use.
fn own(doc: &Document, n: &Node, xf: Affine, dist: f64, out: &mut Vec<(Need, f64)>) {
    let scale = xf.determinant().abs().sqrt();
    for p in n.fills.iter().chain(&n.strokes).filter(|p| p.visible && p.opacity > 0.0) {
        let PaintKind::Image(img) = &p.kind else { continue };
        let Some(data) = doc.images.get(&img.image) else { continue };
        let level = crate::images::paint_level(img, data, n.width, n.height, scale);
        let need = Need { hash: img.image.clone(), filters: img.filters, level };
        match out.iter_mut().find(|(n, _)| *n == need) {
            Some((_, d)) => *d = d.min(dist),
            None => out.push((need, dist)),
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
