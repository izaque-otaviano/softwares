//! Presenting in a tab ([`tab`]) and the bar's three zones ([`bar`]): Present opens a tab beside
//! the file's, which keeps its state while the editor shows, follows the file's edits and ends with
//! its ×, Ctrl/Cmd+W, a middle click or its file; the window's close button and Quit keep their
//! normal flow with it open. Driven headless through egui (`present_tests`' harness, 1440×900: the
//! tab strip takes 40, the presenter's bar 40 below it).

use std::path::PathBuf;
use std::rc::Rc;

use egui::{Event, Key, Modifiers, Pos2, Rect, ViewportCommand, ViewportEvent, ViewportId, ViewportInfo, pos2};
use figcraft_doc::NodeId;
use figcraft_engine::Session;
use figcraft_engine::share;
use serde_json::{Value, json};

use super::tab;
use super::ux_tests::{click, click_control, control, ex, frame_out, has_text, presenter, press, screen, t, text_at, texts};
use crate::Services;
use crate::present_tests::{Ui, id};

/// Screens A, B and C side by side in an unsaved file; Present from A (the default: a tab).
fn tabbed() -> (Ui, [NodeId; 3]) {
    let mut s = Session::new();
    let ids = [("A", 0.0), ("B", 400.0), ("C", 800.0)]
        .map(|(n, x)| id(&ex(&mut s, "frame.create", json!({"x": x, "y": 0, "width": 300, "height": 400, "name": n}))));
    let mut u = Ui::new(s);
    u.run("proto.present", json!({"start": ids[0]}));
    u.frames(2, Vec::new);
    (u, ids)
}

fn file_name(u: &Ui) -> String {
    u.app.session.doc().map(|d| d.name.clone()).unwrap_or_default()
}

fn tab_info(u: &Ui) -> Value {
    u.app.inspect()["presentTab"].clone()
}

fn rect_of(v: &Value) -> Rect {
    let f = |i: usize| v[i].as_f64().unwrap_or_else(|| panic!("no rectangle: {v}")) as f32;
    Rect::from_min_max(pos2(f(0), f(1)), pos2(f(2), f(3)))
}

/// The middle of the presentation's tab, and of its ×.
fn tab_at(u: &Ui) -> Pos2 {
    rect_of(&tab_info(u)["rect"]).center()
}

fn close_at(u: &Ui) -> Pos2 {
    rect_of(&tab_info(u)["closeRect"]).center()
}

/// The editor shows (its Design tab is on screen), not the presentation.
fn editor_shows(u: &mut Ui) -> bool {
    has_text(&frame_out(u, vec![]), &t("Design"))
}

fn saved(u: &mut Ui) {
    if let Ok(ds) = u.app.session.ds_mut() {
        ds.mark_saved();
    }
}

/// Click the editor's tab (the file's name in the strip).
fn click_file_tab(u: &mut Ui) {
    let out = frame_out(u, vec![]);
    click(u, text_at(&out, &file_name(u)));
    u.frames(2, Vec::new);
}

fn commands(out: &egui::FullOutput) -> Vec<ViewportCommand> {
    out.viewport_output.get(&ViewportId::ROOT).map(|v| v.commands.clone()).unwrap_or_default()
}

// ---------------------------------------------------------------------------------------------
// The tab.

