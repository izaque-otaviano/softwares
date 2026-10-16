//! The Variables page, which fills the window (the icon rail stays): a sidebar with the file's
//! name, its collections (this file's, then each enabled library's, read-only under the library's
//! name) and the selected collection's groups, and at the right the collection's variables as a
//! table with one value column per mode, a search field above it and Create variable under it. Double-click a name to rename it, right-click for more; a
//! value's variable button turns it into an alias of another variable (a library one too).
//! A library collection can be extended: a collection of this file with its modes and variables,
//! whose overridden values are marked (with a reset). Import and export read and write the
//! variables JSON (or CSS). Everything goes through `variable.*` / `library.*` commands, so it's
//! undoable and the same over MCP.

use egui::{Align2, Color32, Context, CornerRadius, Id, Rect, Sense, Stroke, StrokeKind, Ui, UiBuilder, pos2, vec2};
use figcraft_doc::{Collection, Document, PublishedLibrary, Variable, VariableType, VariableValue, Variables, scopes_for};
use figcraft_engine::library;
use serde_json::{Value, json};

use crate::FigApp;
use crate::a11y::Tip;
use crate::colorpicker::PickerTarget;
use crate::i18n::{tr, tr_noop, trf, trn};
use crate::icons::{self, Icon};
use crate::right::menu_item;
use crate::theme::{Tokens, regular, semibold};
use crate::widgets::{self, FieldEdit, Lead};

const SIDEBAR_W: f32 = 250.0;
/// Below this window width the sidebar starts out hidden (its toggle brings it back).
const NARROW_W: f32 = 760.0;
const TOP_H: f32 = 48.0;
const HEAD_H: f32 = 36.0;
const ROW_H: f32 = 36.0;
const FOOT_H: f32 = 40.0;
const SEARCH_W: f32 = 220.0;
const NAME_W: f32 = 220.0;
const MODE_W: f32 = 240.0;
/// The Add mode column at the table's right edge.
const ADD_W: f32 = 40.0;
const NAME_RANGE: (f32, f32) = (120.0, 480.0);
const MODE_RANGE: (f32, f32) = (140.0, 600.0);
const TYPES: [VariableType; 4] = [VariableType::Color, VariableType::Number, VariableType::String, VariableType::Boolean];

/// What's being renamed inline.
#[derive(Clone, Debug, PartialEq, Hash)]
enum Rename {
    Collection(String),
    /// (collection, mode)
    Mode(String, String),
    Variable(String),
    /// (collection, group path)
    Group(String, String),
}

/// The open editor's state (`UiState::variables`; None = closed).
#[derive(Clone, Default)]
pub struct Editor {
    /// The library whose collection is shown (id or name); None for this file's.
    library: Option<String>,
    /// The selected collection's id.
    collection: Option<String>,
    query: String,
    rename: Option<Rename>,
    /// The variable whose details (name, description, scopes) are open.
    details: Option<String>,
    /// The group the table shows ("space" or "color/brand"); None = every variable.
    group: Option<String>,
    /// Whether the sidebar shows; None follows the window's width.
    sidebar: Option<bool>,
    /// Only the variables of this type show (the filter at the end of the search field).
    kind: Option<VariableType>,
    /// The widths of the name column and of each mode's, once dragged.
    name_w: Option<f32>,
    mode_w: Option<f32>,
    /// A text field had the keyboard at the end of the last frame (Escape is its).
    typing: bool,
}

impl Editor {
    /// An editor showing `collection` (id or name; the first one when None or unknown).
    pub fn on(collection: Option<String>) -> Self {
        Editor { collection, ..Default::default() }
    }

    /// An editor showing a collection of enabled library `library` (id or name).
    pub fn in_library(library: String, collection: Option<String>) -> Self {
        Editor { library: Some(library), collection, ..Default::default() }
    }
}

/// What the editor lists for one source: this file's variables (editable, never library copies)
/// or an enabled library's published ones (read-only).
struct View<'a> {
    vars: &'a Variables,
    /// The library's (id, name); None for this file.
    library: Option<(&'a str, &'a str)>,
    collections: Vec<&'a Collection>,
    variables: Vec<&'a Variable>,
}

impl<'a> View<'a> {
    fn local(doc: &'a Document) -> Self {
        View {
            vars: &doc.variables,
            library: None,
            collections: library::local_collections(doc).collect(),
            variables: doc.variables.variables.iter().filter(|v| !library::is_remote_variable(doc, &v.id)).collect(),
        }
    }

    fn of(lib: &'a PublishedLibrary) -> Self {
        View {
            vars: &lib.doc.variables,
            library: Some((&lib.manifest.id, &lib.manifest.name)),
            collections: library::published_collections(lib).collect(),
            variables: library::published_variables(lib).collect(),
        }
    }

    fn id(&self) -> Option<&'a str> {
        self.library.map(|l| l.0)
    }

    fn editable(&self) -> bool {
        self.library.is_none()
    }

    /// Whether the editor's `library` (id or name) names this view.
    fn is(&self, library: Option<&str>) -> bool {
        match (self.library, library) {
            (None, None) => true,
            (Some((id, name)), Some(l)) => l == id || l == name,
            _ => false,
        }
    }

    /// Collection `c` (id or name).
    fn collection(&self, c: &str) -> Option<&'a Collection> {
        self.collections.iter().copied().find(|x| x.id == c).or_else(|| self.collections.iter().copied().find(|x| x.name == c))
    }

    fn in_collection(&self, c: &str) -> impl Iterator<Item = &'a Variable> {
        self.variables.iter().copied().filter(move |v| v.collection == c)
    }
}

/// Draw the Variables page into the window's central area while the editor is open (call once per
/// frame, in place of the canvas and the side panels).
pub fn page(app: &mut FigApp, ui: &mut Ui) {
    let Some(mut st) = app.ui.variables.take() else { return };
    let ctx = ui.ctx().clone();
    let Ok(doc) = app.session.ds().map(|d| d.doc.clone()) else {
        app.ui.variables = Some(st);
        return;
    };
    let libs = crate::variable_ui::libraries(app, &doc);
    let views: Vec<View> = std::iter::once(View::local(&doc)).chain(libs.iter().map(|l| View::of(l))).collect();
    // The selected collection (its source's first when none is), else this file's first.
    let found = views.iter().find(|v| v.is(st.library.as_deref())).and_then(|v| {
        let c = match st.collection.as_deref() {
            Some(c) => v.collection(c),
            None => v.collections.first().copied(),
        };
        Some((v, c?))
    });
    let Some((view, coll)) = found.map(|(v, c)| (v, Some(c))).or_else(|| views.first().map(|v| (v, v.collections.first().copied()))) else {
        app.ui.variables = Some(st);
        return;
    };
    st.library = view.id().map(str::to_string);
    st.collection = coll.map(|c| c.id.clone());
    // What Escape means is settled before anything draws: a rename or a menu that ends on it has
    // changed the state by the end of the frame.
    let escape = ctx.input(|i| i.key_pressed(egui::Key::Escape))
        && !(st.typing || st.rename.is_some() || st.details.is_some() || egui::Popup::is_any_open(&ctx) || crate::variable_ui::picker_open(&ctx));
    let t = Tokens::get(&ctx);
    let area = ui.max_rect();
    let side_w = SIDEBAR_W.min(area.width() * 0.5);
    let sidebar_shown = st.sidebar.unwrap_or(area.width() >= NARROW_W);
    let mut open = true;
    ui.spacing_mut().item_spacing = vec2(0.0, 0.0);
    let top_down = egui::Layout::top_down(egui::Align::Min);
    ui.horizontal_top(|ui| {
        let mut main_w = area.width();
        if sidebar_shown {
            ui.allocate_ui_with_layout(vec2(side_w, area.height()), top_down, |ui| sidebar(app, ui, &views, view, coll, &doc, &mut st));
            let (line, _) = ui.allocate_exact_size(vec2(1.0, area.height()), Sense::hover());
            ui.painter().rect_filled(line, CornerRadius::ZERO, t.border);
            main_w -= side_w + 1.0;
        }
        ui.allocate_ui_with_layout(vec2(main_w, area.height()), top_down, |ui| main_column(app, ui, view, &mut st, !sidebar_shown, &mut open));
    });
    details(app, &ctx, &doc.variables, &mut st);
    if escape {
        ctx.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Escape));
        open = false;
    }
    st.typing = crate::a11y::field_focused(&ctx);
    app.ui.variables = open.then_some(st);
}

