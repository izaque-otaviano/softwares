//! File ▸ New ▸ Project…, a sheet in its own colours ([`Tokens::sheet_palette`]): category tabs
//! (the active one underlined) over a hero card with an illustration drawn in code and a grid of
//! preset cards with glyphs drawn in code (the chosen one outlined in blue), and a Preset Details
//! column on the right (the project's name, the first sequence's width, height and frame rate,
//! whether to make it, and collapsible Advanced Options: sample rate, audio, video and audio
//! tracks), with Close and Create at the bottom right.
//!
//! Create runs `file.newProject` with the name and then, when "Create a first sequence" is on,
//! `file.newSequence` with the preset's settings: the same commands the menus, the CLI and agents
//! use (with params, `file.newProject` still makes the project directly).
//!
//! Automation ids: `newProject.tab.<category>`, `newProject.preset.<id>`, `newProject.name`,
//! `newProject.width`, `newProject.height`, `newProject.fps`, `newProject.sequence`,
//! `newProject.advanced`, `newProject.close`, `newProject.create`. `ui.set {"newProject": {...}}`
//! patches the draft ([`crate::state::NewProjectDraft`]).

use egui::{Color32, CornerRadius, Rect, Sense, Stroke, StrokeKind, pos2, vec2};
use filmcraft_time::FrameRate;
use serde_json::{Map, Value, json};

use crate::FilmcraftApp;
use crate::state::NewProjectDraft;
use crate::theme::{Sheet, Tokens};

/// Width of the presets column (four cards a row).
const LEFT: f32 = 600.0;
/// Width of the Preset Details column.
const DETAILS: f32 = 270.0;
/// Height of the dialog's content.
const HEIGHT: f32 = 540.0;
/// Height of the hero card.
const HERO: f32 = 104.0;
/// Size of a preset card.
const TILE: egui::Vec2 = egui::vec2(138.0, 120.0);

/// The kind of picture a preset card shows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Glyph {
    Screen,
    Film,
    Phone,
    Square,
    Browser,
}

/// A built-in preset: id, name (technical, kept as it is in every language), category, size,
/// timebase and glyph.
pub struct Preset {
    pub id: &'static str,
    pub name: &'static str,
    pub category: &'static str,
    pub width: u32,
    pub height: u32,
    pub fps: (i64, i64),
    pub glyph: Glyph,
}

const fn p(id: &'static str, name: &'static str, category: &'static str, width: u32, height: u32, fps: (i64, i64), glyph: Glyph) -> Preset {
    Preset { id, name, category, width, height, fps, glyph }
}

/// The presets, in the order the All tab shows them.
pub const PRESETS: &[Preset] = &[
    p("hd1080-23976", "HD 1080p", "broadcast", 1920, 1080, (24_000, 1001), Glyph::Screen),
    p("hd1080-25", "HD 1080p", "broadcast", 1920, 1080, (25, 1), Glyph::Screen),
    p("hd1080-2997", "HD 1080p", "broadcast", 1920, 1080, (30_000, 1001), Glyph::Screen),
    p("hd720-25", "HD 720p", "broadcast", 1280, 720, (25, 1), Glyph::Screen),
    p("uhd-23976", "UHD 4K", "broadcast", 3840, 2160, (24_000, 1001), Glyph::Screen),
    p("uhd-25", "UHD 4K", "broadcast", 3840, 2160, (25, 1), Glyph::Screen),
    p("dci4k-24", "DCI 4K", "cinema", 4096, 2160, (24, 1), Glyph::Film),
    p("dci2k-24", "DCI 2K", "cinema", 2048, 1080, (24, 1), Glyph::Film),
    p("scope2k-24", "2K 2.39:1", "cinema", 2048, 858, (24, 1), Glyph::Film),
    p("vertical-30", "9:16", "social", 1080, 1920, (30, 1), Glyph::Phone),
    p("square-30", "1:1", "social", 1080, 1080, (30, 1), Glyph::Square),
    p("portrait-30", "4:5", "social", 1080, 1350, (30, 1), Glyph::Square),
    p("web720-30", "720p", "web", 1280, 720, (30, 1), Glyph::Browser),
    p("web1080-60", "1080p", "web", 1920, 1080, (60, 1), Glyph::Browser),
];

/// The category tabs: id and label.
fn categories() -> [(&'static str, &'static str); 5] {
    [
        ("all", tl!("All")),
        ("broadcast", tl!("Broadcast")),
        ("cinema", tl!("Cinema")),
        ("social", tl!("Social")),
        // kept as it is in every language
        ("web", "Web"),
    ]
}

