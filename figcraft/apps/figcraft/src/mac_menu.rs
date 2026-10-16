//! The macOS menu bar: the tree [`figcraft_ui_egui::menu_model`] builds (the in-window main menu's
//! items, arranged as a Mac app's menus), shown with muda (Tauri's menu crate, MIT OR Apache-2.0),
//! which keeps AppKit's Objective-C and its `unsafe` out of FigCraft's crates.
//!
//! - The UI hands over the bar when something in it changed ([`update`]): a changed shape (labels,
//!   items, submenus, a recent file, a language) builds the menu again; enabled and checked states
//!   change in place.
//! - A picked item's id ([`figcraft_ui_egui::menu_model::Action::id`]) is queued and the window is
//!   woken ([`install`]); the next frame takes the queue ([`take_events`]) and runs it there.
//! - Key equivalents: only ⌘/⌃ shortcuts get one ([`figcraft_ui_egui::menu_model::native_key`]);
//!   the module docs there say why a shortcut never runs twice.
//!
//! Everything here runs on the main thread (muda's menu objects aren't `Send`): `install` from the
//! first frame, `update` from frames.

use std::cell::RefCell;
use std::str::FromStr;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use figcraft_ui_egui::menu_model::{self, Native, NativeKey, Node, Role, Top};
use muda::accelerator::{Accelerator, Code, Modifiers};
use muda::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu};

/// Picked items not taken yet (bounded).
static EVENTS: Mutex<Vec<String>> = Mutex::new(Vec::new());
const MAX_EVENTS: usize = 256;
static INSTALLED: AtomicBool = AtomicBool::new(false);

/// The menu shown now, what it was built from and its items in [`menu_model::items_of`] order.
struct Built {
    _menu: Menu,
    shape: Vec<Top>,
    items: Vec<Handle>,
}

enum Handle {
    Plain(MenuItem),
    Check(CheckMenuItem),
}

thread_local! {
    static BUILT: RefCell<Option<Built>> = const { RefCell::new(None) };
}

/// Start taking the menu bar's picks: they wake `ctx`'s window. Once, from the first frame.
pub fn install(ctx: &egui::Context) {
    if INSTALLED.swap(true, Ordering::Relaxed) {
        return;
    }
    let ctx = ctx.clone();
    MenuEvent::set_event_handler(Some(move |e: MenuEvent| {
        let mut q = EVENTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if q.len() < MAX_EVENTS {
            q.push(e.id.0);
        }
        drop(q);
        ctx.request_repaint();
    }));
}

/// Whether the menu bar is FigCraft's ([`install`] ran).
pub fn installed() -> bool {
    INSTALLED.load(Ordering::Relaxed)
}

/// The items picked since the last call.
pub fn take_events() -> Vec<String> {
    std::mem::take(&mut *EVENTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner))
}

/// Show `bar` (handed over when something in it changed).
pub fn update(bar: &[Top]) {
    BUILT.with(|cell| {
        let Ok(mut built) = cell.try_borrow_mut() else { return };
        if let Some(b) = built.as_mut()
            && menu_model::same_shape(&b.shape, bar)
        {
            for (h, it) in b.items.iter().zip(menu_model::items_of(bar)) {
                match h {
                    Handle::Plain(m) => {
                        if m.is_enabled() != it.enabled {
                            m.set_enabled(it.enabled);
                        }
                    }
                    Handle::Check(m) => {
                        if m.is_enabled() != it.enabled {
                            m.set_enabled(it.enabled);
                        }
                        let on = it.checked.unwrap_or(false);
                        if m.is_checked() != on {
                            m.set_checked(on);
                        }
                    }
                }
            }
            b.shape = bar.to_vec();
            return;
        }
        match build(bar) {
            Ok(b) => *built = Some(b),
            Err(e) => log::warn!("menu bar: {e}"),
        }
    });
}

fn build(bar: &[Top]) -> muda::Result<Built> {
    let menu = Menu::new();
    let mut items = Vec::new();
    let mut roles = Vec::new();
    for top in bar {
        let sub = Submenu::new(text(&top.label), true);
        fill(&sub, &top.items, &mut items)?;
        menu.append(&sub)?;
        roles.push((top.role, sub));
    }
    menu.init_for_nsapp();
    // (After the menu is the app's: AppKit lists the windows in one and adds its search to the other.)
    for (role, sub) in &roles {
        match role {
            Role::Window => sub.set_as_windows_menu_for_nsapp(),
            Role::Help => sub.set_as_help_menu_for_nsapp(),
            Role::App | Role::Plain => {}
        }
    }
    Ok(Built { _menu: menu, shape: bar.to_vec(), items })
}

fn fill(sub: &Submenu, nodes: &[Node], items: &mut Vec<Handle>) -> muda::Result<()> {
    for n in nodes {
        match n {
            Node::Separator => sub.append(&PredefinedMenuItem::separator())?,
            Node::Item(it) => {
                let accel = it.shortcut.and_then(menu_model::native_key).and_then(accelerator);
                let (id, label) = (it.action.id(), text(&it.label));
                match it.checked {
                    Some(on) => {
                        let m = CheckMenuItem::with_id(id, label, it.enabled, on, accel);
                        sub.append(&m)?;
                        items.push(Handle::Check(m));
                    }
                    None => {
                        let m = MenuItem::with_id(id, label, it.enabled, accel);
                        sub.append(&m)?;
                        items.push(Handle::Plain(m));
                    }
                }
            }
            Node::Submenu { label, children, .. } => {
                let s = Submenu::new(text(label), true);
                fill(&s, children, items)?;
                sub.append(&s)?;
            }
            Node::Native(n) => {
                let label = Some(n.label());
                let item = match n {
                    Native::Services => PredefinedMenuItem::services(label),
                    Native::Hide => PredefinedMenuItem::hide(label),
                    Native::HideOthers => PredefinedMenuItem::hide_others(label),
                    Native::ShowAll => PredefinedMenuItem::show_all(label),
                    Native::Minimize => PredefinedMenuItem::minimize(label),
                    Native::Zoom => PredefinedMenuItem::zoom(label),
                };
                sub.append(&item)?;
            }
        }
    }
    Ok(())
}

/// A label as muda takes it: `&` marks a mnemonic there, `&&` is a literal `&`.
fn text(label: &str) -> String {
    label.replace('&', "&&")
}

/// A native key equivalent as muda's.
fn accelerator(k: NativeKey) -> Option<Accelerator> {
    let code = Code::from_str(k.code).ok()?;
    let mut mods = Modifiers::empty();
    for (on, m) in [(k.cmd, Modifiers::META), (k.ctrl, Modifiers::CONTROL), (k.alt, Modifiers::ALT), (k.shift, Modifiers::SHIFT)] {
        if on {
            mods |= m;
        }
    }
    Some(Accelerator::new(mods, code))
}