/// Export this file's collections through a save dialog.
fn export_dialog(app: &mut FigApp, format: &str) {
    let name = app.session.doc().map(|d| format!("{}.variables.{format}", d.name)).unwrap_or_else(|_| format!("variables.{format}"));
    let Some(p) = app.services.pick_save(tr("Export variables"), &name, &[format]) else { return };
    if app.run("variable.export", json!({"format": format, "path": p.to_string_lossy()})).is_some() {
        let file = p.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default();
        app.toast(trf("Exported {file}", &[("file", &file)]));
    }
}

/// Import a variables JSON picked in an open dialog.
fn import_dialog(app: &mut FigApp) {
    let Some(p) = app.services.pick_open(tr("Import variables"), &["json"]) else { return };
    let Some(r) = app.run("variable.import", json!({"variables": p.to_string_lossy()})) else { return };
    let (added, updated) = (r["variables"].as_u64().unwrap_or(0), r["updated"].as_u64().unwrap_or(0));
    let skipped = r["warnings"].as_array().map_or(0, Vec::len);
    let mut msg = trn("Imported {n} new variables, updated {updated}", added as usize, &[("updated", &updated)]);
    if skipped > 0 {
        msg = format!("{msg} {}", trn("({n} warnings: some entries were skipped)", skipped, &[]));
    }
    app.toast(msg);
}

/// Extend library `lib`'s collection `c` and show the new collection.
fn extend(app: &mut FigApp, lib: &str, c: &str, st: &mut Editor) {
    if let Some(id) = app.run("library.extendCollection", json!({"library": lib, "collection": c})).and_then(|r| r["id"].as_str().map(str::to_string))
    {
        st.library = None;
        st.collection = Some(id);
        st.group = None;
        st.query.clear();
    }
}

fn rename_id(target: &Rename) -> Id {
    Id::new(("var_rename", target))
}

fn start_rename(ui: &Ui, st: &mut Editor, target: Rename) {
    ui.memory_mut(|m| m.request_focus(rename_id(&target).with("te")));
    st.rename = Some(target);
}

/// The inline editor of a rename in progress: the new name once committed. The rename ends when
/// the editor closes.
fn rename_field(ui: &mut Ui, st: &mut Editor, target: &Rename, value: &str, rect: Rect, font: egui::FontId) -> Option<String> {
    let (out, open) = widgets::rename_field(ui, rename_id(target), value, rect, font, false);
    if !open {
        st.rename = None;
    }
    out
}

/// The first of `base`, `base 2`, `base 3`… that `taken` doesn't hold.
fn unique(base: &str, taken: impl Fn(&str) -> bool) -> String {
    (1..10_000).map(|k| if k == 1 { base.to_string() } else { format!("{base} {k}") }).find(|n| !taken(n)).unwrap_or_else(|| base.to_string())
}

/// An icon button in `rect` whose response the caller takes (for a menu to hang on).
fn icon_response(ui: &mut Ui, id: Id, rect: Rect, icon: Icon, tip: &str) -> egui::Response {
    let t = Tokens::get(ui.ctx());
    let resp = ui.interact(rect, id, Sense::click()).tip(tip);
    crate::a11y::button(&resp, tip);
    if resp.hovered() {
        ui.painter().rect_filled(rect, CornerRadius::same(5), t.hover);
    }
    icons::paint(ui.painter(), rect.shrink(5.0), icon, t.icon);
    resp
}

/// A small 24×24 button centred at `x`, `y`.
fn button_rect(x: f32, y: f32) -> Rect {
    Rect::from_center_size(pos2(x, y), vec2(24.0, 24.0))
}

/// A sidebar section's heading ("Collections", "Groups"): its row, for the buttons at its right.
fn section_title(ui: &mut Ui, text: &str) -> Rect {
    let t = Tokens::get(ui.ctx());
    let (r, _) = ui.allocate_exact_size(vec2(ui.available_width(), HEAD_H), Sense::hover());
    ui.painter().text(pos2(r.min.x + 16.0, r.center().y), Align2::LEFT_CENTER, text, semibold(11.0), t.text);
    r
}

fn sidebar(app: &mut FigApp, ui: &mut Ui, views: &[View], view: &View, coll: Option<&Collection>, doc: &Document, st: &mut Editor) {
    let t = Tokens::get(ui.ctx());
    // The file's name, and the toggle that hides the sidebar.
    let (hr, _) = ui.allocate_exact_size(vec2(ui.available_width(), TOP_H), Sense::hover());
    let name_r = Rect::from_min_max(pos2(hr.min.x + 16.0, hr.min.y), pos2(hr.max.x - 48.0, hr.max.y));
    ui.painter().with_clip_rect(name_r).text(name_r.left_center(), Align2::LEFT_CENTER, &doc.name, semibold(12.5), t.text);
    if widgets::icon_button_at(ui, Id::new("vars_sidebar_hide"), button_rect(hr.max.x - 24.0, hr.center().y), Icon::Panels, tr("Collapse panel")) {
        st.sidebar = Some(false);
    }
    egui::ScrollArea::vertical().id_salt("vars_sidebar").auto_shrink([false, false]).show(ui, |ui| {
        ui.spacing_mut().item_spacing = vec2(0.0, 0.0);
        // Collections, with import and export and a new one at the right of the heading.
        let r = section_title(ui, tr("Collections"));
        let io = icon_response(ui, Id::new("vars_io"), button_rect(r.max.x - 44.0, r.center().y), Icon::Adjust, tr("Import and export"));
        crate::right::menu_popup(&io).show(|ui| {
            if menu_item(ui, tr("Import…"), "") {
                import_dialog(app);
                ui.close();
            }
            ui.add_space(2.0);
            widgets::label(ui, tr("Export…"), t.text_secondary);
            for (label, format) in [(tr("Variables JSON…"), "json"), (tr("CSS custom properties…"), "css")] {
                if menu_item(ui, label, "") {
                    export_dialog(app, format);
                    ui.close();
                }
            }
        });
        if widgets::icon_button_at(ui, Id::new("vars_add_coll"), button_rect(r.max.x - 20.0, r.center().y), Icon::Plus, tr("Create collection")) {
            create_collection(app, ui, &doc.variables, st);
        }
        for v in views {
            if let Some((_, name)) = v.library
                && !v.collections.is_empty()
            {
                library_title(ui, name);
            }
            for c in &v.collections {
                collection_row(app, ui, v, c, st);
            }
        }
        // Groups: the selected collection's.
        ui.add_space(8.0);
        let (line, _) = ui.allocate_exact_size(vec2(ui.available_width(), 1.0), Sense::hover());
        ui.painter().rect_filled(line, CornerRadius::ZERO, t.border);
        section_title(ui, tr("Groups"));
        if let Some(coll) = coll {
            group_rows(app, ui, view, coll, st);
        }
    });
}

