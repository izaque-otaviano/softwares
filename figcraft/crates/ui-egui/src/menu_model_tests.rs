//! The menu model: the in-window main menu draws exactly [`menu_model::level`]'s rows; the macOS
//! menu bar has the same menus, items and states arranged as a Mac app's; picks from the native
//! menu run once, in the right place, and junk is ignored; the bar is handed over only when it
//! changed.

use std::sync::{Arc, Mutex};

use egui::{Pos2, RawInput, Rect, vec2};
use figcraft_engine::Session;
use figcraft_engine::keymap::{self, Platform};
use serde_json::json;

use crate::FigApp;
use crate::menu_model::{self, Action, Env, Native, Node, Role, Top};

/// What the native menu's platform side saw: the bars handed over and picks waiting.
#[derive(Clone, Default)]
struct Fake {
    bars: Arc<Mutex<Vec<Vec<Top>>>>,
    picks: Arc<Mutex<Vec<String>>>,
    clipboard: Arc<Mutex<Option<String>>>,
}

impl crate::Services for Fake {
    fn native_menu(&self) -> bool {
        true
    }
    fn set_native_menu(&mut self, bar: &[Top]) {
        self.bars.lock().unwrap().push(bar.to_vec());
    }
    fn native_menu_events(&mut self) -> Vec<String> {
        std::mem::take(&mut *self.picks.lock().unwrap())
    }
    fn clipboard_get_text(&mut self) -> Option<String> {
        self.clipboard.lock().unwrap().clone()
    }
}

struct H {
    ctx: egui::Context,
    app: FigApp,
    time: f64,
}

fn session(selected: bool) -> Session {
    let mut s = Session::new();
    let r = s.execute("shape.rectangle", &json!({"x": 10, "y": 10, "width": 100, "height": 50})).unwrap();
    s.execute("shape.rectangle", &json!({"x": 200, "y": 10, "width": 100, "height": 50})).unwrap();
    let rect = figcraft_engine::params::id_of(r.get("id").unwrap()).unwrap();
    s.ds_mut().unwrap().selection = if selected { vec![rect] } else { vec![] };
    s
}

impl H {
    fn new(s: Session, services: Box<dyn crate::Services>) -> Self {
        let mut h = Self { ctx: egui::Context::default(), app: FigApp::new(s, services), time: 0.0 };
        h.app.ui.home = false;
        for _ in 0..3 {
            h.frame(vec![]);
        }
        h
    }

    /// A frame on a tall screen (the longest menus fit), with these input events.
    fn frame(&mut self, events: Vec<egui::Event>) -> egui::FullOutput {
        self.time += 1.0 / 60.0;
        let input = RawInput {
            screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(1440.0, 3000.0))),
            time: Some(self.time),
            events,
            ..Default::default()
        };
        let app = &mut self.app;
        let mut out = self.ctx.run_ui(input, |ui| app.ui(ui));
        out.textures_delta.clear();
        out
    }

    fn env_exists(p: &str) -> bool {
        std::path::Path::new(p).exists()
    }
}

/// A menu's rows as the screen reader reads them: (label, greyed).
fn rows(nodes: &[Node]) -> Vec<(String, bool)> {
    nodes
        .iter()
        .filter_map(|n| match n {
            Node::Item(it) => Some((it.label.clone(), !it.enabled)),
            Node::Submenu { label, .. } => Some((label.clone(), false)),
            Node::Separator | Node::Native(_) => None,
        })
        .collect()
}

/// The menu rows drawn this frame, column by column (each open menu is a column), top to bottom.
fn drawn_columns(out: &egui::FullOutput) -> Vec<Vec<(String, bool)>> {
    use egui::accesskit::Role as R;
    let Some(update) = out.platform_output.accesskit_update.as_ref() else { return vec![] };
    let mut cells: Vec<(i64, f64, String, bool)> = update
        .nodes
        .iter()
        .map(|(_, n)| n)
        .filter(|n| matches!(n.role(), R::MenuItem | R::MenuItemCheckBox))
        .filter_map(|n| n.bounds().map(|b| (b.x0.round() as i64, b.y0, n.label().unwrap_or_default().to_string(), n.is_disabled())))
        .collect();
    cells.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
    let mut cols: Vec<(i64, Vec<(String, bool)>)> = Vec::new();
    for (x, _, label, off) in cells {
        match cols.last_mut() {
            Some((cx, col)) if *cx == x => col.push((label, off)),
            _ => cols.push((x, vec![(label, off)])),
        }
    }
    cols.into_iter().map(|(_, c)| c).collect()
}

