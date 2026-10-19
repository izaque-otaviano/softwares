//! Layers that only moved: copy their pixels instead of drawing them again.
//!
//! A drag changes one thing per frame, the position of some layers by a few pixels. Drawing the
//! layers anew at the new place (and what they uncovered) costs as much as the layers' area;
//! but where a layer is *opaque* its pixels are the layer's own, whatever lies under them, so
//! the pixels at the new place are the pixels it had at the old one: the retained image can copy
//! them. Only the thin strips a move uncovers, the soft edges (anti-aliasing, shadows) and what
//! the layer covered need drawing.
//!
//! The copy is taken only where it gives the same pixels a render would (the retained tests
//! compare every kind of move with a full render). Everything that could make a pixel depend on
//! where the layer is, not just on what it is, leaves the layer to be drawn: a move that is not a
//! whole number of device pixels or not the same for every layer that changed, layers that are
//! not opaque at that place (or have opacity, a blend mode, a mask, background blur, glass or
//! grain), anything painted above the layer in either place (later siblings of it or of any
//! ancestor, an ancestor's stroke), an ancestor that is not a plain container (a mask, a boolean,
//! a blur, a group with effects), and places a clipping ancestor cuts or rounds.

use figcraft_color::{BlendMode, ImageScaleMode, PaintKind};
use figcraft_doc::{Document, EffectKind, Node, NodeId, NodeKind};
use figcraft_geom::Rect;

use crate::retained::Px;

/// Deepest nesting looked into.
const MAX_DEPTH: usize = 64;
/// Most layers that may have changed for a move to be planned.
const MAX_CHANGED: usize = 64;

/// Pixels to copy: `src` of the kept image goes to `dst` (the same size, `dx` and `dy` away).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Copy {
    pub src: Px,
    pub dst: Px,
}

/// What a move needs.
pub struct Plan {
    pub copies: Vec<Copy>,
    /// Places a copy lands that need drawing after all: what is painted over the layer at its
    /// new place, and the pixels of what was painted over it at the old one.
    pub repair: Vec<Px>,
    /// The page areas whose pixels may differ from the kept image besides the copies' places:
    /// where the layers were and are, with what they paint (shadows) and the ancestors whose own
    /// look depends on them.
    pub areas: Vec<Rect>,
}

/// A solid fill, or a photo, that covers the whole box with no transparency in it.
fn opaque_fill(doc: &Document, n: &Node) -> bool {
    let Some(p) = n.fills.iter().rev().find(|p| p.visible) else { return false };
    if !matches!(p.blend, BlendMode::Normal | BlendMode::PassThrough) || p.opacity < 0.999 {
        return false;
    }
    match &p.kind {
        PaintKind::Solid { color } => color.a >= 0.999,
        PaintKind::Image(ip) => {
            matches!(ip.scale_mode, ImageScaleMode::Fill | ImageScaleMode::Tile) && doc.images.get(&ip.image).is_some_and(|d| image_opaque(&d.bytes))
        }
        _ => false,
    }
}

/// Whether encoded image bytes have no alpha: a JPEG, or a PNG of a colour type without it (and no
/// transparent colour).
fn image_opaque(bytes: &[u8]) -> bool {
    if bytes.starts_with(&[0xFF, 0xD8]) {
        return true;
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        let color_type = bytes.get(25).copied();
        let head = bytes.get(..bytes.len().min(4096)).unwrap_or(bytes);
        let transparent = head.windows(4).any(|w| w == b"tRNS");
        return matches!(color_type, Some(0 | 2)) && !transparent;
    }
    false
}

fn plain_blend(n: &Node) -> bool {
    matches!(n.blend, BlendMode::Normal | BlendMode::PassThrough)
}

fn visible_effect(n: &Node, f: impl Fn(&EffectKind) -> bool) -> bool {
    n.effects.iter().any(|e| e.visible && f(&e.kind))
}