#[test]
fn present_opens_a_tab_beside_the_files_with_a_play_icon_and_the_flow_in_its_title() {
    let (mut u, [a, b, _]) = tabbed();
    assert_eq!(u.app.inspect()["presenting"], json!(true));
    let name = file_name(&u);
    // No flow: the first screen's name.
    assert_eq!(tab_info(&u)["title"], json!(format!("{name} - A")));
    assert_eq!(tab_info(&u)["active"], json!(true));
    assert_eq!(presenter(&u)["tab"], json!(true));
    let out = frame_out(&mut u, vec![]);
    assert!(has_text(&out, &format!("{name} - A")), "{:?}", texts(&out));
    assert!(has_text(&out, &name), "the file's own tab is still there: {:?}", texts(&out));
    // The presentation replaces the editor in the window.
    assert!(!has_text(&out, &t("Design")), "{:?}", texts(&out));
    assert!(has_text(&out, "1 / 3"));
    // The tab sits right after the file's, between it and the new-tab button.
    let tab = rect_of(&tab_info(&u)["rect"]);
    let file = texts(&out).into_iter().find(|(s, _)| *s == name).map(|(_, p)| p).expect("the file's tab");
    assert!(file.x < tab.min.x && tab.min.y == 0.0 && (tab.height() - crate::tabs::HEIGHT).abs() < 2.0, "{file:?} {tab:?}");
    // With a flow starting at the screen presented: the flow's name; it follows a restart.
    u.run("proto.flow.add", json!({"start": b, "name": "Signup"}));
    assert_eq!(tab_info(&u)["title"], json!(format!("{name} - A")), "the flow isn't the one playing");
    u.run("proto.present", json!({"start": b}));
    assert_eq!(tab_info(&u)["title"], json!(format!("{name} - Signup")));
    let _ = a;
}

#[test]
fn the_tab_keeps_its_state_while_the_editor_shows_and_follows_the_files_edits() {
    let (mut u, [a, b, _]) = tabbed();
    press(&mut u, Key::N, Modifiers::NONE);
    assert_eq!(screen(&u), "B");
    // The file's own tab: the editor, and the presentation is still there.
    click_file_tab(&mut u);
    assert!(editor_shows(&mut u));
    assert_eq!(tab_info(&u)["active"], json!(false));
    assert!(u.app.ui.present.is_some() && !crate::present::window::covers_window(&u.app));
    // Edit in the editor: rename the screen being presented, add a screen.
    u.run("node.set", json!({"id": b, "props": {"name": "Beta"}}));
    u.run("frame.create", json!({"x": 1200, "y": 0, "width": 300, "height": 400, "name": "D"}));
    // Back to the presentation: the same screen, with the edits.
    let out = frame_out(&mut u, vec![]);
    assert!(has_text(&out, &format!("{} - A", file_name(&u))), "the tab is still in the strip: {:?}", texts(&out));
    let at = tab_at(&u);
    click(&mut u, at);
    u.frames(2, Vec::new);
    assert_eq!(tab_info(&u)["active"], json!(true));
    assert_eq!(presenter(&u)["current"], json!(b), "it stayed on the screen it was on");
    assert_eq!(screen(&u), "Beta", "and follows the rename");
    assert_eq!(presenter(&u)["position"], json!([2, 4]), "and the new screen");
    assert!(!editor_shows(&mut u));
    let _ = a;
}

#[test]
fn the_tab_closes_with_its_x_ctrl_w_and_a_middle_click_and_only_the_presentation_ends() {
    // The ×.
    let (mut u, _) = tabbed();
    saved(&mut u);
    let at = close_at(&u);
    click(&mut u, at);
    assert!(u.app.ui.present.is_none() && tab_info(&u).is_null());
    assert!(editor_shows(&mut u), "the file's tab shows again");
    assert_eq!(u.app.session.docs.len(), 1, "the file is open");
    // Ctrl/Cmd+W.
    let (mut u, _) = tabbed();
    press(&mut u, Key::W, Modifiers::COMMAND);
    u.frames(2, Vec::new);
    assert!(u.app.ui.present.is_none());
    assert!(editor_shows(&mut u));
    assert_eq!(u.app.session.docs.len(), 1, "Ctrl+W closed the presentation, not the file");
    // A middle click on the tab.
    let (mut u, _) = tabbed();
    let at = tab_at(&u);
    let b = |pressed| Event::PointerButton { pos: at, button: egui::PointerButton::Middle, pressed, modifiers: Modifiers::NONE };
    frame_out(&mut u, vec![Event::PointerMoved(at)]);
    frame_out(&mut u, vec![b(true)]);
    frame_out(&mut u, vec![b(false)]);
    u.frames(2, Vec::new);
    assert!(u.app.ui.present.is_none());
    assert_eq!(u.app.session.docs.len(), 1);
}