#[test]
fn the_in_window_main_menu_draws_the_model_rows_for_every_menu() {
    for selected in [true, false] {
        let mut h = H::new(session(selected), Box::new(crate::NoServices));
        h.ctx.enable_accesskit();
        for top in crate::menus::TOP_MENUS {
            h.app.ui.main_menu = true;
            crate::menus::open_main_menu(&h.ctx, top);
            h.frame(vec![]);
            let out = h.frame(vec![]);
            let env = Env { one_window: h.ctx.embed_viewports(), exists: &H::env_exists };
            let want = rows(&menu_model::level(&h.app, top, &env));
            assert!(!want.is_empty(), "{top} has items");
            let cols = drawn_columns(&out);
            assert!(cols.contains(&want), "{top} (selected: {selected}) draws {want:?}; drawn columns: {cols:?}");
        }
    }
}

#[test]
fn a_click_in_the_in_window_menu_runs_the_model_action() {
    let mut h = H::new(session(true), Box::new(crate::NoServices));
    h.ctx.enable_accesskit();
    let before = h.app.session.undo_depth().0;
    h.app.ui.main_menu = true;
    crate::menus::open_main_menu(&h.ctx, "Object");
    h.frame(vec![]);
    let out = h.frame(vec![]);
    let label = crate::i18n::menu_item("object.group", "Group selection").into_owned();
    let update = out.platform_output.accesskit_update.unwrap();
    let b = update.nodes.iter().map(|(_, n)| n).find(|n| n.label() == Some(label.as_str())).and_then(|n| n.bounds()).expect("Group selection row");
    let p = Pos2::new(((b.x0 + b.x1) / 2.0) as f32, ((b.y0 + b.y1) / 2.0) as f32);
    let button = |pressed| egui::Event::PointerButton { pos: p, button: egui::PointerButton::Primary, pressed, modifiers: Default::default() };
    h.frame(vec![egui::Event::PointerMoved(p)]);
    h.frame(vec![button(true)]);
    h.frame(vec![button(false)]);
    assert_eq!(h.app.session.undo_depth().0, before + 1, "grouped once");
    assert!(!h.app.ui.main_menu, "the menu closes");
}

fn mac_bar(app: &FigApp) -> Vec<Top> {
    menu_model::mac_bar(app, &Env { one_window: false, exists: &|_| true }, false)
}

fn commands(nodes: &[Node], out: &mut Vec<&'static str>) {
    for n in nodes {
        match n {
            Node::Item(it) => {
                if let Action::Command(id) = it.action {
                    out.push(id);
                }
            }
            Node::Submenu { children, .. } => commands(children, out),
            Node::Separator | Node::Native(_) => {}
        }
    }
}

#[test]
fn the_mac_menu_bar_is_the_main_menu_arranged_as_a_mac_app() {
    let app = FigApp::new(session(true), Box::new(crate::NoServices));
    let bar = mac_bar(&app);
    let keys: Vec<&str> = bar.iter().map(|t| t.key).collect();
    assert_eq!(keys, ["FigCraft", "File", "Edit", "View", "Object", "Text", "Arrange", "Vector", "Plugins", "Libraries", "Window", "Help"]);
    assert_eq!(bar.iter().map(|t| t.role).collect::<Vec<_>>().first(), Some(&Role::App));
    assert_eq!(bar.iter().find(|t| t.key == "Window").map(|t| t.role), Some(Role::Window));
    assert_eq!(bar.last().map(|t| t.role), Some(Role::Help));
    // The menus that stay are the in-window ones, item for item.
    let env = Env { one_window: false, exists: &|_| true };
    let inside = menu_model::in_window(&app, &env);
    for top in &bar {
        if let Some(same) = inside.iter().find(|t| t.key == top.key && !matches!(t.key, "Help")) {
            assert_eq!(top.items, same.items, "{} is the in-window menu", top.key);
            assert_eq!(top.label, same.label);
        }
    }
    // Every command of the in-window menu is in the bar once: About and Preferences… moved to
    // the app menu, the Preferences toggles into its Preferences submenu.
    let (mut a, mut b) = (vec![], vec![]);
    for t in &inside {
        commands(&t.items, &mut a);
    }
    for t in &bar {
        commands(&t.items, &mut b);
    }
    a.sort_unstable();
    b.sort_unstable();
    assert_eq!(a, b);
    // The app menu: About, Preferences… (⌘,), the toggles, Services, Hide/Hide Others/Show All,
    // Quit (⌘Q) last.
    let app_menu = &bar[0].items;
    let first = |n: &Node| matches!(n, Node::Item(it) if it.action == Action::Command("help.about"));
    assert!(app_menu.first().is_some_and(first));
    let prefs = app_menu.iter().find_map(|n| match n {
        Node::Item(it) if it.action == Action::Command("app.preferences") => Some(it),
        _ => None,
    });
    assert_eq!(prefs.and_then(|p| p.shortcut), Some("Cmd+,"));
    assert!(app_menu.iter().any(|n| matches!(n, Node::Submenu { key, children, .. } if key == "Preferences" && !children.is_empty())));
    for n in [Native::Services, Native::Hide, Native::HideOthers, Native::ShowAll] {
        assert!(app_menu.contains(&Node::Native(n)), "{n:?}");
    }
    match app_menu.last() {
        Some(Node::Item(q)) => {
            assert_eq!(q.action, Action::Quit);
            assert_eq!(q.shortcut, Some("Cmd+Q"));
        }
        other => panic!("Quit last, not {other:?}"),
    }
    // No separator at a menu's ends or twice in a row.
    for t in &bar {
        let seps: Vec<bool> = t.items.iter().map(|n| *n == Node::Separator).collect();
        assert!(seps.first() != Some(&true) && seps.last() != Some(&true), "{} ends", t.key);
        assert!(!seps.windows(2).any(|w| w[0] && w[1]), "{} doubles a separator", t.key);
    }
}

