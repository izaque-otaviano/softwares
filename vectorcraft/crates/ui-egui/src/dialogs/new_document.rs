//! File → New, a sheet in its own colours ([`Tokens::sheet`]): category tabs (Recent, Saved and
//! the built-in categories of `file.newPresets`) over a hero card (New from Template…) and a grid
//! of preset cards with glyphs drawn in code, and a Preset Details column (name and Save Preset,
//! size and units, orientation, artboards, bleed, colour mode, raster effects, background
//! contents, Advanced Options (Preview Mode), More Settings); Close and Create. More Settings is the classic form of the same fields (artboard layout,
//! spacing and columns, profile and size lists), so both share one set of fields and widgets.
//!
//! Fields: `file.new`'s params (`preset`, `name`, `width`, `height` (pt), `units`, `artboards`,
//! `artboardLayout`, `bleed`, `backgroundContents`, `colorMode`, `rasterEffectsPpi`,
//! `previewMode`), plus `category` (the tab, also More Settings' Profile), `advanced` (Advanced
//! Options open), `bleedLinked` and `presetName` (Save Preset's name). Setting `preset` fills the
//! fields from that preset; changing any of them afterwards makes the settings custom.

use serde_json::{Map, Value, json};
use vectorcraft_doc::Unit;
use vectorcraft_engine::cmd::newdoc::{self, ArtboardLayout, DocSettings, MAX_ARTBOARDS, PreviewMode, RASTER_PPI};

use super::{DialogSpec, form};
use crate::state::Dialog;
use crate::theme::{self, Tokens};
use crate::{VectorcraftApp, widgets};

pub(super) const KIND: &str = "newDocument";
/// More Settings.
pub(super) const MORE: &str = "newDocumentMore";

pub(super) const SPEC: DialogSpec = DialogSpec::window(show, confirm);
pub(super) const MORE_SPEC: DialogSpec = DialogSpec::window(show_more, confirm);

/// The fields `file.new` takes.
const PARAMS: [&str; 12] = [
    "preset",
    "name",
    "width",
    "height",
    "units",
    "artboards",
    "artboardLayout",
    "bleed",
    "backgroundContents",
    "colorMode",
    "rasterEffectsPpi",
    "previewMode",
];
/// The preset the fields were last filled from (its fields as `apply` set them).
const APPLIED: &str = "__applied";
/// Save Preset's name field is showing.
const SAVING: &str = "__saving";
/// The units New Document offers (all ten).
const UNITS: [Unit; 10] = [
    Unit::Pixels,
    Unit::Points,
    Unit::Picas,
    Unit::Inches,
    Unit::Millimeters,
    Unit::Centimeters,
    Unit::Feet,
    Unit::Yards,
    Unit::Meters,
    Unit::FeetInches,
];
const BACKGROUNDS: [(&str, &str); 2] = [("transparent", "Transparent (Default)"), ("white", "White")];
const COLOR_MODES: [(&str, &str); 2] = [("rgb", "RGB Color"), ("cmyk", "CMYK Color")];
/// Width of the Preset Details column.
const DETAILS: f32 = 292.0;
/// Width of the presets column (four cards a row).
const LEFT: f32 = 640.0;
/// Height of the hero card.
const HERO: f32 = 112.0;
/// Size of a preset card.
const TILE: egui::Vec2 = egui::vec2(146.0, 132.0);
/// Height of the dialog's content.
const HEIGHT: f32 = 600.0;

/// Open New Document on the most recent settings (or Letter), named after the next untitled
/// document.
pub fn open(app: &mut VectorcraftApp) {
    let category = if app.session.prefs.recent_new_docs.is_empty() { "Print" } else { "Recent" };
    let first = newdoc::category(&app.session, category).and_then(|v| v.into_iter().next()).unwrap_or_default();
    let mut d = Dialog::new(KIND, json!({ "category": category, "name": app.session.peek_untitled(), "advanced": false }));
    apply(&mut d, &first);
    app.ui.dialog = Some(d);
}

/// Fill the fields from a preset.
fn apply(d: &mut Dialog, s: &DocSettings) {
    let Value::Object(mut v) = s.to_json() else { return };
    for k in ["size", "orientation"] {
        v.remove(k);
    }
    if let Some(name) = v.remove("name") {
        v.insert("preset".into(), name);
    }
    d.fields.insert("bleedLinked".into(), json!(s.bleed.iter().all(|b| *b == s.bleed[0])));
    for (k, val) in &v {
        d.fields.insert(k.clone(), val.clone());
    }
    d.fields.insert(APPLIED.into(), Value::Object(v));
}

/// Keep the fields and the chosen preset in step: a new `preset` (also from `ui.dialog.set`) fills
/// the fields; a changed field makes the settings custom.
fn sync(app: &VectorcraftApp, d: &mut Dialog) {
    let preset = d.str("preset");
    match d.fields.get(APPLIED).and_then(Value::as_object) {
        Some(a) if a.get("preset").and_then(Value::as_str) == Some(preset.as_str()) => {
            // Unchanged fields keep the preset (falling through would apply it again).
            let edited = a.iter().any(|(k, v)| k != "preset" && d.fields.get(k) != Some(v));
            if edited {
                d.fields.insert("preset".into(), json!(""));
                d.fields.remove(APPLIED);
            }
        }
        _ if !preset.is_empty() => match newdoc::find(&app.session, &preset) {
            Some(s) => apply(d, &s),
            None => {
                d.fields.remove(APPLIED);
            }
        },
        _ => {}
    }
}

/// Create the document; the dialog stays open when that fails (bad size, …).
fn confirm(app: &mut VectorcraftApp, d: &Dialog) -> Result<Value, String> {
    let mut p: Map<String, Value> = PARAMS.iter().filter_map(|k| Some((k.to_string(), d.fields.get(*k)?.clone()))).collect();
    // Recent entries such as "Custom" aren't presets file.new knows.
    if newdoc::find(&app.session, &d.str("preset")).is_none() {
        p.remove("preset");
    }
    let r = app.run("file.new", Value::Object(p));
    if r.is_ok() {
        app.ui.dialog = None;
    }
    r
}

/// The units the size fields show.
fn unit(d: &Dialog) -> Unit {
    Unit::named(&d.str("units")).unwrap_or_default()
}

/// The artboard layout fields.
fn layout(d: &Dialog) -> (ArtboardLayout, u64, f64, bool) {
    let l = d.fields.get("artboardLayout");
    let get = |k: &str| l.and_then(|l| l.get(k));
    (
        get("layout").and_then(Value::as_str).and_then(ArtboardLayout::parse).unwrap_or_default(),
        get("columns").and_then(Value::as_u64).unwrap_or(1),
        get("spacing").and_then(Value::as_f64).unwrap_or(20.0),
        get("rightToLeft").and_then(Value::as_bool).unwrap_or(false),
    )
}

fn set_layout(d: &mut Dialog, key: &str, v: Value) {
    let mut l = d.fields.get("artboardLayout").cloned().filter(Value::is_object).unwrap_or_else(|| json!({}));
    l[key] = v;
    d.fields.insert("artboardLayout".into(), l);
}

/// The New Document dialog window `id` (accessible name `title`) in the shared modal frame.
fn window(ctx: &egui::Context, id: &str, title: &str, margin: i8, add: impl FnOnce(&mut egui::Ui)) {
    super::modal::show(ctx, title, egui::Id::new(("dialog", id)), -20.0, margin, add);
}