#[test]
fn escape_does_not_end_a_tab_but_closes_the_list_and_shows_the_hidden_bar() {
    let (mut u, _) = tabbed();
    press(&mut u, Key::Questionmark, Modifiers::NONE);
    assert_eq!(presenter(&u)["shortcuts"], json!(true));
    press(&mut u, Key::Escape, Modifiers::NONE);
    assert_eq!(presenter(&u)["shortcuts"], json!(false), "the list");
    press(&mut u, Key::Backslash, Modifiers::COMMAND);
    assert_eq!(presenter(&u)["hideUi"], json!(true));
    press(&mut u, Key::Escape, Modifiers::NONE);
    assert_eq!(presenter(&u)["hideUi"], json!(false), "the hidden bar");
    for _ in 0..3 {
        press(&mut u, Key::Escape, Modifiers::NONE);
    }
    assert!(u.app.ui.present.is_some() && tab::active(&u.app), "nothing left for Escape to close: the × does that");
    // The shortcut list doesn't offer it either.
    press(&mut u, Key::Questionmark, Modifiers::NONE);
    let out = frame_out(&mut u, vec![]);
    assert!(has_text(&out, &t("Restart")) && !has_text(&out, &t("Close the presentation")), "{:?}", texts(&out));
}

/// A frame of the window in full screen (the system tells egui so in the viewport's info).
fn full_screen_frame(u: &mut Ui, events: Vec<Event>) -> egui::FullOutput {
    u.time += 1.0 / 60.0;
    let mut viewports = egui::ViewportIdMap::default();
    viewports.insert(ViewportId::ROOT, ViewportInfo { fullscreen: Some(true), ..Default::default() });
    let input = egui::RawInput {
        viewport_id: ViewportId::ROOT,
        viewports,
        screen_rect: Some(Rect::from_min_size(Pos2::ZERO, u.size)),
        time: Some(u.time),
        events,
        ..Default::default()
    };
    let app = &mut u.app;
    let mut out = u.ctx.run_ui(input, |ui| app.ui(ui));
    out.textures_delta.clear();
    out
}

#[test]
fn the_fullscreen_button_toggles_and_escape_leaves_full_screen_before_anything() {
    let (mut u, _) = tabbed();
    // (A click is several frames; the command goes out in the one that released the button.)
    let at = control(&u, false, "fullscreen");
    let b = |pressed| Event::PointerButton { pos: at, button: egui::PointerButton::Primary, pressed, modifiers: Modifiers::NONE };
    frame_out(&mut u, vec![Event::PointerMoved(at)]);
    frame_out(&mut u, vec![b(true)]);
    let sent = commands(&frame_out(&mut u, vec![b(false)]));
    assert!(sent.contains(&ViewportCommand::Fullscreen(true)), "{sent:?}");
    // Full screen is all prototype: the tab strip steps aside, the bar stays.
    let out = full_screen_frame(&mut u, vec![]);
    let name = file_name(&u);
    assert!(!has_text(&out, &format!("{name} - A")) && has_text(&out, &t("Share prototype")), "{:?}", texts(&out));
    // Escape leaves full screen and nothing else.
    press(&mut u, Key::Questionmark, Modifiers::NONE);
    let mut events = vec![Event::PointerMoved(pos2(720.0, 470.0))];
    events.extend(super::ux_tests::key_events(Key::Escape, Modifiers::NONE));
    let sent = commands(&full_screen_frame(&mut u, events));
    assert!(!sent.contains(&ViewportCommand::Fullscreen(false)), "the list first: {sent:?}");
    assert_eq!(presenter(&u)["shortcuts"], json!(false));
    let mut events = vec![Event::PointerMoved(pos2(720.0, 470.0))];
    events.extend(super::ux_tests::key_events(Key::Escape, Modifiers::NONE));
    let sent = commands(&full_screen_frame(&mut u, events));
    assert!(sent.contains(&ViewportCommand::Fullscreen(false)), "{sent:?}");
    assert!(u.app.ui.present.is_some());
}

