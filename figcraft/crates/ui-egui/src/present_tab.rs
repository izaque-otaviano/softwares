//! Presenting in a tab of the app: Present opens the prototype in a tab beside the file's own, with
//! a play icon and the title "<file> - <flow or first screen>". The tab has no document of its own:
//! it plays the open file it was started from (its source), keeps its state while the editor's tab
//! shows, follows that file's edits as the preview pane does and ends with the tab's ×, Ctrl/Cmd+W,
//! a middle click, or when its file closes. The editor's tab and the presentation's switch like any
//! two tabs; the window's own close button, Alt+F4 and Quit keep their normal flow (the
//! unsaved-changes question) and never stop at the presentation.
//!
//! The presenter lives in `app.ui.present` as before, marked as a tab (`ux.tab`, the source file's
//! uid in `ux.tab_doc`, `ux.tab_active` for the tab being the one showing), so each window has its
//! own. A presentation in a window of its own ([`super::window`]) or full window over the editor
//! (`proto.present {mode: "fullWindow"}`, a shared prototype) isn't a tab.
//!
//! A child module of `present`.

use egui::{CornerRadius, Key, Modifiers, Rect, Sense, Stroke, Ui, pos2, vec2};
use figcraft_doc::{NodeId, NodeKind};
use serde_json::{Value, json};

use super::Presenter;
use crate::FigApp;
use crate::a11y::Tip;
use crate::i18n::tr;
use crate::icons::{self, Icon};
use crate::theme::{Tokens, regular};

/// The widest and narrowest a presentation tab gets (points), as the file tabs'.
const MIN_W: f32 = 120.0;
const MAX_W: f32 = 260.0;

/// The window's presentation is a tab (showing or not).
pub fn is_tab(app: &FigApp) -> bool {
    app.ui.present.as_ref().is_some_and(|p| p.ux.tab && !p.ux.window)
}

/// The presentation's tab is the one showing: the editor is hidden behind it.
pub fn active(app: &FigApp) -> bool {
    !app.ui.home && app.ui.present.as_ref().is_some_and(|p| p.ux.tab && !p.ux.window && p.ux.tab_active)
}

/// Present from `start` in a tab beside the active file's, and show it.
pub fn open(app: &mut FigApp, start: NodeId) {
    let Ok(ds) = app.session.ds() else { return };
    let uid = ds.uid;
    let mut p = Presenter::new(start);
    p.view = app.ui.present_view;
    p.ux.tab = true;
    p.ux.tab_doc = uid;
    p.ux.tab_active = true;
    app.ui.present = Some(p);
    app.ui.home = false;
}

/// Show the presentation's tab (a click on it): its file becomes the active one again.
pub fn select(app: &mut FigApp) {
    let Some(uid) = app.ui.present.as_ref().filter(|p| p.ux.tab).map(|p| p.ux.tab_doc) else { return };
    let Some(i) = app.session.docs.iter().position(|d| d.uid == uid) else { return };
    app.run("doc.switch", json!({"index": i}));
    app.ui.home = false;
    if let Some(p) = app.ui.present.as_mut() {
        p.ux.tab_active = true;
    }
}

/// Another tab (a file's, the home screen, a new file) takes the window: the presentation's tab
/// stays, with its state, but doesn't show.
pub fn deselect(app: &mut FigApp) {
    if let Some(p) = app.ui.present.as_mut() {
        p.ux.tab_active = false;
    }
}

/// End the presentation of the tab (its ×, Ctrl/Cmd+W, a middle click); the file's own tab shows.
pub fn close(app: &mut FigApp) {
    if is_tab(app) {
        app.ui.present = None;
    }
}

/// Every frame, before anything draws: the tab ends when its file has closed (or moved to another
/// window), and stops showing when a command made another file the active one.
pub fn tick(app: &mut FigApp) {
    let Some(p) = app.ui.present.as_ref().filter(|p| p.ux.tab && !p.ux.window) else { return };
    let (uid, shown) = (p.ux.tab_doc, p.ux.tab_active);
    if !app.session.docs.iter().any(|d| d.uid == uid && app.shows(d.uid)) {
        app.ui.present = None;
        return;
    }
    if shown && app.session.ds().map_or(true, |d| d.uid != uid) {
        deselect(app);
    }
}

/// The tab's title: "<file> - <flow>", the flow being played or, without one, the first screen's
/// name.
pub fn title(app: &FigApp) -> Option<String> {
    let p = app.ui.present.as_ref().filter(|p| p.ux.tab)?;
    let d = app.session.docs.iter().find(|d| d.uid == p.ux.tab_doc)?;
    let flows = match d.doc.page_of(p.start).and_then(|pg| d.doc.node(pg)).map(|n| &n.kind) {
        Some(NodeKind::Page { flows, .. }) => flows.as_slice(),
        _ => &[],
    };
    let part = flows.iter().find(|f| f.start == p.start).map(|f| f.name.clone()).or_else(|| d.doc.node(p.start).map(|n| n.name.clone()))?;
    Some(format!("{} - {}", d.doc.name, part))
}

