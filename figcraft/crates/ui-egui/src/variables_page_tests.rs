//! The Variables page (it fills the window beside the icon rail): its layout, drawn headless
//! through the presenter gallery's software rasteriser (`present::raster_tests::Rec`). Set
//! `FIGCRAFT_SNAPSHOTS=/some/dir` to write PNGs (`cargo test -p figcraft-ui-egui --lib
//! variables_snapshots`).

use egui::{Event, Id, Key, Modifiers, Pos2, Rect, Shape, pos2, vec2};
use figcraft_doc::VariableType;
use figcraft_engine::Session;
use serde_json::{Value, json};

use super::*;
use crate::present::raster_tests::Rec;
use crate::present::ux_tests::{shapes, texts};
use crate::theme::Tokens;

const SEVEN: [&str; 7] = ["343A40", "23076C", "EEC94F", "FFDE8B", "C1D8F2", "80AC84", "4E4E4E"];

/// The rail is 56 points wide; the sidebar follows it.
const RAIL_W: f32 = 56.0;

/// A file with one collection ("Variable collection") of seven synthetic colour variables.
fn colours() -> Session {
    let mut s = Session::new();
    let mut ex = |c: &str, p: Value| s.execute(c, &p).unwrap();
    ex("variable.createCollection", json!({"name": "Variable collection", "modes": ["Mode 1"]}));
    for (name, hex) in [
        ("Ink", "#343A40"),
        ("PRIMARY BLUE", "#23076C"),
        ("PRIMARY YELLOW", "#EEC94F"),
        ("YELLOW 2", "#FFDE8B"),
        ("BLUE 2", "#C1D8F2"),
        ("PRIMARY GREEN", "#80AC84"),
        ("PRIMARY GREY", "#4E4E4E"),
    ] {
        ex("variable.create", json!({"collection": "Variable collection", "name": name, "type": "color", "value": hex}));
    }
    s
}

/// The page open on [`colours`], the frames settled.
fn open() -> Rec {
    let mut r = Rec::new(colours());
    crate::control::handle(&mut r.u.app, &r.u.ctx, "ui.set", &json!({"variables": true})).unwrap();
    r.frames(5);
    r
}

/// What the last frame drew: the output of one more frame.
fn look(r: &mut Rec) -> egui::FullOutput {
    r.frame(Vec::new())
}

fn texts_of(r: &mut Rec) -> Vec<(String, Pos2)> {
    texts(&look(r))
}

/// The middle of the first text reading `s`.
fn at(r: &mut Rec, s: &str) -> Pos2 {
    texts_of(r).into_iter().find(|(t, _)| t == s).unwrap_or_else(|| panic!("no text {s:?} on the page")).1
}

fn has(r: &mut Rec, s: &str) -> bool {
    texts_of(r).iter().any(|(t, _)| t == s)
}

/// The last-drawn rect of the widget `id`.
fn rect_of(r: &Rec, id: impl std::hash::Hash + std::fmt::Debug) -> Rect {
    r.u.ctx.read_response(Id::new(id)).expect("the widget was drawn").rect
}

fn click_id(r: &mut Rec, id: impl std::hash::Hash + std::fmt::Debug) {
    let p = rect_of(r, id).center();
    r.click(p);
}

fn editor(r: &Rec) -> &Editor {
    r.u.app.ui.variables.as_ref().expect("the page is open")
}

fn editor_mut(r: &mut Rec) -> &mut Editor {
    r.u.app.ui.variables.as_mut().expect("the page is open")
}

fn var_names(r: &Rec) -> Vec<String> {
    r.u.app.session.doc().unwrap().variables.variables.iter().map(|v| v.name.clone()).collect()
}

fn key(r: &mut Rec, key: Key, modifiers: Modifiers) {
    let k = |pressed| Event::Key { key, physical_key: None, pressed, repeat: false, modifiers };
    r.frame(vec![k(true)]);
    r.frame(vec![k(false)]);
    r.frames(2);
}