/// The frame rates Frame Rate offers.
const RATES: [(i64, i64); 9] = [(24_000, 1001), (24, 1), (25, 1), (30_000, 1001), (30, 1), (50, 1), (60_000, 1001), (60, 1), (120, 1)];
const SAMPLE_RATES: [u32; 4] = [32_000, 44_100, 48_000, 96_000];
const MIXES: [&str; 3] = ["Stereo", "Mono", "5.1"];

fn rate_label((num, den): (i64, i64)) -> String {
    let r = FrameRate { num, den }.sane();
    let v = r.as_f64();
    if r.den == 1 {
        format!("{v:.0} fps")
    } else {
        // 23.976, 29.97, 59.94
        let s = format!("{v:.3}");
        format!("{} fps", s.trim_end_matches('0'))
    }
}

fn find(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|p| p.id == id)
}

/// Fill the draft's size and timebase from a preset.
fn apply(d: &mut NewProjectDraft, p: &Preset) {
    d.preset = p.id.into();
    d.width = p.width;
    d.height = p.height;
    (d.fps_num, d.fps_den) = p.fps;
}

/// Does the draft still match its preset? A changed field makes the settings custom.
fn matches(d: &NewProjectDraft, p: &Preset) -> bool {
    d.width == p.width && d.height == p.height && (d.fps_num, d.fps_den) == p.fps
}

/// Open New Project on the default preset, named like a new project would be.
pub fn open(app: &mut FilmcraftApp) {
    let mut d = NewProjectDraft { name: tl!("Untitled").into(), ..Default::default() };
    if let Some(p) = find(&d.preset) {
        apply(&mut d, p);
    }
    app.ui.new_project = d;
    app.dialog = Some(crate::Dialog::NewProject);
}

/// `ui.set {"newProject": patch}`: merge `patch` into the draft; a new `preset` fills the fields.
pub fn patch(app: &mut FilmcraftApp, patch: &Value) -> Result<(), String> {
    let Some(obj) = patch.as_object() else { return Err("`newProject` must be an object".into()) };
    let mut cur = serde_json::to_value(&app.ui.new_project).map_err(|e| e.to_string())?;
    if let Some(c) = cur.as_object_mut() {
        for (k, v) in obj {
            c.insert(k.clone(), v.clone());
        }
    }
    let mut d: NewProjectDraft = serde_json::from_value(cur).map_err(|e| format!("bad `newProject`: {e}"))?;
    if let Some(id) = obj.get("preset").and_then(Value::as_str) {
        let p = find(id).ok_or_else(|| format!("unknown preset `{id}`"))?;
        apply(&mut d, p);
    }
    app.ui.new_project = d;
    Ok(())
}

/// The `file.newProject` and (when the draft makes one) `file.newSequence` parameters.
pub fn create_params(d: &NewProjectDraft) -> (Value, Option<Value>) {
    let name = d.name.trim();
    let project = json!({ "name": if name.is_empty() { tl!("Untitled") } else { name } });
    if !d.sequence {
        return (project, None);
    }
    let mut s = Map::new();
    s.insert("width".into(), json!(d.width.clamp(16, 16_384)));
    s.insert("height".into(), json!(d.height.clamp(16, 16_384)));
    s.insert("fps".into(), json!(FrameRate { num: d.fps_num, den: d.fps_den }.sane().as_f64()));
    s.insert("sampleRate".into(), json!(d.sample_rate));
    s.insert("mix".into(), json!(d.mix));
    s.insert("video".into(), json!(d.video_tracks.min(256)));
    s.insert("audio".into(), json!(d.audio_tracks.min(256)));
    (project, Some(Value::Object(s)))
}

/// Make the project (and its first sequence).
fn create(app: &mut FilmcraftApp, d: &NewProjectDraft) -> Result<(), String> {
    let (project, sequence) = create_params(d);
    app.session.execute("file.newProject", project).map_err(|e| e.to_string())?;
    if let Some(s) = sequence {
        app.session.execute("file.newSequence", s).map_err(|e| e.to_string())?;
    }
    Ok(())
}

type Elems = Vec<(String, Rect, String)>;

#[derive(Default)]
struct Buttons {
    create: bool,
    close: bool,
}