/// What the buttons of a window asked for.
#[derive(Default)]
struct Buttons {
    create: bool,
    close: bool,
    /// New from Template…
    template: bool,
}

impl Buttons {
    /// Act on the buttons (Enter also creates) once the window is drawn.
    fn finish(self, app: &mut VectorcraftApp, ctx: &egui::Context, d: Dialog) {
        if self.template {
            new_from_template(app);
            return;
        }
        let create = self.create || ctx.input(|i| i.key_pressed(egui::Key::Enter)) && !ctx.memory(|m| m.focused().is_some());
        app.ui.dialog = Some(d);
        if self.close {
            app.ui.dialog = None;
        } else if create && let Err(e) = super::confirm(app) {
            app.status(e);
        }
    }
}

/// New from Template…: close the dialog and open a template instead.
fn new_from_template(app: &mut VectorcraftApp) {
    app.ui.dialog = None;
    if let Err(e) = app.run("file.newFromTemplate", json!({})) {
        app.status(e);
    }
}

/// Run `f` with the sheet's colours (the reference palette supplied by the user in the dark
/// levels; the light levels' own), putting the app's back afterwards.
fn sheet<R>(ctx: &egui::Context, f: impl FnOnce() -> R) -> R {
    theme::with_tokens(ctx, Tokens::get(ctx).sheet(), f)
}

fn show(app: &mut VectorcraftApp, ctx: &egui::Context) {
    let Some(mut d) = app.ui.dialog.clone() else { return };
    sync(app, &mut d);
    let mut b = Buttons::default();
    sheet(ctx, || {
        let t = Tokens::get(ctx);
        let s = t.sheet_palette();
        window(ctx, KIND, tl!("New Document"), 0, |ui| {
            theme::sheet_visuals(ui, &s);
            // No heading: the top margin (14) and the empty part of the category tabs' row (30) move
            // the window.
            super::modal::drag_band(ui, ui.max_rect().top() + 44.0);
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 0.0;
                let well = egui::CornerRadius { nw: 6, sw: 6, ne: 0, se: 0 };
                egui::Frame::NONE.fill(s.well).corner_radius(well).inner_margin(egui::Margin { left: 22, right: 18, top: 14, bottom: 18 }).show(
                    ui,
                    |ui| {
                        ui.vertical(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            ui.set_width(LEFT);
                            ui.set_min_height(HEIGHT - 32.0);
                            presets(app, ui, &mut d, &mut b);
                        });
                    },
                );
                let side = egui::CornerRadius { nw: 0, sw: 0, ne: 6, se: 6 };
                egui::Frame::NONE.fill(s.window).corner_radius(side).inner_margin(egui::Margin::same(18)).show(ui, |ui| {
                    ui.vertical(|ui| {
                        ui.spacing_mut().item_spacing.x = 6.0;
                        ui.set_width(DETAILS);
                        ui.set_min_height(HEIGHT);
                        details(app, ui, &mut d, &mut b);
                    });
                });
            });
        });
    });
    b.finish(app, ctx, d);
}

/// A category's name as shown on its tab.
fn category_label(name: &str) -> &str {
    match name {
        "Recent" => tl!("Recent"),
        "Saved" => tl!("Saved"),
        "Mobile" => tl!("Mobile"),
        // A name kept as it is in every language, like the Web menu items.
        "Web" => "Web",
        "Print" => tl!("Print"),
        "Film & Video" => tl!("Film & Video"),
        "Art & Illustration" => tl!("Art & Illustration"),
        "Branding" => tl!("Branding"),
        "Social" => tl!("Social"),
        other => tl!(other),
    }
}

/// The category tabs, the hero card and the chosen category's preset cards: a click chooses one,
/// a double-click also creates it.
fn presets(app: &VectorcraftApp, ui: &mut egui::Ui, d: &mut Dialog, b: &mut Buttons) {
    let t = Tokens::get(ui.ctx());
    let s = t.sheet_palette();
    let names: Vec<&str> = newdoc::category_names().collect();
    let labels: Vec<&str> = names.iter().map(|n| category_label(n)).collect();
    let cat = names.iter().position(|n| n.eq_ignore_ascii_case(&d.str("category"))).unwrap_or(0);
    if let Some(n) = widgets::sheet_tab_bar(ui, &labels, cat, s.tab_idle, s.tab_active).and_then(|i| names.get(i)) {
        d.fields.insert("category".into(), json!(n));
    }
    ui.add_space(14.0);
    b.template |= hero(ui, &s);
    ui.add_space(16.0);
    let list = names.get(cat).and_then(|c| newdoc::category(&app.session, c)).unwrap_or_default();
    let heading = if cat == 0 {
        tl!("RECENT")
    } else if cat == 1 {
        tl!("SAVED")
    } else {
        tl!("BLANK DOCUMENT PRESETS")
    };
    ui.label(egui::RichText::new(format!("{heading} ({})", list.len())).font(theme::semibold(11.0)).color(s.tab_idle));
    ui.add_space(10.0);
    if list.is_empty() {
        let hint = if cat == 1 { tl!("Presets you save with the Save Preset button appear here.") } else { tl!("Documents you create appear here.") };
        ui.label(egui::RichText::new(hint).color(s.tab_idle));
        return;
    }
    egui::ScrollArea::vertical().id_salt(("newdoc-presets", cat)).max_height(HEIGHT - 240.0).auto_shrink([false, false]).show(ui, |ui| {
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing = egui::vec2(12.0, 12.0);
            let (w, h, preset) = (d.f64("width", 0.0), d.f64("height", 0.0), d.str("preset"));
            for p in &list {
                let selected = d.fields.contains_key(APPLIED) && p.name == preset && p.width == w && p.height == h;
                let card = preset_tile(ui, p, selected, &s);
                if card.clicked() || card.double_clicked() {
                    apply(d, p);
                }
                b.create |= card.double_clicked();
            }
        });
    });
}

/// The hero card at the top of the well: our heading and hint, a New from Template… link and an
/// illustration drawn in code. Whether the link was clicked.
fn hero(ui: &mut egui::Ui, s: &theme::Sheet) -> bool {
    let t = Tokens::get(ui.ctx());
    let (r, _) = ui.allocate_exact_size(egui::vec2(LEFT, HERO), egui::Sense::hover());
    ui.painter().rect_filled(r, egui::CornerRadius::same(8), s.card);
    let art = egui::Rect::from_center_size(egui::pos2(r.right() - 96.0, r.center().y), egui::vec2(150.0, 84.0));
    paint_hero_art(ui.painter(), art, &t, s);
    let text = egui::Rect::from_min_max(r.min + egui::vec2(20.0, 16.0), egui::pos2(art.left() - 16.0, r.bottom() - 12.0));
    let mut link = false;
    ui.scope_builder(egui::UiBuilder::new().max_rect(text).layout(egui::Layout::top_down(egui::Align::Min)), |ui| {
        ui.spacing_mut().item_spacing.y = 6.0;
        ui.add(egui::Label::new(egui::RichText::new(tl!("Start a new document")).font(theme::semibold(16.0)).color(s.tab_active)).selectable(false));
        ui.add(
            egui::Label::new(egui::RichText::new(tl!("Pick a preset below, or set your own size in Preset Details.")).size(12.5).color(s.tab_idle))
                .wrap()
                .selectable(false),
        );
        let l = ui.add(egui::Link::new(egui::RichText::new(tl!("New from Template…")).size(12.5).color(s.selected)));
        link = l.clicked();
    });
    link
}

