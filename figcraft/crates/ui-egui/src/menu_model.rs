//! The main menu as data: one tree, built from the engine's menu catalog and the app's state, that
//! both the in-window main menu (the logo button, [`crate::menus`]) and the macOS menu bar draw.
//! Same items, order, separators, submenus, labels (translated the same way), shortcuts and
//! enabled/checked states, so the two can't drift apart.
//!
//! - [`level`] builds one menu ("File", "Edit/Copy as"); [`in_window`] the main menu's top level.
//! - [`mac_bar`] arranges the same menus as a macOS menu bar: the app menu (About, Preferences…,
//!   the Preferences toggles, Services, Hide/Hide Others/Show All, Quit), the catalog's menus, a
//!   Window menu (Minimize, Zoom, the open files) and Help.
//! - [`Action`] is what an item does; [`Action::id`] / [`Action::parse`] carry it through the
//!   platform menu as a string (junk from there is ignored), and [`run`] does it.
//! - [`native_frame`] runs at the start and end of every window's frame on a platform with a
//!   native menu bar ([`crate::Services::native_menu`]): it takes the items picked since the last
//!   frame and hands the platform the bar again when something in it changed.
//!
//! Shortcuts and the native menu: a native key equivalent takes its key press before egui sees it,
//! and the platform then reports the item as picked. So only shortcuts with ⌘ or ⌃ get a native key
//! ([`native_key`]): plain keys, Shift and Option keys would be taken from text fields, so the
//! native menu doesn't show them (the in-window menu and tooltips do). An item picked natively while
//! a text field or the canvas text editor has the keyboard, whose key that field acts on (undo,
//! redo, cut, copy, paste, select all; in the text editor also its text shortcuts, ⌘B and the
//! like), is handed to egui as the key press it stands for ([`key_events`]), so ⌘C copies the text
//! being edited and ⌘Z undoes typing, as the key would; anything else runs like a click in the
//! in-window menu. Either way a key press runs its command once: the native menu takes it and egui
//! never sees it, or (its item greyed) the native menu lets it through to egui.

use figcraft_doc::NodeId;
use figcraft_engine::catalog::{MENU, SEP};
use serde_json::json;

use crate::FigApp;
use crate::i18n::{self, tr, tr_noop, trf};

/// One row of a menu.
#[derive(Clone, Debug, PartialEq)]
pub enum Node {
    Item(Item),
    Separator,
    /// `key` is unique among the menus (the English path, "Edit/Copy as"); `label` is shown.
    Submenu {
        key: String,
        label: String,
        children: Vec<Node>,
    },
    /// An item the platform provides (macOS only).
    Native(Native),
}

/// A clickable row.
#[derive(Clone, Debug, PartialEq)]
pub struct Item {
    pub action: Action,
    pub label: String,
    /// The key in [`figcraft_engine::keymap`] notation (`Shift+Cmd+K`).
    pub shortcut: Option<&'static str>,
    pub enabled: bool,
    /// Why it's greyed (an English key for [`tr`]), shown on hover.
    pub why: Option<&'static str>,
    /// `Some` for a toggle: whether it's on.
    pub checked: Option<bool>,
}

/// Items of the platform's own (macOS).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Native {
    Services,
    Hide,
    HideOthers,
    ShowAll,
    Minimize,
    Zoom,
}

impl Native {
    /// The label (translated).
    pub fn label(self) -> &'static str {
        match self {
            Native::Services => tr("Services"),
            Native::Hide => tr("Hide FigCraft"),
            Native::HideOthers => tr("Hide Others"),
            Native::ShowAll => tr("Show All"),
            Native::Minimize => tr("Minimize"),
            Native::Zoom => tr("Zoom"),
        }
    }
}

/// What picking an item does.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Action {
    /// A catalog command, as a click in the menu runs it ([`crate::menus::invoke`]).
    Command(&'static str),
    /// File ▸ Open recent: the file at this index of the recent files.
    Recent(usize),
    ClearRecent,
    /// Object ▸ Move to page: the selection to this page.
    MoveToPage(NodeId),
    /// An installed plugin's command.
    Plugin {
        plugin: String,
        command: String,
    },
    /// Plugins ▸ Widgets: insert this plugin's widget.
    Widget(String),
    /// Window ▸ an open file (its uid).
    Tab(u64),
    /// Quit FigCraft, asking about unsaved changes first.
    Quit,
}