#[test]
fn the_tab_ends_with_its_file_and_another_files_tab_takes_the_window() {
    let (mut u, _) = tabbed();
    // A new file: its tab shows; the presentation's stays, with its state.
    u.app.run("file.new", json!({}));
    u.frames(3, Vec::new);
    assert_eq!(u.app.session.docs.len(), 2);
    assert_eq!(tab_info(&u)["active"], json!(false));
    assert!(editor_shows(&mut u));
    assert!(u.app.ui.present.is_some());
    // The presentation's tab brings its own file back.
    let at = tab_at(&u);
    click(&mut u, at);
    u.frames(2, Vec::new);
    assert_eq!(u.app.session.active, 0);
    assert_eq!(tab_info(&u)["active"], json!(true));
    assert!(!editor_shows(&mut u));
    // Closing the file it plays ends it, whichever tab shows.
    u.app.run("doc.switch", json!({"index": 1}));
    u.frames(2, Vec::new);
    assert!(u.app.ui.present.is_some());
    u.app.session.execute("file.close", &json!({"index": 0, "force": true})).ok();
    u.frames(2, Vec::new);
    assert!(u.app.ui.present.is_none(), "its file closed");
    assert!(tab_info(&u).is_null());
    assert!(editor_shows(&mut u));
}

// ---------------------------------------------------------------------------------------------
// Through the control channel, the command and the Options menu.

#[test]
fn proto_present_opens_the_tab_through_the_control_channel_and_reports_it() {
    let mut s = Session::new();
    let [a, b] =
        [("A", 0.0), ("B", 400.0)].map(|(n, x)| id(&ex(&mut s, "frame.create", json!({"x": x, "y": 0, "width": 300, "height": 400, "name": n}))));
    let mut u = Ui::new(s);
    let run = |u: &mut Ui, p: Value| {
        let r = crate::control::handle(&mut u.app, &u.ctx, "engine.execute", &json!({"command": "proto.present", "params": p}));
        u.frames(2, Vec::new);
        r
    };
    run(&mut u, json!({"start": a})).expect("engine.execute");
    let inspect = u.app.inspect();
    assert_eq!(inspect["presenting"], json!(true));
    assert_eq!(inspect["presentTab"]["active"], json!(true));
    assert_eq!(inspect["presentTab"]["title"], json!(format!("{} - A", file_name(&u))));
    assert_eq!(inspect["presenter"]["tab"], json!(true));
    // `fullWindow` covers the editor's window instead, without a tab.
    u.app.ui.present = None;
    run(&mut u, json!({"start": b, "mode": "fullWindow"})).expect("engine.execute");
    assert!(u.app.inspect()["presentTab"].is_null());
    assert_eq!(presenter(&u)["tab"], json!(false));
    assert!(crate::present::window::covers_window(&u.app) && !tab::is_tab(&u.app));
    // A mode that isn't one is an error, and nothing opens.
    u.app.ui.present = None;
    assert!(run(&mut u, json!({"start": a, "mode": "sideways"})).is_err());
    assert!(u.app.ui.present.is_none());
    // The window's Options entry moves it to a window of its own and back to the tab.
    u.ctx.set_embed_viewports(false);
    run(&mut u, json!({"start": a})).expect("engine.execute");
    super::window::apply(&mut u.app, &u.ctx, true);
    assert_eq!(presenter(&u)["window"], json!(true));
    assert!(tab_info(&u).is_null(), "the tab goes while a window plays");
    super::window::apply(&mut u.app, &u.ctx, false);
    u.frames(2, Vec::new);
    assert_eq!(tab_info(&u)["active"], json!(true), "and comes back");
    assert_eq!(presenter(&u)["window"], json!(false));
}