/// The hero's illustration: two offset artboards, a curve across them with its anchors and
/// handles.
fn paint_hero_art(p: &egui::Painter, r: egui::Rect, t: &Tokens, s: &theme::Sheet) {
    let back = egui::Rect::from_min_size(r.min + egui::vec2(10.0, 0.0), egui::vec2(78.0, 62.0));
    let front = egui::Rect::from_min_size(r.min + egui::vec2(56.0, 18.0), egui::vec2(88.0, 64.0));
    for a in [back, front] {
        p.rect_filled(a.translate(egui::vec2(2.0, 3.0)), 3.0, egui::Color32::from_black_alpha(70));
        p.rect_filled(a, 3.0, s.well);
        p.rect_stroke(a, 3.0, egui::Stroke::new(1.0, t.icon.gamma_multiply(0.6)), egui::StrokeKind::Inside);
    }
    let (a, b) = (egui::pos2(back.left() + 12.0, back.bottom() - 14.0), egui::pos2(front.right() - 12.0, front.top() + 16.0));
    let (c1, c2) = (a + egui::vec2(28.0, -46.0), b + egui::vec2(-30.0, 48.0));
    let stroke = egui::Stroke::new(2.0, s.selected);
    p.add(egui::epaint::CubicBezierShape::from_points_stroke([a, c1, c2, b], false, egui::Color32::TRANSPARENT, stroke));
    let handle = egui::Stroke::new(1.0, t.icon);
    for (anchor, control) in [(a, c1), (b, c2)] {
        p.line_segment([anchor, control], handle);
        p.circle_filled(control, 2.5, t.icon);
        let sq = egui::Rect::from_center_size(anchor, egui::vec2(6.0, 6.0));
        p.rect_filled(sq, 0.0, s.tab_active);
        p.rect_stroke(sq, 0.0, egui::Stroke::new(1.0, s.selected), egui::StrokeKind::Inside);
    }
}

/// Is `name` a built-in preset's? Those are ours (translated); Recent and Saved hold the names of
/// the user's documents and presets, shown as they are.
fn is_builtin_preset(name: &str) -> bool {
    newdoc::CATEGORIES.iter().any(|(_, _, _, presets)| presets.iter().any(|(n, ..)| *n == name))
}

/// A preset's name as shown: a built-in one translated, the user's as it is.
pub(crate) fn preset_name(name: &str) -> &str {
    if is_builtin_preset(name) { tl!(name) } else { name }
}

/// The glyph a preset card shows for its kind of document.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Glyph {
    Page,
    Phone,
    Tablet,
    Watch,
    Browser,
    Film,
    Art,
    Card,
    Post,
}

/// The glyph for a preset: its built-in category's, else a screen for pixel sizes and a page for
/// the others.
fn glyph_of(s: &DocSettings) -> Glyph {
    let category = newdoc::CATEGORIES.iter().find(|(_, _, _, presets)| presets.iter().any(|(n, ..)| *n == s.name)).map(|c| c.0);
    match category {
        Some("Mobile") if s.name.starts_with("Tablet") => Glyph::Tablet,
        Some("Mobile") if s.name.starts_with("Watch") => Glyph::Watch,
        Some("Mobile") => Glyph::Phone,
        Some("Web") => Glyph::Browser,
        Some("Film & Video") => Glyph::Film,
        Some("Art & Illustration") => Glyph::Art,
        Some("Branding") => Glyph::Card,
        Some("Social") => Glyph::Post,
        Some(_) => Glyph::Page,
        None if s.units == Unit::Pixels => Glyph::Browser,
        None => Glyph::Page,
    }
}

/// Draw `g` in the square `r` with outlines in `c` and details in `accent`.
fn paint_glyph(p: &egui::Painter, r: egui::Rect, g: Glyph, c: egui::Color32, accent: egui::Color32) {
    let line = egui::Stroke::new(1.5, c);
    let thin = egui::Stroke::new(1.0, c);
    let at = |w: f32, h: f32| egui::Rect::from_center_size(r.center(), egui::vec2(w, h));
    match g {
        Glyph::Page => {
            let page = at(26.0, 34.0);
            let fold = 8.0;
            let outline = vec![
                page.left_top(),
                page.right_top() - egui::vec2(fold, 0.0),
                page.right_top() + egui::vec2(0.0, fold),
                page.right_bottom(),
                page.left_bottom(),
                page.left_top(),
            ];
            p.add(egui::Shape::line(outline, line));
            p.add(egui::Shape::line(
                vec![page.right_top() - egui::vec2(fold, 0.0), page.right_top() + egui::vec2(-fold, fold), page.right_top() + egui::vec2(0.0, fold)],
                thin,
            ));
        }
        Glyph::Phone => {
            let b = at(20.0, 36.0);
            p.rect_stroke(b, 4.0, line, egui::StrokeKind::Middle);
            p.line_segment([egui::pos2(b.center().x - 3.0, b.top() + 4.0), egui::pos2(b.center().x + 3.0, b.top() + 4.0)], thin);
        }
        Glyph::Tablet => {
            let b = at(28.0, 36.0);
            p.rect_stroke(b, 3.0, line, egui::StrokeKind::Middle);
            p.circle_filled(egui::pos2(b.center().x, b.bottom() - 4.0), 1.5, c);
        }
        Glyph::Watch => {
            let b = at(20.0, 22.0);
            p.rect_stroke(b, 5.0, line, egui::StrokeKind::Middle);
            for (y0, y1) in [(b.top(), b.top() - 7.0), (b.bottom(), b.bottom() + 7.0)] {
                p.rect_stroke(
                    egui::Rect::from_x_y_ranges(b.left() + 4.0..=b.right() - 4.0, y0.min(y1)..=y0.max(y1)),
                    1.0,
                    thin,
                    egui::StrokeKind::Middle,
                );
            }
        }
        Glyph::Browser => {
            let b = at(38.0, 28.0);
            p.rect_stroke(b, 3.0, line, egui::StrokeKind::Middle);
            p.line_segment([egui::pos2(b.left(), b.top() + 7.0), egui::pos2(b.right(), b.top() + 7.0)], thin);
            for i in 0..3 {
                p.circle_filled(egui::pos2(b.left() + 4.5 + i as f32 * 4.0, b.top() + 3.5), 1.2, c);
            }
        }
        Glyph::Film => {
            let b = at(40.0, 24.0);
            p.rect_stroke(b, 2.0, line, egui::StrokeKind::Middle);
            for i in 0..5 {
                let x = b.left() + 6.0 + i as f32 * 7.0;
                p.line_segment([egui::pos2(x, b.top() + 2.0), egui::pos2(x + 3.0, b.top() + 2.0)], thin);
                p.line_segment([egui::pos2(x, b.bottom() - 2.0), egui::pos2(x + 3.0, b.bottom() - 2.0)], thin);
            }
            let m = b.center();
            p.add(egui::Shape::convex_polygon(
                vec![m + egui::vec2(-4.0, -5.0), m + egui::vec2(6.0, 0.0), m + egui::vec2(-4.0, 5.0)],
                accent,
                egui::Stroke::NONE,
            ));
        }
        Glyph::Art => {
            let b = at(34.0, 30.0);
            p.rect_stroke(b, 2.0, line, egui::StrokeKind::Middle);
            let (a, e) = (b.left_bottom() + egui::vec2(6.0, -7.0), b.right_top() + egui::vec2(-6.0, 9.0));
            let (c1, c2) = (a + egui::vec2(6.0, -16.0), e + egui::vec2(-8.0, 14.0));
            p.add(egui::epaint::CubicBezierShape::from_points_stroke(
                [a, c1, c2, e],
                false,
                egui::Color32::TRANSPARENT,
                egui::Stroke::new(1.5, accent),
            ));
            p.line_segment([a, c1], thin);
            p.circle_filled(c1, 1.5, c);
            for q in [a, e] {
                p.rect_filled(egui::Rect::from_center_size(q, egui::vec2(4.0, 4.0)), 0.0, c);
            }
        }
        Glyph::Card => {
            let b = at(40.0, 24.0);
            p.rect_stroke(b, 2.0, line, egui::StrokeKind::Middle);
            p.circle_stroke(egui::pos2(b.left() + 9.0, b.center().y), 4.5, egui::Stroke::new(1.5, accent));
            for (dy, w) in [(-4.0, 16.0), (0.0, 12.0), (4.0, 14.0)] {
                let x = b.left() + 18.0;
                p.line_segment([egui::pos2(x, b.center().y + dy), egui::pos2(x + w, b.center().y + dy)], thin);
            }
        }
        Glyph::Post => {
            let b = at(30.0, 26.0).translate(egui::vec2(0.0, -3.0));
            p.rect_stroke(b, 3.0, line, egui::StrokeKind::Middle);
            let tail =
                vec![egui::pos2(b.left() + 7.0, b.bottom()), egui::pos2(b.left() + 7.0, b.bottom() + 7.0), egui::pos2(b.left() + 14.0, b.bottom())];
            p.add(egui::Shape::line(tail, line));
            p.circle_filled(b.center(), 3.0, accent);
        }
    }
}

