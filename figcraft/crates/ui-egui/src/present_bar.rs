//! The full-window presenter's top bar, in three zones on a dark, 40-point strip:
//!
//! - left: the app's mark (it opens the main menu) and the Comments toggle;
//! - centre: the file's name with a caret that opens the flows and screens, and, beside it and
//!   quieter, the screen's name with "3 / 12" between previous and next;
//! - right: your avatar (you and the others in the file), the primary "Share prototype" button
//!   (the website export), the Options menu and the full-screen toggle.
//!
//! Everything else the old bar had as text buttons (Inspect, Restart, Close, the screens panel and
//! the shortcut list) is in the Options menu, or on its key. The preview pane keeps the small icon
//! bar of `present::top_bar`.
//!
//! A child module of `present`: it works on the player's private state.

use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Response, Sense, Ui, pos2, vec2};
use figcraft_doc::NodeKind;
use figcraft_doc::proto::Flow;

use super::ux::{self, BarColors};
use super::{BarAction, Presenter, options_menu, page_settings, panel};
use crate::FigApp;
use crate::a11y::Tip;
use crate::i18n::{tr, trf};
use crate::icons::{self, Icon};
use crate::theme::{ACCENT, Tokens, regular, semibold};

/// An icon button's side, the gap between neighbours and the bar's padding at both ends.
const BTN: f32 = 28.0;
const GAP: f32 = 6.0;
const PAD: f32 = 10.0;
/// The Share button's height, and the room its label gets either side.
const SHARE_H: f32 = 28.0;
const SHARE_PAD: f32 = 14.0;
/// The avatar's radius, and the room the avatar and its caret take together.
const AVATAR_R: f32 = 11.0;
const AVATAR_W: f32 = 2.0 * AVATAR_R + 4.0 + 10.0;
/// Under this width the avatar leaves the bar (the file's name needs the room).
const AVATAR_MIN_BAR: f32 = 640.0;
/// The least the file name's button keeps of its width (points).
const MIN_FILE_W: f32 = 72.0;
/// The room the screen's name (at least 48 of it), the counter and its two buttons need after the
/// file's name.
const TAIL_MIN: f32 = 48.0 + 8.0 + 22.0 + 4.0 + 36.0 + 4.0 + 22.0;

/// Whether "Share prototype" can run here: it writes a website into a folder, which the browser
/// has none for.
pub fn share_available(p: &Presenter) -> bool {
    !p.ux.web
}

/// Who the avatar shows: you (the live session's name and colour, else the name in Preferences)
/// and the others in the file's live session. Call each frame before the bar draws.
pub fn note_people(app: &FigApp, ctx: &egui::Context, p: &mut Presenter) {
    let t = Tokens::get(ctx);
    let live = app.session.live();
    let name = match live.info.as_ref() {
        Some(i) if !i.name.is_empty() => i.name.clone(),
        _ => app.session.prefs.user_name.clone(),
    };
    let fill = live.info.as_ref().map_or(t.success, |i| crate::live::color(&i.color));
    p.ux.me = Some((name, fill));
    p.ux.peers = live.peers.values().map(|q| (q.name.clone(), crate::live::color(&q.color))).collect();
}

/// One icon button of the bar, centred at `(cx, cy)`; `on` fills it with the accent (a toggle that
/// is on). The response is the click target.
fn icon_button(p: &mut Presenter, ui: &mut Ui, name: &str, at: Pos2, icon: Icon, tip: String, on: bool, c: &BarColors) -> Response {
    let r = Rect::from_center_size(at, vec2(BTN, BTN));
    p.ux.note(name, r);
    let resp = ui.interact(r, ui.id().with(("pbar", name)), Sense::click()).tip(tip);
    if on {
        ui.painter().rect_filled(r, CornerRadius::same(6), ACCENT);
    } else if resp.hovered() {
        ui.painter().rect_filled(r, CornerRadius::same(6), c.hover);
    }
    icons::paint(ui.painter(), Rect::from_center_size(r.center(), vec2(16.0, 16.0)), icon, c.text);
    resp
}

