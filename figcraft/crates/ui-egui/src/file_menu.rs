//! The menu behind the arrow beside the file's name at the top of the left panel: the version
//! history, saving a version, export, duplicate, rename and showing the file in its folder. Each
//! item runs the command of the same name (`menus::invoke`), and an item that has nothing to act
//! on is greyed out rather than hidden.

use egui::{CornerRadius, Rect, Sense, Ui, vec2};

use crate::FigApp;
use crate::a11y::Tip;
use crate::i18n::tr;
use crate::icons::{self, Icon};
use crate::theme::Tokens;

/// The arrow button in `r` and its menu.
pub fn button(app: &mut FigApp, ui: &mut Ui, r: Rect) {
    let t = Tokens::get(ui.ctx());
    let resp = ui.interact(r, ui.id().with("file_menu"), Sense::click());
    let open = egui::Popup::is_id_open(ui.ctx(), egui::Popup::default_response_id(&resp));
    if resp.hovered() || open {
        ui.painter().rect_filled(r, CornerRadius::same(5), if open { t.pressed } else { t.hover });
    }
    icons::paint(ui.painter(), Rect::from_center_size(r.center(), vec2(12.0, 12.0)), Icon::Chevron, t.icon);
    crate::a11y::button(&resp, tr("File options"));
    let resp = if open { resp } else { resp.tip(tr("File options")) };
    let mut run = None;
    let (has_doc, path) = {
        let ds = app.session.ds().ok();
        (ds.is_some(), ds.and_then(|d| d.path.clone()))
    };
    let on_disk = cfg!(not(target_arch = "wasm32")) && path.as_deref().is_some_and(|p| std::path::Path::new(p).is_file());
    crate::right::menu_popup(&resp).width(220.0).show(|ui| {
        let item = |ui: &mut Ui, label: &str, id: &'static str, run: &mut Option<&'static str>| {
            if crate::right::menu_item_enabled(ui, label, "", has_doc && crate::menus::available(id)) {
                *run = Some(id);
                ui.close();
            }
        };
        item(ui, tr("Show version history"), "file.versionHistory", &mut run);
        item(ui, tr("Save version…"), "file.saveVersion", &mut run);
        ui.separator();
        item(ui, tr("Export…"), "file.export", &mut run);
        item(ui, tr("Duplicate"), "file.duplicate", &mut run);
        item(ui, tr("Rename"), "file.rename", &mut run);
        if cfg!(not(target_arch = "wasm32")) {
            ui.separator();
            if crate::right::menu_item_enabled(ui, crate::home_recents::reveal_label(), "", on_disk) {
                run = Some("file.showInFolder");
                ui.close();
            }
        }
    });
    match run {
        Some("file.showInFolder") => {
            if let Some(p) = path {
                app.services.reveal_path(std::path::Path::new(&p));
            }
        }
        Some(id) => crate::menus::invoke(app, id),
        None => {}
    }
}

/// The line under the file's name: where its work stands. `(text, is a problem, the reason)`.
/// Without saving as you work it stays what it was: "Drafts".
pub fn status_line(app: &FigApp) -> (&'static str, bool, Option<String>) {
    use figcraft_engine::filesave::SaveStatus;
    let s = &app.session;
    // The browser's storage refused the work (full, blocked): nothing is kept until it clears.
    if let Some(why) = app.services.browser_problem() {
        return (tr("Couldn't save"), true, Some(why));
    }
    let Ok(ds) = s.ds() else { return (tr("Drafts"), false, None) };
    if !s.filesave_active() || ds.branch_of.is_some() {
        return (tr("Drafts"), false, None);
    }
    match s.save_status(ds.uid) {
        Some(SaveStatus::Failed(e)) => (tr("Couldn't save"), true, Some(e.clone())),
        Some(SaveStatus::Saving) => (tr("Saving…"), false, None),
        Some(SaveStatus::Pending) => (tr("Unsaved changes"), false, None),
        None if ds.is_dirty() => (tr("Unsaved changes"), false, None),
        None if ds.path.as_deref().is_some_and(|p| s.is_draft(p)) => (tr("Saved in Drafts"), false, None),
        None if ds.path.is_none() => (tr("Drafts"), false, None),
        None => (tr("Saved"), false, None),
    }
}