/// The colour mode a card names.
fn mode_label(s: &DocSettings) -> &'static str {
    if newdoc::color_mode_id(s.color_mode) == "cmyk" { "CMYK" } else { "RGB" }
}

/// A New Document preset card: the glyph of its kind, the name and "size · colour mode", with
/// an outline while `selected`. Returns the card's response.
fn preset_tile(ui: &mut egui::Ui, s: &DocSettings, selected: bool, sheet: &theme::Sheet) -> egui::Response {
    let t = Tokens::get(ui.ctx());
    let label = preset_name(&s.name);
    let detail = format!("{} · {}", s.size_label(), mode_label(s));
    let (r, resp) = ui.allocate_exact_size(egui::vec2(TILE.x, TILE.y), egui::Sense::click());
    let p = ui.painter();
    p.rect_filled(r, egui::CornerRadius::same(6), if resp.hovered() || selected { sheet.card_hover } else { sheet.card });
    if selected {
        p.rect_stroke(r, egui::CornerRadius::same(6), egui::Stroke::new(2.0, sheet.selected), egui::StrokeKind::Inside);
    } else if resp.has_focus() {
        p.rect_stroke(r, egui::CornerRadius::same(6), egui::Stroke::new(1.0, sheet.selected), egui::StrokeKind::Inside);
    }
    let glyph = egui::Rect::from_center_size(r.center_top() + egui::vec2(0.0, 38.0), egui::vec2(44.0, 44.0));
    paint_glyph(p, glyph, glyph_of(s), t.icon, sheet.selected);
    // The name on up to two lines, then the size and colour mode.
    let mut job = egui::text::LayoutJob::single_section(
        label.to_string(),
        egui::TextFormat { font_id: theme::semibold(11.5), color: t.text_strong, ..Default::default() },
    );
    job.halign = egui::Align::Center;
    job.wrap = egui::text::TextWrapping { max_width: r.width() - 14.0, max_rows: 2, break_anywhere: false, overflow_character: Some('…') };
    let name = ui.fonts_mut(|f| f.layout_job(job));
    let name_h = name.size().y;
    p.galley(egui::pos2(r.center().x, r.top() + 74.0), name, t.text_strong);
    p.text(egui::pos2(r.center().x, r.top() + 78.0 + name_h), egui::Align2::CENTER_TOP, &detail, egui::FontId::proportional(11.0), sheet.tab_idle);
    resp.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::SelectableLabel, true, selected, format!("{label}, {}", s.size_label())));
    resp.on_hover_text(label)
}

/// A preset card: a page-proportioned thumbnail, the name and the size (the Home screen), filled
/// with `fill`, or with `hover` while hovered or `selected`. Returns the card's response.
pub fn preset_card(ui: &mut egui::Ui, s: &DocSettings, selected: bool, fill: egui::Color32, hover: egui::Color32) -> egui::Response {
    let t = Tokens::get(ui.ctx());
    let label = preset_name(&s.name);
    let (r, resp) = ui.allocate_exact_size(egui::vec2(146.0, 150.0), egui::Sense::click());
    let p = ui.painter();
    p.rect_filled(r, egui::CornerRadius::same(6), if resp.hovered() || selected { hover } else { fill });
    if selected {
        p.rect_stroke(r, egui::CornerRadius::same(6), egui::Stroke::new(2.0, t.accent), egui::StrokeKind::Inside);
    }
    let k = (60.0 / s.width.max(s.height).max(1e-9)) as f32;
    let page = egui::Rect::from_center_size(
        r.center_top() + egui::vec2(0.0, 48.0),
        egui::vec2((s.width as f32 * k).max(4.0), (s.height as f32 * k).max(4.0)),
    );
    p.rect_filled(page.translate(egui::vec2(2.0, 2.0)), 0.0, egui::Color32::from_black_alpha(80));
    p.rect_filled(page, 0.0, egui::Color32::WHITE);
    // The name on up to two lines, then the size.
    let mut job = egui::text::LayoutJob::single_section(
        label.to_string(),
        egui::TextFormat { font_id: theme::semibold(11.5), color: t.text_strong, ..Default::default() },
    );
    job.halign = egui::Align::Center;
    job.wrap = egui::text::TextWrapping { max_width: r.width() - 14.0, max_rows: 2, break_anywhere: false, overflow_character: Some('…') };
    let name = ui.fonts_mut(|f| f.layout_job(job));
    let name_h = name.size().y;
    p.galley(egui::pos2(r.center().x, r.top() + 94.0), name, t.text_strong);
    p.text(egui::pos2(r.center().x, r.top() + 98.0 + name_h), egui::Align2::CENTER_TOP, s.size_label(), egui::FontId::proportional(11.0), t.text_dim);
    resp.on_hover_text(label)
}