/// Effects that read what is under a layer, or draw by pixel position.
fn reads_around(k: &EffectKind) -> bool {
    matches!(k, EffectKind::BackgroundBlur(_) | EffectKind::Glass(_) | EffectKind::Noise(_) | EffectKind::Texture(_))
}

fn axis_aligned(c: [f64; 6]) -> bool {
    c[1].abs() < 1e-9 && c[2].abs() < 1e-9
}

/// Device pixels (frame coordinates) of a page rectangle, shrunk by `inset` device pixels and
/// rounded inwards.
fn inner_px(r: Rect, scale: f64, px: (i64, i64), inset: f64) -> Option<Px> {
    let c = |v: f64, o: i64| v * scale - o as f64;
    let (x0, y0, x1, y1) = (c(r.x0, px.0) + inset, c(r.y0, px.1) + inset, c(r.x1, px.0) - inset, c(r.y1, px.1) - inset);
    if ![x0, y0, x1, y1].iter().all(|v| v.is_finite() && v.abs() < 1e12) {
        return None;
    }
    let (x0, y0, x1, y1) = (x0.ceil() as i64, y0.ceil() as i64, x1.floor() as i64, y1.floor() as i64);
    Some(Px { x0, y0, x1: x1.max(x0), y1: y1.max(y0) })
}

fn corner_inset(n: &Node, scale: f64) -> f64 {
    let r = n.corners.radii.iter().copied().fold(0.0, f64::max);
    1.0 + r.abs() * (1.0 + n.corners.smoothing.max(0.0)) * scale
}

fn intersect(a: Px, b: Px) -> Px {
    let (x0, y0) = (a.x0.max(b.x0), a.y0.max(b.y0));
    Px { x0, y0, x1: a.x1.min(b.x1).max(x0), y1: a.y1.min(b.y1).max(y0) }
}

fn is_empty(r: &Px) -> bool {
    r.x1 <= r.x0 || r.y1 <= r.y0
}

struct Ctx<'a> {
    doc: &'a Document,
    scale: f64,
    px: (i64, i64),
}

/// The opaque places of `id` and what it carries (device pixels), within `clip`. `None` when the
/// subtree has something a copy can't be trusted with.
fn cores(c: &Ctx, id: NodeId, clip: Px, out: &mut Vec<Px>, depth: usize) -> Option<()> {
    let n = c.doc.node(id)?;
    if depth > MAX_DEPTH {
        return None;
    }
    if !n.visible {
        return Some(());
    }
    if n.is_mask || matches!(n.kind, NodeKind::BooleanOp { .. } | NodeKind::Section { .. }) || visible_effect(n, reads_around) {
        return None;
    }
    // Opacity, a blend mode or a blur: what it shows depends on what is under it (or is not its
    // own pixels), and so does everything it carries.
    let plain = n.opacity >= 0.999 && plain_blend(n) && !visible_effect(n, |k| matches!(k, EffectKind::LayerBlur(_)));
    let start = out.len();
    let mut clip = clip;
    if matches!(n.kind, NodeKind::Rectangle) || n.kind.is_frame_like() {
        let boxed = axis_aligned(c.doc.world_transform(id).as_coeffs());
        if plain
            && boxed
            && opaque_fill(c.doc, n)
            && let Some(b) = c.doc.world_bounds(id).and_then(|b| inner_px(b, c.scale, c.px, corner_inset(n, c.scale)))
        {
            let core = intersect(b, clip);
            if !is_empty(&core) {
                out.push(core);
            }
        }
        // What a clipping frame cuts, its children are not opaque outside of.
        if n.clip && n.kind.is_frame_like() {
            if !boxed {
                return None;
            }
            clip = intersect(clip, inner_px(c.doc.world_bounds(id)?, c.scale, c.px, corner_inset(n, c.scale))?);
        }
    }
    for k in &n.children {
        cores(c, *k, clip, out, depth + 1)?;
    }
    if !plain {
        out.truncate(start);
    }
    Some(())
}