#[test]
fn full_window_presenting_has_its_way_out_in_the_options_menu() {
    // (The replacement of the old bar's Close.) Escape ends it as before, a tab has no such entry.
    let (mut u, [a, ..]) = tabbed();
    click_control(&mut u, "options");
    let menu = frame_out(&mut u, vec![]);
    assert!(!has_text(&menu, &t("Close the presentation")), "a tab has its ×: {:?}", texts(&menu));
    assert!(has_text(&menu, &t("Restart")), "(the menu is open)");
    press(&mut u, Key::Escape, Modifiers::NONE);
    u.app.ui.present = None;
    u.run("proto.present", json!({"start": a, "mode": "fullWindow"}));
    click_control(&mut u, "options");
    let menu = frame_out(&mut u, vec![]);
    click(&mut u, text_at(&menu, &t("Close the presentation")));
    assert!(u.app.ui.present.is_none());
    assert!(editor_shows(&mut u));
}

// ---------------------------------------------------------------------------------------------
// The window's close button and Quit.

/// One frame of the main window as eframe runs it: the app's `logic` reads the window's close
/// request first, then it draws.
fn main_out(u: &mut Ui, close: bool) -> egui::FullOutput {
    u.time += 1.0 / 60.0;
    let mut viewports = egui::ViewportIdMap::default();
    viewports.insert(ViewportId::ROOT, ViewportInfo { events: if close { vec![ViewportEvent::Close] } else { Vec::new() }, ..Default::default() });
    let input = egui::RawInput {
        viewport_id: ViewportId::ROOT,
        viewports,
        screen_rect: Some(Rect::from_min_size(Pos2::ZERO, u.size)),
        time: Some(u.time),
        ..Default::default()
    };
    let app = &mut u.app;
    let mut out = u.ctx.run_ui(input, |ui| {
        crate::windows::on_close_request(app, ui.ctx());
        app.ui(ui);
    });
    out.textures_delta.clear();
    out
}

fn lets_close(out: &egui::FullOutput) -> bool {
    !commands(out).contains(&ViewportCommand::CancelClose)
}

#[test]
fn the_windows_close_button_with_a_presentation_tab_open_asks_about_unsaved_changes() {
    let (mut u, _) = tabbed();
    assert!(u.app.session.ds().is_ok_and(|d| d.is_dirty()), "(the screens are unsaved)");
    // Not the presentation's end: the first press asks the normal question, over the tab.
    let out = main_out(&mut u, true);
    assert!(u.app.ui.present.is_some() && tab::active(&u.app), "the presentation is left alone");
    assert!(!lets_close(&out) && u.app.ui.confirm_close && !u.app.ui.quit);
    let out = main_out(&mut u, false);
    assert!(has_text(&out, &t("Unsaved changes")), "the question shows on the tab: {:?}", texts(&out));
    // Cancelling it keeps everything; discarding closes the window (the app) as before.
    click(&mut u, text_at(&out, &t("Cancel")));
    assert!(!u.app.ui.confirm_close && u.app.ui.present.is_some());
    let out = main_out(&mut u, true);
    assert!(u.app.ui.confirm_close && !lets_close(&out));
    let out = main_out(&mut u, false);
    click(&mut u, text_at(&out, &t("Close without saving")));
    let out = main_out(&mut u, false);
    assert!(u.app.ui.quit || commands(&out).contains(&ViewportCommand::Close), "{:?}", commands(&out));
}

#[test]
fn the_windows_close_button_with_nothing_unsaved_closes_the_window_despite_the_tab() {
    let (mut u, _) = tabbed();
    saved(&mut u);
    let out = main_out(&mut u, true);
    assert!(lets_close(&out) && u.app.ui.quit, "{:?}", commands(&out));
    assert!(u.app.ui.present.is_some(), "(it goes with the app)");
}