#[test]
fn the_page_has_the_sidebar_sections_and_the_table() {
    let mut r = open();
    let all = texts_of(&mut r);
    let find = |s: &str| all.iter().filter(|(t, _)| t == s).map(|(_, p)| *p).collect::<Vec<_>>();
    // The sidebar: the file's name, then Collections with its list, then Groups with All.
    let side = |p: &Pos2| p.x > RAIL_W && p.x < RAIL_W + SIDEBAR_W && p.y > 44.0;
    let name = find("Untitled").into_iter().find(side).expect("the file's name heads the sidebar");
    let [coll_head] = find("Collections")[..] else { panic!("one Collections heading") };
    let rows = find("Variable collection");
    assert_eq!(rows.len(), 2, "the collection's row in the sidebar and the title of the page");
    let (row, title) = (rows.iter().copied().find(side).unwrap(), rows.iter().copied().find(|p| !side(p)).unwrap());
    let [groups_head] = find("Groups")[..] else { panic!("one Groups heading") };
    let [all_row] = find("All")[..] else { panic!("the All group") };
    assert!(name.y < coll_head.y && coll_head.y < row.y && row.y < groups_head.y && groups_head.y < all_row.y, "top to bottom");
    assert!(title.x > RAIL_W + SIDEBAR_W, "the title is right of the sidebar");
    assert!(title.y < 40.0 + TOP_H, "the title is in the slim bar under the tabs");
    // Both lists count the seven variables, right-aligned.
    let sevens = find("7");
    assert_eq!(sevens.len(), 2);
    assert!(sevens.iter().all(|p| side(p) && p.x > RAIL_W + SIDEBAR_W - 40.0), "counts at the sidebar's right edge: {sevens:?}");
    // The table: Name and Value headers; rows 36 high; Create variable pinned to the bottom.
    let [name_h] = find("Name")[..] else { panic!("a Name header") };
    let [value_h] = find("Value")[..] else { panic!("a Value header (one mode, default name)") };
    assert!(value_h.x > name_h.x && (value_h.y - name_h.y).abs() < 1.0);
    let (ink, blue) = (find("Ink")[0], find("PRIMARY BLUE")[0]);
    assert_eq!(blue.y - ink.y, ROW_H, "rows are {ROW_H} points apart");
    assert!(ink.y > name_h.y + HEAD_H - 4.0, "rows follow the header");
    let [footer] = find("Create variable")[..] else { panic!("one Create variable") };
    assert!(footer.y > r.u.size.y - FOOT_H, "the footer is at the bottom: {footer:?}");
    // No window title any more.
    assert!(find("Local variables").is_empty());
}

#[test]
fn selected_rows_use_the_theme_tokens() {
    let mut r = open();
    let t = Tokens::get(&r.u.ctx);
    let out = look(&mut r);
    let fill_at = |p: Pos2| {
        shapes(&out)
            .iter()
            .filter_map(|s| match s {
                Shape::Rect(rs) if rs.rect.contains(p) && rs.rect.width() > 100.0 => Some(rs.fill),
                _ => None,
            })
            .next_back()
    };
    let all = texts(&out);
    let pos = |s: &str| all.iter().find(|(t, p)| t == s && p.x < RAIL_W + SIDEBAR_W && p.y > 44.0).unwrap().1;
    // The selected collection is a grey row, the selected group (All) a light blue one.
    assert_eq!(fill_at(pos("Variable collection")), Some(t.hover));
    assert_eq!(fill_at(pos("All")), Some(t.selected_row));
    assert_ne!(t.hover, t.selected_row);
}

#[test]
fn hex_values_are_capitals_without_a_hash() {
    let mut r = open();
    let all = texts_of(&mut r);
    for hex in SEVEN {
        assert!(all.iter().any(|(t, _)| t == hex), "{hex} shows");
    }
    assert!(all.iter().all(|(t, _)| !t.starts_with('#')), "no #RRGGBB text");
    assert!(all.iter().all(|(t, _)| t != "100%"), "an opaque colour shows no alpha");
    // The formatting itself.
    let c = figcraft_color::Color::from_hex("#aabbcc").unwrap();
    assert_eq!(hex_text(&c), "AABBCC");
    // A translucent colour shows its alpha after the hex.
    r.run("variable.create", json!({"collection": "Variable collection", "name": "Veil", "type": "color", "value": "#11223380"}));
    r.frames(3);
    let all = texts_of(&mut r);
    assert!(all.iter().any(|(t, _)| t == "112233"), "{all:?}");
    assert!(all.iter().any(|(t, _)| t == "50%"));
}

