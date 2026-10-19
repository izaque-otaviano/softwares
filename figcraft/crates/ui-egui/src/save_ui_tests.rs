//! Saving as you work in the interface: the line under the file's name, the menu behind the arrow
//! beside it, the version history grouped by day, and the drafts on the home screen. A gallery of
//! PNGs (`FIGCRAFT_SNAPSHOTS=/some/dir cargo test -p figcraft-ui-egui --lib save_gallery`).

use std::path::PathBuf;

use egui::{Pos2, Rect, vec2};
use figcraft_engine::Session;
use serde_json::json;

use crate::file_menu::status_line;
use crate::present::raster_tests::Rec;
use crate::versions::{clock, day_label};

fn scratch(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("figcraft-saveui-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

fn rect(s: &mut Session, x: f64) {
    s.execute("shape.rectangle", &json!({"x": x, "y": 0, "width": 40, "height": 40, "props": {"fill": "#0D99FF"}})).unwrap();
}

#[test]
fn the_line_under_the_name_follows_the_save_state() {
    let dir = scratch("line");
    let drafts = dir.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = Session::new();
    // Not running (a headless session): as it always was.
    let r = Rec::new(s);
    assert_eq!(status_line(&r.u.app).0, "Drafts");
    s = Session::new();
    s.filesave.enabled = true;
    s.filesave.threaded = false;
    s.filesave.drafts_dir = Some(drafts.clone());
    let mut r = Rec::new(s);
    assert_eq!(status_line(&r.u.app).0, "Drafts", "a new file nothing was done to");
    rect(&mut r.u.app.session, 0.0);
    r.u.app.session.filesave_tick(0.0);
    assert_eq!(status_line(&r.u.app).0, "Unsaved changes");
    r.u.app.session.filesave_tick(3.0);
    assert_eq!(status_line(&r.u.app).0, "Saved in Drafts");
    // Saved where the user chose.
    let file = dir.join("a.figcraft").to_string_lossy().into_owned();
    r.u.app.session.execute("file.saveAs", &json!({"path": file})).unwrap();
    assert_eq!(status_line(&r.u.app).0, "Saved");
    // A write that fails says so, with the reason on hover.
    std::fs::remove_file(&file).unwrap();
    std::fs::create_dir(&file).unwrap();
    rect(&mut r.u.app.session, 60.0);
    r.u.app.session.filesave_tick(10.0);
    r.u.app.session.filesave_tick(14.0);
    let (text, warn, why) = status_line(&r.u.app);
    assert_eq!((text, warn), ("Couldn't save", true));
    assert!(why.is_some_and(|w| w.contains("a.figcraft")));
    // Switched off: back to the old line.
    r.u.app.session.execute("pref.autosave", &json!({"on": false})).unwrap();
    assert_eq!(status_line(&r.u.app).0, "Drafts");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn versions_are_headed_by_day_and_timed() {
    let day = 86_400;
    let now = 100 * day + 15 * 3600 + 5 * 60;
    assert_eq!(day_label(now, now - 60), "Today");
    assert_eq!(day_label(now, 99 * day + 23 * 3600), "Yesterday");
    assert_eq!(day_label(now, 90 * day), crate::home_recents::date(90 * day));
    // The clock never panics on any time, and reads like a clock.
    assert_eq!(clock(now), "15:05");
    assert_eq!(clock(0), "00:00");
    assert_eq!(clock(u64::MAX).len(), 5);
    // A time in the future (a wrong clock) is still "today", not a panic.
    assert_eq!(day_label(now, now + 10 * day), "Today");
}

#[test]
fn the_home_screen_lists_the_drafts_and_deletes_one() {
    let dir = scratch("home");
    let drafts = dir.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = Session::new();
    s.filesave.enabled = true;
    s.filesave.threaded = false;
    s.filesave.drafts_dir = Some(drafts.clone());
    s.execute("file.rename", &json!({"name": "Checkout flow"})).unwrap();
    rect(&mut s, 0.0);
    s.filesave_tick(0.0);
    s.filesave_tick(3.0);
    s.execute("file.close", &json!({})).unwrap();
    let mut r = Rec::new(s);
    r.u.app.ui.home = true;
    r.frames(4);
    let shown = r.u.app.ui.home_view.drafts.clone();
    assert_eq!(shown.len(), 1);
    assert_eq!(shown[0].1, "Checkout flow");
    // Deleting through the command (the menu's action) removes the file and the row.
    r.run("file.deleteDraft", json!({"path": shown[0].0}));
    r.u.app.ui.home_view.drafts_read = None;
    r.frames(3);
    assert!(r.u.app.ui.home_view.drafts.is_empty());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn the_file_menu_runs_the_commands_of_the_same_name() {
    // (Row centres below the arrow, in points: the menu lists them 32 apart, a rule between groups.)
    let rows = [("history", 34.0), ("save", 66.0), ("export", 110.0), ("duplicate", 142.0), ("rename", 174.0), ("folder", 218.0)];
    for (what, dy) in rows {
        let mut s = Session::new();
        rect(&mut s, 0.0);
        let mut r = Rec::new(s);
        r.u.app.ui.home = false;
        r.resize(1440.0, 900.0);
        r.frames(3);
        let at = chevron(&r);
        r.click(at);
        r.frames(12);
        r.click(at + vec2(10.0, dy));
        let ui = &r.u.app.ui;
        match what {
            "history" => assert!(ui.versions.open && ui.versions.form.is_none(), "Show version history"),
            "save" => assert!(ui.versions.open && ui.versions.form.is_some(), "Save version…"),
            "export" => assert!(ui.export_preview, "Export…"),
            "duplicate" => assert_eq!(r.u.app.session.docs.len(), 2, "Duplicate"),
            // The name field takes the keyboard (the layers panel clears the flag when it draws).
            "rename" => assert!(!ui.versions.open && r.u.app.session.docs.len() == 1),
            // A file that was never saved has no folder to show: the row is greyed out and does nothing.
            _ => assert!(!ui.versions.open && r.u.app.session.docs.len() == 1, "Show in folder"),
        }
    }
}

/// The arrow beside the file's name.
fn chevron(r: &Rec) -> Pos2 {
    let left = crate::RAIL_W + r.u.app.ui.left_width;
    Pos2::new(left - 62.0, TOP + 24.0)
}

/// The top of the left panel (below the tab strip).
const TOP: f32 = 40.0;

fn gallery_dir() -> Option<PathBuf> {
    std::env::var_os("FIGCRAFT_SNAPSHOTS").map(Into::into)
}

#[test]
fn save_gallery() {
    let Some(dir) = gallery_dir() else { return };
    figcraft_text::scan_system_fonts();
    let scratch = scratch("gallery");
    let drafts = scratch.join("Drafts");
    std::fs::create_dir_all(&drafts).unwrap();
    let mut s = Session::new();
    s.filesave.enabled = true;
    s.filesave.threaded = false;
    s.filesave.drafts_dir = Some(drafts);
    s.execute("file.rename", &json!({"name": "Shop / Checkout"})).unwrap();
    let frame = s.execute("frame.create", &json!({"x": 0, "y": 0, "width": 390, "height": 600, "name": "Cart"})).unwrap();
    let frame = crate::present_tests::id(&frame);
    s.execute("shape.rectangle", &json!({"parent": frame, "x": 24, "y": 40, "width": 342, "height": 120, "props": {"fill": "#0D99FF"}})).unwrap();
    // A history over three days.
    s.execute("file.saveVersion", &json!({"name": "First layout", "description": "Cart and totals"})).unwrap();
    rect(&mut s, 500.0);
    s.execute("version.autosave", &json!({})).unwrap();
    rect(&mut s, 560.0);
    s.execute("file.saveVersion", &json!({"name": "Payment step"})).unwrap();
    let now = figcraft_engine::cmd::comment::now_secs();
    let ages = [3 * 86_400 + 4000, 86_400 + 9000, 5000];
    let n = s.ds().unwrap().versions.len();
    for (i, v) in s.ds_mut().unwrap().versions_mut().iter_mut().enumerate().take(ages.len().min(n)) {
        v.time = now - ages[i];
    }
    s.filesave_tick(0.0);
    s.filesave_tick(4.0);
    let mut r = Rec::new(s);
    r.u.app.ui.home = false;
    r.resize(1440.0, 900.0);
    r.run("view.zoomFit", json!({}));
    r.frames(6);
    let header = Rect::from_min_size(Pos2::new(0.0, 0.0), vec2(420.0, 560.0));
    r.save_region(&dir.join("file-name-saved.png"), header, 2);
    // The arrow's menu.
    let at = chevron(&r);
    r.click(at);
    r.frames(3);
    r.save_region(&dir.join("file-menu.png"), header, 2);
    r.click(Pos2::new(900.0, 500.0));
    // The version history, grouped by day.
    r.run("file.versionHistory", json!({}));
    r.frames(4);
    r.save_region(&dir.join("version-history.png"), Rect::from_min_size(Pos2::ZERO, vec2(420.0, 760.0)), 2);
    // The home screen with a draft.
    r.run("file.close", json!({}));
    r.run("doc.home", json!({}));
    r.u.app.ui.home = true;
    r.frames(6);
    r.save_region(&dir.join("home-drafts.png"), Rect::from_min_size(Pos2::ZERO, vec2(1440.0, 900.0)), 1);
    let _ = std::fs::remove_dir_all(&scratch);
}