/// Draw New Project; whether it stays open.
pub fn show(app: &mut FilmcraftApp, ctx: &egui::Context) -> bool {
    let t = app.tokens;
    let s = t.sheet_palette();
    let mut d = app.ui.new_project.clone();
    if find(&d.preset).is_some_and(|p| !matches(&d, p)) {
        d.preset.clear();
    }
    let mut b = Buttons::default();
    let mut elems: Elems = Vec::new();
    let frame = egui::Frame::window(&ctx.global_style()).fill(s.window).inner_margin(0).corner_radius(8).stroke(Stroke::new(1.0, t.separator));
    egui::Window::new(tl!("New Project"))
        .id(egui::Id::new("New Project"))
        .title_bar(false)
        .collapsible(false)
        .resizable(false)
        .frame(frame)
        .pivot(egui::Align2::CENTER_CENTER)
        .default_pos(crate::widgets::dialog_center(ctx))
        .show(ctx, |ui| {
            sheet_visuals(ui, &s);
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 0.0;
                let well = CornerRadius { nw: 8, sw: 8, ne: 0, se: 0 };
                egui::Frame::NONE.fill(s.well).corner_radius(well).inner_margin(egui::Margin { left: 22, right: 18, top: 12, bottom: 18 }).show(ui, |ui| {
                    // A vertical column of a fixed width: in a horizontal layout the cards would
                    // run on and on to the right.
                    ui.vertical(|ui| {
                        ui.set_width(LEFT);
                        ui.set_min_height(HEIGHT - 30.0);
                        presets(ui, &mut d, &s, &t, &mut b, &mut elems);
                    });
                });
                egui::Frame::NONE.inner_margin(18).show(ui, |ui| {
                    ui.vertical(|ui| {
                        ui.set_width(DETAILS);
                        ui.set_min_height(HEIGHT - 36.0);
                        details(ui, &mut d, &s, &t, &mut b, &mut elems);
                    });
                });
            });
        });
    for (id, r, l) in elems {
        app.auto.add(&id, r, &l);
    }
    let mut keep = true;
    if b.close || crate::widgets::escape_closes(ctx) {
        keep = false;
    }
    if ctx.input(|i| i.key_pressed(egui::Key::Enter)) && !ctx.egui_wants_keyboard_input() {
        b.create = true;
    }
    if b.create && keep {
        match create(app, &d) {
            Ok(()) => keep = false,
            Err(e) => app.ui.status = e,
        }
    }
    app.ui.new_project = d;
    keep
}

/// egui's own widget colours inside the sheet: fields and dropdown buttons in its input colour.
fn sheet_visuals(ui: &mut egui::Ui, s: &Sheet) {
    let v = ui.visuals_mut();
    v.extreme_bg_color = s.input;
    v.widgets.inactive.bg_fill = s.input;
    v.widgets.inactive.weak_bg_fill = s.input;
    v.widgets.hovered.weak_bg_fill = s.card_hover;
    v.widgets.hovered.bg_fill = s.card_hover;
    v.selection.bg_fill = s.cta;
    v.selection.stroke = Stroke::new(1.0, Color32::WHITE);
    v.panel_fill = s.window;
    v.window_fill = s.window;
}

/// The category tabs, the hero card and the chosen category's preset cards: a click chooses one,
/// a double-click also creates the project.
fn presets(ui: &mut egui::Ui, d: &mut NewProjectDraft, s: &Sheet, t: &Tokens, b: &mut Buttons, elems: &mut Elems) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 22.0;
        for (id, label) in categories() {
            let sel = d.category == id;
            let font = if sel { Tokens::semibold(13.0) } else { egui::FontId::proportional(13.0) };
            let galley = ui.painter().layout_no_wrap(label.to_string(), font, s.tab_active);
            let (rect, resp) = ui.allocate_exact_size(vec2(galley.size().x, 30.0), Sense::click());
            let color = if sel || resp.hovered() { s.tab_active } else { s.tab_idle };
            ui.painter().galley(pos2(rect.left(), rect.center().y - galley.size().y / 2.0 - 2.0), galley, color);
            if sel {
                ui.painter().rect_filled(Rect::from_min_max(pos2(rect.left(), rect.bottom() - 2.0), rect.right_bottom()), CornerRadius::same(1), s.tab_active);
            }
            resp.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::SelectableLabel, true, sel, label));
            if resp.on_hover_cursor(egui::CursorIcon::PointingHand).clicked() {
                d.category = id.into();
            }
            elems.push((format!("newProject.tab.{id}"), rect, label.into()));
        }
    });
    ui.add_space(12.0);
    hero(ui, s, t);
    ui.add_space(16.0);
    let list: Vec<&Preset> = PRESETS.iter().filter(|p| d.category == "all" || p.category == d.category).collect();
    let heading = tl!("Blank project presets").to_uppercase();
    ui.label(egui::RichText::new(format!("{heading} ({})", list.len())).font(Tokens::semibold(11.0)).color(s.tab_idle));
    ui.add_space(8.0);
    egui::ScrollArea::vertical().id_salt(("new-project-presets", d.category.clone())).max_height(HEIGHT - 220.0).auto_shrink([false, false]).show(ui, |ui| {
        ui.set_width(LEFT - 12.0);
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing = vec2(12.0, 12.0);
            for p in list {
                let selected = d.preset == p.id;
                let card = preset_card(ui, p, selected, s, t);
                if card.clicked() || card.double_clicked() {
                    apply(d, p);
                }
                b.create |= card.double_clicked();
                elems.push((format!("newProject.preset.{}", p.id), card.rect, format!("{} {}", p.name, rate_label(p.fps))));
            }
        });
    });
}