/// A library's heading in the sidebar: its collections follow, read-only.
fn library_title(ui: &mut Ui, name: &str) {
    let t = Tokens::get(ui.ctx());
    ui.add_space(8.0);
    let (r, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 26.0), Sense::hover());
    icons::paint(ui.painter(), Rect::from_center_size(pos2(r.min.x + 22.0, r.center().y), vec2(12.0, 12.0)), Icon::Library, t.icon_secondary);
    let name_r = Rect::from_min_max(pos2(r.min.x + 34.0, r.min.y), pos2(r.max.x - 8.0, r.max.y));
    ui.painter().with_clip_rect(name_r).text(name_r.left_center(), Align2::LEFT_CENTER, name, semibold(11.0), t.text_secondary);
    resp.on_hover_text(tr("Library: its variables are read-only here; edit them in the library file and publish it"));
}

/// One collection in the sidebar: a grey row when selected, its variable count at the right.
fn collection_row(app: &mut FigApp, ui: &mut Ui, view: &View, c: &Collection, st: &mut Editor) {
    let t = Tokens::get(ui.ctx());
    let (r, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 30.0), Sense::click());
    crate::a11y::tab(&resp, &c.name, view.is(st.library.as_deref()) && st.collection.as_deref() == Some(c.id.as_str()));
    let r = r.shrink2(vec2(8.0, 1.0));
    let selected = view.is(st.library.as_deref()) && st.collection.as_deref() == Some(c.id.as_str());
    if selected {
        ui.painter().rect_filled(r, CornerRadius::same(6), t.hover);
    } else if resp.hovered() {
        ui.painter().rect_filled(r, CornerRadius::same(6), t.hover.gamma_multiply(0.5));
    }
    let target = Rename::Collection(c.id.clone());
    let count = view.in_collection(&c.id).count();
    ui.painter().text(pos2(r.max.x - 8.0, r.center().y), Align2::RIGHT_CENTER, count.to_string(), regular(11.0), t.text_secondary);
    let indent = if view.editable() { 8.0 } else { 26.0 };
    let name_r = Rect::from_min_max(pos2(r.min.x + indent, r.min.y + 4.0), pos2(r.max.x - 32.0, r.max.y - 4.0));
    if view.editable() && st.rename.as_ref() == Some(&target) {
        if let Some(name) = rename_field(ui, st, &target, &c.name, name_r, regular(11.5)) {
            app.run("variable.renameCollection", json!({"collection": c.id, "name": name}));
        }
    } else {
        let font = if selected { semibold(11.5) } else { regular(11.5) };
        ui.painter().with_clip_rect(name_r).text(name_r.left_center(), Align2::LEFT_CENTER, &c.name, font, t.text);
    }
    if resp.clicked() {
        if !selected {
            st.group = None;
            st.query.clear();
        }
        st.library = view.id().map(str::to_string);
        st.collection = Some(c.id.clone());
    }
    if view.editable() {
        if resp.double_clicked() {
            start_rename(ui, st, target.clone());
        }
        crate::right::context_popup(&resp).show(|ui| {
            if menu_item(ui, tr("Rename"), "") {
                start_rename(ui, st, target.clone());
                ui.close();
            }
            if menu_item(ui, tr("Delete collection"), "") {
                app.run("variable.deleteCollection", json!({"collection": c.id}));
                ui.close();
            }
        });
    } else if let Some(lib) = view.id() {
        crate::right::context_popup(&resp).show(|ui| {
            if menu_item(ui, tr("Extend collection"), "") {
                extend(app, lib, &c.id, st);
                ui.close();
            }
        });
    }
}

/// Every group path in `names` with its ancestors ("a/b/c" → "a", "a/b"), sorted.
fn groups<'a>(names: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for name in names {
        let mut path = group_of(name);
        while !path.is_empty() {
            if !out.iter().any(|g| g == path) {
                out.push(path.to_string());
            }
            path = group_of(path);
        }
    }
    out.sort();
    out
}

/// "All" and the collection's groups (indented by depth): picking one filters the table (a light
/// blue row); this file's groups can be renamed (every variable in them follows) or deleted.
fn group_rows(app: &mut FigApp, ui: &mut Ui, view: &View, coll: &Collection, st: &mut Editor) {
    let t = Tokens::get(ui.ctx());
    let members: Vec<&Variable> = view.in_collection(&coll.id).collect();
    let names: Vec<&str> = members.iter().map(|v| v.name.as_str()).collect();
    let list = groups(names.iter().copied());
    let rows = std::iter::once(None).chain(list.iter().map(Some));
    for g in rows {
        let (r, resp) = ui.allocate_exact_size(vec2(ui.available_width(), 30.0), Sense::click());
        let r = r.shrink2(vec2(8.0, 1.0));
        let on = st.group.as_ref() == g;
        crate::a11y::tab(&resp, g.map_or(tr("All"), |g| g.as_str()), on);
        if on {
            ui.painter().rect_filled(r, CornerRadius::same(6), t.selected_row);
        } else if resp.hovered() {
            ui.painter().rect_filled(r, CornerRadius::same(6), t.hover);
        }
        let depth = g.map_or(0, |g| g.matches('/').count());
        let x = r.min.x + 8.0 + depth as f32 * 12.0;
        let label = g.map_or(tr("All"), |g| g.rsplit('/').next().unwrap_or(g));
        let count = names.iter().filter(|n| g.is_none_or(|g| n.starts_with(&format!("{g}/")))).count();
        ui.painter().text(pos2(r.max.x - 8.0, r.center().y), Align2::RIGHT_CENTER, count.to_string(), regular(11.0), t.text_secondary);
        let name_r = Rect::from_min_max(pos2(x, r.min.y + 3.0), pos2(r.max.x - 28.0, r.max.y - 3.0));
        let font = if on { semibold(11.5) } else { regular(11.5) };
        let Some(g) = g else {
            ui.painter().text(name_r.left_center(), Align2::LEFT_CENTER, label, font, t.text);
            if resp.clicked() {
                st.group = None;
            }
            continue;
        };
        let target = Rename::Group(coll.id.clone(), g.clone());
        if view.editable() && st.rename.as_ref() == Some(&target) {
            if let Some(new) = rename_field(ui, st, &target, label, name_r, regular(11.5)) {
                rename_group(app, &members, g, &new, st);
            }
        } else {
            ui.painter().with_clip_rect(name_r).text(name_r.left_center(), Align2::LEFT_CENTER, label, font, t.text);
        }
        if resp.clicked() {
            st.group = Some(g.clone());
        }
        if !view.editable() {
            continue;
        }
        if resp.double_clicked() {
            start_rename(ui, st, target.clone());
        }
        crate::right::context_popup(&resp).show(|ui| {
            if menu_item(ui, tr("Rename group"), "") {
                start_rename(ui, st, target.clone());
                ui.close();
            }
            if menu_item(ui, tr("Delete group"), "") {
                let steps: Vec<serde_json::Value> = members
                    .iter()
                    .filter(|v| v.name.starts_with(&format!("{g}/")))
                    .map(|v| json!({"command": "variable.delete", "params": {"variable": v.id}}))
                    .collect();
                app.run("command.batch", json!({"label": "Delete group", "commands": steps}));
                if st.group.as_ref().is_some_and(|s| s == g || s.starts_with(&format!("{g}/"))) {
                    st.group = None;
                }
                ui.close();
            }
        });
    }
}

