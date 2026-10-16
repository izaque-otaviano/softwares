//! "Selection colors": the solid colours the selected layers and everything inside them use, in a
//! row of swatches (a count of the rest) that opens into a list. Editing a colour in the list
//! changes it everywhere in the selection, in one undo step, through `fill.set` / `stroke.set`.

use egui::{Align2, CornerRadius, Id, Rect, Sense, Stroke, StrokeKind, Ui, pos2, vec2};
use figcraft_color::{Color, PaintKind};
use figcraft_doc::{Document, NodeId};
use serde_json::json;

use crate::FigApp;
use crate::a11y;
use crate::i18n::tr;
use crate::icons::{self, Icon};
use crate::right::row_rect;
use crate::theme::{Tokens, regular, semibold};
use crate::widgets::{self, PAD};

/// The most layers looked through (a huge selection shows the colours of the first ones).
const MAX_NODES: usize = 4000;
/// The most colours listed when the section is open.
const MAX_ROWS: usize = 40;
/// Swatches shown in the closed row.
const PREVIEW: usize = 3;

/// One colour in use and how many paints use it.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Used {
    pub color: Color,
    pub count: usize,
}

/// Where a colour is used: the layer, whether it is a fill (else a stroke), and the paint's index.
type Place = (NodeId, bool, usize);

/// Every solid paint under `sel` (the layers themselves included), most used colour first, and
/// whether the selection has more than itself in it (the section is for those).
pub(crate) fn collect(doc: &Document, sel: &[NodeId]) -> (Vec<Used>, bool) {
    let mut found: Vec<(String, Used)> = Vec::new();
    let mut stack: Vec<NodeId> = sel.iter().rev().copied().collect();
    let mut seen = 0usize;
    while let Some(id) = stack.pop() {
        let Some(n) = doc.node(id) else { continue };
        seen += 1;
        if seen > MAX_NODES {
            break;
        }
        for p in n.fills.iter().chain(n.strokes.iter()) {
            if let PaintKind::Solid { color } = &p.kind
                && p.visible
            {
                let key = color.to_css_hex();
                match found.iter_mut().find(|(k, _)| *k == key) {
                    Some((_, u)) => u.count += 1,
                    None => found.push((key, Used { color: *color, count: 1 })),
                }
            }
        }
        stack.extend(n.children.iter().rev().copied());
    }
    // Stable: equal counts keep the order they were met in.
    let mut used: Vec<Used> = found.into_iter().map(|(_, u)| u).collect();
    used.sort_by_key(|u| std::cmp::Reverse(u.count));
    (used, seen > sel.len())
}

/// Every place the colour `from` (by its CSS hex) is used under `sel`.
fn places(doc: &Document, sel: &[NodeId], from: &str) -> Vec<Place> {
    let mut out = Vec::new();
    let mut stack: Vec<NodeId> = sel.iter().rev().copied().collect();
    let mut seen = 0usize;
    while let Some(id) = stack.pop() {
        let Some(n) = doc.node(id) else { continue };
        seen += 1;
        if seen > MAX_NODES {
            break;
        }
        for (fills, list) in [(true, &n.fills), (false, &n.strokes)] {
            for (i, p) in list.iter().enumerate() {
                if let PaintKind::Solid { color } = &p.kind
                    && p.visible
                    && color.to_css_hex() == from
                {
                    out.push((id, fills, i));
                }
            }
        }
        stack.extend(n.children.iter().rev().copied());
    }
    out
}

/// Change every use of the colour `from` under `sel` to `to`, as one undo step. Returns how many
/// paints changed.
pub(crate) fn replace(app: &mut FigApp, sel: &[NodeId], from: &Color, to: &Color) -> usize {
    let Ok(doc) = app.session.doc() else { return 0 };
    let at = places(doc, sel, &from.to_css_hex());
    if at.is_empty() || from.to_css_hex() == to.to_css_hex() || app.session.begin_interaction("Edit").is_err() {
        return 0;
    }
    let mut changed = 0;
    for (id, fills, index) in at {
        let cmd = if fills { "fill.set" } else { "stroke.set" };
        match app.session.execute(cmd, &json!({"ids": [id], "index": index, "color": to.to_css_hex()})) {
            Ok(_) => changed += 1,
            Err(e) => app.failed(cmd, &e),
        }
    }
    let _ = app.session.commit_interaction();
    changed
}

/// Whether the section is open (kept while the app runs).
fn open_id() -> Id {
    Id::new("selection_colors_open")
}

