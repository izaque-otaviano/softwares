//! The right panel's Design tab, driven headless: the layout invariants of the properties
//! inspector (section order, grouped alignment buttons, fields that edit and undo, the flow
//! control, the help button, narrow widths) and a gallery of PNGs drawn by the software
//! rasteriser (`FIGCRAFT_SNAPSHOTS=/some/dir cargo test -p figcraft-ui-egui --lib right_panel_gallery`).

use egui::{Pos2, Rect, vec2};
use figcraft_doc::NodeId;
use figcraft_engine::Session;
use serde_json::{Value, json};

use crate::present::raster_tests::Rec;
use crate::present_tests::id;

/// A tall window, so the whole Design tab shows without scrolling.
const TALL: f32 = 1500.0;

fn ex(s: &mut Session, cmd: &str, params: Value) -> Value {
    s.execute(cmd, &params).unwrap_or_else(|e| panic!("{cmd}: {e}"))
}

/// A document with a frame (grey fill, a rectangle, a text and a circle inside), an auto layout
/// frame and a few loose layers: returns the session and the ids `[frame, rectangle, text, auto layout]`.
fn scene() -> (Session, [NodeId; 4]) {
    let mut s = Session::new();
    let frame = id(&ex(&mut s, "frame.create", json!({"x": 0, "y": 0, "width": 390, "height": 760, "name": "Home"})));
    ex(&mut s, "fill.set", json!({"ids": [frame], "color": "#F8F8F8"}));
    let rect = id(&ex(
        &mut s,
        "shape.rectangle",
        json!({"parent": frame, "x": 24, "y": 80, "width": 342, "height": 120, "props": {"name": "Card", "fill": "#0D99FF"}}),
    ));
    ex(&mut s, "node.set", json!({"id": rect, "props": {"cornerRadius": 12}}));
    let text = id(&ex(&mut s, "text.create", json!({"parent": frame, "text": "Hello", "x": 24, "y": 240})));
    ex(&mut s, "shape.ellipse", json!({"parent": frame, "x": 24, "y": 320, "width": 60, "height": 60, "props": {"fill": "#F24822"}}));
    let auto = id(&ex(&mut s, "frame.create", json!({"x": 500, "y": 0, "width": 300, "height": 200, "name": "Row"})));
    for (i, c) in ["#14AE5C", "#9747FF", "#FFCD29"].into_iter().enumerate() {
        ex(&mut s, "shape.rectangle", json!({"parent": auto, "x": 10.0 + 60.0 * i as f64, "y": 10, "width": 50, "height": 50, "props": {"fill": c}}));
    }
    ex(&mut s, "layout.add", json!({"ids": [auto], "direction": "horizontal"}));
    (s, [frame, rect, text, auto])
}

fn rec() -> (Rec, [NodeId; 4]) {
    let (s, ids) = scene();
    let mut r = Rec::new(s);
    r.resize(1440.0, TALL);
    (r, ids)
}

/// The right panel's area on screen.
fn panel(r: &Rec) -> Rect {
    let w = r.u.app.ui.right_width;
    Rect::from_min_size(Pos2::new(r.u.size.x - w, 0.0), vec2(w, r.u.size.y))
}

fn select(r: &mut Rec, ids: &[NodeId]) {
    r.run("select.set", json!({"ids": ids}));
    r.frames(3);
}

/// Where `FIGCRAFT_SNAPSHOTS` points (None: the gallery does nothing).
fn gallery_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("FIGCRAFT_SNAPSHOTS").map(Into::into)
}

#[test]
fn right_panel_gallery() {
    let Some(dir) = gallery_dir() else { return };
    let (mut r, [frame, rect, text, auto]) = rec();
    for (name, ids) in
        [("frame", vec![frame]), ("rectangle", vec![rect]), ("text", vec![text]), ("autolayout", vec![auto]), ("multi", vec![rect, text])]
    {
        select(&mut r, &ids);
        let area = panel(&r);
        r.save_region(&dir.join(format!("{name}.png")), area, 2);
    }
    // Nothing selected, the Prototype tab and Dev Mode.
    select(&mut r, &[]);
    r.save_region(&dir.join("page.png"), panel(&r), 2);
    select(&mut r, &[frame]);
    r.u.app.ui.right_tab = crate::RightTab::Prototype;
    r.frames(3);
    r.save_region(&dir.join("prototype.png"), panel(&r), 2);
    r.u.app.ui.right_tab = crate::RightTab::Inspect;
    r.frames(3);
    r.save_region(&dir.join("devmode.png"), panel(&r), 2);
}