/// Rename the last part of group `g` of a collection (its variables `members`) to `new`: every
/// variable under it moves along (one undo step).
fn rename_group(app: &mut FigApp, members: &[&Variable], g: &str, new: &str, st: &mut Editor) {
    let new = new.trim().replace('/', "-");
    if new.is_empty() {
        return;
    }
    let renamed = match g.rsplit_once('/') {
        Some((parent, _)) => format!("{parent}/{new}"),
        None => new,
    };
    let prefix = format!("{g}/");
    let steps: Vec<serde_json::Value> = members
        .iter()
        .filter(|v| v.name.starts_with(&prefix))
        .map(|v| json!({"command": "variable.update", "params": {"variable": v.id, "name": format!("{renamed}/{}", &v.name[prefix.len()..])}}))
        .collect();
    if app.run("command.batch", json!({"label": "Rename group", "commands": steps})).is_some()
        && st.group.as_deref().is_some_and(|s| s == g || s.starts_with(&prefix))
    {
        st.group = st.group.as_ref().map(|s| format!("{renamed}{}", &s[g.len()..]));
    }
}

fn create_collection(app: &mut FigApp, ui: &Ui, vars: &Variables, st: &mut Editor) {
    let name = unique("Collection", |n| vars.collections.iter().any(|c| c.name == n));
    if let Some(id) =
        app.run("variable.createCollection", json!({"name": name, "modes": ["Mode 1"]})).and_then(|r| r["id"].as_str().map(str::to_string))
    {
        st.library = None;
        st.collection = Some(id.clone());
        start_rename(ui, st, Rename::Collection(id));
    }
}

/// The group part of a variable name ("space/md" → "space"; "" when ungrouped).
fn group_of(name: &str) -> &str {
    name.rsplit_once('/').map(|(g, _)| g).unwrap_or("")
}

/// The column the table sits in: the top bar (title, search, close), the table, and (for this
/// file's collections) the footer with Create variable.
fn main_column(app: &mut FigApp, ui: &mut Ui, view: &View, st: &mut Editor, sidebar_hidden: bool, open: &mut bool) {
    let t = Tokens::get(ui.ctx());
    // A sidebar click this frame picked another source: shown next frame.
    if !view.is(st.library.as_deref()) {
        ui.ctx().request_repaint();
        return;
    }
    let coll = st.collection.as_deref().and_then(|c| view.collection(c));
    top_bar(app, ui, view, coll, st, sidebar_hidden, open);
    let Some(coll) = coll else {
        ui.add_space(24.0);
        ui.horizontal(|ui| {
            ui.add_space(24.0);
            ui.vertical(|ui| {
                widgets::label(
                    ui,
                    tr("Variables store reusable values (colours, numbers, strings, booleans) with modes such as Light and Dark."),
                    t.text_secondary,
                );
                ui.add_space(12.0);
                if widgets::button(ui, tr("Create collection"), true, true).clicked() {
                    create_collection(app, ui, view.vars, st);
                }
            });
        });
        return;
    };
    let foot = if view.editable() { FOOT_H } else { 0.0 };
    let body = vec2(ui.available_width(), (ui.available_height() - foot).max(60.0));
    ui.allocate_ui_with_layout(body, egui::Layout::top_down(egui::Align::Min), |ui| table(app, ui, view, coll, st));
    if view.editable() {
        footer(app, ui, view, coll, st);
    }
}

/// The slim bar above the table: the collection's name at the left; at the right the note about
/// a library or extended collection, the search field and the button that closes the page.
fn top_bar(app: &mut FigApp, ui: &mut Ui, view: &View, coll: Option<&Collection>, st: &mut Editor, sidebar_hidden: bool, open: &mut bool) {
    let t = Tokens::get(ui.ctx());
    let (r, _) = ui.allocate_exact_size(vec2(ui.available_width(), TOP_H), Sense::hover());
    ui.painter().line_segment([r.left_bottom(), r.right_bottom()], Stroke::new(1.0, t.border));
    let mut x = r.min.x + 16.0;
    if sidebar_hidden {
        if widgets::icon_button_at(ui, Id::new("vars_sidebar_show"), button_rect(x + 4.0, r.center().y), Icon::Panels, tr("Expand panel")) {
            st.sidebar = Some(true);
        }
        x += 36.0;
    }
    let close = button_rect(r.max.x - 28.0, r.center().y);
    if widgets::icon_button_at(ui, Id::new("vars_close"), close, Icon::Close, tr("Close")) {
        *open = false;
    }
    let field_w = SEARCH_W.min((r.max.x - x - 150.0).max(130.0));
    let field = Rect::from_min_size(pos2(close.min.x - 12.0 - field_w, r.center().y - 14.0), vec2(field_w, 28.0));
    search_field(ui, field, st);
    let Some(coll) = coll else { return };
    // The title, then (in the room left) the note about where the collection comes from.
    let title_w = ui.painter().layout_no_wrap(coll.name.clone(), regular(13.0), t.text).size().x.min(280.0);
    let title_r = Rect::from_min_max(pos2(x, r.min.y), pos2((x + title_w).min(field.min.x - 12.0), r.max.y));
    ui.painter().with_clip_rect(title_r).text(title_r.left_center(), Align2::LEFT_CENTER, &coll.name, regular(13.0), t.text);
    let note = Rect::from_min_max(pos2(title_r.max.x + 16.0, r.min.y + 8.0), pos2(field.min.x - 12.0, r.max.y - 8.0));
    if note.width() < 40.0 {
        return;
    }
    let mut bar = ui.new_child(UiBuilder::new().max_rect(note).layout(egui::Layout::right_to_left(egui::Align::Center)));
    let text = match (view.library, coll.extends.as_deref().and_then(|p| view.vars.collection(p))) {
        (Some((lib, name)), _) => {
            let tip = tr("A collection of this file with these modes and variables: override their values per mode and add variables of its own");
            if widgets::button(&mut bar, tr("Extend collection"), false, true).on_hover_text(tip).clicked() {
                extend(app, lib, &coll.id, st);
            }
            bar.add_space(8.0);
            Some(trf("From the library \"{name}\": read-only", &[("name", &name)]))
        }
        (None, Some(parent)) => Some(trf("Extends \"{name}\": overridden values are marked", &[("name", &parent.name)])),
        _ => None,
    };
    if let Some(text) = text {
        bar.add(egui::Label::new(egui::RichText::new(text).font(regular(11.0)).color(t.text_secondary)).truncate());
    }
}

/// The search field: a magnifier at its left and, at its right end, the filter by type.
fn search_field(ui: &mut Ui, field: Rect, st: &mut Editor) {
    let t = Tokens::get(ui.ctx());
    ui.painter().rect_filled(field, CornerRadius::same(6), t.field);
    icons::paint(ui.painter(), Rect::from_center_size(pos2(field.min.x + 14.0, field.center().y), vec2(12.0, 12.0)), Icon::Search, t.icon_secondary);
    let text_r = Rect::from_min_max(pos2(field.min.x + 26.0, field.min.y + 4.0), pos2(field.max.x - 28.0, field.max.y - 4.0));
    let mut child = ui.new_child(UiBuilder::new().max_rect(text_r).layout(egui::Layout::left_to_right(egui::Align::Center)));
    child.add(
        egui::TextEdit::singleline(&mut st.query)
            .id(Id::new("vars_search"))
            .frame(egui::Frame::NONE)
            .hint_text(tr("Search"))
            .font(regular(11.0))
            .desired_width(text_r.width())
            .vertical_align(egui::Align::Center),
    );
    let filter = Rect::from_center_size(pos2(field.max.x - 14.0, field.center().y), vec2(20.0, 20.0));
    let resp = ui.interact(filter, Id::new("vars_filter"), Sense::click()).tip(tr("Filter and sort"));
    crate::a11y::button(&resp, tr("Filter and sort"));
    if resp.hovered() {
        ui.painter().rect_filled(filter, CornerRadius::same(4), t.pressed);
    }
    let tint = if st.kind.is_some() { t.accent_text } else { t.icon_secondary };
    icons::paint(ui.painter(), filter.shrink(4.0), Icon::Adjust, tint);
    crate::right::menu_popup(&resp).show(|ui| {
        if crate::right::menu_check(ui, st.kind.is_none(), tr("All"), "") {
            st.kind = None;
            ui.close();
        }
        for kind in TYPES {
            if crate::right::menu_check(ui, st.kind == Some(kind), tr(kind_label(kind)), "") {
                st.kind = Some(kind);
                ui.close();
            }
        }
    });
}