/// The hero card: our heading and hint, and an illustration drawn in code.
fn hero(ui: &mut egui::Ui, s: &Sheet, t: &Tokens) {
    let (r, _) = ui.allocate_exact_size(vec2(LEFT, HERO), Sense::hover());
    ui.painter().rect_filled(r, CornerRadius::same(8), s.card);
    let art = Rect::from_center_size(pos2(r.right() - 104.0, r.center().y), vec2(170.0, 80.0));
    paint_hero_art(ui.painter(), art, s, t);
    let text = Rect::from_min_max(r.min + vec2(20.0, 18.0), pos2(art.left() - 16.0, r.bottom() - 12.0));
    // a child that doesn't move the parent's cursor: the card already took its space
    let mut child = ui.new_child(egui::UiBuilder::new().max_rect(text).layout(egui::Layout::top_down(egui::Align::Min)));
    {
        let ui = &mut child;
        ui.spacing_mut().item_spacing.y = 6.0;
        ui.add(egui::Label::new(egui::RichText::new(tl!("Start a new project")).font(Tokens::semibold(16.0)).color(s.tab_active)).selectable(false));
        ui.add(
            egui::Label::new(egui::RichText::new(tl!("Pick a preset, or set your own frame size and rate in Preset Details.")).size(12.5).color(s.tab_idle))
                .wrap()
                .selectable(false),
        );
    }
}

/// The hero's illustration: a viewer frame over a small timeline of clips with a playhead.
fn paint_hero_art(p: &egui::Painter, r: Rect, s: &Sheet, t: &Tokens) {
    let viewer = Rect::from_min_size(r.min + vec2(38.0, 0.0), vec2(96.0, 46.0));
    p.rect_filled(viewer.translate(vec2(2.0, 3.0)), 3.0, Color32::from_black_alpha(70));
    p.rect_filled(viewer, 3.0, s.well);
    p.rect_stroke(viewer, 3.0, Stroke::new(1.0, t.icon.gamma_multiply(0.6)), StrokeKind::Inside);
    // a horizon with a sun in the viewer
    let ground = vec![
        viewer.left_bottom() + vec2(4.0, -6.0),
        viewer.left_bottom() + vec2(34.0, -22.0),
        viewer.left_bottom() + vec2(54.0, -12.0),
        viewer.right_bottom() + vec2(-4.0, -26.0),
    ];
    p.add(egui::Shape::line(ground, Stroke::new(1.5, t.icon)));
    p.circle_filled(viewer.right_top() + vec2(-20.0, 13.0), 5.0, s.selected);
    // two tracks of clips
    let lane = |y: f32, clips: &[(f32, f32)], fill: Color32| {
        for &(x, w) in clips {
            p.rect_filled(Rect::from_min_size(pos2(r.left() + x, r.top() + y), vec2(w, 10.0)), 2.0, fill);
        }
    };
    lane(54.0, &[(4.0, 52.0), (60.0, 38.0), (102.0, 62.0)], s.selected.gamma_multiply(0.75));
    lane(68.0, &[(4.0, 80.0), (88.0, 76.0)], t.icon.gamma_multiply(0.45));
    let x = r.left() + 92.0;
    p.line_segment([pos2(x, r.top() + 50.0), pos2(x, r.bottom())], Stroke::new(1.5, s.tab_active));
    p.add(egui::Shape::convex_polygon(vec![pos2(x - 4.0, r.top() + 47.0), pos2(x + 4.0, r.top() + 47.0), pos2(x, r.top() + 52.0)], s.tab_active, Stroke::NONE));
}