/// The Preset Details column.
fn details(app: &mut VectorcraftApp, ui: &mut egui::Ui, d: &mut Dialog, b: &mut Buttons) {
    let t = Tokens::get(ui.ctx());
    ui.spacing_mut().item_spacing = egui::vec2(6.0, 4.0);
    let top = ui.cursor().top();
    ui.label(egui::RichText::new(tl!("PRESET DETAILS")).font(theme::semibold(11.0)).color(t.text_dim));
    ui.add_space(8.0);
    ui.horizontal(|ui| {
        form::text(ui, d, "name", DETAILS - 50.0);
        if widgets::icon_button(ui, "save", tl!("Save Preset"), d.bool(SAVING), 26.0).clicked() {
            let saving = !d.bool(SAVING);
            d.fields.insert(SAVING.into(), json!(saving));
            if saving && d.str("presetName").is_empty() {
                let template = "Preset {number}";
                let name = crate::i18n::fmt(tl!(template), &[("number", &(app.session.prefs.new_doc_presets.len() + 1).to_string())]);
                d.fields.insert("presetName".into(), json!(name));
            }
        }
    });
    if d.bool(SAVING) {
        save_row(app, ui, d);
    }
    ui.add_space(8.0);
    let unit = unit(d);
    form::caption(ui, tl!("Width"));
    ui.horizontal(|ui| {
        form::length(ui, d, "width", unit, DETAILS - 124.0);
        units_dropdown(ui, d, 112.0);
    });
    ui.add_space(4.0);
    ui.horizontal_top(|ui| {
        ui.vertical(|ui| {
            form::caption(ui, tl!("Height"));
            form::length(ui, d, "height", unit, DETAILS - 124.0);
        });
        ui.add_space(6.0);
        ui.vertical(|ui| {
            form::caption(ui, tl!("Orientation"));
            orientation(ui, d);
        });
    });
    ui.add_space(6.0);
    form::caption(ui, tl!("Artboards"));
    artboards(ui, d, 96.0);
    ui.add_space(6.0);
    form::caption(ui, tl!("Bleed"));
    form::bleed(ui, d, unit, 52.0);
    ui.add_space(6.0);
    let (colors, ppi, _) = advanced_options();
    form::caption(ui, tl!("Color Mode"));
    choice(ui, d, "colorMode", &colors, DETAILS);
    ui.add_space(6.0);
    form::caption(ui, tl!("Raster Effects"));
    choice(ui, d, "rasterEffectsPpi", &ppi, DETAILS);
    ui.add_space(6.0);
    form::caption(ui, tl!("Background Contents"));
    background(ui, d, DETAILS - 34.0);
    ui.add_space(8.0);
    advanced(ui, d, 110.0, DETAILS - 116.0, &["previewMode"]);
    ui.add_space(10.0);
    if widgets::flat_button(ui, tl!("More Settings"), DETAILS).clicked() {
        d.kind = MORE.into();
    }
    // Close and Create at the bottom right.
    ui.add_space((HEIGHT - (ui.cursor().top() - top) - 28.0).max(12.0));
    ui.allocate_ui_with_layout(egui::vec2(ui.available_width(), 28.0), egui::Layout::right_to_left(egui::Align::Center), |ui| {
        b.create |= widgets::primary_button(ui, tl!("Create")).clicked();
        ui.add_space(8.0);
        b.close = widgets::secondary_button(ui, tl!("Close")).clicked();
    });
}

/// Save Preset: the preset's name, Save and Cancel.
fn save_row(app: &mut VectorcraftApp, ui: &mut egui::Ui, d: &mut Dialog) {
    ui.add_space(4.0);
    form::caption(ui, tl!("Preset Name"));
    ui.horizontal(|ui| {
        let enter = form::text_edit(ui, d, "presetName", DETAILS - 140.0).lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
        if widgets::flat_button(ui, tl!("Save"), 54.0).clicked() || enter {
            let mut p: Map<String, Value> = PARAMS.iter().filter_map(|k| Some((k.to_string(), d.fields.get(*k)?.clone()))).collect();
            p.insert("name".into(), json!(d.str("presetName")));
            p.remove("preset");
            match app.run("file.newPresets.save", Value::Object(p)) {
                Ok(r) => {
                    d.fields.insert(SAVING.into(), json!(false));
                    d.fields.insert("category".into(), json!("Saved"));
                    d.fields.insert("preset".into(), r["name"].clone());
                    d.fields.remove(APPLIED);
                }
                Err(e) => app.status(e),
            }
        }
        if widgets::flat_button(ui, tl!("Cancel"), 60.0).clicked() {
            d.fields.insert(SAVING.into(), json!(false));
        }
    });
}

fn units_dropdown(ui: &mut egui::Ui, d: &mut Dialog, width: f32) {
    let labels = UNITS.map(Unit::label);
    if let Some(u) = widgets::dropdown(ui, "newdoc-units", unit(d).label(), &labels, width).and_then(|i| UNITS.get(i)) {
        d.fields.insert("units".into(), json!(u.label()));
    }
}

/// Portrait and landscape: choosing the other one swaps width and height.
fn orientation(ui: &mut egui::Ui, d: &mut Dialog) {
    let (w, h) = (d.f64("width", 612.0), d.f64("height", 792.0));
    let landscape = w > h;
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 2.0;
        for (is_landscape, tip) in [(false, tl!("Portrait")), (true, tl!("Landscape"))] {
            if widgets::orientation_button(ui, is_landscape, landscape == is_landscape, tip) && landscape != is_landscape {
                d.fields.insert("width".into(), json!(h));
                d.fields.insert("height".into(), json!(w));
            }
        }
    });
}

fn artboards(ui: &mut egui::Ui, d: &mut Dialog, width: f32) {
    let n = d.f64("artboards", 1.0);
    ui.horizontal(|ui| {
        if let Some(v) = widgets::spin_plain(ui, "newdoc-artboards", n, "", 0, width, 1.0, 1.0, &[]) {
            d.fields.insert("artboards".into(), json!(v.round().clamp(1.0, MAX_ARTBOARDS as f64) as u64));
        }
    });
}

/// Background Contents with its chip: white, or white slashed in red for transparent.
fn background(ui: &mut egui::Ui, d: &mut Dialog, width: f32) {
    let t = Tokens::get(ui.ctx());
    let cur = d.str("backgroundContents");
    let shown = BACKGROUNDS.iter().find(|(v, _)| *v == cur).map_or(BACKGROUNDS[0].1, |(_, l)| l);
    ui.horizontal(|ui| {
        if let Some((v, _)) = widgets::dropdown(ui, "newdoc-background", shown, &BACKGROUNDS.map(|b| b.1), width).and_then(|i| BACKGROUNDS.get(i)) {
            d.fields.insert("backgroundContents".into(), json!(v));
        }
        let (chip, _) = ui.allocate_exact_size(egui::vec2(22.0, 22.0), egui::Sense::hover());
        ui.painter().rect_filled(chip, 2.0, egui::Color32::WHITE);
        if cur != "white" {
            ui.painter().line_segment([chip.left_bottom(), chip.right_top()], egui::Stroke::new(1.5, t.bleed));
        }
        ui.painter().rect_stroke(chip, 2.0, egui::Stroke::new(1.0, t.input_border), egui::StrokeKind::Inside);
    });
}

/// A dropdown bound to `d.fields[key]` over (value, label) pairs.
fn choice(ui: &mut egui::Ui, d: &mut Dialog, key: &str, options: &[(Value, String)], width: f32) {
    let cur = d.fields.get(key).cloned().unwrap_or_default();
    let shown = options
        .iter()
        .find(|(v, _)| *v == cur || v.as_f64().is_some_and(|x| cur.as_f64() == Some(x)))
        .map_or_else(|| cur.to_string(), |(_, l)| l.clone());
    let labels: Vec<&str> = options.iter().map(|(_, l)| l.as_str()).collect();
    if let Some((v, _)) = widgets::dropdown(ui, ("newdoc", key), &shown, &labels, width).and_then(|i| options.get(i)) {
        d.fields.insert(key.into(), v.clone());
    }
}

/// The options of Color Mode, Raster Effects and Preview Mode as (value, label).
type Options = Vec<(Value, String)>;