/// A variable type's English name (its key, and the base of a new variable's name).
fn kind_label(kind: VariableType) -> &'static str {
    match kind {
        VariableType::Color => tr_noop("Color"),
        VariableType::Number => tr_noop("Number"),
        VariableType::String => tr_noop("String"),
        VariableType::Boolean => tr_noop("Boolean"),
    }
}

/// The strip pinned under the table: Create variable, with a menu of the variable types.
fn footer(app: &mut FigApp, ui: &mut Ui, view: &View, coll: &Collection, st: &mut Editor) {
    let t = Tokens::get(ui.ctx());
    let (r, _) = ui.allocate_exact_size(vec2(ui.available_width(), FOOT_H), Sense::hover());
    ui.painter().line_segment([r.left_top(), r.right_top()], Stroke::new(1.0, t.border));
    let label = tr("Create variable");
    let text_w = ui.painter().layout_no_wrap(label.to_string(), regular(11.5), t.text).size().x;
    let b = Rect::from_min_size(pos2(r.min.x + 8.0, r.center().y - 14.0), vec2(text_w + 40.0, 28.0));
    let resp = ui.interact(b, Id::new("vars_create"), Sense::click());
    crate::a11y::button(&resp, label);
    if resp.hovered() {
        ui.painter().rect_filled(b, CornerRadius::same(5), t.hover);
    }
    icons::paint(ui.painter(), Rect::from_center_size(pos2(b.min.x + 16.0, b.center().y), vec2(12.0, 12.0)), Icon::Plus, t.icon);
    ui.painter().text(pos2(b.min.x + 30.0, b.center().y), Align2::LEFT_CENTER, label, regular(11.5), t.text);
    crate::right::menu_popup(&resp).show(|ui| {
        for kind in TYPES {
            // The English label also names the new variable (document content).
            let base = kind_label(kind);
            if menu_item(ui, tr(base), "") {
                let name = unique(base, |n| view.in_collection(&coll.id).any(|v| v.name == n));
                let params = json!({"collection": coll.id, "name": name, "type": kind.id()});
                if let Some(id) = app.run("variable.create", params).and_then(|r| r["id"].as_str().map(str::to_string)) {
                    st.query.clear();
                    st.kind = None;
                    st.group = None;
                    start_rename(ui, st, Rename::Variable(id));
                }
                ui.close();
            }
        }
    });
}

/// The columns' widths: the name's, and each mode's (resized by dragging the header's dividers).
#[derive(Clone, Copy)]
struct Cols {
    name: f32,
    mode: f32,
    /// The room at the right end for the Add mode button (none in a read-only collection).
    add: f32,
}

impl Cols {
    fn of(st: &Editor, editable: bool) -> Self {
        Cols {
            name: st.name_w.unwrap_or(NAME_W).clamp(NAME_RANGE.0, NAME_RANGE.1),
            mode: st.mode_w.unwrap_or(MODE_W).clamp(MODE_RANGE.0, MODE_RANGE.1),
            add: if editable { ADD_W } else { 0.0 },
        }
    }

    /// Where mode `i`'s column starts, from the table's left edge.
    fn mode_x(self, i: usize) -> f32 {
        self.name + i as f32 * self.mode
    }

    /// The table's width with `modes` columns.
    fn content(self, modes: usize) -> f32 {
        self.mode_x(modes) + self.add
    }
}

/// The thin vertical lines between a row's columns (the name's, each mode's, and the Add mode
/// column's at the right edge).
fn dividers(ui: &Ui, r: Rect, cols: Cols, modes: usize) {
    let t = Tokens::get(ui.ctx());
    let stroke = Stroke::new(1.0, t.border);
    for k in 0..=modes {
        let x = r.min.x + cols.mode_x(k);
        ui.painter().line_segment([pos2(x, r.min.y), pos2(x, r.max.y)], stroke);
    }
    let x = r.max.x - cols.add;
    if cols.add > 0.0 && x > r.min.x + cols.mode_x(modes) + 1.0 {
        ui.painter().line_segment([pos2(x, r.min.y), pos2(x, r.max.y)], stroke);
    }
}

/// The variables table: a header (Name, one column per mode, Add mode at the far right) and one
/// row per variable; the search, the type filter and the selected group narrow it.
fn table(app: &mut FigApp, ui: &mut Ui, view: &View, coll: &Collection, st: &mut Editor) {
    let t = Tokens::get(ui.ctx());
    let q = st.query.trim().to_lowercase();
    let in_group = |v: &Variable| st.group.as_ref().is_none_or(|g| v.name.starts_with(&format!("{g}/")));
    let mut list: Vec<&Variable> = view
        .in_collection(&coll.id)
        .filter(|v| in_group(v) && st.kind.is_none_or(|k| v.kind == k) && (q.is_empty() || v.name.to_lowercase().contains(&q)))
        .collect();
    list.sort_by(|a, b| group_of(&a.name).cmp(group_of(&b.name)));
    let cols = Cols::of(st, view.editable() && coll.extends.is_none());
    let width = cols.content(coll.modes.len()).max(ui.available_width());
    egui::ScrollArea::both().id_salt("vars_table").auto_shrink([false, false]).show(ui, |ui| {
        ui.spacing_mut().item_spacing = vec2(0.0, 0.0);
        header_row(app, ui, view, coll, st, cols, width);
        let mut group: Option<&str> = None;
        for v in &list {
            let g = group_of(&v.name);
            if group != Some(g) {
                group = Some(g);
                if !g.is_empty() {
                    let (r, _) = ui.allocate_exact_size(vec2(width, 28.0), Sense::hover());
                    dividers(ui, r, cols, coll.modes.len());
                    ui.painter().text(pos2(r.min.x + 16.0, r.center().y + 2.0), Align2::LEFT_CENTER, g, semibold(11.0), t.text_secondary);
                }
            }
            var_row(app, ui, view, coll, v, st, cols, width);
        }
        if list.is_empty() && (!q.is_empty() || st.kind.is_some()) {
            let (r, _) = ui.allocate_exact_size(vec2(width, ROW_H), Sense::hover());
            ui.painter().text(pos2(r.min.x + 16.0, r.center().y), Align2::LEFT_CENTER, tr("No matching variables"), regular(11.0), t.text_secondary);
        }
    });
}