/// The dock along the bottom of the canvas, as a PNG (`FIGCRAFT_SNAPSHOTS=/some/dir`).
#[test]
fn dock_gallery() {
    let Some(dir) = gallery_dir() else { return };
    let (mut r, [_, rect, ..]) = rec();
    r.resize(1440.0, 900.0);
    r.run("select.set", json!({"ids": [rect]}));
    r.frames(3);
    let size = r.u.size;
    let area = Rect::from_min_size(Pos2::new(size.x / 2.0 - 400.0, size.y - 90.0), vec2(800.0, 80.0));
    r.save_region(&dir.join("dock.png"), area, 3);
}

// ---------------------------------------------------------------------------------------------
// Layout invariants, driven through egui headless with the AccessKit tree on.

use egui::accesskit::{Role, Toggled};
use egui::{Event, pos2};

use crate::layers_drag_tests::Ui;

/// What the screen reader tree says about one control.
#[derive(Clone, Debug)]
struct Control {
    role: Role,
    label: String,
    rect: Rect,
    disabled: bool,
    toggled: Option<Toggled>,
}

impl Control {
    fn center(&self) -> Pos2 {
        self.rect.center()
    }
}

/// The scene's session in a window, `which` of `[frame, rectangle, text, auto layout]` selected.
fn ui_with(which: &[usize]) -> (Ui, [NodeId; 4]) {
    let (mut s, ids) = scene();
    let sel: Vec<NodeId> = which.iter().map(|i| ids[*i]).collect();
    ex(&mut s, "select.set", json!({"ids": sel}));
    let mut u = Ui::new(s);
    u.ctx.enable_accesskit();
    u.frame(vec![]);
    u.frame(vec![]);
    (u, ids)
}

fn controls(u: &mut Ui) -> Vec<Control> {
    u.frame(vec![]);
    let out = u.frame_output(vec![]);
    let nodes = out.platform_output.accesskit_update.expect("an AccessKit update").nodes;
    nodes
        .iter()
        .filter_map(|(_, n)| {
            let b = n.bounds()?;
            Some(Control {
                role: n.role(),
                label: n.label().unwrap_or_default().to_string(),
                rect: Rect::from_min_max(pos2(b.x0 as f32, b.y0 as f32), pos2(b.x1 as f32, b.y1 as f32)),
                disabled: n.is_disabled(),
                toggled: n.toggled(),
            })
        })
        .collect()
}

fn control(u: &mut Ui, role: Role, label: &str) -> Control {
    controls(u).into_iter().find(|c| c.role == role && c.label == label).unwrap_or_else(|| panic!("no {role:?} named {label:?}"))
}

fn click(u: &mut Ui, p: Pos2) {
    u.button(p, true);
    u.button(p, false);
    u.frame(vec![]);
}

fn click_control(u: &mut Ui, role: Role, label: &str) {
    let c = control(u, role, label);
    click(u, c.center());
}

/// The texts drawn this frame.
fn drawn(u: &mut Ui) -> Vec<(String, Pos2)> {
    let out = u.frame_output(vec![]);
    out.shapes
        .iter()
        .filter_map(|s| match &s.shape {
            egui::Shape::Text(t) => Some((t.galley.text().to_string(), t.pos)),
            _ => None,
        })
        .collect()
}

fn y_of(texts: &[(String, Pos2)], s: &str) -> f32 {
    texts.iter().find(|(t, p)| t == s && p.x > 1200.0).unwrap_or_else(|| panic!("no text {s:?} in the panel")).1.y
}

fn doc_node(u: &Ui, id: NodeId) -> figcraft_doc::Node {
    u.app.session.doc().unwrap().node(id).unwrap().clone()
}

#[test]
fn the_design_tab_lists_its_sections_in_the_reference_order() {
    let (mut u, _) = ui_with(&[0]);
    let t = drawn(&mut u);
    let order = [
        "Position",
        "Alignment",
        "Rotation",
        "Layout",
        "Flow",
        "Dimensions",
        "Appearance",
        "Fill",
        "Stroke",
        "Effects",
        "Selection colors",
        "Layout grid",
        "Export",
    ];
    let ys: Vec<f32> = order.iter().map(|s| y_of(&t, s)).collect();
    assert!(ys.windows(2).all(|w| w[0] < w[1]), "sections out of order: {:?}", order.iter().zip(&ys).collect::<Vec<_>>());
    // The handoff status is a quiet section after Export.
    assert!(y_of(&t, "Status") > y_of(&t, "Export"));
}

