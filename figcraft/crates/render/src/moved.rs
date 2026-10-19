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

pub use crate::perf::NoCopy;
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
            matches!(ip.scale_mode, ImageScaleMode::Fill | ImageScaleMode::Tile)
                && doc.images.get(&ip.image).is_some_and(|d| crate::images::opaque_bytes(&d.bytes))
        }
        _ => false,
    }
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

/// Plan the copies for a move of `changed` (see the module docs), or why the pixels have to be
/// drawn.
pub fn plan_or_why(
    old: &Document,
    new: &Document,
    page: NodeId,
    changed: &[NodeId],
    scale: f64,
    px: (i64, i64),
    size: (i64, i64),
) -> Result<Plan, NoCopy> {
    if changed.is_empty() || changed.len() > MAX_CHANGED || !(scale.is_finite() && scale > 0.0) {
        return Err(NoCopy::Count);
    }
    // A move by the same whole number of device pixels, of layers that changed in nothing else.
    let mut delta: Option<(f64, f64)> = None;
    for id in changed {
        let (Some(a), Some(b)) = (old.node(*id), new.node(*id)) else { return Err(NoCopy::NotAMove) };
        if a.parent != b.parent || !a.visible || !b.visible || old.page_of(*id) != Some(page) || new.page_of(*id) != Some(page) {
            return Err(NoCopy::NotAMove);
        }
        let mut same = a.clone();
        same.transform = b.transform;
        if same != *b || new.ancestors(*id).iter().any(|a| changed.contains(a)) {
            return Err(NoCopy::NotAMove);
        }
        let (wa, wb) = (old.world_transform(*id).as_coeffs(), new.world_transform(*id).as_coeffs());
        if (0..4).any(|k| (wa[k] - wb[k]).abs() > 1e-9) {
            return Err(NoCopy::NotAMove);
        }
        let d = (wb[4] - wa[4], wb[5] - wa[5]);
        match delta {
            None => delta = Some(d),
            Some(e) if (e.0 - d.0).abs() < 1e-7 && (e.1 - d.1).abs() < 1e-7 => {}
            Some(_) => return Err(NoCopy::DifferentDeltas),
        }
    }
    let (dx, dy) = delta.ok_or(NoCopy::Count)?;
    let (ddx, ddy) = (dx * scale, dy * scale);
    if !(ddx.abs() < 4096.0 && ddy.abs() < 4096.0) || (ddx - ddx.round()).abs() > 1e-4 || (ddy - ddy.round()).abs() > 1e-4 {
        return Err(NoCopy::FractionalDelta);
    }
    let (ddx, ddy) = (ddx.round() as i64, ddy.round() as i64);
    if ddx == 0 && ddy == 0 {
        return Err(NoCopy::ZeroDelta);
    }
    plan_copies(old, new, changed, scale, px, size, (ddx, ddy))
}