/// The section; returns whether it showed (so the caller draws a divider after it).
pub fn section(app: &mut FigApp, ui: &mut Ui, doc: &Document, sel: &[NodeId]) -> bool {
    let t = Tokens::get(ui.ctx());
    // Looked through once per document revision and selection.
    let revision = app.session.ds().map(|d| d.revision).unwrap_or(0);
    let cache = Id::new("selection_colors_cache");
    let cached: Option<(u64, Vec<NodeId>, Vec<Used>, bool)> = ui.data(|d| d.get_temp(cache));
    let (used, nested) = match cached {
        Some((r, s, used, nested)) if r == revision && s == sel => (used, nested),
        _ => {
            let (used, nested) = collect(doc, sel);
            ui.data_mut(|d| d.insert_temp(cache, (revision, sel.to_vec(), used.clone(), nested)));
            (used, nested)
        }
    };
    if !nested || used.len() < 2 {
        return false;
    }
    let open: bool = ui.data(|d| d.get_temp(open_id())).unwrap_or(false);
    let title = tr("Selection colors");
    let (rect, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 40.0), Sense::click());
    a11y::disclosure(&resp, title, open);
    if resp.hovered() {
        ui.painter().rect_filled(rect, CornerRadius::ZERO, t.hover);
    }
    ui.painter().text(pos2(rect.min.x + PAD, rect.center().y), Align2::LEFT_CENTER, title, semibold(12.0), t.text);
    if !open {
        // Swatches and the count of the rest, at the right.
        let more = used.len().saturating_sub(PREVIEW);
        let mut x = rect.max.x - PAD;
        if more > 0 {
            let g = ui.painter().layout_no_wrap(format!("+{more}"), regular(11.0), t.text_secondary);
            x -= g.size().x;
            ui.painter().galley(pos2(x, rect.center().y - g.size().y / 2.0), g, t.text_secondary);
            x -= 6.0;
        }
        for u in used.iter().take(PREVIEW).rev() {
            let r = Rect::from_min_size(pos2(x - 16.0, rect.center().y - 8.0), vec2(16.0, 16.0));
            small_swatch(ui, r, &u.color);
            x -= 20.0;
        }
    } else {
        icons::paint(
            ui.painter(),
            Rect::from_center_size(pos2(rect.max.x - PAD - 6.0, rect.center().y), vec2(12.0, 12.0)),
            Icon::Chevron,
            t.icon_secondary,
        );
    }
    if resp.clicked() {
        ui.data_mut(|d| d.insert_temp(open_id(), !open));
    }
    if open {
        let ids = sel.to_vec();
        for (i, u) in used.iter().take(MAX_ROWS).enumerate() {
            let mut edited: Option<Color> = None;
            row_rect(ui, 32.0, |ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                let w = ui.available_width() - 44.0;
                let (r, _) = ui.allocate_exact_size(vec2(w, widgets::field_h()), Sense::hover());
                ui.painter().rect_filled(r, widgets::field_radius(), t.field);
                let sw = Rect::from_min_size(pos2(r.min.x + 8.0, r.center().y - 8.0), vec2(16.0, 16.0));
                small_swatch(ui, sw, &u.color);
                let text_r = Rect::from_min_max(pos2(sw.max.x + 8.0, r.min.y + 4.0), pos2(r.max.x - 4.0, r.max.y - 4.0));
                if let Some(h) = widgets::text_field_inline(ui, Id::new(("selcolor", i)), &u.color.to_hex(), text_r, regular(11.0))
                    && let Some(c) = Color::from_hex(&h)
                {
                    edited = Some(c.with_alpha(u.color.a));
                }
                let used_label = ui.painter().layout_no_wrap(u.count.to_string(), regular(11.0), t.text_secondary);
                let at = pos2(ui.max_rect().max.x - used_label.size().x, r.center().y - used_label.size().y / 2.0);
                ui.painter().galley(at, used_label, t.text_secondary);
            });
            if let Some(to) = edited {
                replace(app, &ids, &u.color, &to);
            }
        }
        if used.len() > MAX_ROWS {
            let rest = used.len() - MAX_ROWS;
            widgets::note(ui, &format!("+{rest}"), t.text_secondary);
        }
        ui.add_space(4.0);
    }
    true
}

/// A small rounded swatch of `color` (over a checkerboard when it is see-through).
fn small_swatch(ui: &Ui, r: Rect, color: &Color) {
    let t = Tokens::get(ui.ctx());
    if color.a >= 0.999 {
        ui.painter().rect_filled(r, CornerRadius::same(4), crate::theme::doc_c32(ui.ctx(), *color));
    } else {
        widgets::paint_swatch(ui.painter(), r, &figcraft_color::Paint::solid(*color));
    }
    ui.painter().rect_stroke(r, CornerRadius::same(4), Stroke::new(1.0, t.border), StrokeKind::Inside);
}