#[test]
fn the_header_row_has_dev_mode_component_and_more() {
    let (mut u, ids) = ui_with(&[0]);
    let dev = control(&mut u, Role::Button, "Dev Mode");
    let comp = control(&mut u, Role::Button, "Create component");
    let more = control(&mut u, Role::Button, "More");
    assert!(dev.rect.min.x < comp.rect.min.x && comp.rect.min.x < more.rect.min.x, "dev mode, component, more: left to right");
    assert!((dev.rect.center().y - more.rect.center().y).abs() < 1.0);
    // The component button makes a component of the frame.
    click(&mut u, comp.center());
    assert!(u.app.ui.last_error.is_none(), "{:?}", u.app.ui.last_error);
    let _ = ids;
    // Dev Mode switches the panel to its Inspect tab.
    let (mut u, _) = ui_with(&[0]);
    click_control(&mut u, Role::Button, "Dev Mode");
    assert_eq!(u.app.ui.right_tab, crate::RightTab::Inspect);
}

#[test]
fn the_more_menu_keeps_mask_boolean_and_swap_orientation() {
    let (mut u, ids) = ui_with(&[0]);
    click_control(&mut u, Role::Button, "More");
    let t = drawn(&mut u);
    for s in ["Use as mask", "Swap orientation", "Union", "Subtract", "Intersect", "Exclude", "Flatten"] {
        assert!(t.iter().any(|(x, _)| x == s), "the More menu lacks {s:?}");
    }
    let (w, h) = (doc_node(&u, ids[0]).width, doc_node(&u, ids[0]).height);
    let p = t.iter().find(|(x, _)| x == "Swap orientation").unwrap().1;
    click(&mut u, p + vec2(10.0, 6.0));
    let n = doc_node(&u, ids[0]);
    assert_eq!((n.width, n.height), (h, w), "Swap orientation swapped the frame's size");
}

#[test]
fn alignment_icons_come_in_two_groups_and_still_run_their_commands() {
    let (mut u, ids) = ui_with(&[1, 2]);
    let l = control(&mut u, Role::Button, "Align left");
    let r = control(&mut u, Role::Button, "Align right");
    // (The typography section has an "Align top" of its own, further down.)
    let top = controls(&mut u).into_iter().filter(|c| c.label == "Align top").min_by(|a, b| a.rect.min.y.total_cmp(&b.rect.min.y)).unwrap();
    let ctr = control(&mut u, Role::Button, "Align horizontal centers");
    // Horizontal alignment first, vertical second, side by side on one row.
    assert!(l.rect.max.x <= ctr.rect.min.x + 0.5 && ctr.rect.max.x <= r.rect.min.x + 0.5, "three touching icons in a group");
    assert!(r.rect.max.x < top.rect.min.x, "a gap between the groups");
    assert!((l.rect.center().y - top.rect.center().y).abs() < 1.0, "{:?} {:?}", l.rect, top.rect);
    click(&mut u, l.center());
    let (a, b) =
        (u.app.session.doc().unwrap().frame_relative(ids[1]).as_coeffs()[4], u.app.session.doc().unwrap().frame_relative(ids[2]).as_coeffs()[4]);
    assert!((a - b).abs() < 1e-6, "Align left lined both layers up: {a} {b}");
    // Distribute is there for two layers but greyed; it comes alive with three.
    assert!(control(&mut u, Role::Button, "Distribute and tidy").disabled);
    let (mut u, _) = ui_with(&[1, 2, 0]);
    assert!(!control(&mut u, Role::Button, "Distribute and tidy").disabled);
}

#[test]
fn fields_are_32_points_tall_rounded_and_edit_their_values_with_undo() {
    let (mut u, ids) = ui_with(&[1]);
    let x = control(&mut u, Role::SpinButton, "X");
    assert!((x.rect.height() - 32.0).abs() < 0.5, "field height {}", x.rect.height());
    // Click in, type, Enter.
    click(&mut u, x.center());
    u.frame(vec![Event::Text("48".into())]);
    for pressed in [true, false] {
        u.frame(vec![Event::Key { key: egui::Key::Enter, physical_key: None, pressed, repeat: false, modifiers: Default::default() }]);
    }
    u.frame(vec![]);
    let at = |u: &Ui| u.app.session.doc().unwrap().frame_relative(ids[1]).as_coeffs()[4];
    assert_eq!(at(&u), 48.0);
    u.app.run("edit.undo", json!({}));
    assert_eq!(at(&u), 24.0, "one undo takes the edit back");
}