#[test]
fn the_window_menu_lists_the_open_files_with_the_active_one_checked() {
    let mut s = session(false);
    s.execute("file.new", &json!({})).unwrap();
    let app = FigApp::new(s, Box::new(crate::NoServices));
    let bar = mac_bar(&app);
    let window = &bar.iter().find(|t| t.key == "Window").unwrap().items;
    assert_eq!(window[..2], [Node::Native(Native::Minimize), Node::Native(Native::Zoom)]);
    let files: Vec<(&str, Option<bool>)> = window
        .iter()
        .filter_map(|n| match n {
            Node::Item(it) => Some((it.label.as_str(), it.checked)),
            _ => None,
        })
        .collect();
    assert_eq!(files.len(), app.session.docs.len());
    assert_eq!(files.iter().filter(|f| f.1 == Some(true)).count(), 1, "{files:?}");
}

#[test]
fn ids_round_trip_and_junk_is_not_an_action() {
    let app = FigApp::new(session(true), Box::new(crate::NoServices));
    let bar = mac_bar(&app);
    let items = menu_model::items_of(&bar);
    assert!(items.len() > 150, "{} items", items.len());
    for it in items {
        assert_eq!(Action::parse(&it.action.id()).as_ref(), Some(&it.action), "{}", it.action.id());
    }
    for a in [
        Action::Recent(3),
        Action::ClearRecent,
        Action::MoveToPage(figcraft_doc::NodeId(42)),
        Action::Plugin { plugin: "a:b\"c".into(), command: "x/y".into() },
        Action::Widget("w:1".into()),
        Action::Tab(7),
        Action::Quit,
    ] {
        assert_eq!(Action::parse(&a.id()), Some(a));
    }
    for junk in [
        "",
        ":",
        "cmd:",
        "cmd:not.a.command",
        "cmd:tool.move:extra",
        "recent:-1",
        "recent:99999999999999999999999",
        "recent-clear:x",
        "quit:now",
        "page:abc",
        "plugin:[\"only one\"]",
        "plugin:{",
        "widget:3",
        "tab:",
        "\u{0}",
        "é:é",
    ] {
        assert_eq!(Action::parse(junk), None, "{junk:?}");
    }
    assert_eq!(Action::parse(&"x".repeat(1 << 20)), None);
}

/// A small deterministic generator for junk ids.
fn junk(seed: &mut u64) -> String {
    const PARTS: [&str; 14] = ["cmd:", "recent:", "page:", "plugin:", "widget:", "tab:", "quit", "[", "\"", "]", "9", "-", "file.save", "é"];
    let mut out = String::new();
    for _ in 0..(*seed % 6) {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 7;
        *seed ^= *seed << 17;
        out.push_str(PARTS[(*seed % PARTS.len() as u64) as usize]);
    }
    *seed = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    out
}

#[test]
fn junk_picked_from_the_native_menu_does_nothing() {
    let p = Fake::default();
    let mut h = H::new(session(true), Box::new(p.clone()));
    let before = (h.app.session.undo_depth(), h.app.session.docs.len());
    let mut seed = 0x1234_5678_u64;
    let mut n = 0;
    while n < 3000 {
        let id = junk(&mut seed);
        // (Real ids would run their command: only junk here.)
        if Action::parse(&id).is_some() {
            continue;
        }
        n += 1;
        p.picks.lock().unwrap().push(id);
        if n % 100 == 0 {
            h.frame(vec![]);
        }
    }
    h.frame(vec![]);
    assert_eq!((h.app.session.undo_depth(), h.app.session.docs.len()), before);
    assert!(!h.app.ui.quit && !h.app.ui.confirm_quit);
}

