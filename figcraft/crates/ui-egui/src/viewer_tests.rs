//! The viewer: a shared prototype plays locked (nothing leads back to the editor, no comments or
//! Inspect), a file that can't be opened says so, and File ▸ Export prototype as website… writes
//! a site that opens in it. Driven headless through egui (`present_tests`' harness, 1440×900).

use std::path::PathBuf;

use egui::{Event, Key, Modifiers, Pos2, Rect, Shape, pos2};
use figcraft_doc::NodeId;
use figcraft_engine::Session;
use figcraft_engine::share::{self, ViewerConfig};
use serde_json::{Value, json};

use crate::present_tests::{Ui, id};
use crate::{FigApp, Services};

fn frame(s: &mut Session, name: &str, x: f64) -> NodeId {
    id(&s.execute("frame.create", &json!({"x": x, "y": 0, "width": 300, "height": 400, "name": name})).unwrap())
}

/// Screens Home and Next, Home's click going to Next; the viewer locked on Home.
fn viewing() -> (Ui, [NodeId; 2]) {
    let mut s = Session::new();
    let ids = [("Home", 0.0), ("Next", 400.0)].map(|(n, x)| frame(&mut s, n, x));
    s.execute("proto.interaction.add", &json!({"id": ids[0], "action": {"type": "navigate", "dest": ids[1]}})).unwrap();
    let mut u = Ui::new(s);
    super::lock(&mut u.app, ids[0], "Shop".into());
    u.frames(3, Vec::new);
    (u, ids)
}

fn presenter(u: &Ui) -> Value {
    u.app.inspect()["presenter"].clone()
}

fn screen(u: &Ui) -> String {
    presenter(u)["name"].as_str().unwrap_or_default().to_string()
}

fn press(u: &mut Ui, key: Key, modifiers: Modifiers) {
    let k = |pressed| Event::Key { key, physical_key: None, pressed, repeat: false, modifiers };
    u.frame(vec![Event::PointerMoved(pos2(720.0, 450.0)), k(true), k(false)]);
}

/// The middle of the bar's control `name`.
fn control_at(u: &Ui, name: &str) -> Pos2 {
    let r = &presenter(u)["controls"][name];
    let f = |i: usize| r[i].as_f64().unwrap_or_else(|| panic!("no control {name:?}")) as f32;
    pos2((f(0) + f(2)) / 2.0, (f(1) + f(3)) / 2.0)
}

fn click_at_control(u: &mut Ui, name: &str) {
    let at = control_at(u, name);
    u.button(at, true);
    u.button(at, false);
    u.frames(2, Vec::new);
}

fn click_options(u: &mut Ui) {
    click_at_control(u, "options");
}

/// The texts one frame draws.
fn texts(u: &mut Ui) -> Vec<String> {
    u.time += 1.0 / 60.0;
    let input = egui::RawInput { screen_rect: Some(Rect::from_min_size(Pos2::ZERO, u.size)), time: Some(u.time), ..Default::default() };
    let app = &mut u.app;
    let mut out = u.ctx.run_ui(input, |ui| app.ui(ui));
    out.textures_delta.clear();
    fn walk(s: &Shape, into: &mut Vec<String>) {
        match s {
            Shape::Vec(v) => v.iter().for_each(|s| walk(s, into)),
            Shape::Text(t) => into.push(t.galley.text().to_string()),
            _ => {}
        }
    }
    let mut v = Vec::new();
    out.shapes.iter().for_each(|c| walk(&c.shape, &mut v));
    v
}

fn tr(s: &str) -> String {
    crate::i18n::tr(s).to_string()
}