#[test]
fn quit_with_a_presentation_open_asks_about_unsaved_changes_in_the_tab_and_full_window() {
    for mode in ["tab", "fullWindow"] {
        let mut s = Session::new();
        let a = id(&ex(&mut s, "frame.create", json!({"x": 0, "y": 0, "width": 300, "height": 400, "name": "A"})));
        let mut u = Ui::new(s);
        u.run("proto.present", json!({"start": a, "mode": mode}));
        u.frames(2, Vec::new);
        let ctx = u.ctx.clone();
        crate::windows::request_quit(&mut u.app, &ctx);
        assert!(u.app.ui.confirm_quit && !u.app.ui.quit, "{mode}");
        frame_out(&mut u, vec![]);
        let out = frame_out(&mut u, vec![]);
        assert!(has_text(&out, &t("Unsaved changes")), "{mode}: the question shows over the presentation: {:?}", texts(&out));
        assert!(u.app.ui.present.is_some(), "{mode}: and the presentation isn't what it ends");
        click(&mut u, text_at(&out, &t("Cancel")));
        assert!(!u.app.ui.confirm_quit && !u.app.ui.quit, "{mode}");
    }
}

// ---------------------------------------------------------------------------------------------
// The bar.

#[test]
fn the_bar_has_three_zones_in_a_dark_strip_below_the_tab_strip() {
    let (mut u, _) = tabbed();
    let x = |name: &str| control(&u, false, name);
    let (logo, comments, file, avatar, share, options, full) =
        (x("logo"), x("comments"), x("file"), x("avatar"), x("share"), x("options"), x("fullscreen"));
    // Left to right: mark, Comments | the file's name | avatar, Share prototype, Options, full screen.
    assert!(logo.x < comments.x && comments.x < file.x && file.x < avatar.x, "{logo:?} {comments:?} {file:?} {avatar:?}");
    assert!(avatar.x < share.x && share.x < options.x && options.x < full.x, "{avatar:?} {share:?} {options:?} {full:?}");
    // The file's name sits at the middle of the window.
    assert!((file.x - 720.0).abs() < 60.0, "{file:?}");
    // A 40 point bar under the 40 point tab strip, the controls centred in it.
    for p in [logo, comments, file, avatar, share, options, full] {
        assert_eq!(p.y, 60.0, "{p:?}");
    }
    // What the old bar had as text buttons isn't there.
    let controls = presenter(&u)["controls"].clone();
    for gone in ["close", "restart", "inspect", "help", "screens"] {
        assert!(controls.get(gone).is_none(), "{gone} is still a button: {controls}");
    }
    // The prototype sits below both strips.
    let screen = presenter(&u)["screenRect"].clone();
    assert!(screen[1].as_f64().unwrap_or(0.0) >= 80.0, "{screen}");
    let out = frame_out(&mut u, vec![]);
    assert!(has_text(&out, &t("Share prototype")), "{:?}", texts(&out));
    assert!(has_text(&out, &file_name(&u)), "the file's name");
}

#[test]
fn the_file_name_menu_lists_the_flows_and_the_screens_and_the_counter_stays_beside_the_name() {
    let mut s = Session::new();
    let ids = ["A", "B", "C"]
        .iter()
        .enumerate()
        .map(|(i, n)| id(&ex(&mut s, "frame.create", json!({"x": 400.0 * i as f64, "y": 0, "width": 300, "height": 400, "name": n}))));
    let ids: Vec<NodeId> = ids.collect();
    ex(&mut s, "proto.flow.add", json!({"start": ids[0], "name": "Onboarding"}));
    ex(&mut s, "proto.flow.add", json!({"start": ids[2], "name": "Checkout"}));
    let mut u = Ui::new(s);
    u.run("proto.present", json!({"start": ids[0]}));
    u.frames(2, Vec::new);
    // The counter and its buttons are in the centre, beside the file's name (quieter).
    let (file, position, next) = (control(&u, false, "file"), control(&u, false, "position"), control(&u, false, "next"));
    assert!(file.x < position.x && position.x < next.x, "{file:?} {position:?} {next:?}");
    assert_eq!(presenter(&u)["position"], json!([1, 3]));
    // The menu: both flows, then the screens; a flow starts over there, a screen shows at once.
    click_control(&mut u, "file");
    let menu = frame_out(&mut u, vec![]);
    for label in ["Onboarding", "Checkout", "B", "C"] {
        assert!(has_text(&menu, label), "{label}: {:?}", texts(&menu));
    }
    click(&mut u, text_at(&menu, "B"));
    assert_eq!(presenter(&u)["current"], json!(ids[1]), "a screen");
    assert_eq!(presenter(&u)["history"], json!([ids[0]]), "keeping where it came from");
    click_control(&mut u, "file");
    let menu = frame_out(&mut u, vec![]);
    click(&mut u, text_at(&menu, "Checkout"));
    assert_eq!(presenter(&u)["current"], json!(ids[2]), "a flow");
    assert_eq!(presenter(&u)["start"], json!(ids[2]));
    assert_eq!(tab_info(&u)["title"], json!(format!("{} - Checkout", file_name(&u))), "the tab follows the flow");
}

