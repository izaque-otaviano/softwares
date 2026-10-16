//! The viewer: FigCraft showing one prototype and nothing else, as a shared website does
//! (`figcraft_engine::share`). The presenter plays it locked: no way back to the editor (no
//! Close, Escape doesn't end it), no Comments, Inspect or window of its own; restart, flows, the
//! screens panel, sizes, full screen, hide UI and the shortcut list stay. A file that can't be
//! opened shows a short explanation instead.
//!
//! The web build enters it from `prototype.json` or `?prototype=` ([`open`]); the desktop app with
//! `--viewer <site folder | file>`, to try an export.

use egui::{Ui, pos2};
use figcraft_doc::NodeId;
use figcraft_engine::share::{self, ViewerConfig};
use serde_json::{Value, json};

use crate::FigApp;
use crate::i18n::{tr, trf};
use crate::present::Presenter;
use crate::theme::{Tokens, regular, semibold};

/// The viewer's state (`app.ui.viewer`).
#[derive(Clone, Debug, PartialEq)]
pub struct Viewer {
    /// The frame the prototype starts on (`None` when it couldn't be opened).
    pub start: Option<NodeId>,
    /// The page or window title: the flow's or the file's name.
    pub title: String,
    /// Why the prototype couldn't be opened.
    pub error: Option<String>,
}

/// Open the shared file `bytes` as `cfg` says and show only its prototype from now on. A file
/// that can't be opened shows why ([`fail`]). True when it opened.
pub fn open(app: &mut FigApp, bytes: &[u8], cfg: &ViewerConfig) -> bool {
    match share::open_viewer(&mut app.session, bytes, cfg) {
        Ok((start, title)) => {
            lock(app, start, title);
            true
        }
        Err(e) => {
            fail(app, format!("{}: {e}", cfg.file));
            false
        }
    }
}

/// Show `error` in place of the prototype (the shared file is missing or damaged).
pub fn fail(app: &mut FigApp, error: impl Into<String>) {
    app.ui.present = None;
    app.ui.viewer = Some(Viewer { start: None, title: tr("Prototype").to_string(), error: Some(error.into()) });
}

/// Present the active file from `start`, locked: the editor never shows again.
pub fn lock(app: &mut FigApp, start: NodeId, title: String) {
    app.ui.home = false;
    app.ui.preview = None;
    app.ui.present = None;
    app.ui.viewer = Some(Viewer { start: Some(start), title, error: None });
}

/// The app shows only a prototype.
pub fn active(app: &FigApp) -> bool {
    app.ui.viewer.is_some()
}

/// The page or window title while viewing.
pub fn title(app: &FigApp) -> Option<String> {
    app.ui.viewer.as_ref().map(|v| v.title.clone())
}

/// The viewer for `ui.inspect`.
pub fn inspect(app: &FigApp) -> Value {
    app.ui.viewer.as_ref().map_or(Value::Null, |v| json!({"start": v.start, "title": v.title, "error": v.error}))
}

/// What the locked presenter can't do: end, show comments or Inspect, move to a window of its own.
fn lock_presenter(p: &mut Presenter) {
    p.ux.viewer = true;
    p.ux.window = false;
    p.ux.window_request = None;
    p.view.comments = false;
    p.view.inspect = false;
}

/// One frame of the viewer: the locked presenter, or the explanation of what went wrong.
pub(crate) fn show(app: &mut FigApp, ui: &mut Ui) {
    let Some(v) = app.ui.viewer.as_ref() else { return };
    let (start, error) = (v.start, v.error.clone());
    let Some(start) = start.filter(|_| error.is_none()) else {
        error_screen(ui, error.as_deref().unwrap_or_default());
        return;
    };
    // (A presentation that somehow ended starts over: the editor is never reachable.)
    lock_presenter(app.ui.present.get_or_insert_with(|| Presenter::new(start)));
    crate::present::show(app, ui);
    if let Some(p) = app.ui.present.as_mut() {
        lock_presenter(p);
    } else {
        ui.ctx().request_repaint();
    }
}

/// The explanation shown when the shared file can't be opened.
fn error_screen(ui: &mut Ui, error: &str) {
    let t = Tokens::get(ui.ctx());
    let rect = ui.max_rect();
    ui.painter().rect_filled(rect, 0.0, t.canvas);
    let width = (rect.width() - 48.0).clamp(160.0, 520.0);
    let p = ui.painter();
    let mut y = rect.center().y - 60.0;
    for (text, font, color) in [
        (tr("This prototype couldn't be opened"), semibold(16.0), t.text),
        (error, regular(12.0), t.text_secondary),
        (
            tr("Check that the whole website folder was uploaded: prototype.json and prototype.figcraft sit next to index.html."),
            regular(12.0),
            t.text_secondary,
        ),
    ] {
        // Each line centred (a wrapped paragraph too).
        let mut job = egui::text::LayoutJob::simple(text.to_string(), font, color, width);
        job.halign = egui::Align::Center;
        let galley = p.layout_job(job);
        let h = galley.size().y;
        p.galley(pos2(rect.center().x, y), galley, color);
        y += h + 14.0;
    }
}

/// The folder an export goes into, inside the one picked: the file's name, then " (site)".
fn site_folder(name: &str) -> String {
    let clean: String = name.trim().chars().take(120).map(|c| if c.is_control() || "/\\:*?\"<>|".contains(c) { '_' } else { c }).collect();
    let clean = clean.trim_matches(|c: char| c == '.' || c.is_whitespace());
    format!("{} (site)", if clean.is_empty() { "Prototype" } else { clean })
}

/// File ▸ Export prototype as website…: pick a folder (and, in a build without the web viewer
/// built in, the web build to use); the site goes into a folder of its own there.
pub fn export_dialog(app: &mut FigApp) {
    let name = app.session.doc().map(|d| d.name.clone()).unwrap_or_default();
    let bundle = if share::has_embedded_bundle() {
        None
    } else {
        app.toast(tr("This FigCraft build has no web viewer built in: choose a web build folder (trunk build --release in apps/figcraft-web)"));
        match app.services.pick_folder(tr("Choose the FigCraft web build (the folder with index.html)")) {
            Some(b) => Some(b),
            None => return,
        }
    };
    let Some(parent) = app.services.pick_folder(tr("Choose where to save the website")) else { return };
    let folder = parent.join(site_folder(&name));
    let mut params = json!({"path": folder.to_string_lossy()});
    if let Some(b) = bundle {
        params["bundle"] = json!(b.to_string_lossy());
    }
    if app.run("file.exportPrototypeSite", params).is_some() {
        let shown = folder.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default();
        app.toast(trf("Website saved in {folder}: drag that folder onto app.netlify.com/drop to get a link", &[("folder", &shown)]));
        app.services.reveal_path(&folder);
    }
}

#[cfg(test)]
#[path = "viewer_tests.rs"]
mod tests;