#[test]
fn the_footer_button_creates_a_variable() {
    let mut r = open();
    let p = at(&mut r, "Create variable");
    r.click(p);
    for kind in ["Color", "Number", "String", "Boolean"] {
        assert!(has(&mut r, kind), "the menu offers {kind}");
    }
    let p = at(&mut r, "Number");
    r.click(p);
    assert_eq!(var_names(&r).len(), 8);
    let made = r.u.app.session.doc().unwrap().variables.variables.iter().find(|v| v.name == "Number").cloned().expect("a variable named Number");
    assert_eq!(made.kind, VariableType::Number);
    assert_eq!(editor(&r).rename, Some(Rename::Variable(made.id.clone())), "its name is open for editing");
    // One undo removes it.
    r.u.app.run("edit.undo", json!({}));
    r.frames(2);
    assert_eq!(var_names(&r).len(), 7);
}

#[test]
fn the_add_button_at_the_right_of_the_header_adds_a_mode() {
    let mut r = open();
    let add = rect_of(&r, "vars_add_mode");
    let head = at(&mut r, "Name");
    assert!((add.center().y - head.y).abs() < 1.0, "in the header row");
    assert!(add.center().x > r.u.size.x - 60.0, "at the far right: {add:?}");
    click_id(&mut r, "vars_add_mode");
    let modes = r.u.app.session.doc().unwrap().variables.collections[0].modes.len();
    assert_eq!(modes, 2);
    // Two modes: each column is named by its mode (the first no longer reads "Value").
    assert!(has(&mut r, "Mode 1"));
    assert!(!has(&mut r, "Value"));
}

#[test]
fn search_narrows_the_rows_and_the_filter_narrows_by_type() {
    let mut r = open();
    r.run("variable.create", json!({"collection": "Variable collection", "name": "gap", "type": "number", "value": 4}));
    r.frames(2);
    click_id(&mut r, "vars_search");
    r.frame(vec![Event::Text("blue".into())]);
    r.frames(2);
    assert_eq!(editor(&r).query, "blue");
    assert!(has(&mut r, "PRIMARY BLUE") && has(&mut r, "BLUE 2"));
    assert!(!has(&mut r, "Ink") && !has(&mut r, "gap"), "the rest is filtered out");
    r.frame(vec![Event::Text("zzz".into())]);
    r.frames(2);
    assert!(has(&mut r, "No matching variables"));
    // Clear it, then filter by type through the filter at the field's end.
    editor_mut(&mut r).query.clear();
    r.frames(2);
    assert!(has(&mut r, "Ink") && has(&mut r, "gap"));
    click_id(&mut r, "vars_filter");
    // (A menu's checked and unchecked rows are padded alike.)
    let p = texts_of(&mut r).into_iter().find(|(t, _)| t.trim() == "Number").expect("the filter lists Number").1;
    r.click(p);
    assert_eq!(editor(&r).kind, Some(VariableType::Number));
    assert!(has(&mut r, "gap") && !has(&mut r, "Ink"));
}

#[test]
fn the_sidebar_toggles_and_a_narrow_window_starts_without_it() {
    let mut r = open();
    assert!(has(&mut r, "Collections"), "a wide window shows it");
    click_id(&mut r, "vars_sidebar_hide");
    assert_eq!(editor(&r).sidebar, Some(false));
    assert!(!has(&mut r, "Collections") && !has(&mut r, "Groups"));
    assert!(has(&mut r, "Ink"), "the table stays");
    click_id(&mut r, "vars_sidebar_show");
    assert!(has(&mut r, "Collections"));
    // Left to the window's width, a narrow one hides it.
    editor_mut(&mut r).sidebar = None;
    r.resize(620.0, 700.0);
    r.frames(3);
    assert!(!has(&mut r, "Collections"), "narrow: hidden");
    assert!(has(&mut r, "Ink") && has(&mut r, "Create variable"), "the table still fits");
    click_id(&mut r, "vars_sidebar_show");
    assert!(has(&mut r, "Collections") && has(&mut r, "Ink"));
}

#[test]
fn dragging_a_divider_resizes_the_name_column() {
    let mut r = open();
    let before = at(&mut r, "Value").x;
    let g = rect_of(&r, ("vars_col", 0usize)).center();
    let ev = |p: Pos2, pressed: Option<bool>| match pressed {
        Some(pressed) => vec![
            Event::PointerMoved(p),
            Event::PointerButton { pos: p, button: egui::PointerButton::Primary, pressed, modifiers: Default::default() },
        ],
        None => vec![Event::PointerMoved(p)],
    };
    r.frame(ev(g, None));
    r.frame(ev(g, Some(true)));
    r.frame(ev(g + vec2(30.0, 0.0), None));
    r.frame(ev(g + vec2(60.0, 0.0), None));
    r.frame(ev(g + vec2(60.0, 0.0), Some(false)));
    r.frames(2);
    let w = editor(&r).name_w.expect("the drag set the width");
    assert!((w - (NAME_W + 60.0)).abs() < 2.0, "{w}");
    assert!((at(&mut r, "Value").x - before - 60.0).abs() < 2.0, "the value column moved along");
}