/// The copies of a move by whole device pixels `(ddx, ddy)`; `None` when something in the
/// layers or their ancestors makes a copy untrustworthy (see the module docs).
#[allow(clippy::too_many_arguments)]
fn plan_copies(
    old: &Document,
    new: &Document,
    changed: &[NodeId],
    scale: f64,
    px: (i64, i64),
    size: (i64, i64),
    (ddx, ddy): (i64, i64),
) -> Result<Plan, NoCopy> {
    let frame = Px { x0: 0, y0: 0, x1: size.0, y1: size.1 };
    let c = Ctx { doc: old, scale, px };
    let mut copies: Vec<Copy> = Vec::new();
    let mut repair: Vec<Px> = Vec::new();
    let mut areas: Vec<Rect> = Vec::new();
    let mut footprint: Option<Rect> = None;
    for id in changed {
        // Everything the layer paints, where it was and where it is (the footprint); what shows
        // of it is within the clipping ancestors (worked out below).
        let (old_bounds, new_bounds) =
            (crate::draw::paint_bounds(old, *id).ok_or(NoCopy::NotAMove)?, crate::draw::paint_bounds(new, *id).ok_or(NoCopy::NotAMove)?);
        for b in [old_bounds, new_bounds] {
            footprint = Some(footprint.map_or(b, |f| f.union(b)));
        }
        // The places it is opaque, kept to what its ancestors show of it.
        let mut allowed = frame;
        // The page area the clipping ancestors show (their boxes); outside it nothing of the
        // layer is drawn, so nothing there changed.
        let mut shown: Option<Rect> = None;
        // The corners of rounded clipping ancestors: the clip cuts them, so pixels there are
        // not the layer's and are drawn after the copy.
        let mut corners: Vec<Px> = Vec::new();
        let mut cur = *id;
        let mut occluders: Vec<NodeId> = Vec::new();
        let mut guard = 0;
        while let Some(parent) = old.node(cur).and_then(|n| n.parent) {
            guard += 1;
            let p = old.node(parent).ok_or(NoCopy::Ancestor)?;
            if guard > MAX_DEPTH {
                return Err(NoCopy::Ancestor);
            }
            if p.is_page() {
                let pos = p.paint_order().position(|k| k == cur).ok_or(NoCopy::Ancestor)?;
                occluders.extend(p.paint_order().skip(pos + 1));
                let masks_before = p.paint_order().take(pos).any(|k| old.node(k).is_some_and(|s| s.is_mask && s.visible));
                if masks_before {
                    return Err(NoCopy::Ancestor);
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
                return Err(NoCopy::Ancestor);
            }
            let pos = p.paint_order().position(|k| k == cur).ok_or(NoCopy::Ancestor)?;
            occluders.extend(p.paint_order().skip(pos + 1));
            if p.paint_order().take(pos).any(|k| old.node(k).is_some_and(|s| s.is_mask && s.visible)) {
                return Err(NoCopy::Ancestor);
            }
            let world = old.world_transform(parent).as_coeffs();
            if p.clip && p.kind.is_frame_like() {
                if !axis_aligned(world) {
                    return Err(NoCopy::Ancestor);
                }
                let wb = old.world_bounds(parent).ok_or(NoCopy::Ancestor)?;
                shown = Some(shown.map_or(wb, |s| s.intersect(wb)));
                // Inside the clip's straight edges (a pixel in for anti-aliasing); its rounded
                // corners are drawn after the copy, not kept out of it along the whole edge.
                let b = inner_px(wb, scale, px, 1.0).ok_or(NoCopy::Ancestor)?;
                allowed = intersect(allowed, b);
                let r = corner_inset(p, scale).ceil() as i64;
                if r > 1 {
                    corners.extend([
                        Px { x0: b.x0, y0: b.y0, x1: b.x0 + r, y1: b.y0 + r },
                        Px { x0: b.x1 - r, y0: b.y0, x1: b.x1, y1: b.y0 + r },
                        Px { x0: b.x0, y0: b.y1 - r, x1: b.x0 + r, y1: b.y1 },
                        Px { x0: b.x1 - r, y0: b.y1 - r, x1: b.x1, y1: b.y1 },
                    ]);
                }
            }
            // Strokes are drawn over the children.
            if p.has_visible_stroke() {
                if !axis_aligned(world) {
                    return Err(NoCopy::Ancestor);
                }
                let w = p.stroke.max_weight().max(p.stroke.weight) * scale + 1.0;
                let b = old.world_bounds(parent).and_then(|b| inner_px(b, scale, px, w)).ok_or(NoCopy::Ancestor)?;
                allowed = intersect(allowed, b);
            }
            cur = parent;
        }
        for b in [old_bounds, new_bounds] {
            let b = shown.map_or(b, |s| s.intersect(b));
            if b.x1 > b.x0 && b.y1 > b.y0 {
                areas.push(b);
            }
        }
        let mut found = Vec::new();
        cores(&c, *id, allowed, &mut found, 0).ok_or(NoCopy::NothingOpaque)?;
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
                let on = old.node(*o).ok_or(NoCopy::Ancestor)?;
                if !on.visible {
                    continue;
                }
                let b = crate::draw::paint_bounds(old, *o).ok_or(NoCopy::Ancestor)?;
                if let Some(r) = inner_px(b, scale, px, -2.0) {
                    for at in [r, Px { x0: r.x0 + ddx, y0: r.y0 + ddy, x1: r.x1 + ddx, y1: r.y1 + ddy }] {
                        let hit = intersect(at, dst);
                        if !is_empty(&hit) {
                            repair.push(hit);
                        }
                    }
                }
            }
            for q in &corners {
                for at in [*q, shift(*q)] {
                    let hit = intersect(at, dst);
                    if !is_empty(&hit) {
                        repair.push(hit);
                    }
                }
            }
            copies.push(Copy { src, dst });
        }
    }
    if copies.is_empty() {
        return Err(NoCopy::NothingOpaque);
    }
    // Two layers' places that overlap would have to be copied in paint order: leave those.
    for (i, a) in copies.iter().enumerate() {
        if copies.iter().skip(i + 1).any(|b| !is_empty(&intersect(a.src, b.src)) || !is_empty(&intersect(a.dst, b.dst))) {
            return Err(NoCopy::Overlap);
        }
    }
    // The ancestors whose own pixels depend on what their children cover (a shadow cast from
    // the whole): a frame that is opaque through and through, or that the layers stay inside of,
    // looks the same.
    let footprint = footprint.ok_or(NoCopy::NothingOpaque)?;
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
                areas.push(crate::draw::paint_bounds(old, a).ok_or(NoCopy::Ancestor)?);
                areas.push(crate::draw::paint_bounds(new, a).ok_or(NoCopy::Ancestor)?);
            }
        }
    }
    Ok(Plan { copies, repair, areas })
}