fn header_row(app: &mut FigApp, ui: &mut Ui, view: &View, coll: &Collection, st: &mut Editor, cols: Cols, width: f32) {
    let t = Tokens::get(ui.ctx());
    // An extended collection has the modes of the one it extends.
    let editable = view.editable() && coll.extends.is_none();
    let (r, _) = ui.allocate_exact_size(vec2(width, HEAD_H), Sense::hover());
    ui.painter().text(pos2(r.min.x + 16.0, r.center().y), Align2::LEFT_CENTER, tr("Name"), semibold(11.0), t.text);
    dividers(ui, r, cols, coll.modes.len());
    // A single mode that still has its default name is just the "Value" column.
    let lone = coll.modes.len() == 1;
    for (i, m) in coll.modes.iter().enumerate() {
        let x = r.min.x + cols.mode_x(i);
        let cell = Rect::from_min_max(pos2(x + 4.0, r.min.y + 4.0), pos2(x + cols.mode - 4.0, r.max.y - 4.0));
        let target = Rename::Mode(coll.id.clone(), m.id.clone());
        if editable && st.rename.as_ref() == Some(&target) {
            if let Some(name) = rename_field(ui, st, &target, &m.name, cell.shrink2(vec2(4.0, 2.0)), regular(11.0)) {
                app.run("variable.renameMode", json!({"collection": coll.id, "mode": m.id, "name": name}));
            }
            continue;
        }
        let name_pos = pos2(cell.min.x + 8.0, cell.center().y);
        let shown = if lone && m.name == "Mode 1" { tr("Value") } else { m.name.as_str() };
        if !editable {
            ui.painter().with_clip_rect(cell).text(name_pos, Align2::LEFT_CENTER, shown, semibold(11.0), t.text);
            continue;
        }
        let resp = ui.interact(cell, Id::new(("vars_mode", &m.id)), Sense::click());
        if resp.hovered() {
            ui.painter().rect_filled(cell, CornerRadius::same(4), t.hover);
        }
        ui.painter().with_clip_rect(cell).text(name_pos, Align2::LEFT_CENTER, shown, semibold(11.0), t.text);
        if resp.double_clicked() {
            start_rename(ui, st, target.clone());
        }
        crate::right::context_popup(&resp).show(|ui| {
            if menu_item(ui, tr("Rename mode"), "") {
                start_rename(ui, st, target.clone());
                ui.close();
            }
            if menu_item(ui, tr("Duplicate mode"), "") {
                let name = unique(&format!("{} copy", m.name), |n| coll.modes.iter().any(|x| x.name == n));
                let made = app.run("variable.addMode", json!({"collection": coll.id, "name": name, "from": m.id}));
                if let Some(id) = made.and_then(|r| r["id"].as_str().map(str::to_string)) {
                    start_rename(ui, st, Rename::Mode(coll.id.clone(), id));
                }
                ui.close();
            }
            // The default mode is the first column: moving a column changes it.
            let last = coll.modes.len() - 1;
            for (show, label, to) in [
                (i > 0, tr_noop("Set as default"), 0),
                (i > 0, tr_noop("Move column left"), i.saturating_sub(1)),
                (i < last, tr_noop("Move column right"), i + 1),
            ] {
                if show && menu_item(ui, tr(label), "") {
                    app.run("variable.moveMode", json!({"collection": coll.id, "mode": m.id, "to": to}));
                    ui.close();
                }
            }
            if coll.modes.len() > 1 && menu_item(ui, tr("Delete mode"), "") {
                app.run("variable.removeMode", json!({"collection": coll.id, "mode": m.id}));
                ui.close();
            }
        });
    }
    if editable
        && widgets::icon_button_at(ui, Id::new("vars_add_mode"), button_rect(r.max.x - cols.add / 2.0, r.center().y), Icon::Plus, tr("Add mode"))
    {
        let name = unique("Mode", |n| coll.modes.iter().any(|m| m.name == n));
        if let Some(id) = app.run("variable.addMode", json!({"collection": coll.id, "name": name})).and_then(|r| r["id"].as_str().map(str::to_string))
        {
            start_rename(ui, st, Rename::Mode(coll.id.clone(), id));
        }
    }
    ui.painter().line_segment([r.left_bottom(), r.right_bottom()], Stroke::new(1.0, t.border));
    resize_handles(ui, r, st, cols, coll.modes.len());
}

/// Dragging a divider of the header resizes the column to its left: the name's, or (all alike)
/// the modes'.
fn resize_handles(ui: &mut Ui, r: Rect, st: &mut Editor, cols: Cols, modes: usize) {
    for k in 0..=modes {
        let x = r.min.x + cols.mode_x(k);
        let grip = Rect::from_center_size(pos2(x, r.center().y), vec2(8.0, r.height()));
        let resp = ui.interact(grip, Id::new(("vars_col", k)), Sense::drag());
        if resp.hovered() || resp.dragged() {
            ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal);
        }
        let Some(at) = resp.interact_pointer_pos().filter(|_| resp.dragged()) else { continue };
        let px = at.x - r.min.x;
        if k == 0 {
            st.name_w = Some(px.clamp(NAME_RANGE.0, NAME_RANGE.1));
        } else {
            st.mode_w = Some(((px - cols.name) / k as f32).clamp(MODE_RANGE.0, MODE_RANGE.1));
        }
    }
}

fn var_row(app: &mut FigApp, ui: &mut Ui, view: &View, coll: &Collection, v: &Variable, st: &mut Editor, cols: Cols, width: f32) {
    let t = Tokens::get(ui.ctx());
    let editable = view.editable();
    let (r, resp) = ui.allocate_exact_size(vec2(width, ROW_H), Sense::click());
    if resp.hovered() || (editable && st.details.as_deref() == Some(v.id.as_str())) {
        ui.painter().rect_filled(r, CornerRadius::ZERO, t.hover);
    }
    dividers(ui, r, cols, coll.modes.len());
    kind_glyph(ui, v, Rect::from_center_size(pos2(r.min.x + 24.0, r.center().y), vec2(14.0, 14.0)));
    let name_r = Rect::from_min_max(pos2(r.min.x + 40.0, r.min.y + 8.0), pos2(r.min.x + cols.name - 8.0, r.max.y - 8.0));
    let target = Rename::Variable(v.id.clone());
    // An inherited variable is named (and deleted) in the collection it extends.
    let inherited = v.extends.is_some();
    let scrolled = Id::new(("var_scrolled", &v.id));
    if editable && st.rename.as_ref() == Some(&target) {
        // A new variable below the fold scrolls into view once.
        if ui.data(|d| d.get_temp::<bool>(scrolled)).is_none() {
            ui.data_mut(|d| d.insert_temp(scrolled, true));
            ui.scroll_to_rect(r, None);
        }
        if let Some(name) = rename_field(ui, st, &target, &v.name, name_r, regular(11.5)) {
            app.run("variable.update", json!({"variable": v.id, "name": name}));
        }
    } else {
        ui.data_mut(|d| d.remove::<bool>(scrolled));
        // Grouped names show their last part under the group's header.
        let short = v.name.rsplit('/').next().unwrap_or(&v.name);
        ui.painter().with_clip_rect(name_r).text(name_r.left_center(), Align2::LEFT_CENTER, short, regular(11.5), t.text);
    }
    for (i, m) in coll.modes.iter().enumerate() {
        let x = r.min.x + cols.mode_x(i);
        let cell = Rect::from_min_max(pos2(x + 8.0, r.center().y - 13.0), pos2(x + cols.mode - 8.0, r.center().y + 13.0));
        value_cell(app, ui, view, v, coll, &m.id, cell);
    }
    if editable {
        if !inherited && resp.double_clicked() && ui.input(|i| i.pointer.interact_pos()).is_some_and(|p| p.x < name_r.max.x) {
            start_rename(ui, st, target.clone());
        }
        crate::right::context_popup(&resp).show(|ui| {
            if menu_item(ui, tr("Edit variable"), "") {
                st.details = Some(v.id.clone());
                ui.close();
            }
            if !inherited && menu_item(ui, tr("Rename"), "") {
                start_rename(ui, st, target.clone());
                ui.close();
            }
            if !v.overrides.is_empty() && menu_item(ui, tr("Reset overrides"), "") {
                app.run("variable.resetOverride", json!({"variable": v.id}));
                ui.close();
            }
            if menu_item(ui, tr("Duplicate"), "") {
                app.run("variable.duplicate", json!({"variable": v.id}));
                ui.close();
            }
            if !inherited && menu_item(ui, tr("Delete variable"), "") {
                app.run("variable.delete", json!({"variable": v.id}));
                ui.close();
            }
        });
    }
    ui.painter().line_segment([r.left_bottom(), r.right_bottom()], Stroke::new(1.0, t.border));
}