impl Action {
    /// The action as a string for a platform menu item's id.
    pub fn id(&self) -> String {
        match self {
            Action::Command(id) => format!("cmd:{id}"),
            Action::Recent(i) => format!("recent:{i}"),
            Action::ClearRecent => "recent-clear".into(),
            Action::MoveToPage(p) => format!("page:{}", p.0),
            Action::Plugin { plugin, command } => format!("plugin:{}", json!([plugin, command])),
            Action::Widget(p) => format!("widget:{}", json!(p)),
            Action::Tab(uid) => format!("tab:{uid}"),
            Action::Quit => "quit".into(),
        }
    }

    /// The action [`Action::id`] made `s` from; `None` for anything else (only catalog commands).
    pub fn parse(s: &str) -> Option<Action> {
        // Ids are short: anything long is junk.
        if s.len() > 4096 {
            return None;
        }
        let (kind, rest) = s.split_once(':').unwrap_or((s, ""));
        match kind {
            "cmd" => figcraft_engine::catalog::items().find(|m| m.id == rest).map(|m| Action::Command(m.id)),
            "recent" => rest.parse().ok().map(Action::Recent),
            "recent-clear" if rest.is_empty() && !s.contains(':') => Some(Action::ClearRecent),
            "page" => rest.parse().ok().map(|n| Action::MoveToPage(NodeId(n))),
            "plugin" => match serde_json::from_str::<Vec<String>>(rest).ok()?.as_slice() {
                [plugin, command] => Some(Action::Plugin { plugin: plugin.clone(), command: command.clone() }),
                _ => None,
            },
            "widget" => serde_json::from_str::<String>(rest).ok().map(Action::Widget),
            "tab" => rest.parse().ok().map(Action::Tab),
            "quit" if !s.contains(':') => Some(Action::Quit),
            _ => None,
        }
    }
}

/// What the menu is built for.
pub struct Env<'a> {
    /// One window only (the browser): New window is greyed.
    pub one_window: bool,
    /// Whether a recent file is still there (the in-window menu looks each time it shows; the
    /// native one keeps a cached answer).
    pub exists: &'a dyn Fn(&str) -> bool,
}

/// One menu at catalog path `prefix` ("File", "Edit/Copy as"), as the in-window main menu draws it.
pub fn level(app: &FigApp, prefix: &str, env: &Env) -> Vec<Node> {
    let mut out = Vec::new();
    // The installed plugins head the Plugins menu.
    if prefix == "Plugins" {
        plugins(app, &mut out);
    }
    let mut subs: Vec<&str> = Vec::new();
    let mut last_sep = true;
    for m in MENU.iter() {
        if m.menu == prefix {
            if m.label == SEP {
                if !last_sep {
                    out.push(Node::Separator);
                    last_sep = true;
                }
                continue;
            }
            last_sep = false;
            let key = format!("{prefix}/{}", m.label);
            if m.id == "file.openRecent" {
                out.push(Node::Submenu { key, label: i18n::menu_item(m.id, m.label).into_owned(), children: recent(app, env) });
                continue;
            }
            if m.id == "object.moveToPage" && crate::menus::enabled(app, m.id) {
                out.push(Node::Submenu { key, label: i18n::menu_item(m.id, m.label).into_owned(), children: pages(app) });
                continue;
            }
            // One window in the browser.
            let why = if m.id == "window.new" && env.one_window { Some(tr_noop("Not available yet")) } else { crate::menus::why_disabled(app, m.id) };
            out.push(Node::Item(Item {
                action: Action::Command(m.id),
                label: i18n::menu_item(m.id, m.label).into_owned(),
                shortcut: crate::shortcuts::shortcut(m.id),
                enabled: why.is_none(),
                why,
                checked: figcraft_engine::cmd::view::checked(&app.session, m.id),
            }));
        } else if let Some(rest) = m.menu.strip_prefix(prefix).and_then(|r| r.strip_prefix('/')) {
            let sub = rest.split('/').next().unwrap_or(rest);
            if !subs.contains(&sub) {
                subs.push(sub);
                last_sep = false;
                let key = format!("{prefix}/{sub}");
                let children = level(app, &key, env);
                out.push(Node::Submenu { key, label: tr(sub).to_string(), children });
            }
        }
    }
    out
}

