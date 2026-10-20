//! The home screen's "Files in this browser" (the web version): the work the browser keeps for
//! this site, with a plain warning about what that means, a download of each file and a way to
//! forget it. Desktop builds list nothing here (their files are on disk; see `home` for drafts).

use egui::{Color32, Sense, Ui, vec2};
use serde_json::json;

use crate::FigApp;
use crate::a11y;
use crate::home::{FileRow, file_row};
use crate::i18n::{tr, trf};
use crate::icons::Icon;
use crate::theme::{ACCENT, Tokens, regular};

pub fn section(app: &mut FigApp, ui: &mut Ui, t: &Tokens) {
    let files = app.services.browser_files();
    let problem = app.services.browser_problem();
    if files.is_empty() && problem.is_none() {
        return;
    }
    ui.add_space(28.0);
    ui.label(egui::RichText::new(tr("Files in this browser")).font(crate::theme::semibold(12.0)).color(t.text_secondary));
    ui.add_space(8.0);
    // The warning is not small print: clearing site data erases these files.
    ui.scope(|ui| {
        ui.set_max_width(640.0);
        ui.add(
            egui::Label::new(
                egui::RichText::new(tr(
                    "These files are kept only in this browser, on this computer. Clearing the site's data or using a private window erases them: download a copy of anything you want to keep.",
                ))
                .font(regular(11.0))
                .color(t.text_secondary),
            )
            .wrap(),
        );
    });
    if let Some(p) = &problem {
        ui.add_space(6.0);
        ui.label(egui::RichText::new(p).font(regular(11.0)).color(t.danger));
    }
    ui.add_space(8.0);
    let now = figcraft_engine::cmd::comment::now_secs();
    let (mut open, mut download, mut delete) = (None, None, None);
    for f in files.iter().take(50) {
        let (r, _) = ui.allocate_exact_size(vec2(ui.available_width().min(640.0), 36.0), Sense::hover());
        let resp = ui.interact(r, ui.id().with(("browser_file", &f.id)), Sense::click());
        a11y::button(&resp, &f.name);
        let detail = crate::home_recents::edited(now, f.modified);
        file_row(
            ui,
            t,
            r,
            &resp,
            &FileRow {
                mark: Some((Icon::Document, ACCENT)),
                name: &f.name,
                ink: t.text,
                detail: &detail,
                detail_size: 11.0,
                detail_ink: t.text_secondary,
            },
        );
        crate::right::context_popup(&resp).show(|ui| {
            if crate::right::menu_item(ui, tr("Open"), "") {
                open = Some(f.clone());
                ui.close();
            }
            if crate::right::menu_item(ui, tr("Download a copy"), "") {
                download = Some(f.clone());
                ui.close();
            }
            if crate::right::menu_item_enabled(ui, tr("Remove from this browser"), "", f.open.is_none()) {
                delete = Some(f.id.clone());
                ui.close();
            }
        });
        if resp.clicked() {
            open = Some(f.clone());
        }
    }
    if let Some(f) = open {
        open_file(app, &f);
    }
    if let Some(f) = download {
        match app.services.browser_file_bytes(&f.id) {
            Some(bytes) => {
                let name = format!("{}.figcraft", f.name);
                if app.services.download(&name, &bytes) {
                    app.toast(trf("Downloaded {name}", &[("name", &name)]));
                }
            }
            None => app.toast(tr("That file can't be read any more")),
        }
    }
    if let Some(id) = delete {
        app.services.browser_delete(&id);
        app.toast(tr("Removed from this browser"));
    }
}

/// Open a browser file in a tab (a file already open is switched to).
fn open_file(app: &mut FigApp, f: &crate::BrowserFile) {
    if let Some(uid) = f.open {
        if let Some(i) = app.session.docs.iter().position(|d| d.uid == uid) {
            app.run("doc.switch", json!({"index": i}));
            app.ui.home = false;
        }
        return;
    }
    let Some(bytes) = app.services.browser_file_bytes(&f.id) else {
        app.toast(tr("That file can't be read any more"));
        return;
    };
    use base64::Engine as _;
    let data = base64::engine::general_purpose::STANDARD.encode(bytes);
    if let Some(r) = app.run("file.openData", json!({"data": data, "name": format!("{}.figcraft", f.name)})) {
        if let Some(uid) = r.get("index").and_then(serde_json::Value::as_u64).and_then(|i| app.session.docs.get(i as usize)).map(|d| d.uid) {
            app.services.browser_adopt(&f.id, uid);
        }
        app.ui.home = false;
    }
}