#[test]
fn a_native_pick_runs_its_command_once_and_greyed_ones_say_why() {
    let p = Fake::default();
    let mut h = H::new(session(true), Box::new(p.clone()));
    let before = h.app.session.undo_depth().0;
    p.picks.lock().unwrap().push(Action::Command("object.group").id());
    h.frame(vec![]);
    h.frame(vec![]);
    assert_eq!(h.app.session.undo_depth().0, before + 1, "grouped once");
    // Nothing selected: greyed, and picking it says why instead.
    h.app.session.ds_mut().unwrap().selection.clear();
    h.app.ui.toast = None;
    p.picks.lock().unwrap().push(Action::Command("object.group").id());
    h.frame(vec![]);
    assert_eq!(h.app.session.undo_depth().0, before + 1);
    assert_eq!(h.app.ui.toast.as_ref().map(|t| t.0.as_str()), Some(crate::i18n::tr("Select a layer first")));
}

#[test]
fn while_a_field_has_the_keyboard_its_editing_keys_go_to_it_and_the_rest_run() {
    let p = Fake::default();
    *p.clipboard.lock().unwrap() = Some("pasted".into());
    let mut h = H::new(session(true), Box::new(p.clone()));
    let before = h.app.session.undo_depth().0;
    // The Actions palette's field has the keyboard.
    h.app.ui.palette = Some(String::new());
    h.frame(vec![]);
    for id in ["object.group", "edit.copy", "edit.paste", "edit.undo"] {
        p.picks.lock().unwrap().push(Action::Command(id).id());
    }
    h.frame(vec![]);
    // Group selection isn't the field's: it ran (once). Copy, paste and undo are its keys.
    assert_eq!(h.app.session.undo_depth().0, before + 1, "grouped once, not undone");
    let keys = std::mem::take(&mut h.app.control_input);
    let undo = menu_model::key_events(crate::shortcuts::shortcut("edit.undo").unwrap(), None);
    assert_eq!(keys.len(), 2 + undo.len(), "{keys:?}");
    assert_eq!(keys[..2], [egui::Event::Copy, egui::Event::Paste("pasted".into())]);
    assert_eq!(keys[2..], undo[..]);
    let cmd = egui::Modifiers { mac_cmd: true, command: true, ..Default::default() };
    let z = |pressed| egui::Event::Key { key: egui::Key::Z, physical_key: Some(egui::Key::Z), pressed, repeat: false, modifiers: cmd };
    assert_eq!(menu_model::key_events(keymap::primary("edit.undo", Platform::Mac).unwrap(), None), vec![z(true), z(false)]);
}

#[test]
fn in_the_text_editor_its_text_shortcuts_go_to_it() {
    let p = Fake::default();
    let mut s = Session::new();
    let t = s.execute("text.create", &json!({"x": 10, "y": 100, "text": "Hello"})).unwrap();
    let id = figcraft_engine::params::id_of(t.get("id").unwrap()).unwrap();
    s.ds_mut().unwrap().selection = vec![id];
    let mut h = H::new(s, Box::new(p.clone()));
    h.app.session.execute("text.edit.begin", &json!({"id": id})).unwrap();
    assert!(h.app.session.ds().unwrap().text_edit.is_some());
    // A command the text editor has a key for while editing: handed over as that key.
    let live: Vec<&'static str> = figcraft_engine::catalog::items()
        .map(|m| m.id)
        .filter(|id| {
            crate::shortcuts::shortcut(id)
                .filter(|s| menu_model::native_key(s).is_some())
                .and_then(keymap::parse)
                .is_some_and(|(m, k)| keymap::lookup(crate::shortcuts::platform(), keymap::Context::Text, k, m).is_some_and(|b| b.id == *id))
        })
        .collect();
    let cmd = live.iter().copied().find(|id| !id.starts_with("edit.") && *id != "select.all").expect("a text shortcut with ⌘ (bold, italic…)");
    p.picks.lock().unwrap().push(Action::Command(cmd).id());
    h.frame(vec![]);
    let keys = std::mem::take(&mut h.app.control_input);
    assert_eq!(keys, menu_model::key_events(crate::shortcuts::shortcut(cmd).unwrap(), None), "{cmd}");
}