/// Plan the copies for a move of `changed` (see the module docs); `None` when the pixels have to
/// be drawn.
pub fn plan(old: &Document, new: &Document, page: NodeId, changed: &[NodeId], scale: f64, px: (i64, i64), size: (i64, i64)) -> Option<Plan> {
    if changed.is_empty() || changed.len() > MAX_CHANGED || !(scale.is_finite() && scale > 0.0) {
        return None;
    }
    // A move by the same whole number of device pixels, of layers that changed in nothing else.
    let mut delta: Option<(f64, f64)> = None;
    for id in changed {
        let (a, b) = (old.node(*id)?, new.node(*id)?);
        if a.parent != b.parent || !a.visible || !b.visible || old.page_of(*id) != Some(page) || new.page_of(*id) != Some(page) {
            return None;
        }
        let mut same = a.clone();
        same.transform = b.transform;
        if same != *b || new.ancestors(*id).iter().any(|a| changed.contains(a)) {
            return None;
        }
        let (wa, wb) = (old.world_transform(*id).as_coeffs(), new.world_transform(*id).as_coeffs());
        if (0..4).any(|k| (wa[k] - wb[k]).abs() > 1e-9) {
            return None;
        }
        let d = (wb[4] - wa[4], wb[5] - wa[5]);
        match delta {
            None => delta = Some(d),
            Some(e) if (e.0 - d.0).abs() < 1e-7 && (e.1 - d.1).abs() < 1e-7 => {}
            Some(_) => return None,
        }
    }
    let (dx, dy) = delta?;
    let (ddx, ddy) = (dx * scale, dy * scale);
    if !(ddx.abs() < 4096.0 && ddy.abs() < 4096.0) || (ddx - ddx.round()).abs() > 1e-4 || (ddy - ddy.round()).abs() > 1e-4 {
        return None;
    }
    let (ddx, ddy) = (ddx.round() as i64, ddy.round() as i64);
    if ddx == 0 && ddy == 0 {
        return None;
    }
    let frame = Px { x0: 0, y0: 0, x1: size.0, y1: size.1 };
    let c = Ctx { doc: old, scale, px };
    let mut copies: Vec<Copy> = Vec::new();
    let mut repair: Vec<Px> = Vec::new();
    let mut areas: Vec<Rect> = Vec::new();
    let mut footprint: Option<Rect> = None;
    for id in changed {
        let n = old.node(*id)?;
        // Everything the layer paints, where it was and where it is.
        for doc in [old, new] {
            let b = crate::draw::paint_bounds(doc, *id)?;
            footprint = Some(footprint.map_or(b, |f| f.union(b)));
            areas.push(b);
        }
        let _ = n;
        // The places it is opaque, kept to what its ancestors show of it.
        let mut allowed = frame;
        let mut cur = *id;
        let mut occluders: Vec<NodeId> = Vec::new();
        let mut guard = 0;
        while let Some(parent) = old.node(cur).and_then(|n| n.parent) {
            guard += 1;
            let p = old.node(parent)?;
            if guard > MAX_DEPTH {
                return None;
            }
            if p.is_page() {
                let pos = p.paint_order().position(|k| k == cur)?;
                occluders.extend(p.paint_order().skip(pos + 1));
                let masks_before = p.paint_order().take(pos).any(|k| old.node(k).is_some_and(|s| s.is_mask && s.visible));
                if masks_before {
                    return None;
                }
                break;
            }
            // A plain container: no mask, boolean, section, blur, grain or reading of what is under it.
            if !p.visible
                || p.is_mask
                || !(p.opacity >= 0.999 && plain_blend(p))
                || matches!(p.kind, NodeKind::BooleanOp { .. } | NodeKind::Section { .. } | NodeKind::Text(_))
                || visible_effect(p, |k| reads_around(k) || matches!(k, EffectKind::LayerBlur(_)))
                || (matches!(p.kind, NodeKind::Group) && p.effects.iter().any(|e| e.visible))
            {
                return None;
            }
            let pos = p.paint_order().position(|k| k == cur)?;
            occluders.extend(p.paint_order().skip(pos + 1));
            if p.paint_order().take(pos).any(|k| old.node(k).is_some_and(|s| s.is_mask && s.visible)) {
                return None;
            }
            let world = old.world_transform(parent).as_coeffs();
            if p.clip && p.kind.is_frame_like() {
                if !axis_aligned(world) {
                    return None;
                }
                allowed = intersect(allowed, inner_px(old.world_bounds(parent)?, scale, px, corner_inset(p, scale))?);
            }
            // Strokes are drawn over the children.
            if p.has_visible_stroke() {
                if !axis_aligned(world) {
                    return None;
                }
                let w = p.stroke.max_weight().max(p.stroke.weight) * scale + 1.0;
                allowed = intersect(allowed, inner_px(old.world_bounds(parent)?, scale, px, w)?);
            }
            cur = parent;
        }
        let mut found = Vec::new();
        cores(&c, *id, allowed, &mut found, 0)?;
        let shift = |r: Px| Px { x0: r.x0 + ddx, y0: r.y0 + ddy, x1: r.x1 + ddx, y1: r.y1 + ddy };
        for core in found {
            // The source must stay inside what the ancestors show at both places.
            let src =
                intersect(intersect(core, allowed), Px { x0: allowed.x0 - ddx, y0: allowed.y0 - ddy, x1: allowed.x1 - ddx, y1: allowed.y1 - ddy });
            let src = intersect(src, Px { x0: -ddx, y0: -ddy, x1: size.0 - ddx, y1: size.1 - ddy });
            if is_empty(&src) {
                continue;
            }
            // Painted above the layer in either place: copied pixels there are wrong (they are
            // what was above it, or what should be), so they are drawn after the copy.
            let dst = shift(src);
            for o in &occluders {
                let on = old.node(*o)?;
                if !on.visible {
                    continue;
                }
                let b = crate::draw::paint_bounds(old, *o)?;
                if let Some(r) = inner_px(b, scale, px, -2.0) {
                    for at in [r, Px { x0: r.x0 + ddx, y0: r.y0 + ddy, x1: r.x1 + ddx, y1: r.y1 + ddy }] {
                        let hit = intersect(at, dst);
                        if !is_empty(&hit) {
                            repair.push(hit);
                        }
                    }
                }
            }
            copies.push(Copy { src, dst });
        }
    }
    if copies.is_empty() {
        return None;
    }
    // Two layers' places that overlap would have to be copied in paint order: leave those.
    for (i, a) in copies.iter().enumerate() {
        if copies.iter().skip(i + 1).any(|b| !is_empty(&intersect(a.src, b.src)) || !is_empty(&intersect(a.dst, b.dst))) {
            return None;
        }
    }
    // The ancestors whose own pixels depend on what their children cover (a shadow cast from
    // the whole): a frame that is opaque through and through, or that the layers stay inside of,
    // looks the same.
    let footprint = footprint?;
    let mut seen: Vec<NodeId> = Vec::new();
    for id in changed {
        for a in old.ancestors(*id) {
            let Some(an) = old.node(a) else { break };
            if an.is_page() {
                break;
            }
            if seen.contains(&a) || !an.effects.iter().any(|e| e.visible) {
                continue;
            }
            seen.push(a);
            let boxed = axis_aligned(old.world_transform(a).as_coeffs());
            let covered = boxed && an.kind.is_frame_like() && opaque_fill(old, an);
            // Inside its outline, rounded corners kept out.
            let r = an.corners.radii.iter().copied().fold(0.0, f64::max) * (1.0 + an.corners.smoothing.max(0.0));
            let inside = covered
                && old
                    .world_bounds(a)
                    .is_some_and(|b| b.x0 + r <= footprint.x0 && b.y0 + r <= footprint.y0 && b.x1 - r >= footprint.x1 && b.y1 - r >= footprint.y1);
            if !(covered && (an.clip || inside)) {
                areas.push(crate::draw::paint_bounds(old, a)?);
                areas.push(crate::draw::paint_bounds(new, a)?);
            }
        }
    }
    Some(Plan { copies, repair, areas })
}