fn plain(action: Action, label: String, enabled: bool) -> Node {
    Node::Item(Item { action, label, shortcut: None, enabled, why: None, checked: None })
}

/// File ▸ Open recent: the recent files (greyed when the file is gone) and Clear recent.
fn recent(app: &FigApp, env: &Env) -> Vec<Node> {
    let recents = &app.session.prefs.recent_files;
    let mut out: Vec<Node> = recents
        .iter()
        .enumerate()
        .map(|(i, p)| {
            let name = std::path::Path::new(p).file_name().map_or_else(|| p.clone(), |f| f.to_string_lossy().into_owned());
            plain(Action::Recent(i), name, (env.exists)(p))
        })
        .collect();
    if !recents.is_empty() {
        out.push(Node::Separator);
    }
    out.push(plain(Action::ClearRecent, tr("Clear recent").to_string(), !recents.is_empty()));
    out
}

/// Object ▸ Move to page: the file's other pages.
fn pages(app: &FigApp) -> Vec<Node> {
    let Ok(ds) = app.session.ds() else { return Vec::new() };
    ds.doc
        .pages
        .iter()
        .filter(|p| **p != ds.page)
        .filter_map(|p| ds.doc.node(*p).map(|n| plain(Action::MoveToPage(*p), n.name.clone(), true)))
        .collect()
}

/// The installed plugins at the top of the Plugins menu: a plugin with one command is an item, one
/// with several a submenu; widgets in a submenu of their own; then a separator.
fn plugins(app: &FigApp, out: &mut Vec<Node>) {
    let installed = &app.session.prefs.plugins;
    if installed.is_empty() {
        return;
    }
    for p in installed {
        let m = &p.manifest;
        match m.commands.as_slice() {
            // A widget may have no commands: it's in Widgets.
            [] => {}
            [only] => {
                // An ellipsis: it asks for parameters first.
                let label = if only.params.is_empty() { m.name.clone() } else { format!("{}…", m.name) };
                out.push(plain(Action::Plugin { plugin: m.id.clone(), command: only.id.clone() }, label, true));
            }
            commands => out.push(Node::Submenu {
                key: format!("Plugins/plugin:{}", m.id),
                label: m.name.clone(),
                children: commands
                    .iter()
                    .map(|c| plain(Action::Plugin { plugin: m.id.clone(), command: c.id.clone() }, c.label.clone(), true))
                    .collect(),
            }),
        }
    }
    let widgets: Vec<Node> =
        installed.iter().filter(|p| p.manifest.widget).map(|p| plain(Action::Widget(p.manifest.id.clone()), p.manifest.name.clone(), true)).collect();
    if !widgets.is_empty() {
        out.push(Node::Submenu { key: "Plugins/widgets".into(), label: tr("Widgets").to_string(), children: widgets });
    }
    out.push(Node::Separator);
}

/// A top-level menu.
#[derive(Clone, Debug, PartialEq)]
pub struct Top {
    /// The catalog path ("File"), or "FigCraft" / "Window" for the macOS menus of their own.
    pub key: &'static str,
    pub label: String,
    pub role: Role,
    pub items: Vec<Node>,
}

/// What a top-level menu is to the platform.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// The application menu (macOS: the one named after the app).
    App,
    Plain,
    /// The platform lists the app's windows in it too.
    Window,
    /// The platform adds its help search to it.
    Help,
}

/// The in-window main menu's top level ([`crate::menus::TOP_MENUS`]).
pub fn in_window(app: &FigApp, env: &Env) -> Vec<Top> {
    crate::menus::TOP_MENUS.iter().map(|k| Top { key: k, label: tr(k).to_string(), role: Role::Plain, items: level(app, k, env) }).collect()
}

/// The commands the macOS app menu takes from the catalog's menus (About from Help, Preferences…
/// from Preferences).
pub const APP_MENU_COMMANDS: [&str; 2] = ["help.about", "app.preferences"];