#[test]
fn the_bar_is_handed_over_only_when_it_changes() {
    let p = Fake::default();
    let mut h = H::new(session(true), Box::new(p.clone()));
    let n = p.bars.lock().unwrap().len();
    assert!(n >= 1);
    for _ in 0..5 {
        h.frame(vec![]);
    }
    assert_eq!(p.bars.lock().unwrap().len(), n, "an idle frame hands nothing over");
    // The selection changes what's greyed, not the menus' shape.
    h.app.session.ds_mut().unwrap().selection.clear();
    h.frame(vec![]);
    let bars = p.bars.lock().unwrap().clone();
    assert_eq!(bars.len(), n + 1);
    let (a, b) = (&bars[n - 1], &bars[n]);
    assert!(menu_model::same_shape(a, b) && a != b);
    // A new recent file changes the shape (File ▸ Open recent has another item).
    h.app.session.prefs.recent_files.insert(0, "/nowhere/else.figcraft".into());
    h.frame(vec![]);
    let bars = p.bars.lock().unwrap().clone();
    assert!(!menu_model::same_shape(&bars[bars.len() - 2], &bars[bars.len() - 1]));
}

#[test]
fn quit_asks_about_unsaved_changes_first() {
    let p = Fake::default();
    let mut s = Session::empty();
    s.execute("file.new", &json!({})).unwrap();
    let mut h = H::new(s, Box::new(p.clone()));
    assert!(!h.app.session.docs.iter().any(|d| d.is_dirty()));
    p.picks.lock().unwrap().push(Action::Quit.id());
    h.frame(vec![]);
    assert!(h.app.ui.quit, "nothing unsaved: quits at once");
    let p = Fake::default();
    let mut h = H::new(session(true), Box::new(p.clone()));
    p.picks.lock().unwrap().push(Action::Quit.id());
    h.frame(vec![]);
    assert!(!h.app.ui.quit && h.app.ui.confirm_quit, "unsaved changes: asks");
}

#[test]
fn only_command_and_control_shortcuts_become_native_keys() {
    use menu_model::{NativeKey, native_key};
    let k = |code, cmd, ctrl, alt, shift| Some(NativeKey { code, cmd, ctrl, alt, shift });
    assert_eq!(native_key("Cmd+S"), k("KeyS", true, false, false, false));
    assert_eq!(native_key("Shift+Cmd+K"), k("KeyK", true, false, false, true));
    assert_eq!(native_key("Ctrl+Cmd+F"), k("KeyF", true, true, false, false));
    assert_eq!(native_key("Cmd+,"), k("Comma", true, false, false, false));
    assert_eq!(native_key("Cmd+="), k("Equal", true, false, false, false));
    assert_eq!(native_key("Cmd+Delete"), k("Backspace", true, false, false, false));
    assert_eq!(native_key("Alt+Cmd+1"), k("Digit1", true, false, true, false));
    for plain in ["R", "Shift+A", "Alt+A", "Delete", "Shift+1", "", "Cmd+", "Cmd+Nope", "Cmd+K+J"] {
        assert_eq!(native_key(plain), None, "{plain:?}");
    }
    // Every ⌘/⌃ shortcut of a menu item gets one (no key it can't name).
    for m in figcraft_engine::catalog::items() {
        let Some(spec) = keymap::primary(m.id, Platform::Mac) else { continue };
        let Some((mods, _)) = keymap::parse(spec) else { continue };
        if mods.cmd || mods.ctrl {
            assert!(native_key(spec).is_some(), "{}: {spec}", m.id);
        }
    }
}

#[test]
fn key_presses_are_what_egui_winit_makes_of_them() {
    use menu_model::key_events;
    assert_eq!(key_events("Cmd+C", None), vec![egui::Event::Copy]);
    assert_eq!(key_events("Cmd+X", None), vec![egui::Event::Cut]);
    assert_eq!(key_events("Cmd+V", Some("a\r\nb".into())), vec![egui::Event::Paste("a\nb".into())]);
    let cmd = egui::Modifiers { mac_cmd: true, command: true, ..Default::default() };
    let key = |key, pressed| egui::Event::Key { key, physical_key: Some(key), pressed, repeat: false, modifiers: cmd };
    // An image-only clipboard: the key itself (the app pastes the image from it).
    assert_eq!(key_events("Cmd+V", None), vec![key(egui::Key::V, true), key(egui::Key::V, false)]);
    assert_eq!(key_events("Cmd+Z", None), vec![key(egui::Key::Z, true), key(egui::Key::Z, false)]);
    assert_eq!(key_events("Cmd+=", None), vec![key(egui::Key::Equals, true), key(egui::Key::Equals, false)]);
    assert!(key_events("nonsense+", None).is_empty());
}