#[test]
fn the_flow_control_adds_changes_and_removes_auto_layout() {
    let (mut u, ids) = ui_with(&[0]);
    let frame = ids[0];
    let free = control(&mut u, Role::Button, "Freeform");
    assert_eq!(free.toggled, Some(Toggled::True), "a frame without auto layout is freeform");
    assert!(doc_node(&u, frame).layout.is_none());
    click_control(&mut u, Role::Button, "Horizontal");
    assert_eq!(doc_node(&u, frame).layout.as_ref().map(|l| l.mode), Some(figcraft_doc::LayoutMode::Horizontal));
    assert_eq!(control(&mut u, Role::Button, "Horizontal").toggled, Some(Toggled::True));
    click_control(&mut u, Role::Button, "Vertical");
    assert_eq!(doc_node(&u, frame).layout.as_ref().map(|l| l.mode), Some(figcraft_doc::LayoutMode::Vertical));
    click_control(&mut u, Role::Button, "Grid");
    assert_eq!(doc_node(&u, frame).layout.as_ref().map(|l| l.mode), Some(figcraft_doc::LayoutMode::Grid));
    click_control(&mut u, Role::Button, "Freeform");
    assert!(doc_node(&u, frame).layout.is_none(), "Freeform takes auto layout off");
    u.app.run("edit.undo", json!({}));
    assert_eq!(doc_node(&u, frame).layout.as_ref().map(|l| l.mode), Some(figcraft_doc::LayoutMode::Grid), "and undo puts it back");
    assert!(u.app.ui.last_error.is_none(), "{:?}", u.app.ui.last_error);
}

#[test]
fn the_layout_header_has_fit_and_add_auto_layout() {
    let (mut u, ids) = ui_with(&[0]);
    click_control(&mut u, Role::Button, "Add auto layout");
    assert!(doc_node(&u, ids[0]).layout.is_some());
    click_control(&mut u, Role::Button, "Remove auto layout");
    assert!(doc_node(&u, ids[0]).layout.is_none());
    let before = doc_node(&u, ids[0]).height;
    click_control(&mut u, Role::Button, "Fit to contents");
    assert!(u.app.ui.last_error.is_none(), "{:?}", u.app.ui.last_error);
    let _ = before;
}

#[test]
fn the_help_button_floats_at_the_panel_corner_and_opens_the_help_menu() {
    let (mut u, _) = ui_with(&[0]);
    let help = control(&mut u, Role::Button, "Help");
    let w = u.app.ui.right_width;
    assert!(help.rect.max.x > 1440.0 - 24.0 && help.rect.max.x <= 1440.0, "at the right edge: {:?}", help.rect);
    assert!(help.rect.max.y > 900.0 - 24.0 && help.rect.max.y <= 900.0, "at the foot: {:?}", help.rect);
    assert!(help.rect.min.x > 1440.0 - w);
    assert!(!u.app.ui.shortcuts_panel);
    click(&mut u, help.center());
    let t = drawn(&mut u);
    for s in ["Getting started", "Keyboard shortcuts", "Help page", "About FigCraft"] {
        assert!(t.iter().any(|(x, _)| x == s), "the help menu lacks {s:?}");
    }
    let p = t.iter().find(|(x, _)| x == "Keyboard shortcuts").unwrap().1;
    click(&mut u, p + vec2(10.0, 6.0));
    assert!(u.app.ui.shortcuts_panel, "Keyboard shortcuts opened the panel");
    // The panel has it on every tab.
    let (mut u, _) = ui_with(&[0]);
    u.app.ui.right_tab = crate::RightTab::Prototype;
    u.frame(vec![]);
    control(&mut u, Role::Button, "Help");
}

#[test]
fn an_empty_stroke_section_is_grey_with_only_a_plus() {
    let (mut u, ids) = ui_with(&[1]);
    let t = drawn(&mut u);
    assert!(t.iter().any(|(x, _)| x == "Stroke"));
    click_control(&mut u, Role::Button, "Add stroke");
    assert_eq!(doc_node(&u, ids[1]).strokes.len(), 1);
}