/// Draw glyph `g` centred in `r`: outlines in `c`, details in `accent`.
pub fn paint_glyph(p: &egui::Painter, r: Rect, g: Glyph, c: Color32, accent: Color32) {
    let line = Stroke::new(1.5, c);
    let thin = Stroke::new(1.0, c);
    let at = |w: f32, h: f32| Rect::from_center_size(r.center(), vec2(w, h));
    match g {
        Glyph::Screen => {
            let b = at(40.0, 26.0).translate(vec2(0.0, -3.0));
            p.rect_stroke(b, 2.0, line, StrokeKind::Middle);
            p.line_segment([pos2(b.center().x, b.bottom()), pos2(b.center().x, b.bottom() + 5.0)], thin);
            p.line_segment([pos2(b.center().x - 9.0, b.bottom() + 6.0), pos2(b.center().x + 9.0, b.bottom() + 6.0)], line);
            let m = b.center();
            p.add(egui::Shape::convex_polygon(vec![m + vec2(-4.0, -5.0), m + vec2(6.0, 0.0), m + vec2(-4.0, 5.0)], accent, Stroke::NONE));
        }
        Glyph::Film => {
            let b = at(42.0, 26.0);
            p.rect_stroke(b, 2.0, line, StrokeKind::Middle);
            for i in 0..6 {
                let x = b.left() + 4.0 + i as f32 * 6.5;
                for y in [b.top() + 2.5, b.bottom() - 5.0] {
                    p.rect_filled(Rect::from_min_size(pos2(x, y), vec2(3.0, 2.5)), 0.5, c);
                }
            }
            p.rect_filled(Rect::from_center_size(b.center(), vec2(20.0, 9.0)), 1.0, accent);
        }
        Glyph::Phone => {
            let b = at(20.0, 36.0);
            p.rect_stroke(b, 4.0, line, StrokeKind::Middle);
            p.line_segment([pos2(b.center().x - 3.0, b.top() + 4.0), pos2(b.center().x + 3.0, b.top() + 4.0)], thin);
            let m = b.center();
            p.add(egui::Shape::convex_polygon(vec![m + vec2(-3.0, -4.0), m + vec2(5.0, 0.0), m + vec2(-3.0, 4.0)], accent, Stroke::NONE));
        }
        Glyph::Square => {
            let b = at(30.0, 30.0);
            p.rect_stroke(b, 4.0, line, StrokeKind::Middle);
            p.circle_stroke(b.center(), 7.0, Stroke::new(1.5, accent));
            p.circle_filled(b.right_top() + vec2(-6.0, 6.0), 1.5, c);
        }
        Glyph::Browser => {
            let b = at(40.0, 28.0);
            p.rect_stroke(b, 3.0, line, StrokeKind::Middle);
            p.line_segment([pos2(b.left(), b.top() + 7.0), pos2(b.right(), b.top() + 7.0)], thin);
            for i in 0..3 {
                p.circle_filled(pos2(b.left() + 4.5 + i as f32 * 4.0, b.top() + 3.5), 1.2, c);
            }
            let m = b.center() + vec2(0.0, 3.5);
            p.add(egui::Shape::convex_polygon(vec![m + vec2(-3.0, -4.0), m + vec2(5.0, 0.0), m + vec2(-3.0, 4.0)], accent, Stroke::NONE));
        }
    }
}

/// A preset card: its glyph, the name and "width × height · rate", outlined while `selected`.
fn preset_card(ui: &mut egui::Ui, p: &Preset, selected: bool, s: &Sheet, t: &Tokens) -> egui::Response {
    let (r, resp) = ui.allocate_exact_size(TILE, Sense::click());
    let painter = ui.painter();
    painter.rect_filled(r, CornerRadius::same(6), if resp.hovered() || selected { s.card_hover } else { s.card });
    if selected {
        painter.rect_stroke(r, CornerRadius::same(6), Stroke::new(2.0, s.selected), StrokeKind::Inside);
    }
    let glyph = Rect::from_center_size(r.center_top() + vec2(0.0, 36.0), vec2(44.0, 44.0));
    paint_glyph(painter, glyph, p.glyph, t.icon, s.selected);
    let rate = rate_label(p.fps);
    painter.text(pos2(r.center().x, r.top() + 70.0), egui::Align2::CENTER_TOP, format!("{} · {rate}", p.name), Tokens::semibold(11.5), s.tab_active);
    painter.text(
        pos2(r.center().x, r.top() + 88.0),
        egui::Align2::CENTER_TOP,
        format!("{} × {}", p.width, p.height),
        egui::FontId::proportional(11.0),
        s.tab_idle,
    );
    let label = format!("{} {rate}", p.name);
    resp.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::SelectableLabel, true, selected, &label));
    resp
}