/// Text editing keys: while a field has the keyboard their native items stay clickable (the press
/// goes to the field, [`key_events`]) even if the command itself is greyed.
const TEXT_KEYS: &[&str] = &["edit.undo", "edit.redo", "edit.cut", "edit.copy", "edit.paste", "select.all"];

/// The macOS menu bar: the in-window main menu's menus, arranged as a Mac app's. `typing`: a text
/// field or the text editor has the keyboard.
pub fn mac_bar(app: &FigApp, env: &Env, typing: bool) -> Vec<Top> {
    let mut tops = in_window(app, env);
    let take = |tops: &mut Vec<Top>, key: &str| tops.iter().position(|t| t.key == key).map(|i| tops.remove(i));
    let mut prefs = take(&mut tops, "Preferences").map(|t| t.items).unwrap_or_default();
    let pick = |items: &mut Vec<Node>, id: &str| {
        let i = items.iter().position(|n| matches!(n, Node::Item(it) if matches!(it.action, Action::Command(c) if c == id)))?;
        match items.remove(i) {
            Node::Item(it) => Some(it),
            _ => None,
        }
    };
    let settings = pick(&mut prefs, "app.preferences");
    tidy(&mut prefs);
    let mut help = take(&mut tops, "Help");
    let about = help.as_mut().and_then(|h| pick(&mut h.items, "help.about"));
    if let Some(h) = help.as_mut() {
        tidy(&mut h.items);
    }
    // The application menu.
    let mut app_items = Vec::new();
    app_items.extend(about.map(Node::Item));
    app_items.push(Node::Separator);
    app_items.extend(settings.map(Node::Item));
    if !prefs.is_empty() {
        app_items.push(Node::Submenu { key: "Preferences".into(), label: tr("Preferences").to_string(), children: prefs });
    }
    app_items.push(Node::Separator);
    app_items.push(Node::Native(Native::Services));
    app_items.push(Node::Separator);
    app_items.extend([Native::Hide, Native::HideOthers, Native::ShowAll].map(Node::Native));
    app_items.push(Node::Separator);
    app_items.push(Node::Item(Item {
        action: Action::Quit,
        label: tr("Quit FigCraft").to_string(),
        shortcut: Some("Cmd+Q"),
        enabled: true,
        why: None,
        checked: None,
    }));
    tidy(&mut app_items);
    // The Window menu: the window's own items, then the open files (the system lists the windows).
    let mut window = vec![Node::Native(Native::Minimize), Node::Native(Native::Zoom)];
    let active = app.session.ds().ok().filter(|_| !app.ui.home).map(|d| d.uid);
    let files: Vec<Node> = app
        .session
        .docs
        .iter()
        .map(|d| {
            Node::Item(Item {
                action: Action::Tab(d.uid),
                label: d.doc.name.clone(),
                shortcut: None,
                enabled: true,
                why: None,
                checked: Some(active == Some(d.uid)),
            })
        })
        .collect();
    if !files.is_empty() {
        window.push(Node::Separator);
        window.extend(files);
    }
    let mut bar = Vec::with_capacity(tops.len() + 3);
    bar.push(Top { key: "FigCraft", label: "FigCraft".into(), role: Role::App, items: app_items });
    bar.extend(tops);
    bar.push(Top { key: "Window", label: tr("Window").to_string(), role: Role::Window, items: window });
    bar.extend(help.map(|h| Top { role: Role::Help, ..h }));
    if typing {
        for top in &mut bar {
            for_items(&mut top.items, &mut |it| {
                if matches!(it.action, Action::Command(id) if TEXT_KEYS.contains(&id)) {
                    it.enabled = true;
                    it.why = None;
                }
            });
        }
    }
    bar
}

/// Drop separators a removed item left at an end or doubled.
fn tidy(items: &mut Vec<Node>) {
    let mut out: Vec<Node> = Vec::with_capacity(items.len());
    for n in items.drain(..) {
        if n == Node::Separator && out.last().is_none_or(|l| *l == Node::Separator) {
            continue;
        }
        out.push(n);
    }
    if out.last() == Some(&Node::Separator) {
        out.pop();
    }
    *items = out;
}