/// The type marker before a variable's name: an icon for each type.
fn kind_glyph(ui: &Ui, v: &Variable, rect: Rect) {
    let t = Tokens::get(ui.ctx());
    let p = ui.painter();
    match v.kind {
        VariableType::Color => icons::paint(p, rect, Icon::PaintBucket, t.icon_secondary),
        VariableType::Number => {
            p.text(rect.center(), Align2::CENTER_CENTER, "#", semibold(12.0), t.icon_secondary);
        }
        VariableType::String => icons::paint(p, rect, Icon::Text, t.icon_secondary),
        VariableType::Boolean => {
            let track = Rect::from_center_size(rect.center(), vec2(14.0, 8.0));
            p.rect_stroke(track, CornerRadius::same(4), Stroke::new(1.2, t.icon_secondary), StrokeKind::Inside);
            p.circle_filled(pos2(track.max.x - 4.0, track.center().y), 2.0, t.icon_secondary);
        }
    }
}

/// A colour as a small rounded square (a transparent one shows its checker and alpha halves).
fn colour_chip(ui: &Ui, rect: Rect, c: &figcraft_color::Color) {
    if c.a < 0.999 {
        widgets::paint_swatch(ui.painter(), rect, &figcraft_color::Paint::solid(*c));
        return;
    }
    // A hairline keeps colours close to the page's own readable.
    let t = Tokens::get(ui.ctx());
    let edge = if t.dark { Color32::from_white_alpha(56) } else { Color32::from_black_alpha(32) };
    let radius = CornerRadius::same(3);
    ui.painter().rect_filled(rect, radius, crate::theme::doc_c32(ui.ctx(), *c));
    ui.painter().rect_stroke(rect, radius, Stroke::new(1.0, edge), StrokeKind::Inside);
}

/// The text a colour shows in the table: its hex in capitals, without the `#`.
fn hex_text(c: &figcraft_color::Color) -> String {
    c.to_hex().to_uppercase()
}

/// `val` as a `variable.set` value.
fn value_json(val: &VariableValue) -> Value {
    match val {
        VariableValue::Color(c) => json!(c.to_css_hex()),
        VariableValue::Number(x) => json!(x),
        VariableValue::String(s) => json!(s),
        VariableValue::Boolean(b) => json!(b),
        VariableValue::Alias(a) => json!({"alias": a}),
    }
}

fn set(app: &mut FigApp, v: &Variable, mode: &str, value: Value) {
    app.run("variable.set", json!({"variable": v.id, "mode": mode, "value": value}));
}

/// One value cell: an editor for the value, or the aliased variable's chip; the variable button
/// on the right makes it an alias. A library's values only show.
fn value_cell(app: &mut FigApp, ui: &mut Ui, view: &View, v: &Variable, coll: &Collection, mode: &str, rect: Rect) {
    let t = Tokens::get(ui.ctx());
    let Some(val) = v.values.get(mode) else { return };
    let editable = view.editable();
    let id = Id::new(("var_cell", &v.id, mode));
    // The value editor leaves room for the alias button (and in extended collections an
    // override's reset button, so the column stays even).
    let overridden = v.overrides.contains(mode);
    let body = Rect::from_min_max(rect.min, pos2(rect.max.x - if coll.extends.is_some() { 50.0 } else { 26.0 }, rect.max.y));
    let alias_btn = Rect::from_center_size(pos2(rect.max.x - 11.0, rect.center().y), vec2(22.0, 22.0));
    let hovered = editable && ui.rect_contains_pointer(rect.expand2(vec2(4.0, 6.0)));
    if overridden {
        let mark = Rect::from_min_size(pos2(rect.min.x - 4.0, rect.min.y + 3.0), vec2(2.0, rect.height() - 6.0));
        ui.painter().rect_filled(mark, CornerRadius::same(1), t.accent);
        ui.interact(mark.expand2(vec2(2.0, 0.0)), id.with("mark"), Sense::hover())
            .tip(tr("Overridden here (the collection it extends has another value)"));
        if hovered
            && widgets::icon_button_at(ui, id.with("reset"), alias_btn.translate(vec2(-24.0, 0.0)), Icon::Reset, tr("Reset to the inherited value"))
        {
            app.run("variable.resetOverride", json!({"variable": v.id, "mode": mode}));
        }
    }
    if let VariableValue::Alias(target) = val {
        let full = view.vars.get(target).map(|x| x.name.as_str()).unwrap_or(tr("Missing variable"));
        let resp = ui.interact(body, id.with("alias"), if editable { Sense::click() } else { Sense::hover() });
        let resp = if editable { resp.on_hover_text(tr("Change alias")) } else { resp };
        let chip = body.shrink2(vec2(3.0, 3.0));
        ui.painter().rect_filled(chip, CornerRadius::same(4), t.hover);
        let border = if editable && resp.hovered() { t.border_strong } else { t.border };
        ui.painter().rect_stroke(chip, CornerRadius::same(4), Stroke::new(1.0, border), StrokeKind::Inside);
        icons::paint(
            ui.painter(),
            Rect::from_center_size(pos2(chip.min.x + 11.0, chip.center().y), vec2(12.0, 12.0)),
            Icon::Variable,
            t.icon_secondary,
        );
        let text_r = Rect::from_min_max(pos2(chip.min.x + 21.0, chip.min.y), pos2(chip.max.x - 4.0, chip.max.y));
        ui.painter().with_clip_rect(text_r).text(text_r.left_center(), Align2::LEFT_CENTER, full, regular(11.0), t.text);
        if resp.clicked() {
            crate::variable_ui::open_alias(ui, &v.id, mode, v.kind, body.left_bottom());
        }
        // Detach: keep the value it resolves to now.
        if hovered && widgets::icon_button_at(ui, id.with("detach"), alias_btn, Icon::Detach, tr("Detach alias")) {
            let modes = [(coll.id.clone(), mode.to_string())].into_iter().collect();
            if let Some(resolved) = view.vars.resolve(&v.id, &modes) {
                set(app, v, mode, value_json(&resolved));
            }
        }
        return;
    }
    if !editable {
        read_only_value(ui, val, body);
        return;
    }
    match val {
        VariableValue::Color(c) => {
            let sw = Rect::from_min_size(pos2(body.min.x + 4.0, body.center().y - 8.0), vec2(16.0, 16.0));
            colour_chip(ui, sw, c);
            if ui.interact(sw.expand(3.0), id.with("swatch"), Sense::click()).tip(tr("Edit colour")).clicked() {
                app.ui.picker = Some(PickerTarget::Variable { id: v.id.clone(), mode: mode.to_string() });
            }
            let hex_r = Rect::from_min_max(pos2(sw.max.x + 8.0, body.min.y + 4.0), pos2(body.max.x - 44.0, body.max.y - 4.0));
            if let Some(h) = widgets::text_field_inline(ui, id.with("hex"), &hex_text(c), hex_r, regular(11.5))
                && let Some(nc) = figcraft_color::Color::from_hex(&h)
            {
                // Six digits keep the alpha; eight set it.
                let nc = if h.trim().trim_start_matches('#').len() == 8 { nc } else { nc.with_alpha(c.a) };
                set(app, v, mode, json!(nc.to_css_hex()));
            }
            alpha_text(ui, c, body);
        }
        VariableValue::Number(x) => {
            let mut child = ui.new_child(UiBuilder::new().max_rect(body));
            match widgets::number_field(&mut child, id.with("num"), Lead::None, Some(*x), "", body.width(), 1.0) {
                Some(FieldEdit::Set(n)) => set(app, v, mode, json!(n)),
                Some(FieldEdit::Scrub(n, done)) => {
                    crate::typography::live(app, "Edit variable", "variable.set", json!({"variable": v.id, "mode": mode, "value": n}), done)
                }
                None => {}
            }
        }
        VariableValue::String(s) => {
            let mut child = ui.new_child(UiBuilder::new().max_rect(body));
            if let Some(n) = widgets::text_field(&mut child, id.with("str"), s, body.width(), "") {
                set(app, v, mode, json!(n));
            }
        }
        VariableValue::Boolean(b) => {
            let mut child = ui.new_child(UiBuilder::new().max_rect(body.shrink2(vec2(6.0, 0.0))));
            if widgets::checkbox(&mut child, *b, if *b { tr("True") } else { tr("False") }) {
                set(app, v, mode, json!(!b));
            }
        }
        VariableValue::Alias(_) => {}
    }
    if hovered && widgets::icon_button_at(ui, id.with("mkalias"), alias_btn, Icon::Variable, tr("Create alias")) {
        crate::variable_ui::open_alias(ui, &v.id, mode, v.kind, body.left_bottom());
    }
}