fn caption(ui: &mut egui::Ui, s: &Sheet, text: &str) {
    ui.label(egui::RichText::new(text).size(11.5).color(s.tab_idle));
}

/// A whole-number field bound to `v` (clamped to `lo..=hi`).
fn number(ui: &mut egui::Ui, v: &mut u32, lo: u32, hi: u32, width: f32) -> egui::Response {
    ui.add_sized([width, 24.0], egui::DragValue::new(v).range(lo..=hi).speed(1.0))
}

/// The Preset Details column.
fn details(ui: &mut egui::Ui, d: &mut NewProjectDraft, s: &Sheet, t: &Tokens, b: &mut Buttons, elems: &mut Elems) {
    let top = ui.cursor().top();
    ui.spacing_mut().item_spacing = vec2(6.0, 4.0);
    ui.label(egui::RichText::new(tl!("Preset Details").to_uppercase()).font(Tokens::semibold(11.0)).color(s.tab_idle));
    ui.add_space(8.0);
    caption(ui, s, tl!("Name"));
    let r = ui.add_sized([DETAILS, 24.0], egui::TextEdit::singleline(&mut d.name));
    elems.push(("newProject.name".into(), r.rect, "Name".into()));
    ui.add_space(8.0);
    ui.horizontal_top(|ui| {
        let half = (DETAILS - 10.0) / 2.0;
        ui.vertical(|ui| {
            ui.set_width(half);
            caption(ui, s, tl!("Width"));
            let r = number(ui, &mut d.width, 16, 16_384, half);
            elems.push(("newProject.width".into(), r.rect, "Width".into()));
        });
        ui.add_space(4.0);
        ui.vertical(|ui| {
            ui.set_width(half);
            caption(ui, s, tl!("Height"));
            let r = number(ui, &mut d.height, 16, 16_384, half);
            elems.push(("newProject.height".into(), r.rect, "Height".into()));
        });
    });
    ui.add_space(8.0);
    caption(ui, s, tl!("Frame Rate"));
    let cur = (d.fps_num, d.fps_den);
    let r = egui::ComboBox::from_id_salt("new-project-fps").width(DETAILS - 8.0).selected_text(rate_label(cur)).show_ui(ui, |ui| {
        for r in RATES {
            if ui.selectable_label(r == cur, rate_label(r)).clicked() {
                (d.fps_num, d.fps_den) = r;
            }
        }
    });
    elems.push(("newProject.fps".into(), r.response.rect, "Frame Rate".into()));
    ui.add_space(8.0);
    let r = ui.checkbox(&mut d.sequence, tl!("Create a first sequence"));
    elems.push(("newProject.sequence".into(), r.rect, "Create a first sequence".into()));
    ui.add_space(10.0);
    // Advanced Options, collapsible
    let (rect, resp) = ui.allocate_exact_size(vec2(DETAILS, 22.0), Sense::click());
    let open = d.advanced;
    let c = rect.left_center() + vec2(5.0, 0.0);
    let tri = if open {
        vec![c + vec2(-4.0, -2.5), c + vec2(4.0, -2.5), c + vec2(0.0, 3.0)]
    } else {
        vec![c + vec2(-2.5, -4.0), c + vec2(3.0, 0.0), c + vec2(-2.5, 4.0)]
    };
    ui.painter().add(egui::Shape::convex_polygon(tri, t.icon, Stroke::NONE));
    ui.painter().text(rect.left_center() + vec2(16.0, 0.0), egui::Align2::LEFT_CENTER, tl!("Advanced Options"), Tokens::semibold(12.0), s.tab_active);
    resp.widget_info(|| egui::WidgetInfo::selected(egui::WidgetType::CollapsingHeader, true, open, tl!("Advanced Options")));
    if resp.clicked() {
        d.advanced = !open;
    }
    elems.push(("newProject.advanced".into(), rect, "Advanced Options".into()));
    if d.advanced {
        ui.add_space(4.0);
        egui::Grid::new("new-project-advanced").num_columns(2).spacing(vec2(10.0, 6.0)).show(ui, |ui| {
            caption(ui, s, tl!("Sample Rate"));
            egui::ComboBox::from_id_salt("new-project-rate").width(120.0).selected_text(format!("{} Hz", d.sample_rate)).show_ui(ui, |ui| {
                for r in SAMPLE_RATES {
                    ui.selectable_value(&mut d.sample_rate, r, format!("{r} Hz"));
                }
            });
            ui.end_row();
            caption(ui, s, tl!("Audio"));
            let shown = crate::i18n::t(&d.mix).to_string();
            egui::ComboBox::from_id_salt("new-project-mix").width(120.0).selected_text(shown).show_ui(ui, |ui| {
                for m in MIXES {
                    let label = if m == "5.1" { "5.1" } else { crate::i18n::t(m) };
                    if ui.selectable_label(d.mix == m, label).clicked() {
                        d.mix = m.into();
                    }
                }
            });
            ui.end_row();
            caption(ui, s, tl!("Video Tracks"));
            number(ui, &mut d.video_tracks, 0, 256, 120.0);
            ui.end_row();
            caption(ui, s, tl!("Audio Tracks"));
            number(ui, &mut d.audio_tracks, 0, 256, 120.0);
            ui.end_row();
        });
    }
    // Close and Create at the bottom right.
    ui.add_space((HEIGHT - 36.0 - (ui.cursor().top() - top) - 30.0).max(12.0));
    ui.allocate_ui_with_layout(vec2(DETAILS, 30.0), egui::Layout::right_to_left(egui::Align::Center), |ui| {
        ui.spacing_mut().item_spacing.x = 8.0;
        let create =
            ui.add(egui::Button::new(egui::RichText::new(tl!("Create")).color(Color32::WHITE)).fill(s.cta).corner_radius(14).min_size(vec2(84.0, 28.0)));
        elems.push(("newProject.create".into(), create.rect, "Create".into()));
        b.create |= create.clicked();
        let close = ui.add(
            egui::Button::new(egui::RichText::new(tl!("Close")).color(s.tab_active))
                .fill(Color32::TRANSPARENT)
                .stroke(Stroke::new(1.5, s.tab_idle))
                .corner_radius(14)
                .min_size(vec2(76.0, 28.0)),
        );
        elems.push(("newProject.close".into(), close.rect, "Close".into()));
        b.close |= close.clicked();
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use egui_kittest::{Harness, kittest::Queryable};

    #[test]
    fn presets_have_unique_ids_and_categories_with_tabs() {
        let cats: Vec<&str> = categories().iter().map(|c| c.0).collect();
        for (i, p) in PRESETS.iter().enumerate() {
            assert!(PRESETS.iter().skip(i + 1).all(|q| q.id != p.id), "duplicate {}", p.id);
            assert!(cats.contains(&p.category), "{} has no tab", p.id);
            assert!(p.width >= 16 && p.height >= 16);
        }
    }

    #[test]
    fn create_sends_the_project_and_first_sequence() {
        let mut d = NewProjectDraft { name: "  Trailer ".into(), ..Default::default() };
        apply(&mut d, find("vertical-30").unwrap());
        let (p, s) = create_params(&d);
        assert_eq!(p, json!({"name": "Trailer"}));
        assert_eq!(s, Some(json!({"width":1080,"height":1920,"fps":30.0,"sampleRate":48_000,"mix":"Stereo","video":3,"audio":3})));
        d.sequence = false;
        d.name = " ".into();
        let (p, s) = create_params(&d);
        assert_eq!(p, json!({"name": "Untitled"}));
        assert!(s.is_none());
        // hostile sizes are capped
        d.sequence = true;
        (d.width, d.height, d.video_tracks) = (u32::MAX, 0, u32::MAX);
        let s = create_params(&d).1.unwrap();
        assert_eq!((s["width"].as_u64(), s["height"].as_u64(), s["video"].as_u64()), (Some(16_384), Some(16), Some(256)));
    }

    #[test]
    fn patch_merges_and_a_preset_fills_the_fields() {
        let mut app = FilmcraftApp::new(filmcraft_engine::Session::default());
        open(&mut app);
        patch(&mut app, &json!({"category": "cinema", "preset": "dci4k-24", "advanced": true})).unwrap();
        let d = &app.ui.new_project;
        assert_eq!((d.category.as_str(), d.width, d.height, d.fps_num, d.fps_den, d.advanced), ("cinema", 4096, 2160, 24, 1, true));
        assert!(patch(&mut app, &json!({"preset": "nope"})).is_err());
        assert!(patch(&mut app, &json!({"width": "wide"})).is_err());
        assert!(patch(&mut app, &json!(3)).is_err());
    }

    fn harness(app: FilmcraftApp) -> Harness<'static, FilmcraftApp> {
        let tokens = app.tokens;
        // the frames the builder runs come before the app's fonts are installed: skip those
        let mut fonts_in = false;
        let h = Harness::builder().with_size(vec2(1280.0, 800.0)).build_ui_state(
            move |ui, app: &mut FilmcraftApp| {
                let ctx = ui.ctx().clone();
                fonts_in |= ctx.fonts(|f| f.definitions().families.contains_key(&egui::FontFamily::Name("semibold".into())));
                if !fonts_in {
                    return;
                }
                if app.dialog == Some(crate::Dialog::NewProject) && !show(app, &ctx) {
                    app.dialog = None;
                }
            },
            app,
        );
        crate::theme::install(&h.ctx, &tokens);
        h
    }

    /// Run a few frames, dropping the font atlas updates a renderer would have taken.
    fn steps(h: &mut Harness<'static, FilmcraftApp>, n: usize) {
        for _ in 0..n {
            h.step();
            // nothing renders these updates in the test
            let _ = h.ctx.tex_manager().write().take_delta();
        }
    }

    #[test]
    fn the_menu_opens_it_and_create_makes_the_project_and_sequence() {
        let mut app = FilmcraftApp::new(filmcraft_engine::Session::default());
        let ctx = egui::Context::default();
        let r = crate::menus::invoke(&mut app, &ctx, "file.newProject", json!({})).unwrap();
        assert_eq!(r, json!({"dialog": "newProject"}));
        assert_eq!(app.dialog, Some(crate::Dialog::NewProject));
        let mut h = harness(app);
        steps(&mut h, 3);
        // the tabs, the hero and the details are on screen, within the window
        for label in ["Broadcast", "Cinema", "Start a new project", "Advanced Options", "Create", "Close"] {
            let n = h.get_by_label(label);
            let r = n.rect();
            assert!(r.max.x <= 1280.0 && r.max.y <= 800.0, "{label} is off screen: {r:?}");
        }
        if let Some(path) = std::env::var_os("FILMCRAFT_NEW_PROJECT_SCREENSHOT") {
            h.state_mut().ui.new_project.advanced = true;
            steps(&mut h, 2);
            h.render().unwrap().save(path).unwrap();
            h.state_mut().ui.new_project.advanced = false;
            steps(&mut h, 2);
        }
        h.get_by_label("Social").click();
        steps(&mut h, 2);
        assert_eq!(h.state().ui.new_project.category, "social");
        h.get_by_label("9:16 30 fps").click();
        steps(&mut h, 2);
        assert_eq!(h.state().ui.new_project.preset, "vertical-30");
        assert_eq!((h.state().ui.new_project.width, h.state().ui.new_project.height), (1080, 1920));
        h.get_by_label("Advanced Options").click();
        steps(&mut h, 2);
        assert!(h.state().ui.new_project.advanced);
        assert!(h.query_by_label("Sample Rate").is_some(), "Advanced Options shows its fields");
        h.get_by_label("Create").click();
        steps(&mut h, 2);
        let app = h.state();
        assert_eq!(app.dialog, None, "Create closes the dialog");
        assert_eq!(app.session.project.name, "Untitled");
        let seq = app.session.active_sequence().expect("a first sequence");
        assert_eq!((seq.settings.width, seq.settings.height), (1080, 1920));
    }

    #[test]
    fn close_leaves_the_project_alone() {
        let mut app = FilmcraftApp::new(filmcraft_engine::Session::default());
        app.session.execute("file.newProject", json!({"name": "Keep"})).unwrap();
        open(&mut app);
        let mut h = harness(app);
        steps(&mut h, 3);
        h.get_by_label("Close").click();
        steps(&mut h, 2);
        assert_eq!(h.state().dialog, None);
        assert_eq!(h.state().session.project.name, "Keep");
    }

    #[test]
    fn the_sheet_uses_the_shared_dark_palette() {
        let s = Tokens::for_kind(crate::theme::ThemeKind::Dark).sheet_palette();
        assert_eq!(s.cta, Color32::from_rgb(0x12, 0x73, 0xe6));
        assert_eq!((s.well, s.window), (Color32::from_gray(0x1e), Color32::from_gray(0x2c)));
        let light = Tokens::for_kind(crate::theme::ThemeKind::Light).sheet_palette();
        assert!(light.window.r() > 0xc0, "Light keeps a light sheet");
    }
}