#[test]
fn the_comments_button_toggles_the_comments_and_options_has_what_the_bar_lost() {
    let (mut u, _) = tabbed();
    click_control(&mut u, "comments");
    assert_eq!(presenter(&u)["comments"], json!(true));
    click_control(&mut u, "comments");
    assert_eq!(presenter(&u)["comments"], json!(false));
    // Inspect, Restart, the screens panel and the shortcut list are Options entries.
    click_control(&mut u, "options");
    let menu = frame_out(&mut u, vec![]);
    for label in ["Inspect", "Restart", "Screens", "Keyboard shortcuts", "Hide UI", "Auto-hide the bar", "Open in new window"] {
        assert!(has_text(&menu, &t(label)), "{label}: {:?}", texts(&menu));
    }
    click(&mut u, text_at(&menu, &t("Inspect")));
    assert_eq!(presenter(&u)["inspect"], json!(true));
    press(&mut u, Key::N, Modifiers::NONE);
    click_control(&mut u, "options");
    let menu = frame_out(&mut u, vec![]);
    click(&mut u, text_at(&menu, &t("Restart")));
    assert_eq!(screen(&u), "A");
}

#[test]
fn the_avatar_shows_you_and_its_menu_the_people_in_the_file() {
    let (mut u, _) = tabbed();
    let you = u.app.session.prefs.user_name.clone();
    click_control(&mut u, "avatar");
    let menu = frame_out(&mut u, vec![]);
    assert!(has_text(&menu, &crate::i18n::trf("{name} (you)", &[("name", &you)])), "{:?}", texts(&menu));
    assert!(has_text(&menu, &t("Nobody else is here yet")), "{:?}", texts(&menu));
    // A narrow window leaves it out, the rest stays.
    press(&mut u, Key::Escape, Modifiers::NONE);
    u.size = egui::vec2(600.0, 700.0);
    u.frames(3, Vec::new);
    let controls = presenter(&u)["controls"].clone();
    assert!(controls.get("avatar").is_none() && controls.get("share").is_some() && controls.get("options").is_some(), "{controls}");
}

/// Services that pick the folders a test gives, in order, and remember how often they were asked.
struct Picks(Vec<PathBuf>, Rc<std::cell::Cell<usize>>);
impl Services for Picks {
    fn pick_folder(&mut self, _title: &str) -> Option<PathBuf> {
        self.1.set(self.1.get() + 1);
        (!self.0.is_empty()).then(|| self.0.remove(0))
    }
}