/// Every item, depth first.
pub fn for_items(nodes: &mut [Node], f: &mut impl FnMut(&mut Item)) {
    for n in nodes {
        match n {
            Node::Item(it) => f(it),
            Node::Submenu { children, .. } => for_items(children, f),
            Node::Separator | Node::Native(_) => {}
        }
    }
}

/// Every item of a bar, depth first.
pub fn items_of(bar: &[Top]) -> Vec<&Item> {
    fn walk<'a>(nodes: &'a [Node], out: &mut Vec<&'a Item>) {
        for n in nodes {
            match n {
                Node::Item(it) => out.push(it),
                Node::Submenu { children, .. } => walk(children, out),
                Node::Separator | Node::Native(_) => {}
            }
        }
    }
    let mut out = Vec::new();
    for t in bar {
        walk(&t.items, &mut out);
    }
    out
}

/// Whether two bars differ only in which items are enabled or checked (the platform menu then
/// updates those items in place instead of being built again).
pub fn same_shape(a: &[Top], b: &[Top]) -> bool {
    fn nodes(a: &[Node], b: &[Node]) -> bool {
        a.len() == b.len()
            && a.iter().zip(b).all(|(x, y)| match (x, y) {
                (Node::Item(x), Node::Item(y)) => {
                    x.action == y.action && x.label == y.label && x.shortcut == y.shortcut && x.checked.is_some() == y.checked.is_some()
                }
                (Node::Submenu { key: k1, label: l1, children: c1 }, Node::Submenu { key: k2, label: l2, children: c2 }) => {
                    k1 == k2 && l1 == l2 && nodes(c1, c2)
                }
                (Node::Separator, Node::Separator) => true,
                (Node::Native(x), Node::Native(y)) => x == y && x.label() == y.label(),
                _ => false,
            })
    }
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| x.key == y.key && x.label == y.label && x.role == y.role && nodes(&x.items, &y.items))
}

/// A shortcut as a native key equivalent: only keys with ⌘ or ⌃ (see the module docs).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NativeKey {
    /// The key as a W3C `KeyboardEvent.code` name ("KeyK", "Digit1", "Comma", "Backspace").
    pub code: &'static str,
    pub cmd: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
}

/// The native key equivalent for a shortcut in keymap notation, if it gets one.
pub fn native_key(spec: &str) -> Option<NativeKey> {
    let (m, key) = figcraft_engine::keymap::parse(spec)?;
    if !(m.cmd || m.ctrl) {
        return None;
    }
    Some(NativeKey { code: code_name(key)?, cmd: m.cmd, ctrl: m.ctrl, alt: m.alt, shift: m.shift })
}

/// A canonical keymap key's W3C code name (the US layout's key that types it).
fn code_name(key: &str) -> Option<&'static str> {
    const LETTERS: [&str; 26] = [
        "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ", "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ",
        "KeyR", "KeyS", "KeyT", "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ",
    ];
    const DIGITS: [&str; 10] = ["Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"];
    const F: [&str; 12] = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"];
    let mut chars = key.chars();
    if let (Some(c), None) = (chars.next(), chars.next()) {
        let c = c.to_ascii_uppercase();
        if c.is_ascii_uppercase() {
            return LETTERS.get(usize::from(c as u8 - b'A')).copied();
        }
        if c.is_ascii_digit() {
            return DIGITS.get(usize::from(c as u8 - b'0')).copied();
        }
    }
    if let Some(n) = key.strip_prefix('F').and_then(|n| n.parse::<usize>().ok()) {
        return n.checked_sub(1).and_then(|i| F.get(i)).copied();
    }
    Some(match key {
        "=" => "Equal",
        "-" => "Minus",
        "[" => "BracketLeft",
        "]" => "BracketRight",
        "\\" => "Backslash",
        "'" => "Quote",
        "," => "Comma",
        "." => "Period",
        "/" => "Slash",
        ";" => "Semicolon",
        "`" => "Backquote",
        // ⌫ on a Mac keyboard.
        "Delete" => "Backspace",
        "Enter" => "Enter",
        "Escape" => "Escape",
        "Tab" => "Tab",
        "Space" => "Space",
        "PageUp" => "PageUp",
        "PageDown" => "PageDown",
        "Home" => "Home",
        "End" => "End",
        "ArrowLeft" => "ArrowLeft",
        "ArrowRight" => "ArrowRight",
        "ArrowUp" => "ArrowUp",
        "ArrowDown" => "ArrowDown",
        _ => return None,
    })
}