#[test]
fn a_shared_prototype_has_no_way_back_to_the_editor() {
    let (mut u, [_, next]) = viewing();
    let p = presenter(&u);
    assert_eq!(p["name"], "Home");
    let v = u.app.inspect()["viewer"].clone();
    assert_eq!((v["title"].clone(), v["error"].clone()), (json!("Shop"), Value::Null), "{v}");
    assert_eq!(super::title(&u.app).as_deref(), Some("Shop"));
    let controls = p["controls"].as_object().unwrap();
    // No comments, no way to share or export the file, no profile; the mark is a mark and no menu.
    for gone in ["comments", "share", "avatar"] {
        assert!(!controls.contains_key(gone), "{gone} shown: {controls:?}");
    }
    for kept in ["logo", "file", "options", "fullscreen"] {
        assert!(controls.contains_key(kept), "{kept} missing: {controls:?}");
    }
    // The Options menu has no Inspect, no way to close the presentation or to leave for a window.
    click_options(&mut u);
    let menu = texts(&mut u);
    let has = |label: &str| menu.iter().any(|t| t.trim().trim_start_matches('\u{2713}').trim() == tr(label));
    for gone in ["Inspect", "Close the presentation", "Open in new window"] {
        assert!(!has(gone), "{gone} in the menu: {menu:?}");
    }
    for kept in ["Restart", "Screens", "Keyboard shortcuts", "Hide UI"] {
        assert!(has(kept), "{kept} missing from the menu: {menu:?}");
    }
    press(&mut u, Key::Escape, Modifiers::NONE);
    // The mark does nothing: there is no editor behind it.
    click_at_control(&mut u, "logo");
    assert!(!u.app.ui.main_menu);
    // Escape, again and again: still presenting (it first shows the hidden controls, closes the list).
    press(&mut u, Key::Backslash, Modifiers::COMMAND);
    assert_eq!(presenter(&u)["hideUi"], json!(true));
    for _ in 0..3 {
        press(&mut u, Key::Escape, Modifiers::NONE);
    }
    assert_eq!(presenter(&u)["hideUi"], json!(false));
    assert!(u.app.inspect()["presenting"].as_bool().unwrap());
    // No comments (C, Shift+C), no Inspect (even when asked for over the control channel).
    press(&mut u, Key::C, Modifiers::NONE);
    press(&mut u, Key::C, Modifiers::SHIFT);
    u.run("proto.presentOptions", json!({"inspect": true}));
    u.frame(vec![]);
    let v = &presenter(&u);
    assert_eq!((v["comments"].clone(), v["inspect"].clone()), (json!(false), json!(false)), "{v}");
    // The editor's panels never draw; the prototype still plays.
    let shown = texts(&mut u);
    assert!(!shown.iter().any(|t| *t == tr("Layers") || *t == tr("Design")), "{shown:?}");
    u.button(pos2(720.0, 450.0), true);
    u.button(pos2(720.0, 450.0), false);
    u.frames(30, Vec::new);
    assert_eq!(screen(&u), "Next");
    assert_eq!(presenter(&u)["current"], json!(next));
    // Restart (R) goes back to the start.
    press(&mut u, Key::R, Modifiers::NONE);
    assert_eq!(screen(&u), "Home");
    // Even a presentation that ended somehow starts again: the editor never shows.
    u.app.ui.present = None;
    u.frames(2, Vec::new);
    assert_eq!(screen(&u), "Home");
}

#[test]
fn the_shortcut_list_leaves_out_what_a_shared_prototype_cannot_do() {
    let (mut u, _) = viewing();
    press(&mut u, Key::Questionmark, Modifiers::NONE);
    let shown = texts(&mut u);
    assert!(shown.contains(&tr("Restart")) && shown.contains(&tr("Hide UI")), "{shown:?}");
    assert!(!shown.contains(&tr("Close the presentation")) && !shown.contains(&tr("Comments")), "{shown:?}");
    // The Options menu has no "Open in new window" (a window of its own leaves the editor's behind).
    let at = {
        let r = &presenter(&u)["controls"]["options"];
        pos2(((r[0].as_f64().unwrap() + r[2].as_f64().unwrap()) / 2.0) as f32, ((r[1].as_f64().unwrap() + r[3].as_f64().unwrap()) / 2.0) as f32)
    };
    press(&mut u, Key::Escape, Modifiers::NONE);
    u.button(at, true);
    u.button(at, false);
    let shown = texts(&mut u);
    assert!(shown.iter().any(|t| t.contains(&tr("Keyboard shortcuts"))), "the menu is open: {shown:?}");
    assert!(!shown.iter().any(|t| t.contains(&tr("Open in new window"))), "{shown:?}");
}