#[test]
fn selection_colors_list_the_colours_inside_and_change_them_in_one_step() {
    let (mut u, ids) = ui_with(&[0]);
    let (used, nested) = {
        let doc = u.app.session.doc().unwrap();
        crate::selection_colors::collect(doc, &[ids[0]])
    };
    assert!(nested);
    let hexes: Vec<String> = used.iter().map(|c| c.color.to_hex()).collect();
    for want in ["F8F8F8", "0D99FF", "F24822"] {
        assert!(hexes.iter().any(|h| h == want), "{want} is in use: {hexes:?}");
    }
    let blue = used.iter().find(|c| c.color.to_hex() == "0D99FF").unwrap().color;
    let steps = u.app.session.ds().unwrap().history.undo.len();
    let green = figcraft_color::Color::from_hex("14AE5C").unwrap();
    assert_eq!(crate::selection_colors::replace(&mut u.app, &[ids[0]], &blue, &green), 1);
    assert_eq!(doc_node(&u, ids[1]).fills[0].solid_color().map(|c| c.to_hex()).as_deref(), Some("14AE5C"));
    assert_eq!(u.app.session.ds().unwrap().history.undo.len(), steps + 1, "one undo step");
    u.app.run("edit.undo", json!({}));
    assert_eq!(doc_node(&u, ids[1]).fills[0].solid_color().map(|c| c.to_hex()).as_deref(), Some("0D99FF"));
    // The row names the section and counts the colours it doesn't show.
    let t = drawn(&mut u);
    assert!(t.iter().any(|(x, p)| x == "Selection colors" && p.x > 1200.0));
    // A lone layer has nothing inside it: no section.
    let (mut u, _) = ui_with(&[1]);
    assert!(!drawn(&mut u).iter().any(|(x, _)| x == "Selection colors"));
}

#[test]
fn the_export_section_is_a_scale_format_row_a_wide_button_and_a_preview() {
    let (mut u, ids) = ui_with(&[1]);
    u.app.run("export.add", json!({"ids": [ids[1]]}));
    u.frame(vec![]);
    let t = drawn(&mut u);
    let (button, preview) = (y_of(&t, "Export Card"), y_of(&t, "Preview"));
    assert!(button < preview, "the Preview row follows the button");
    let more = control(&mut u, Role::Button, "Export settings");
    let remove = control(&mut u, Role::Button, "Remove export setting");
    assert!(more.rect.max.x <= remove.rect.min.x + 0.5 && remove.rect.max.x <= 1440.0 - 8.0);
    // The suffix field moved into the settings menu.
    assert!(!t.iter().any(|(x, _)| x == "Suffix"));
    click(&mut u, more.center());
    assert!(drawn(&mut u).iter().any(|(x, _)| x == "Suffix"));
}

/// The panel at `width`: every control is inside it, and no two controls on screen overlap.
fn assert_clean_at(width: f32, which: &[usize]) {
    let (mut u, _) = ui_with(which);
    u.app.ui.right_width = width;
    u.frame(vec![]);
    u.frame(vec![]);
    let left = 1440.0 - width;
    let list: Vec<Control> = controls(&mut u)
        .into_iter()
        .filter(|c| {
            c.rect.min.x > left + 1.0
                && c.rect.min.y > 100.0
                && matches!(c.role, Role::SpinButton | Role::ComboBox | Role::Button | Role::CheckBox)
                && !matches!(c.label.as_str(), "Help" | "Apply variable" | "Detach variable")
        })
        .collect();
    assert!(list.len() > 15, "controls found at {width}: {}", list.len());
    for c in &list {
        assert!(c.rect.max.x <= 1440.0 + 0.5 && c.rect.min.x >= left, "{:?} {} is outside the panel at {width}: {:?}", c.role, c.label, c.rect);
    }
    for (i, a) in list.iter().enumerate() {
        for b in &list[i + 1..] {
            let o = a.rect.intersect(b.rect);
            assert!(!(o.width() > 1.0 && o.height() > 1.0), "{} and {} overlap at {width}: {:?} {:?}", a.label, b.label, a.rect, b.rect);
        }
    }
}

#[test]
fn the_panel_stays_clean_at_its_narrowest_and_widest() {
    for width in [240.0, 300.0, 480.0] {
        for which in [vec![0], vec![1], vec![2], vec![3], vec![1, 2]] {
            assert_clean_at(width, &which);
        }
    }
}