/// The egui events a key press of shortcut `spec` makes on macOS, as egui-winit makes them: ⌘C,
/// ⌘X and ⌘V arrive as clipboard events (the paste with `clipboard`'s text), the rest as the key.
pub fn key_events(spec: &str, clipboard: Option<String>) -> Vec<egui::Event> {
    let Some((m, key)) = figcraft_engine::keymap::parse(spec) else { return Vec::new() };
    let Some(key) = egui_key(key) else { return Vec::new() };
    let modifiers = egui::Modifiers { alt: m.alt, ctrl: m.ctrl, shift: m.shift, mac_cmd: m.cmd, command: m.cmd };
    if m.cmd && !m.alt && !m.ctrl {
        match key {
            egui::Key::C if !m.shift => return vec![egui::Event::Copy],
            egui::Key::X if !m.shift => return vec![egui::Event::Cut],
            egui::Key::V => {
                if let Some(text) = clipboard.map(|t| t.replace("\r\n", "\n")).filter(|t| !t.is_empty()) {
                    return vec![egui::Event::Paste(text)];
                }
            }
            _ => {}
        }
    }
    let press = |pressed| egui::Event::Key { key, physical_key: Some(key), pressed, repeat: false, modifiers };
    vec![press(true), press(false)]
}

fn egui_key(key: &str) -> Option<egui::Key> {
    use egui::Key;
    Some(match key {
        "=" => Key::Equals,
        "-" => Key::Minus,
        "[" => Key::OpenBracket,
        "]" => Key::CloseBracket,
        "\\" => Key::Backslash,
        "'" => Key::Quote,
        "," => Key::Comma,
        "." => Key::Period,
        "/" => Key::Slash,
        ";" => Key::Semicolon,
        "`" => Key::Backtick,
        "Delete" => Key::Backspace,
        k => return Key::from_name(k),
    })
}

/// Do what a menu item does (a click in either menu).
pub fn run(app: &mut FigApp, ctx: &egui::Context, action: &Action) {
    match action {
        Action::Command(id) => crate::menus::invoke(app, id),
        Action::Recent(i) => {
            if app.run("file.openRecent", json!({"index": i})).is_some_and(|r| r.get("index").is_some()) {
                app.ui.home = false;
            }
        }
        Action::ClearRecent => {
            app.run("file.openRecent", json!({"clear": true}));
        }
        Action::MoveToPage(page) => {
            let Some(name) = app.session.doc().ok().and_then(|d| d.node(*page)).map(|n| n.name.clone()) else { return };
            let ids = app.session.selection();
            if app.run("object.moveToPage", json!({"ids": ids, "page": page})).is_some() {
                app.toast(trf("Moved to {name}", &[("name", &name)]));
            }
        }
        Action::Plugin { plugin, command } => crate::plugins_ui::start(app, plugin, command),
        Action::Widget(plugin) => {
            app.run("widget.insert", json!({"plugin": plugin}));
        }
        Action::Tab(uid) => {
            if let Some(i) = app.session.docs.iter().position(|d| d.uid == *uid) {
                app.run("doc.switch", json!({"index": i}));
                app.ui.home = false;
            }
        }
        Action::Quit => crate::windows::request_quit(app, ctx),
    }
}

/// The native menu bar's state in the app.
#[derive(Default)]
pub struct NativeMenu {
    /// Items picked (their [`Action::id`]s) and the window in front when they were.
    pending: Vec<(u64, String)>,
    /// The bar last handed to the platform.
    last: Option<Vec<Top>>,
    /// The recent files and whether each is still there, and when that was looked at.
    recent: (Vec<String>, Vec<bool>, f64),
}

/// How often the native menu looks again whether the recent files are still there.
const RECENT_CHECK_SECS: f64 = 2.0;

/// Whether a text field (or the canvas text editor, or the Actions palette) has the keyboard.
pub fn typing(app: &FigApp, ctx: &egui::Context) -> bool {
    ctx.egui_wants_keyboard_input()
        || crate::a11y::field_focused(ctx)
        || app.ui.palette.is_some()
        || app.session.ds().is_ok_and(|d| d.text_edit.is_some())
}