/// What the tab strip draws for the presentation's tab.
pub struct Info {
    /// The open file it plays (it sits right after that file's tab).
    pub doc: u64,
    pub title: String,
    pub active: bool,
}

pub fn info(app: &FigApp) -> Option<Info> {
    let p = app.ui.present.as_ref().filter(|p| p.ux.tab && !p.ux.window)?;
    let title = title(app)?;
    // (A file in another window has its own strip.)
    app.shows(p.ux.tab_doc).then_some(Info { doc: p.ux.tab_doc, title, active: active(app) })
}

/// What a click on the presentation's tab asked for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Click {
    Select,
    Close,
}

/// Draw the presentation's tab in the strip `bar` with its left edge at `x`; returns where the next
/// tab starts, what was clicked, and the tab's and its × button's rectangles.
pub fn draw_tab(ui: &mut Ui, bar: Rect, x: f32, info: &Info, t: &Tokens) -> (f32, Option<Click>, [Rect; 2]) {
    let w = (regular(12.0).size * 0.6 * info.title.chars().count() as f32 + 64.0).clamp(MIN_W, MAX_W);
    let r = Rect::from_min_size(pos2(x, bar.min.y), vec2(w, bar.height()));
    let resp = ui.interact(r, ui.id().with("present_tab"), Sense::click());
    crate::a11y::tab(&resp, &info.title, info.active);
    if info.active {
        ui.painter().rect_filled(r, CornerRadius::ZERO, t.tab_active);
    } else if resp.hovered() {
        ui.painter().rect_filled(r, CornerRadius::ZERO, t.hover);
    }
    icons::paint(ui.painter(), Rect::from_center_size(pos2(r.min.x + 18.0, r.center().y), vec2(12.0, 12.0)), Icon::Play, t.icon);
    crate::bidi::paint_name(ui.painter(), pos2(r.min.x + 32.0, r.center().y), &info.title, regular(12.0), t.text, w - 60.0);
    let cr = Rect::from_center_size(pos2(r.max.x - 16.0, r.center().y), vec2(18.0, 18.0));
    let mut click = None;
    if resp.hovered() || info.active {
        let cresp = ui.interact(cr, ui.id().with("present_tab_close"), Sense::click()).tip(tr("Close tab"));
        if cresp.hovered() {
            ui.painter().rect_filled(cr, CornerRadius::same(4), t.pressed);
        }
        icons::paint(ui.painter(), cr.shrink(4.0), Icon::Close, t.icon_secondary);
        if cresp.clicked() {
            click = Some(Click::Close);
        }
    }
    if click.is_none() && resp.clicked() {
        click = Some(Click::Select);
    }
    if resp.middle_clicked() {
        click = Some(Click::Close);
    }
    ui.painter().line_segment([pos2(r.max.x, bar.min.y + 10.0), pos2(r.max.x, bar.max.y - 10.0)], Stroke::new(1.0, t.border));
    (r.max.x, click, [r, cr])
}

/// The frame of a window whose showing tab is the presentation's: the tab strip, the presenter
/// under it, and the editor's popups (main menu, dialogs). False when nothing was drawn because
/// the tab just closed (Ctrl/Cmd+W): the editor draws instead.
pub(crate) fn show(app: &mut FigApp, ui: &mut Ui) -> bool {
    let ctx = ui.ctx().clone();
    if ctx.input_mut(|i| i.consume_key(Modifiers::COMMAND, Key::W)) {
        close(app);
        ctx.request_repaint();
        return false;
    }
    // Escape closes a dialog before it reaches the presenter.
    crate::dialogs::keys(app, &ctx);
    // (Full screen is all prototype: the strip comes back with the window.)
    let fullscreen = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
    if !fullscreen {
        crate::tabs::tab_bar(app, ui);
    }
    // The strip may have gone to another tab or closed this one, or its file: the presenter then
    // doesn't draw (it would copy another file's document).
    if active(app) && app.session.ds().is_ok_and(|d| app.ui.present.as_ref().is_some_and(|p| p.ux.tab_doc == d.uid)) {
        super::show(app, ui);
    } else {
        ctx.request_repaint();
    }
    crate::menus::popups(app, &ctx);
    crate::dialogs::show(app, &ctx);
    app.toast_ui(&ctx);
    crate::windows::requests(app, &ctx);
    true
}

/// The presentation's tab for `ui.inspect` (`presentTab`): `null` without one.
pub fn inspect(app: &FigApp) -> Value {
    let Some(p) = app.ui.present.as_ref().filter(|p| p.ux.tab && !p.ux.window) else { return Value::Null };
    let rect = |r: Option<Rect>| r.map(|r| json!([r.min.x, r.min.y, r.max.x, r.max.y]));
    json!({
        "title": title(app),
        "active": active(app),
        "doc": p.ux.tab_doc,
        "rect": rect(p.ux.tab_rect),
        "closeRect": rect(p.ux.tab_close_rect),
    })
}