/// The bar above the prototype: see the module's description. Returns what it asked for.
pub(super) fn top_bar(p: &mut Presenter, ui: &mut Ui, bar: Rect, now: f64) -> Option<BarAction> {
    let ctx = ui.ctx().clone();
    let t = Tokens::get(&ctx);
    // Dark in both themes (it frames the prototype, not the editor).
    let c = BarColors { text: t.menu_text, dim: t.menu_dim, hover: Color32::from_white_alpha(28) };
    // (A shade above the menus' black, so that it stands out over a dark prototype.)
    ui.painter().rect_filled(bar, CornerRadius::ZERO, t.menu.lerp_to_gamma(Color32::WHITE, 0.0622));
    let doc = p.doc.as_ref()?;
    let file = doc.name.clone();
    let screen = doc.node(p.current).map(|n| n.name.clone()).unwrap_or_default();
    let flows: Vec<Flow> = match doc.page_of(p.start).and_then(|pg| doc.node(pg)).map(|n| &n.kind) {
        Some(NodeKind::Page { flows, .. }) => flows.clone(),
        _ => vec![],
    };
    let device = page_settings(doc, p.current).device();
    let viewer = p.ux.viewer;
    let cy = bar.center().y;
    let mut action = None;

    // ---- Right, from the end: full screen, Options, Share prototype, the avatar.
    let mut x = bar.max.x - PAD;
    let full = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
    let tip = format!("{} ({})", if full { tr("Exit full screen") } else { tr("Full screen") }, ux::spec(ux::Act::Fullscreen));
    x -= BTN / 2.0;
    if icon_button(p, ui, "fullscreen", pos2(x, cy), Icon::Fullscreen, tip, full, &c).clicked() {
        ux::run(p, ux::Act::Fullscreen, &ctx, now, false);
    }
    x -= BTN / 2.0 + GAP + BTN / 2.0;
    let resp = icon_button(p, ui, "options", pos2(x, cy), Icon::Adjust, tr("Options").to_string(), false, &c);
    crate::right::menu_popup(&resp)
        .width(220.0)
        .close_behavior(egui::PopupCloseBehavior::CloseOnClickOutside)
        .show(|ui| options_menu(p, ui, device, now));
    x -= BTN / 2.0 + GAP;
    // A shared prototype's visitor can't export it (the file isn't theirs to share).
    if !viewer {
        let enabled = share_available(p);
        let label = tr("Share prototype");
        let w = ui.painter().layout_no_wrap(label.to_string(), semibold(12.0), c.text).size().x + 2.0 * SHARE_PAD;
        let r = Rect::from_min_size(pos2(x - w, cy - SHARE_H / 2.0), vec2(w, SHARE_H));
        p.ux.note("share", r);
        // (A greyed button still senses the pointer, for its tooltip; a click does nothing.)
        let mut resp = ui.interact(r, ui.id().with(("pbar", "share")), Sense::click());
        resp = if enabled {
            resp.tip(tr("Export the prototype as a website to share it"))
        } else {
            resp.on_hover_text(tr("Share prototype is available in the desktop app: the browser can't write a website into a folder"))
        };
        let (fill, ink) = if !enabled {
            (Color32::from_white_alpha(22), c.dim)
        } else if resp.hovered() {
            (t.accent_hover, Color32::WHITE)
        } else {
            (ACCENT, Color32::WHITE)
        };
        ui.painter().rect_filled(r, CornerRadius::same(6), fill);
        ui.painter().text(r.center(), Align2::CENTER_CENTER, label, semibold(12.0), ink);
        if enabled && resp.clicked() {
            action = Some(BarAction::Share);
        }
        x = r.min.x - GAP - 2.0;
    }
    // Your avatar with a caret: who is in the file. (Left out of a narrow bar, and from a shared
    // prototype: its visitor has no profile here.)
    if !viewer && bar.width() >= AVATAR_MIN_BAR {
        let r = Rect::from_min_size(pos2(x - AVATAR_W - 8.0, cy - BTN / 2.0), vec2(AVATAR_W + 8.0, BTN));
        p.ux.note("avatar", r);
        let (name, fill) = p.ux.me.clone().unwrap_or_else(|| (String::new(), ACCENT));
        let resp = ui.interact(r, ui.id().with(("pbar", "avatar")), Sense::click());
        let resp = resp.tip(if name.is_empty() { tr("You").to_string() } else { name.clone() });
        if resp.hovered() {
            ui.painter().rect_filled(r, CornerRadius::same(6), c.hover);
        }
        crate::live::avatar(ui.painter(), pos2(r.min.x + 4.0 + AVATAR_R, cy), AVATAR_R, &name, fill);
        icons::paint(ui.painter(), Rect::from_center_size(pos2(r.max.x - 9.0, cy), vec2(9.0, 9.0)), Icon::Chevron, c.dim);
        let peers = p.ux.peers.clone();
        crate::right::menu_popup(&resp).width(220.0).show(|ui| {
            let row = |ui: &mut Ui, label: &str, fill: Color32| {
                crate::right::menu_item_with(ui, label, "", 22.0, |painter, r, _| {
                    crate::live::avatar(painter, pos2(r.max.x - 15.0, r.center().y), 8.0, label, fill)
                })
            };
            row(ui, &trf("{name} (you)", &[("name", &name)]), fill);
            for (who, color) in &peers {
                row(ui, who, *color);
            }
            if peers.is_empty() {
                let t = Tokens::get(ui.ctx());
                crate::widgets::label(ui, tr("Nobody else is here yet"), t.menu_dim);
            }
        });
        x = r.min.x - GAP;
    }
    let right_start = x;

    // ---- Left: the app's mark (the main menu), Comments.
    let mut lx = bar.min.x + PAD + BTN / 2.0;
    let logo_tip = if viewer { "FigCraft".to_string() } else { tr("Main menu").to_string() };
    let logo = Rect::from_center_size(pos2(lx, cy), vec2(BTN, BTN));
    p.ux.note("logo", logo);
    let resp = ui.interact(logo, ui.id().with(("pbar", "logo")), Sense::click());
    let resp = if viewer { resp.on_hover_text(&logo_tip) } else { resp.tip(&logo_tip) };
    if resp.hovered() && !viewer {
        ui.painter().rect_filled(logo, CornerRadius::same(6), c.hover);
    }
    icons::paint(ui.painter(), Rect::from_center_size(logo.center(), vec2(16.0, 16.0)), Icon::Logo, ACCENT);
    if !viewer && resp.clicked() {
        action = Some(BarAction::Menu);
    }
    lx += BTN + 4.0;
    // (A shared prototype has no comments.)
    if !viewer {
        let resp = icon_button(p, ui, "comments", pos2(lx, cy), Icon::Comment, tr("Show comments (Shift+C)").to_string(), p.view.comments, &c);
        if resp.clicked() {
            action = Some(BarAction::Comments);
        }
        lx += BTN;
    }
    let left_end = lx + BTN / 2.0;

    // ---- Centre: the file's name with the flows and screens behind it, then the screen's name
    // and "3 / 12" beside it. The name sits at the bar's middle where the zones leave room.
    let room = (right_start - GAP - left_end).max(0.0);
    let file_font = semibold(12.0);
    let galley = ui.painter().layout_no_wrap(file.clone(), file_font.clone(), c.text);
    let caret = 16.0;
    let want_w = galley.size().x + 2.0 * 10.0 + caret;
    let w = want_w.min((room * 0.6).max(MIN_FILE_W)).max(MIN_FILE_W.min(room));
    // (A narrow bar moves it left, so that the screen's name and the counter keep their room.)
    let at = (bar.center().x - w / 2.0).min(right_start - GAP - w - 8.0 - TAIL_MIN).max(left_end);
    let at = at.min((right_start - GAP - w).max(left_end));
    let fr = Rect::from_min_size(pos2(at, cy - 14.0), vec2(w, 28.0));
    p.ux.note("file", fr);
    let clip = ui.painter().with_clip_rect(Rect::from_min_max(pos2(left_end, bar.min.y), pos2(right_start, bar.max.y)));
    let resp = ui.interact(fr.intersect(clip.clip_rect()), ui.id().with(("pbar", "file")), Sense::click());
    let resp = resp.tip(tr("Flows and screens"));
    if resp.hovered() {
        clip.rect_filled(fr, CornerRadius::same(6), c.hover);
    }
    clip.with_clip_rect(Rect::from_min_max(fr.min, pos2(fr.max.x - caret - 6.0, fr.max.y))).galley(
        pos2(fr.min.x + 10.0, cy - galley.size().y / 2.0),
        galley,
        c.text,
    );
    icons::paint(&clip, Rect::from_center_size(pos2(fr.max.x - 14.0, cy), vec2(9.0, 9.0)), Icon::Chevron, c.dim);
    crate::right::menu_popup(&resp).width(260.0).show(|ui| file_menu(p, ui, &flows, now));
    // The screen's name and where it is: quieter than the file's.
    ux::name_and_counter(p, ui, &clip, bar, fr.max.x + 8.0, right_start, &screen, c.dim, c, now);
    action
}