#[test]
fn escape_the_rail_and_the_close_button_leave_the_page() {
    let mut r = open();
    // Escape in the search field only leaves the field.
    click_id(&mut r, "vars_search");
    key(&mut r, Key::Escape, Modifiers::NONE);
    assert!(r.u.app.ui.variables.is_some(), "the first Escape was the field's");
    key(&mut r, Key::Escape, Modifiers::NONE);
    assert!(r.u.app.ui.variables.is_none(), "the next closes the page");
    // The rail's Variables button opens it again, and closes it.
    let p = at(&mut r, "Variables");
    r.click(p);
    assert!(r.u.app.ui.variables.is_some());
    assert!(has(&mut r, "Collections"));
    let p = at(&mut r, "Variables");
    r.click(p);
    assert!(r.u.app.ui.variables.is_none());
    r.u.app.ui.variables = Some(Default::default());
    r.frames(3);
    click_id(&mut r, "vars_close");
    assert!(r.u.app.ui.variables.is_none());
}

#[test]
fn the_page_keeps_canvas_shortcuts_from_the_hidden_document() {
    let mut s = colours();
    let made = s.execute("shape.rectangle", &json!({"x": 0, "y": 0, "width": 40, "height": 40})).unwrap();
    let id = crate::present_tests::id(&made);
    s.execute("select.set", &json!({"ids": [id]})).unwrap();
    let mut r = Rec::new(s);
    crate::control::handle(&mut r.u.app, &r.u.ctx, "ui.set", &json!({"variables": true})).unwrap();
    r.frames(3);
    key(&mut r, Key::Delete, Modifiers::NONE);
    assert!(r.u.app.session.doc().unwrap().node(id).is_some(), "Delete didn't reach the layer");
    // Undo still does: a variable made here goes away.
    r.run("variable.create", json!({"collection": "Variable collection", "name": "tmp", "type": "number", "value": 1}));
    assert_eq!(var_names(&r).len(), 8);
    key(&mut r, Key::Z, Modifiers::COMMAND);
    assert_eq!(var_names(&r).len(), 7, "Ctrl+Z undid it");
}

fn gallery_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("FIGCRAFT_SNAPSHOTS").map(Into::into)
}

#[test]
fn variables_snapshots() {
    let Some(dir) = gallery_dir() else { return };
    let mut r = open();
    r.frames(10);
    r.save(&dir.join("variables-colours.png"));
    // Several modes, types and groups; a row hovered.
    r.run("variable.addMode", json!({"collection": "Variable collection", "name": "Dark"}));
    for (name, kind, value) in [
        ("space/sm", "number", json!(4)),
        ("space/md", "number", json!(8)),
        ("label/title", "string", json!("Hello")),
        ("flags/on", "boolean", json!(true)),
    ] {
        r.run("variable.create", json!({"collection": "Variable collection", "name": name, "type": kind, "value": value}));
    }
    let p = at(&mut r, "YELLOW 2");
    r.frame(vec![Event::PointerMoved(pos2(p.x + 700.0, p.y))]);
    r.frames(10);
    r.save(&dir.join("variables-modes.png"));
    // The footer's menu.
    let p = at(&mut r, "Create variable");
    r.click(p);
    r.frames(3);
    r.save_region(&dir.join("variables-footer-menu.png"), Rect::from_min_size(pos2(300.0, 700.0), vec2(500.0, 200.0)), 2);
    key(&mut r, Key::Escape, Modifiers::NONE);
    // The dark theme.
    crate::control::handle(&mut r.u.app, &r.u.ctx, "ui.set", &json!({"theme": "dark"})).unwrap();
    r.frames(10);
    r.save(&dir.join("variables-dark.png"));
    crate::control::handle(&mut r.u.app, &r.u.ctx, "ui.set", &json!({"theme": "light"})).unwrap();
    // A narrow window.
    if r.u.app.ui.variables.is_none() {
        r.u.app.ui.variables = Some(Default::default());
    }
    editor_mut(&mut r).sidebar = None;
    r.resize(620.0, 700.0);
    r.frames(10);
    r.save(&dir.join("variables-narrow.png"));
}