/// A colour's alpha as a percentage at the right end of `body` (only when it isn't opaque).
fn alpha_text(ui: &Ui, c: &figcraft_color::Color, body: Rect) {
    if c.a >= 0.999 {
        return;
    }
    let t = Tokens::get(ui.ctx());
    let pct = format!("{}%", (c.a * 100.0).round());
    ui.painter().text(pos2(body.max.x - 8.0, body.center().y), Align2::RIGHT_CENTER, pct, regular(11.0), t.text_secondary);
}

/// A value that only shows (a library's): its swatch and hex for colours, else its text.
fn read_only_value(ui: &Ui, val: &VariableValue, body: Rect) {
    let t = Tokens::get(ui.ctx());
    let mut x = body.min.x + 4.0;
    if let VariableValue::Color(c) = val {
        let sw = Rect::from_min_size(pos2(body.min.x + 4.0, body.center().y - 8.0), vec2(16.0, 16.0));
        colour_chip(ui, sw, c);
        x = sw.max.x + 8.0;
        alpha_text(ui, c, body);
    }
    let text = match val {
        VariableValue::Boolean(b) => (if *b { tr("True") } else { tr("False") }).to_string(),
        VariableValue::Color(c) => hex_text(c),
        other => other.display(),
    };
    let text_r = Rect::from_min_max(pos2(x, body.min.y), pos2(body.max.x - 44.0, body.max.y));
    ui.painter().with_clip_rect(text_r).text(text_r.left_center(), Align2::LEFT_CENTER, text, regular(11.5), t.text);
}

/// The details of one of this file's variables: name, description, where pickers offer it and
/// whether publishing the file as a library leaves it out.
fn details(app: &mut FigApp, ctx: &Context, vars: &Variables, st: &mut Editor) {
    let Some(v) = st.details.as_ref().filter(|_| st.library.is_none()).and_then(|id| vars.get(id)).cloned() else {
        st.details = None;
        return;
    };
    let t = Tokens::get(ctx);
    let mut open = true;
    egui::Window::new(tr("Edit variable"))
        .id(Id::new("variable_details"))
        .open(&mut open)
        .collapsible(false)
        .resizable(false)
        .default_width(280.0)
        .frame(egui::Frame::window(&ctx.global_style()).fill(t.panel).inner_margin(egui::Margin::same(16)))
        .show(ctx, |ui| {
            ui.set_width(260.0);
            widgets::label(ui, tr("Name"), t.text_secondary);
            if let Some(n) = widgets::text_field(ui, Id::new(("var_detail_name", &v.id)), &v.name, 260.0, "") {
                app.run("variable.update", json!({"variable": v.id, "name": n}));
            }
            ui.add_space(6.0);
            widgets::label(ui, tr("Description"), t.text_secondary);
            if let Some(d) = widgets::text_field(ui, Id::new(("var_detail_desc", &v.id)), &v.description, 260.0, tr("What it's for")) {
                app.run("variable.update", json!({"variable": v.id, "description": d}));
            }
            ui.add_space(6.0);
            if widgets::checkbox(ui, v.hidden_from_publishing, tr("Hide from publishing")) {
                app.run("variable.update", json!({"variable": v.id, "hiddenFromPublishing": !v.hidden_from_publishing}));
            }
            // The names code uses for it per platform (generated CSS uses the Web one).
            ui.add_space(10.0);
            widgets::label(ui, tr("Code syntax"), t.text_secondary);
            for (key, label) in [("WEB", tr_noop("Web")), ("iOS", tr_noop("iOS")), ("ANDROID", tr_noop("Android"))] {
                ui.horizontal(|ui| {
                    let (lr, _) = ui.allocate_exact_size(vec2(60.0, 24.0), Sense::hover());
                    ui.painter().text(lr.left_center(), Align2::LEFT_CENTER, tr(label), regular(11.0), t.text);
                    let cur = v.code_syntax.get(key).map_or("", String::as_str);
                    if let Some(n) = widgets::text_field_named(ui, Id::new(("var_detail_code", key, &v.id)), cur, 192.0, tr(label)) {
                        app.run("variable.update", json!({"variable": v.id, "codeSyntax": {key: n}}));
                    }
                });
            }
            let scopes = scopes_for(v.kind);
            if scopes.is_empty() {
                return;
            }
            ui.add_space(10.0);
            widgets::label(ui, tr("Scoping: where pickers offer it"), t.text_secondary);
            // "All" off hides it everywhere; on, from everywhere it fits.
            if widgets::checkbox(ui, v.scopes.is_none(), tr("All supported properties")) {
                app.run("variable.update", json!({"variable": v.id, "scopes": if v.scopes.is_none() { json!([]) } else { Value::Null }}));
            }
            let on: Vec<&str> = scopes.iter().map(|(id, _)| *id).filter(|id| v.in_scope(id)).collect();
            for (sid, label) in scopes {
                let checked = on.contains(sid);
                ui.horizontal(|ui| {
                    ui.add_space(16.0);
                    if widgets::checkbox(ui, checked, tr(label)) {
                        let mut list = on.clone();
                        if checked {
                            list.retain(|x| x != sid);
                        } else {
                            list.push(sid);
                        }
                        app.run("variable.update", json!({"variable": v.id, "scopes": list}));
                    }
                });
            }
        });
    if !open {
        st.details = None;
    }
}

#[cfg(test)]
#[path = "variables_page_tests.rs"]
mod page_tests;

#[cfg(test)]
mod tests {
    use super::groups;

    #[test]
    fn groups_include_parents_once_and_sorted() {
        let names = ["space/sm", "space/md", "color/brand/blue", "color/text", "plain", "color/brand/red"];
        assert_eq!(groups(names.into_iter()), ["color", "color/brand", "space"]);
        assert!(groups(["a", "b"].into_iter()).is_empty());
    }
}