#[test]
fn share_prototype_runs_the_website_export_for_the_screen_presented() {
    let root = std::env::temp_dir().join(format!("figcraft-present-share-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    let bundle = root.join("dist");
    std::fs::create_dir_all(&bundle).unwrap();
    std::fs::write(bundle.join("index.html"), "<title>FigCraft</title>").unwrap();
    std::fs::write(bundle.join("figcraft-web-1_bg.wasm"), "w").unwrap();
    let dest = root.join("Desktop");
    std::fs::create_dir_all(&dest).unwrap();
    let (mut u, [_, b, _]) = tabbed();
    u.run("proto.present", json!({"start": b}));
    u.run("file.rename", json!({"name": "Shop"}));
    let asked = Rc::new(std::cell::Cell::new(0));
    u.app.services = Box::new(Picks(vec![bundle, dest.clone()], asked.clone()));
    click_control(&mut u, "share");
    assert!(asked.get() >= 1, "the export dialog asked for a folder");
    assert!(u.app.ui.last_error.is_none(), "{:?}", u.app.ui.last_error);
    let site = dest.join("Shop (site)");
    assert!(site.join("index.html").is_file() && site.join(share::CONFIG_FILE).is_file(), "the website is written");
    // It starts on the screen being presented.
    let (cfg, _) = share::read_site(&site).unwrap();
    assert!(cfg.start.as_deref().is_some_and(|s| s.contains(&b.0.to_string())), "{cfg:?} (B is {b:?})");
    assert!(u.app.ui.present.is_some(), "and the presentation goes on");
    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn share_prototype_is_disabled_with_a_tooltip_where_there_is_no_folder_to_write_to() {
    let (mut u, _) = tabbed();
    // As in the browser build.
    if let Some(p) = u.app.ui.present.as_mut() {
        p.ux.web = true;
    }
    u.frames(2, Vec::new);
    assert!(!super::bar::share_available(u.app.ui.present.as_ref().expect("presenting")));
    let asked = Rc::new(std::cell::Cell::new(0));
    u.app.services = Box::new(Picks(vec![], asked.clone()));
    click_control(&mut u, "share");
    assert_eq!(asked.get(), 0, "a click does nothing");
    assert!(u.app.ui.toast.is_none() && u.app.ui.last_error.is_none());
    // Greyed, and it says why.
    let at = control(&u, false, "share");
    frame_out(&mut u, vec![Event::PointerMoved(pos2(300.0, 500.0))]);
    u.frames(5, Vec::new);
    frame_out(&mut u, vec![Event::PointerMoved(at)]);
    u.frames(120, Vec::new);
    let out = frame_out(&mut u, vec![]);
    assert!(
        has_text(&out, &t("Share prototype is available in the desktop app: the browser can't write a website into a folder")),
        "{:?}",
        texts(&out)
    );
    // The native build has it.
    assert_eq!(super::bar::share_available(&super::Presenter::new(NodeId(1))), !cfg!(target_arch = "wasm32"));
}

#[test]
fn the_bar_can_rest_hidden_after_a_few_seconds_and_the_pointer_at_the_top_brings_it_back() {
    let (mut u, _) = tabbed();
    // Off by default: the bar stays (and the prototype keeps its place under it).
    assert_eq!(u.app.inspect()["presentOptions"]["hideUi"], json!(false));
    assert_eq!(presenter(&u)["autoHide"], json!(false));
    u.time += 10.0;
    u.frames(3, Vec::new);
    assert!(!presenter(&u)["controls"]["options"].is_null(), "still there");
    // On: it shows to begin with, then slides away once the pointer has stayed off the top.
    click_control(&mut u, "options");
    let menu = frame_out(&mut u, vec![]);
    click(&mut u, text_at(&menu, &t("Auto-hide the bar")));
    assert_eq!(presenter(&u)["autoHide"], json!(true));
    assert_eq!(u.app.inspect()["presentOptions"]["autoHide"], json!(true), "kept for the next presentation");
    let at = pos2(700.0, 500.0);
    frame_out(&mut u, vec![Event::PointerMoved(at)]);
    assert!(presenter(&u)["barReveal"].as_f64().unwrap_or(0.0) > 0.0, "shown at first");
    for _ in 0..12 {
        u.time += 0.5;
        frame_out(&mut u, vec![Event::PointerMoved(at)]);
    }
    u.frames(20, Vec::new);
    assert_eq!(presenter(&u)["barReveal"].as_f64(), Some(0.0), "away after a few seconds");
    // The pointer at the top edge brings it back.
    for _ in 0..30 {
        frame_out(&mut u, vec![Event::PointerMoved(pos2(700.0, 41.0))]);
    }
    assert_eq!(presenter(&u)["barReveal"].as_f64(), Some(1.0));
}