/// At the start of a window's frame (`begin`) and at its end: the items picked in the native menu
/// run in the window that was in front, and the native menu follows the app's state.
pub fn native_frame(app: &mut FigApp, ctx: &egui::Context, begin: bool, typing: bool) {
    if !app.services.native_menu() {
        return;
    }
    if begin {
        take_picks(app, ctx, typing);
    } else if app.windows.current == app.windows.focused || !app.windows.exists(app.windows.focused) {
        update(app, ctx, typing);
    }
}

fn take_picks(app: &mut FigApp, ctx: &egui::Context, typing: bool) {
    let focused = if app.windows.exists(app.windows.focused) { app.windows.focused } else { 0 };
    // Bounded: a flood of events can't grow the queue without end.
    for id in app.services.native_menu_events().into_iter().take(64) {
        app.native.pending.push((focused, id));
    }
    app.native.pending.truncate(64);
    if app.native.pending.iter().any(|(w, _)| *w != app.windows.current) {
        ctx.request_repaint_of(crate::windows::viewport(focused));
    }
    let current = app.windows.current;
    let (mine, rest): (Vec<_>, Vec<_>) =
        std::mem::take(&mut app.native.pending).into_iter().partition(|(w, _)| *w == current || !app.windows.exists(*w));
    app.native.pending = rest;
    for (_, id) in mine {
        pick(app, ctx, &id, typing);
    }
}

/// An item picked in the native menu (its id): junk is ignored, a greyed command says why.
pub fn pick(app: &mut FigApp, ctx: &egui::Context, id: &str, typing: bool) {
    let Some(action) = Action::parse(id) else {
        log::info!("native menu: unknown item {id:?}");
        return;
    };
    if let Action::Command(cmd) = action {
        // The key goes to the field that has the keyboard, as if typed, when the field acts on it.
        if typing && let Some(spec) = crate::shortcuts::shortcut(cmd).filter(|s| native_key(s).is_some() && goes_to_field(app, cmd, s)) {
            let clipboard = if spec == "Cmd+V" { app.services.clipboard_get_text() } else { None };
            app.control_input.extend(key_events(spec, clipboard));
            ctx.request_repaint();
            return;
        }
        let why =
            if cmd == "window.new" && ctx.embed_viewports() { Some(tr_noop("Not available yet")) } else { crate::menus::why_disabled(app, cmd) };
        if let Some(why) = why {
            app.toast(tr(why).to_string());
            return;
        }
    }
    run(app, ctx, &action);
}

/// Whether the field that has the keyboard acts on command `cmd`'s key `spec`: a text field's
/// editing keys, and in the canvas text editor the shortcuts live while editing text.
fn goes_to_field(app: &FigApp, cmd: &str, spec: &str) -> bool {
    use figcraft_engine::keymap;
    TEXT_KEYS.contains(&cmd)
        || app.session.ds().is_ok_and(|d| d.text_edit.is_some())
            && keymap::parse(spec)
                .is_some_and(|(m, k)| keymap::lookup(crate::shortcuts::platform(), keymap::Context::Text, k, m).is_some_and(|b| b.id == cmd))
}

fn update(app: &mut FigApp, ctx: &egui::Context, typing: bool) {
    let now = ctx.input(|i| i.time);
    let list = &app.session.prefs.recent_files;
    let (cached, _, at) = &app.native.recent;
    if cached != list || now - at > RECENT_CHECK_SECS || now < *at {
        let there = list.iter().map(|p| std::path::Path::new(p).exists()).collect();
        app.native.recent = (list.clone(), there, now);
    }
    let (paths, there, _) = &app.native.recent;
    let exists = |p: &str| paths.iter().position(|q| q == p).and_then(|i| there.get(i)).copied().unwrap_or(false);
    let bar = mac_bar(app, &Env { one_window: ctx.embed_viewports(), exists: &exists }, typing);
    if app.native.last.as_ref() != Some(&bar) {
        app.services.set_native_menu(&bar);
        app.native.last = Some(bar);
    }
}