#[test]
fn a_file_that_cannot_be_opened_says_so() {
    let mut u = Ui::new(Session::empty());
    let cfg = ViewerConfig::for_file("prototype.figcraft").unwrap();
    assert!(!super::open(&mut u.app, b"this is no figcraft file", &cfg));
    let shown = texts(&mut u);
    assert!(shown.contains(&tr("This prototype couldn't be opened")), "{shown:?}");
    assert!(shown.iter().any(|t| t.starts_with("prototype.figcraft: ")), "{shown:?}");
    assert!(!u.app.inspect()["presenting"].as_bool().unwrap());
    // Keys do nothing there (no editor to reach either).
    press(&mut u, Key::Escape, Modifiers::NONE);
    assert!(texts(&mut u).contains(&tr("This prototype couldn't be opened")));
}

#[test]
fn a_shared_file_opens_at_its_start_with_its_title() {
    let mut s = Session::new();
    let [_, b] = [("A", 0.0), ("B", 400.0)].map(|(n, x)| frame(&mut s, n, x));
    s.execute("proto.flow.add", &json!({"start": b, "name": "Signup"})).unwrap();
    let bytes = figcraft_format::save_bytes(&s.doc().unwrap().clone(), None).unwrap();
    let mut u = Ui::new(Session::empty());
    assert!(super::open(&mut u.app, &bytes, &ViewerConfig::for_file("p.figcraft").unwrap()));
    u.frames(3, Vec::new);
    assert_eq!(screen(&u), "B");
    assert_eq!(super::title(&u.app).as_deref(), Some("Signup"));
    // A start the address names wins.
    let mut u = Ui::new(Session::empty());
    assert!(super::open(&mut u.app, &bytes, &ViewerConfig::for_file("p.figcraft").unwrap().with_query("?start=A")));
    u.frames(3, Vec::new);
    assert_eq!(screen(&u), "A");
}

/// Services that pick the folders a test gives, in order.
struct Picks(Vec<PathBuf>, std::rc::Rc<std::cell::RefCell<Vec<PathBuf>>>);
impl Services for Picks {
    fn pick_folder(&mut self, _title: &str) -> Option<PathBuf> {
        (!self.0.is_empty()).then(|| self.0.remove(0))
    }
    fn reveal_path(&mut self, path: &std::path::Path) {
        self.1.borrow_mut().push(path.to_path_buf());
    }
}

#[test]
fn the_menu_exports_into_a_folder_of_its_own_and_cancelling_does_nothing() {
    let root = std::env::temp_dir().join(format!("figcraft-viewer-menu-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let bundle = root.join("dist");
    std::fs::create_dir_all(&bundle).unwrap();
    std::fs::write(bundle.join("index.html"), "<title>FigCraft</title>").unwrap();
    std::fs::write(bundle.join("figcraft-web-1_bg.wasm"), "w").unwrap();
    let dest = root.join("Desktop");
    std::fs::create_dir_all(&dest).unwrap();
    std::fs::write(dest.join("holiday.jpg"), "x").unwrap();
    let mut s = Session::new();
    frame(&mut s, "Home", 0.0);
    s.execute("file.rename", &json!({"name": "Shop / v2"})).unwrap();
    let revealed = std::rc::Rc::new(std::cell::RefCell::new(Vec::new()));
    // Cancelled: nothing written, nothing said wrong.
    let mut app = FigApp::new(s, Box::new(Picks(vec![], revealed.clone())));
    super::export_dialog(&mut app);
    assert!(app.ui.last_error.is_none());
    // The web build, then where to put the site: a folder of its own next to the other things there.
    app.services = Box::new(Picks(vec![bundle, dest.clone()], revealed.clone()));
    super::export_dialog(&mut app);
    assert!(app.ui.last_error.is_none(), "{:?}", app.ui.last_error);
    let site = dest.join("Shop _ v2 (site)");
    assert!(site.join("index.html").is_file() && site.join(share::CONFIG_FILE).is_file() && site.join(share::DOC_FILE).is_file());
    assert_eq!(revealed.borrow().as_slice(), std::slice::from_ref(&site));
    assert!(dest.join("holiday.jpg").is_file());
    // It opens in the viewer.
    let (cfg, bytes) = share::read_site(&site).unwrap();
    let mut u = Ui::new(Session::empty());
    assert!(super::open(&mut u.app, &bytes, &cfg));
    u.frames(3, Vec::new);
    assert_eq!(screen(&u), "Home");
    let _ = std::fs::remove_dir_all(&root);
}