fn advanced_options() -> (Options, Options, Options) {
    let colors = COLOR_MODES.iter().map(|(v, l)| (json!(v), l.to_string())).collect();
    let ppi = RASTER_PPI.iter().map(|(v, l)| (json!(v), l.to_string())).collect();
    let previews = PreviewMode::ALL.iter().map(|m| (json!(m.id()), form::humanize(m.id()).trim_end_matches(':').to_string())).collect();
    (colors, ppi, previews)
}

/// The collapsible Advanced Options (open while the `advanced` field is), holding the fields
/// `keys` of Color Mode, Raster Effects and Preview Mode.
fn advanced(ui: &mut egui::Ui, d: &mut Dialog, label: f32, field: f32, keys: &[&str]) {
    let open = d.bool("advanced");
    if widgets::section_toggle(ui, tl!("Advanced Options"), open) {
        d.fields.insert("advanced".into(), json!(!open));
    }
    if !open {
        return;
    }
    let (colors, ppi, previews) = advanced_options();
    for (key, name, options) in [
        ("colorMode", tl!("Color Mode"), &colors),
        ("rasterEffectsPpi", tl!("Raster Effects"), &ppi),
        ("previewMode", tl!("Preview Mode"), &previews),
    ] {
        if keys.contains(&key) {
            widgets::label_row(ui, name, label, |ui| choice(ui, d, key, options, field));
        }
    }
}