/// The menu behind the file's name: the flows (with their descriptions; picking one starts it),
/// then the page's screens in the order the arrow keys step through them (picking one shows it).
fn file_menu(p: &mut Presenter, ui: &mut Ui, flows: &[Flow], now: f64) {
    use crate::right::menu_check;
    let t = Tokens::get(ui.ctx());
    let heading = |ui: &mut Ui, text: &str| {
        ui.label(egui::RichText::new(text).font(semibold(11.0)).color(t.menu_dim));
    };
    if !flows.is_empty() {
        heading(ui, tr("Flows"));
        for f in flows {
            if menu_check(ui, f.start == p.start, &f.name, "") {
                p.restart(f.start, now);
                ui.close();
            }
            let d = f.description.trim();
            if !d.is_empty() {
                egui::Frame::NONE.inner_margin(egui::Margin { left: 26, right: 8, top: 0, bottom: 4 }).show(ui, |ui| {
                    ui.add(egui::Label::new(egui::RichText::new(d).font(regular(10.5)).color(t.menu_dim)).wrap());
                });
            }
        }
    }
    let screens: Vec<(figcraft_doc::NodeId, String)> = p
        .doc
        .as_ref()
        .map(|d| ux::sequence(d, p.current).into_iter().filter_map(|id| d.node(id).map(|n| (id, n.name.clone()))).collect())
        .unwrap_or_default();
    if screens.is_empty() {
        return;
    }
    if !flows.is_empty() {
        ui.separator();
    }
    heading(ui, tr("Screens"));
    egui::ScrollArea::vertical().max_height(320.0).auto_shrink([true, true]).show(ui, |ui| {
        for (id, name) in &screens {
            if menu_check(ui, *id == p.current, name, "") {
                panel::jump(p, *id, now);
                ui.close();
            }
        }
    });
}