/// More Settings: the classic form of the same fields.
fn show_more(app: &mut VectorcraftApp, ctx: &egui::Context) {
    let Some(mut d) = app.ui.dialog.clone() else { return };
    sync(app, &mut d);
    let t = Tokens::get(ctx);
    let mut b = Buttons::default();
    const L: f32 = 150.0;
    window(ctx, MORE, tl!("More Settings"), 22, |ui| {
        ui.set_width(560.0);
        super::modal::heading(ui, tl!("More Settings"));
        ui.add_space(12.0);
        widgets::label_row(ui, tl!("Name:"), L, |ui| {
            form::text(ui, &mut d, "name", 300.0);
        });
        // Profile: the preset categories (the tabs); Size: the profile's presets.
        let profiles: Vec<&str> = newdoc::CATEGORIES.iter().map(|c| c.0).collect();
        let profile = profiles.iter().find(|p| p.eq_ignore_ascii_case(&d.str("category"))).copied().unwrap_or("[Custom]");
        widgets::label_row(ui, tl!("Profile:"), L, |ui| {
            if let Some(p) = widgets::dropdown(ui, "newdoc-profile", profile, &profiles, 220.0).and_then(|i| profiles.get(i)) {
                d.fields.insert("category".into(), json!(p));
                if let Some(first) = newdoc::category(&app.session, p).and_then(|v| v.into_iter().next()) {
                    apply(&mut d, &first);
                }
            }
        });
        ui.add_space(6.0);
        let (lay, cols, spacing, rtl) = layout(&d);
        let n = d.f64("artboards", 1.0);
        let several = n > 1.0;
        widgets::label_row(ui, tl!("Number of Artboards:"), L, |ui| {
            artboards(ui, &mut d, 76.0);
            ui.add_space(10.0);
            for (l, icon) in [
                (ArtboardLayout::GridByRow, "dc-grid-view"),
                (ArtboardLayout::GridByColumn, "grid-3x3"),
                (ArtboardLayout::Row, "arrow-left-right"),
                (ArtboardLayout::Column, "arrow-up-down"),
            ] {
                if widgets::icon_button_enabled(ui, icon, l.label(), lay == l, several, 26.0).clicked() {
                    set_layout(&mut d, "layout", json!(l.id()));
                }
            }
            ui.add_space(6.0);
            if widgets::icon_button_enabled(ui, "chevrons-left", tl!("Change to Right-to-Left Layout"), rtl, several, 26.0).clicked() {
                set_layout(&mut d, "rightToLeft", json!(!rtl));
            }
        });
        ui.add_enabled_ui(several, |ui| {
            widgets::label_row(ui, tl!("Spacing:"), L, |ui| {
                if let Some(v) = widgets::num_field(ui, "newdoc-spacing", Some(spacing), unit(&d), 100.0) {
                    set_layout(&mut d, "spacing", json!(v.max(0.0)));
                }
                ui.add_space(20.0);
                widgets::field_label(ui, egui::RichText::new(tl!("Columns:")).color(t.text));
                let grid = matches!(lay, ArtboardLayout::GridByRow | ArtboardLayout::GridByColumn);
                ui.add_enabled_ui(grid, |ui| {
                    if let Some(v) = widgets::spin_plain(ui, "newdoc-columns", cols as f64, "", 0, 76.0, 1.0, 1.0, &[]) {
                        set_layout(&mut d, "columns", json!(v.round().clamp(1.0, n) as u64));
                    }
                });
            });
        });
        ui.add_space(6.0);
        let sizes = newdoc::category(&app.session, profile).unwrap_or_default();
        let size_names: Vec<&str> = sizes.iter().map(|s| s.name.as_str()).collect();
        let preset = d.str("preset");
        widgets::label_row(ui, tl!("Size:"), L, |ui| {
            // The profile's sizes are built in; the preset may be one the user saved.
            let shown = if preset.is_empty() { tl!("Custom") } else { preset_name(&preset) };
            if let Some(s) = super::mixed_dropdown(ui, "newdoc-size", shown, &size_names, 220.0, |_| true).and_then(|i| sizes.get(i)) {
                apply(&mut d, s);
            }
        });
        let unit = unit(&d);
        widgets::label_row(ui, tl!("Width:"), L, |ui| {
            form::length(ui, &mut d, "width", unit, 120.0);
            ui.add_space(20.0);
            ui.label(egui::RichText::new(tl!("Units:")).color(t.text));
            units_dropdown(ui, &mut d, 120.0);
        });
        widgets::label_row(ui, tl!("Height:"), L, |ui| {
            form::length(ui, &mut d, "height", unit, 120.0);
            ui.add_space(20.0);
            ui.label(egui::RichText::new(tl!("Orientation:")).color(t.text));
            orientation(ui, &mut d);
        });
        ui.add_space(4.0);
        widgets::label_row(ui, tl!("Bleed:"), L, |ui| form::bleed(ui, &mut d, unit, 64.0));
        ui.add_space(4.0);
        widgets::label_row(ui, tl!("Background Contents:"), L, |ui| background(ui, &mut d, 220.0));
        ui.add_space(8.0);
        advanced(ui, &mut d, L, 220.0, &["colorMode", "rasterEffectsPpi", "previewMode"]);
        ui.add_space(16.0);
        ui.horizontal(|ui| {
            b.template = widgets::secondary_button(ui, tl!("Templates…")).on_hover_text(tl!("New from Template")).clicked();
            ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                b.create |= widgets::primary_button(ui, tl!("Create Document")).clicked();
                ui.add_space(8.0);
                // Cancel goes back to New Document.
                if widgets::secondary_button(ui, tl!("Cancel")).clicked() {
                    d.kind = KIND.into();
                }
            });
        });
    });
    b.finish(app, ctx, d);
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use vectorcraft_engine::Session;

    use crate::VectorcraftApp;

    /// Cards translate the built-in presets' names only: Recent and Saved show the user's names.
    #[test]
    fn only_built_in_preset_names_are_translated() {
        assert!(super::is_builtin_preset("Letter") && super::is_builtin_preset("Phone 390×844"));
        assert!(!super::is_builtin_preset("Black") && !super::is_builtin_preset("Untitled-1"));
        assert_eq!(super::preset_name("Black"), "Black");
    }

    fn frame(app: &mut VectorcraftApp) -> egui::FullOutput {
        let ctx = egui::Context::default();
        crate::theme::install_fonts(&ctx);
        crate::theme::apply(&ctx, Default::default());
        let raw = egui::RawInput { screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(1400.0, 1000.0))), ..Default::default() };
        let mut out = ctx.run_ui(raw, |ui| crate::dialogs::show(app, ui.ctx()));
        out.textures_delta.clear();
        out
    }

    fn set(app: &mut VectorcraftApp, k: &str, v: serde_json::Value) {
        app.ui.dialog.as_mut().unwrap().fields.insert(k.into(), v);
    }

    fn field(app: &VectorcraftApp, k: &str) -> serde_json::Value {
        app.ui.dialog.as_ref().unwrap().fields.get(k).cloned().unwrap_or_default()
    }

    /// A double-click on a preset card creates the document from it (#663); a click only chooses it.
    #[test]
    fn a_double_clicked_preset_creates_the_document() {
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        set(&mut app, "category", json!("Mobile"));
        let ctx = egui::Context::default();
        crate::theme::install_fonts(&ctx);
        // Frames 50 ms apart, so two clicks a frame apart make a double-click.
        let mut time = 0.0;
        let mut run = |app: &mut VectorcraftApp, events| {
            time += 0.05;
            let screen_rect = Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(1400.0, 1000.0)));
            let raw = egui::RawInput { screen_rect, events, time: Some(time), ..Default::default() };
            let mut out = ctx.run_ui(raw, |ui| crate::dialogs::show(app, ui.ctx()));
            out.textures_delta.clear();
            out
        };
        run(&mut app, vec![]);
        // The first card of the category, found by its size line.
        let card = |app: &mut VectorcraftApp, run: &mut dyn FnMut(&mut VectorcraftApp, Vec<egui::Event>) -> egui::FullOutput| {
            let out = run(app, vec![]);
            let mut texts = vec![];
            fn walk(s: &egui::Shape, out: &mut Vec<(String, egui::Rect)>) {
                match s {
                    egui::Shape::Text(t) => out.push((t.galley.text().to_string(), t.visual_bounding_rect())),
                    egui::Shape::Vec(v) => v.iter().for_each(|s| walk(s, out)),
                    _ => {}
                }
            }
            out.shapes.iter().for_each(|c| walk(&c.shape, &mut texts));
            texts.into_iter().find(|(t, _)| t.starts_with("Phone 393")).map(|(_, r)| r.center()).unwrap()
        };
        let at = card(&mut app, &mut run);
        let press = |pressed| egui::Event::PointerButton { pos: at, button: egui::PointerButton::Primary, pressed, modifiers: Default::default() };
        run(&mut app, vec![egui::Event::PointerMoved(at), press(true)]);
        run(&mut app, vec![press(false)]);
        assert!(app.ui.dialog.is_some() && app.session.documents().is_empty(), "a click only chooses it");
        assert!(field(&app, "preset").as_str().is_some_and(|p| p == "Phone 393×852"), "{:?}", field(&app, "preset"));
        run(&mut app, vec![press(true)]);
        run(&mut app, vec![press(false)]);
        assert!(app.ui.dialog.is_none(), "the double-click created it: {:?}", app.ui.status);
        assert_eq!(app.session.documents().len(), 1);
    }

    #[test]
    fn a_preset_fills_the_details_and_create_makes_the_document() {
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        frame(&mut app);
        assert_eq!((field(&app, "category"), field(&app, "preset"), field(&app, "name")), (json!("Print"), json!("Letter"), json!("Untitled-1")));
        // Choosing a preset (as `ui.dialog.set` does) fills the fields.
        set(&mut app, "category", json!("Film & Video"));
        set(&mut app, "preset", json!("4K UHD"));
        frame(&mut app);
        assert_eq!((field(&app, "width"), field(&app, "units"), field(&app, "colorMode")), (json!(3840.0), json!("Pixels"), json!("rgb")));
        set(&mut app, "artboards", json!(4));
        set(&mut app, "artboardLayout", json!({"layout": "gridByRow", "columns": 2, "spacing": 10}));
        set(&mut app, "bleed", json!([0, 0, 0, 0]));
        set(&mut app, "previewMode", json!("pixel"));
        set(&mut app, "backgroundContents", json!("white"));
        frame(&mut app);
        assert_eq!(field(&app, "preset"), json!(""), "editing makes the settings custom");
        crate::dialogs::confirm(&mut app).unwrap();
        assert!(app.ui.dialog.is_none());
        let st = app.session.active().unwrap();
        let rects: Vec<_> = st.doc.artboards.iter().map(|a| (a.rect.x0, a.rect.y0)).collect();
        assert_eq!(rects, [(0.0, 0.0), (3850.0, 0.0), (0.0, 2170.0), (3850.0, 2170.0)]);
        assert_eq!(st.doc.setup.background, vectorcraft_doc::Background::White);
        assert!(app.ui.view.pixel_preview, "Pixel preview mode");
        // Next time Recent opens on it.
        app.run("file.newDialog", json!({})).unwrap();
        assert_eq!((field(&app, "category"), field(&app, "name")), (json!("Recent"), json!("Untitled-2")));
        frame(&mut app);
    }

    #[test]
    fn every_category_and_more_settings_draw_and_save_preset_saves() {
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        set(&mut app, "advanced", json!(true));
        for c in vectorcraft_engine::cmd::newdoc::category_names() {
            set(&mut app, "category", json!(c));
            let out = frame(&mut app);
            assert!(!out.shapes.is_empty());
        }
        // More Settings shares the fields; Cancel goes back.
        app.ui.dialog.as_mut().unwrap().kind = super::MORE.into();
        set(&mut app, "artboards", json!(3));
        frame(&mut app);
        assert_eq!(field(&app, "artboards"), json!(3));
        // Save Preset.
        set(&mut app, "category", json!("Print"));
        set(&mut app, "preset", json!("A5"));
        frame(&mut app);
        let p = app.run("file.newPresets.save", json!({"name": "Zine", "preset": "A5"}));
        assert!(p.is_ok());
        app.ui.dialog.as_mut().unwrap().kind = super::KIND.into();
        set(&mut app, "category", json!("Saved"));
        set(&mut app, "preset", json!("Zine"));
        frame(&mut app);
        assert!((field(&app, "width").as_f64().unwrap() - 148.0 * 72.0 / 25.4).abs() < 1e-6, "A5 wide");
        crate::dialogs::confirm(&mut app).unwrap();
        assert_eq!(app.session.prefs.recent_new_docs[0].name, "Zine");
    }

    /// Every text and every outlined rectangle a frame paints.
    type Painted = (Vec<(String, egui::Rect)>, Vec<(egui::Rect, egui::Stroke)>);

    fn shapes(out: &egui::FullOutput) -> Painted {
        fn walk(s: &egui::Shape, texts: &mut Vec<(String, egui::Rect)>, rects: &mut Vec<(egui::Rect, egui::Stroke)>) {
            match s {
                egui::Shape::Text(t) => texts.push((t.galley.text().to_string(), t.visual_bounding_rect())),
                egui::Shape::Rect(r) => rects.push((r.rect, r.stroke)),
                egui::Shape::Vec(v) => v.iter().for_each(|s| walk(s, texts, rects)),
                _ => {}
            }
        }
        let (mut texts, mut rects) = (vec![], vec![]);
        out.shapes.iter().for_each(|c| walk(&c.shape, &mut texts, &mut rects));
        (texts, rects)
    }

    /// Cards show their name and "size · colour mode"; exactly one, the selected one, has the
    /// 2 px selection outline; the app's tokens are back after the dialog draws.
    #[test]
    fn cards_show_size_and_mode_and_one_is_outlined() {
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        set(&mut app, "category", json!("Mobile"));
        set(&mut app, "preset", json!("Phone 390×844"));
        let ctx = egui::Context::default();
        crate::theme::install_fonts(&ctx);
        crate::theme::apply(&ctx, Default::default());
        let panel = crate::theme::Tokens::get(&ctx).panel;
        let mut out = egui::FullOutput::default();
        for _ in 0..2 {
            let raw =
                egui::RawInput { screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(1400.0, 1000.0))), ..Default::default() };
            out = ctx.run_ui(raw, |ui| crate::dialogs::show(&mut app, ui.ctx()));
            out.textures_delta.clear();
        }
        assert_eq!(crate::theme::Tokens::get(&ctx).panel, panel, "the app's tokens are restored");
        let (texts, rects) = shapes(&out);
        assert!(texts.iter().any(|(t, _)| t == "Phone 390×844"), "{texts:?}");
        assert!(texts.iter().any(|(t, _)| t == "390 × 844 px · RGB"), "{texts:?}");
        assert!(texts.iter().any(|(t, _)| t == "Start a new document"));
        // The window fades in, so the outline's colour is the selection blue at some opacity.
        let selected = crate::theme::Tokens::get(&ctx).sheet_palette().selected;
        let blue = |c: egui::Color32| c.a() > 0 && c.b() > c.r() && c.b() > c.g() && (selected.b() > selected.r());
        let outlined: Vec<_> = rects.iter().filter(|(_, s)| s.width == 2.0 && blue(s.color)).collect();
        assert_eq!(outlined.len(), 1, "{outlined:?}");
        let name = texts.iter().find(|(t, _)| t == "Phone 390×844").unwrap().1;
        assert!(outlined[0].0.contains(name.center()), "the outline is around the selected card");
        // A print preset is CMYK.
        set(&mut app, "category", json!("Print"));
        let raw = egui::RawInput { screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(1400.0, 1000.0))), ..Default::default() };
        let mut out = ctx.run_ui(raw, |ui| crate::dialogs::show(&mut app, ui.ctx()));
        out.textures_delta.clear();
        assert!(shapes(&out).0.iter().any(|(t, _)| t.ends_with("· CMYK")));
    }

    /// The glyphs follow the category, and a preset of the user's gets a screen or a page.
    #[test]
    fn glyphs_follow_the_category() {
        use super::Glyph;
        let named = |n: &str| vectorcraft_engine::cmd::newdoc::DocSettings { name: n.into(), ..Default::default() };
        assert_eq!(super::glyph_of(&named("Phone 393×852")), Glyph::Phone);
        assert_eq!(super::glyph_of(&named("Tablet 768×1024")), Glyph::Tablet);
        assert_eq!(super::glyph_of(&named("Watch 184×224")), Glyph::Watch);
        assert_eq!(super::glyph_of(&named("Letter")), Glyph::Page);
        let mut mine = named("Mine");
        mine.units = vectorcraft_doc::Unit::Pixels;
        assert_eq!(super::glyph_of(&mine), Glyph::Browser);
        mine.units = vectorcraft_doc::Unit::Millimeters;
        assert_eq!(super::glyph_of(&mine), Glyph::Page);
    }

    fn harness(app: VectorcraftApp) -> egui_kittest::Harness<'static, VectorcraftApp> {
        let mut ready = false;
        let mut h = egui_kittest::Harness::builder().with_size(egui::vec2(1400.0, 1000.0)).build_ui_state(
            move |ui, app: &mut VectorcraftApp| {
                if !ready {
                    crate::theme::install_fonts(ui.ctx());
                    crate::theme::apply(ui.ctx(), Default::default());
                    ready = true;
                    return;
                }
                crate::dialogs::show(app, ui.ctx());
            },
            app,
        );
        h.run_steps(3);
        h
    }

    /// The tabs and cards say which is selected; Close and Create are buttons by name, and Create
    /// makes the document.
    #[test]
    fn the_dialog_is_accessible_and_create_creates() {
        use egui_kittest::kittest::{NodeT, Queryable};
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        set(&mut app, "category", json!("Mobile"));
        set(&mut app, "preset", json!("Phone 393×852"));
        let mut h = harness(app);
        let toggled = |n: &egui_kittest::Node<'_>| n.accesskit_node().toggled() == Some(egui::accesskit::Toggled::True);
        assert!(toggled(&h.get_by_label("Mobile")));
        assert!(!toggled(&h.get_by_label("Web")));
        assert!(toggled(&h.get_by_label("Phone 393×852, 393 × 852 px")));
        assert!(!toggled(&h.get_by_label("Phone 390×844, 390 × 844 px")));
        let _ = h.get_by_label("Close");
        h.get_by_label("Create").click();
        h.run_steps(2);
        assert!(h.state().ui.dialog.is_none(), "{}", h.state().ui.status);
        assert_eq!(h.state().session.documents().len(), 1);
    }

    /// Enter with no field focused creates the document.
    #[test]
    fn enter_creates_the_document() {
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        let mut h = harness(app);
        h.key_press(egui::Key::Enter);
        h.run_steps(2);
        assert!(h.state().ui.dialog.is_none());
        assert_eq!(h.state().session.documents().len(), 1);
    }

    /// The hero's New from Template… link leaves the dialog for the template picker.
    #[test]
    fn the_hero_link_opens_a_template_instead() {
        use egui_kittest::kittest::Queryable;
        let mut app = VectorcraftApp::new(Session::new(), Default::default());
        app.run("file.newDialog", json!({})).unwrap();
        let mut h = harness(app);
        h.get_by_label("New from Template…").click();
        h.run_steps(2);
        assert!(h.state().ui.dialog.is_none());
        assert!(h.state().session.documents().is_empty(), "no picker here: nothing opened");
    }

    /// Images of the dialog in every brightness, for looking at (set CRAFT_UI_VISUAL_FIXTURES to
    /// a folder).
    #[test]
    fn capture_new_document_visual_fixtures() {
        let Some(directory) = std::env::var_os("CRAFT_UI_VISUAL_FIXTURES").map(std::path::PathBuf::from) else {
            return;
        };
        std::fs::create_dir_all(&directory).unwrap();
        for brightness in crate::theme::Brightness::ALL {
            let mut app = VectorcraftApp::new(Session::new(), Default::default());
            app.run("file.newDialog", json!({})).unwrap();
            set(&mut app, "category", json!("Mobile"));
            set(&mut app, "preset", json!("Phone 393×852"));
            let mut ready = false;
            let mut h = egui_kittest::Harness::builder().with_size(egui::vec2(1400.0, 1000.0)).wgpu().build_ui_state(
                move |ui, app: &mut VectorcraftApp| {
                    if !ready {
                        crate::theme::install_fonts(ui.ctx());
                        crate::theme::apply(ui.ctx(), brightness);
                        ready = true;
                        return;
                    }
                    crate::dialogs::show(app, ui.ctx());
                },
                app,
            );
            h.run_steps(4);
            h.render().unwrap().save(directory.join(format!("vectorcraft-new-document-{brightness:?}.png"))).unwrap();
        }
    }
}
