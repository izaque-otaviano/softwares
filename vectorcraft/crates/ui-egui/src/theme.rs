//! Design tokens (Illustrator's four UI brightness levels), fonts and egui style.

use std::sync::Arc;

use egui::{Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Stroke, TextStyle, Visuals};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Brightness {
    Dark,
    #[default]
    MediumDark,
    MediumLight,
    Light,
}

impl Brightness {
    pub const ALL: [Brightness; 4] = [Brightness::Dark, Brightness::MediumDark, Brightness::MediumLight, Brightness::Light];
    pub fn label(self) -> &'static str {
        match self {
            Brightness::Dark => "Dark",
            Brightness::MediumDark => "Medium Dark",
            Brightness::MediumLight => "Medium Light",
            Brightness::Light => "Light",
        }
    }
    pub fn id(self) -> &'static str {
        match self {
            Brightness::Dark => "dark",
            Brightness::MediumDark => "mediumDark",
            Brightness::MediumLight => "mediumLight",
            Brightness::Light => "light",
        }
    }
    pub fn parse(s: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|b| b.id().eq_ignore_ascii_case(s) || b.label().eq_ignore_ascii_case(s))
    }
}

/// All colours and metrics the UI uses. Never hard-code a colour in a widget.
#[derive(Clone, Copy, Debug)]
pub struct Tokens {
    pub dark: bool,
    pub app_bar: Color32,
    pub panel: Color32,
    pub panel_darker: Color32,
    pub input: Color32,
    pub input_border: Color32,
    pub border: Color32,
    pub divider: Color32,
    pub text: Color32,
    pub text_dim: Color32,
    pub text_disabled: Color32,
    pub icon: Color32,
    pub hover: Color32,
    pub tool_active: Color32,
    pub accent: Color32,
    pub accent_strong: Color32,
    pub row_selected: Color32,
    pub pasteboard: Color32,
    pub ruler: Color32,
    pub ruler_tick: Color32,
    pub smart_guide: Color32,
    pub guide: Color32,
    pub measure_bg: Color32,
    pub button: Color32,
    pub radius: u8,
    /// Field values, button labels, link labels.
    pub text_strong: Color32,
    /// Panel tab strips, doc-tab bar, dock header.
    pub tab_strip: Color32,
    /// Outline of secondary (outlined) buttons.
    pub button_border: Color32,
    /// Default Layer 1 selection colour and selected-anchor fill.
    pub selection: Color32,
    pub anchor_selected: Color32,
    /// Active item text in tool flyouts.
    pub flyout_active: Color32,
    /// Hint-bar / tab-bar heights etc. scale with this base font size.
    pub font_size: f32,
    /// Window Close button (custom title bar) when hovered, and its glyph there.
    pub caption_close: Color32,
    pub caption_close_text: Color32,
    /// What preview images mark (Flattener Preview highlights).
    pub highlight: Color32,
    /// The bleed outline around artboards (Document Setup → Bleed).
    pub bleed: Color32,
    /// Error marks (a missing linked file).
    pub error: Color32,
    /// Warning marks (a modified linked file).
    pub warning: Color32,
    /// Rotation gizmo axes, also labelled X, Y and Z.
    pub axis_x: Color32,
    pub axis_y: Color32,
    pub axis_z: Color32,
    /// The Control bar and the Tools panel (its flyouts and the All Tools drawer too). The app bar
    /// is `app_bar`, the panels `panel`.
    pub bar: Color32,
    /// The status bar and the hint bar along the bottom of the window.
    pub status_bar: Color32,
    /// The Home screen's background.
    pub home: Color32,
    /// The Home screen's preset cards, and one under the pointer.
    pub home_card: Color32,
    pub home_card_hover: Color32,
}

impl Tokens {
    pub fn for_brightness(b: Brightness) -> Self {
        let hex = |s: u32| Color32::from_rgb((s >> 16) as u8, (s >> 8) as u8, s as u8);
        let base = Tokens {
            dark: true,
            app_bar: hex(0x262626),
            panel: hex(0x323232),
            panel_darker: hex(0x282828),
            input: hex(0x1f1f1f),
            input_border: hex(0x464646),
            border: hex(0x1b1b1b),
            divider: hex(0x3f3f3f),
            text: hex(0xd8d8d8),
            text_dim: hex(0xa8a8a8),
            text_disabled: hex(0x6e6e6e),
            icon: hex(0xcfcfcf),
            hover: hex(0x444444),
            tool_active: hex(0x1d1d1d),
            accent: hex(0x378ef0),
            accent_strong: hex(0x1473e6),
            row_selected: hex(0x484b50),
            pasteboard: hex(0x1e1e1e),
            ruler: hex(0x2f2f2f),
            ruler_tick: hex(0x8a8a8a),
            smart_guide: hex(0xff3dfc),
            guide: hex(0x4affff),
            measure_bg: Color32::from_rgba_unmultiplied(92, 92, 92, 235),
            button: hex(0x444444),
            radius: 2,
            text_strong: hex(0xf5f5f5),
            tab_strip: hex(0x282828),
            button_border: hex(0x6a6a6a),
            selection: hex(0x4f80ff),
            anchor_selected: hex(0x3d82ff),
            flyout_active: hex(0x54b2f7),
            font_size: 13.0,
            caption_close: hex(0xc42b1c),
            caption_close_text: Color32::WHITE,
            highlight: hex(0xff3030),
            bleed: hex(0xf03030),
            error: hex(0xe34850),
            warning: hex(0xf0a330),
            axis_x: hex(0xef6058),
            axis_y: hex(0x45af63),
            axis_z: hex(0x378ef0),
            // Surfaces only the default level sets apart. Here and in the light levels they keep the
            // colours they had: the panels' for the bars, the darker panels' for the Home screen and
            // its cards, and the hover colour for a hovered card.
            bar: hex(0x323232),
            status_bar: hex(0x323232),
            home: hex(0x282828),
            home_card: hex(0x282828),
            home_card_hover: hex(0x444444),
        };
        match b {
            Brightness::Dark => base,
            // The default level's colours follow a palette the user supplied for the main window
            // and the Home screen (bars, panels, tab rows, pasteboard, rulers, selected rows,
            // accents, Home). Where it gives no colour the values are the earlier ones, a few
            // lifted so that text keeps at least its earlier contrast on the new surfaces: `text`
            // on a selected row, `text_dim` there and on the panels, `icon`, and the ruler's ticks
            // and numbers. `divider` is darker so it still shows on the darker panels; inputs keep
            // #454545, so their text stays above 4.5:1. The canvas around the artboards is dark
            // now: the artboards' outline and shadow follow it ([`Tokens::artboard_edge`],
            // [`Tokens::page_shadow`]). Tests: `the_default_level_follows_the_supplied_palette`.
            Brightness::MediumDark => Tokens {
                app_bar: hex(0x535353),
                bar: hex(0x535353),
                panel: hex(0x4d4d4d),
                status_bar: hex(0x4b4b4b),
                panel_darker: hex(0x424242),
                tab_strip: hex(0x424242),
                input: hex(0x454545),
                input_border: hex(0x5f5f5f),
                border: hex(0x383838),
                divider: hex(0x3e3e3e),
                text: hex(0xe0e0e0),
                text_strong: hex(0xffffff),
                text_dim: hex(0xbababa),
                text_disabled: hex(0x7a7a7a),
                icon: hex(0xcccccc),
                hover: hex(0x606060),
                tool_active: hex(0x303030),
                row_selected: hex(0x6b6b6b),
                accent: hex(0x2680eb),
                accent_strong: hex(0x1273e6),
                pasteboard: hex(0x282828),
                ruler: hex(0x474747),
                ruler_tick: hex(0xb0b0b0),
                button: hex(0x535353),
                button_border: hex(0x747474),
                home: hex(0x1e1e1e),
                home_card: hex(0x2c2c2c),
                home_card_hover: hex(0x383838),
                ..base
            },
            Brightness::MediumLight => Tokens {
                tab_strip: hex(0xa6a6a6),
                text_strong: hex(0x000000),
                button_border: hex(0x7a7a7a),
                dark: false,
                app_bar: hex(0xa9a9a9),
                panel: hex(0xb8b8b8),
                panel_darker: hex(0xaaaaaa),
                input: hex(0xd6d6d6),
                input_border: hex(0x8c8c8c),
                border: hex(0x969696),
                divider: hex(0x9e9e9e),
                text: hex(0x1f1f1f),
                text_dim: hex(0x3c3c3c),
                text_disabled: hex(0x7c7c7c),
                icon: hex(0x2a2a2a),
                hover: hex(0xc8c8c8),
                tool_active: hex(0x969696),
                row_selected: hex(0x9fb4d6),
                pasteboard: hex(0xa0a0a0),
                ruler: hex(0xc2c2c2),
                ruler_tick: hex(0x4a4a4a),
                button: hex(0xcacaca),
                bar: hex(0xb8b8b8),
                status_bar: hex(0xb8b8b8),
                home: hex(0xaaaaaa),
                home_card: hex(0xaaaaaa),
                home_card_hover: hex(0xc8c8c8),
                ..base
            },
            Brightness::Light => Tokens {
                tab_strip: hex(0xdddddd),
                text_strong: hex(0x000000),
                button_border: hex(0x9a9a9a),
                dark: false,
                app_bar: hex(0xe4e4e4),
                panel: hex(0xf0f0f0),
                panel_darker: hex(0xe2e2e2),
                input: hex(0xffffff),
                input_border: hex(0xb4b4b4),
                border: hex(0xcfcfcf),
                divider: hex(0xd6d6d6),
                text: hex(0x1f1f1f),
                text_dim: hex(0x4b4b4b),
                text_disabled: hex(0x9a9a9a),
                icon: hex(0x303030),
                hover: hex(0xdddddd),
                tool_active: hex(0xcdcdcd),
                row_selected: hex(0xc8daf7),
                pasteboard: hex(0xdcdcdc),
                ruler: hex(0xeaeaea),
                ruler_tick: hex(0x5a5a5a),
                button: hex(0xe0e0e0),
                bar: hex(0xf0f0f0),
                status_bar: hex(0xf0f0f0),
                home: hex(0xe2e2e2),
                home_card: hex(0xe2e2e2),
                home_card_hover: hex(0xdddddd),
                ..base
            },
        }
    }

    pub fn get(ctx: &egui::Context) -> Tokens {
        ctx.data(|d| d.get_temp::<Tokens>(egui::Id::NULL)).unwrap_or_else(|| Tokens::for_brightness(Brightness::MediumDark))
    }
    pub fn cr(&self) -> CornerRadius {
        CornerRadius::same(self.radius)
    }

    /// Is the canvas around the artboards so dark that black marks on it vanish (under 3:1)? The
    /// default level's and Dark's are; the light levels' and the Canvas Color choices are not.
    pub fn dark_pasteboard(&self) -> bool {
        contrast(Color32::BLACK, self.pasteboard) < 3.0
    }

    /// The outline of the active artboard (`active`) or of another one: black and a mid grey on a
    /// light canvas. On a dark one, where black would vanish, the active artboard's is a light grey.
    pub fn artboard_edge(&self, active: bool) -> Color32 {
        match (active, self.dark_pasteboard()) {
            (true, false) => Color32::BLACK,
            (true, true) => Color32::from_gray(0xb4),
            (false, _) => Color32::from_gray(120),
        }
    }

    /// The artboards' hard drop shadow, 1 pt and then 2 pt down and to the right: (nearer,
    /// farther). Deeper on a dark canvas, where the light one would not show.
    pub fn page_shadow(&self) -> (Color32, Color32) {
        if self.dark_pasteboard() {
            (Color32::from_black_alpha(150), Color32::from_black_alpha(80))
        } else {
            (Color32::from_black_alpha(52), Color32::from_black_alpha(26))
        }
    }
}

/// The surfaces of a sheet-style dialog (New Document): the window and its details column, the
/// content well, the cards in it, fields, dropdowns, tabs, the selection outline and the call to
/// action.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sheet {
    /// The window and the details column.
    pub window: Color32,
    /// The well the preset cards sit in.
    pub well: Color32,
    pub card: Color32,
    pub card_hover: Color32,
    pub input: Color32,
    pub dropdown: Color32,
    /// An idle tab's label, and section labels.
    pub tab_idle: Color32,
    /// The active tab's label and its underline.
    pub tab_active: Color32,
    /// The selected card's outline.
    pub selected: Color32,
    /// The primary (Create) button.
    pub cta: Color32,
}

impl Tokens {
    /// The sheet colours. The dark levels follow a reference palette supplied by the user; the
    /// light levels derive theirs from their own tokens, so they stay light.
    pub fn sheet_palette(&self) -> Sheet {
        let hex = |s: u32| Color32::from_rgb((s >> 16) as u8, (s >> 8) as u8, s as u8);
        if self.dark {
            Sheet {
                window: hex(0x323232),
                well: hex(0x252525),
                card: hex(0x2f2f2f),
                card_hover: hex(0x3a3a3a),
                input: hex(0x252525),
                dropdown: hex(0x2f2f2f),
                tab_idle: hex(0xa5a5a5),
                tab_active: Color32::WHITE,
                selected: hex(0x2680eb),
                cta: hex(0x1273e6),
            }
        } else {
            Sheet {
                window: self.panel,
                well: self.panel_darker,
                card: self.panel,
                card_hover: self.hover,
                input: self.input,
                dropdown: self.button,
                tab_idle: self.text_dim,
                tab_active: self.text_strong,
                selected: self.accent,
                cta: self.accent_strong,
            }
        }
    }

    /// These tokens with the sheet's surfaces in place of the panel's, for the widgets a sheet
    /// draws (fields, dropdowns, pills) to pick up its colours.
    pub fn sheet(self) -> Tokens {
        let s = self.sheet_palette();
        Tokens {
            panel: s.window,
            panel_darker: s.well,
            input: s.input,
            button: s.dropdown,
            text_dim: s.tab_idle,
            hover: s.card_hover,
            accent: s.selected,
            accent_strong: s.cta,
            ..self
        }
    }
}

/// Run `f` with `t` as the tokens [`Tokens::get`] returns, then put the previous ones back (also
/// when `f` unwinds).
pub fn with_tokens<R>(ctx: &egui::Context, t: Tokens, f: impl FnOnce() -> R) -> R {
    struct Restore {
        ctx: egui::Context,
        old: Option<Tokens>,
    }
    impl Drop for Restore {
        fn drop(&mut self) {
            let old = self.old.take();
            self.ctx.data_mut(|d| match old {
                Some(o) => {
                    d.insert_temp(egui::Id::NULL, o);
                }
                None => {
                    d.remove::<Tokens>(egui::Id::NULL);
                }
            });
        }
    }
    let _restore = Restore { ctx: ctx.clone(), old: ctx.data(|d| d.get_temp::<Tokens>(egui::Id::NULL)) };
    ctx.data_mut(|d| d.insert_temp(egui::Id::NULL, t));
    f()
}

/// egui's own widget colours inside a sheet (`ui` and what it adds): fields in the sheet's input
/// colour, dropdown buttons in its dropdown colour.
pub fn sheet_visuals(ui: &mut egui::Ui, s: &Sheet) {
    let v = ui.visuals_mut();
    v.extreme_bg_color = s.input;
    v.widgets.inactive.bg_fill = s.dropdown;
    v.widgets.inactive.weak_bg_fill = s.dropdown;
    v.widgets.hovered.bg_fill = s.card_hover;
    v.widgets.hovered.weak_bg_fill = s.card_hover;
}

/// The relative luminance of an opaque colour, from 0 (black) to 1 (white), as WCAG defines it.
pub fn luminance(c: Color32) -> f32 {
    let linear = |v: u8| {
        let s = f32::from(v) / 255.0;
        if s <= 0.04045 { s / 12.92 } else { ((s + 0.055) / 1.055).powf(2.4) }
    };
    0.2126 * linear(c.r()) + 0.7152 * linear(c.g()) + 0.0722 * linear(c.b())
}

/// The WCAG contrast ratio of two opaque colours, from 1 (the same) to 21 (black on white).
pub fn contrast(a: Color32, b: Color32) -> f32 {
    let (la, lb) = (luminance(a), luminance(b));
    (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
}

/// Selected text in the text fields `ui` draws from here on is in the strong text colour. egui
/// paints it in the selection stroke's colour, the accent, which is hard to read on the selection's
/// accent tint (#1465). For fields that draw their own frame: egui's frame takes its focus ring from
/// the same stroke.
pub fn strong_selected_text(ui: &mut egui::Ui) {
    ui.visuals_mut().selection.stroke.color = Tokens::get(ui.ctx()).text_strong;
}

pub const FONT_UI: &str = "ui";
pub const FONT_UI_SEMIBOLD: &str = "ui-semibold";
pub const FONT_MONO: &str = "mono";

pub fn semibold(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(FONT_UI_SEMIBOLD.into()))
}
pub fn mono(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(FONT_MONO.into()))
}

pub fn install_fonts(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    let add = |f: &mut FontDefinitions, name: &str, bytes: &'static [u8]| {
        f.font_data.insert(name.to_owned(), Arc::new(FontData::from_static(bytes)));
    };
    add(&mut fonts, "SourceSans3", include_bytes!("../../../assets/fonts/SourceSans3-Regular.ttf"));
    add(&mut fonts, "SourceSans3-Semibold", include_bytes!("../../../assets/fonts/SourceSans3-Semibold.ttf"));
    add(&mut fonts, "JetBrainsMono", include_bytes!("../../../assets/fonts/JetBrainsMono-Regular.ttf"));
    let fallback: Vec<String> = fonts.families.get(&FontFamily::Proportional).cloned().unwrap_or_default();
    let mut prop = vec!["SourceSans3".to_string()];
    prop.extend(fallback.clone());
    fonts.families.insert(FontFamily::Proportional, prop);
    let mut semi = vec!["SourceSans3-Semibold".to_string()];
    semi.extend(fallback.clone());
    fonts.families.insert(FontFamily::Name(FONT_UI_SEMIBOLD.into()), semi);
    let mut ui = vec!["SourceSans3".to_string()];
    ui.extend(fallback.clone());
    fonts.families.insert(FontFamily::Name(FONT_UI.into()), ui);
    let mut mono = vec!["JetBrainsMono".to_string()];
    mono.extend(fallback);
    fonts.families.insert(FontFamily::Name(FONT_MONO.into()), mono);
    add_craft_fonts(&mut fonts);
    ctx.set_fonts(fonts);
}

/// The egui name of a craft-fonts face.
pub(crate) fn craft_font_name(f: &vectorcraft_text::CraftFont) -> String {
    format!("craft-fonts {} {}", f.family, f.style)
}

/// The Japanese craft-fonts faces (when built with `CRAFT_FONTS_DIR`) as fallbacks at the end of
/// every family, after the app's own fonts and before the installed fonts `ui_fonts` adds: BIZ
/// UDPGothic first (bold first in the semibold family), then the Mincho faces.
fn add_craft_fonts(fonts: &mut FontDefinitions) {
    for f in vectorcraft_text::CRAFT_FONTS.iter().filter(|f| f.is_japanese()) {
        fonts.font_data.insert(craft_font_name(f), Arc::new(FontData::from_static(f.bytes)));
    }
    for (family, stack) in fonts.families.iter_mut() {
        let bold = *family == FontFamily::Name(FONT_UI_SEMIBOLD.into());
        stack.extend(vectorcraft_text::craft_fonts::japanese_ui_fonts(bold).into_iter().map(craft_font_name));
    }
}

/// Apply tokens to egui's global style.
pub fn apply(ctx: &egui::Context, b: Brightness) {
    let t = Tokens::for_brightness(b);
    ctx.data_mut(|d| d.insert_temp(egui::Id::NULL, t));
    let mut v = if t.dark { Visuals::dark() } else { Visuals::light() };
    v.panel_fill = t.panel;
    v.window_fill = t.panel;
    v.extreme_bg_color = t.input;
    v.faint_bg_color = t.panel_darker;
    v.window_stroke = Stroke::new(1.0, t.border);
    v.window_corner_radius = CornerRadius::same(6);
    v.menu_corner_radius = CornerRadius::same(6);
    v.selection.bg_fill = t.accent.gamma_multiply(0.55);
    v.selection.stroke = Stroke::new(1.0, t.accent);
    v.hyperlink_color = t.accent;
    v.override_text_color = Some(t.text);
    v.popup_shadow = egui::epaint::Shadow { offset: [0, 4], blur: 14, spread: 0, color: Color32::from_black_alpha(if t.dark { 120 } else { 60 }) };
    v.window_shadow = egui::epaint::Shadow { offset: [0, 8], blur: 28, spread: 0, color: Color32::from_black_alpha(if t.dark { 140 } else { 70 }) };
    let w = &mut v.widgets;
    craft_ui::theme::WidgetPalette { noninteractive: t.panel, inactive: t.button, hovered: t.hover, active: t.tool_active, open: t.hover }.apply_to(
        w,
        t.cr(),
        Stroke::new(1.0, t.text),
    );
    w.noninteractive.bg_stroke = Stroke::new(1.0, t.divider);
    w.inactive.bg_stroke = Stroke::NONE;
    w.hovered.bg_stroke = Stroke::new(1.0, t.input_border);
    w.active.bg_stroke = Stroke::new(1.0, t.accent);
    ctx.set_visuals(v);
    ctx.global_style_mut(|s| {
        s.spacing.item_spacing = egui::vec2(6.0, 5.0);
        s.spacing.button_padding = egui::vec2(6.0, 2.0);
        s.spacing.interact_size = egui::vec2(24.0, 24.0);
        s.spacing.menu_margin = egui::Margin::same(6);
        s.spacing.slider_width = 120.0;
        s.text_styles = [
            (TextStyle::Small, FontId::proportional(11.0)),
            (TextStyle::Body, FontId::proportional(13.0)),
            (TextStyle::Button, FontId::proportional(13.0)),
            (TextStyle::Heading, FontId::new(15.0, FontFamily::Name(FONT_UI_SEMIBOLD.into()))),
            (TextStyle::Monospace, FontId::new(11.5, FontFamily::Name(FONT_MONO.into()))),
        ]
        .into();
        s.animation_time = 0.08;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn brightness_roundtrip() {
        for b in Brightness::ALL {
            assert_eq!(Brightness::parse(b.id()), Some(b));
            assert_eq!(Brightness::parse(b.label()), Some(b));
        }
        assert!(!Tokens::for_brightness(Brightness::Light).dark);
    }

    /// #1662: a slider's rail (`button_border`, see `widgets::slider`) stands out from the panel
    /// in every brightness.
    #[test]
    fn slider_rails_show_on_every_panel() {
        for b in [Brightness::Dark, Brightness::MediumDark, Brightness::MediumLight, Brightness::Light] {
            let t = Tokens::for_brightness(b);
            let gap = (i32::from(t.button_border.r()) - i32::from(t.panel.r())).abs();
            assert!(gap >= 24, "{b:?}: rail {:?} on panel {:?}", t.button_border, t.panel);
        }
    }

    /// The sheet (New Document) follows the reference palette in the dark levels, keeps its text
    /// readable, and stays light in the light levels.
    #[test]
    fn the_sheet_follows_the_reference_palette_and_keeps_contrast() {
        for b in [Brightness::Dark, Brightness::MediumDark] {
            let s = Tokens::for_brightness(b).sheet_palette();
            for (name, got, want) in [
                ("window", s.window, 0x323232),
                ("well", s.well, 0x252525),
                ("card", s.card, 0x2f2f2f),
                ("input", s.input, 0x252525),
                ("dropdown", s.dropdown, 0x2f2f2f),
                ("idle tab", s.tab_idle, 0xa5a5a5),
                ("selected", s.selected, 0x2680eb),
                ("create", s.cta, 0x1273e6),
            ] {
                assert_eq!(got, rgb(want), "{b:?} {name}");
            }
            assert!(s.card_hover != s.card && luminance(s.card_hover) > luminance(s.card));
            assert!(contrast(Color32::WHITE, s.cta) >= 4.5);
            assert!(contrast(s.tab_idle, s.window) >= 4.5);
            assert!(contrast(s.selected, s.card) >= 3.0);
        }
        for b in [Brightness::MediumLight, Brightness::Light] {
            let t = Tokens::for_brightness(b);
            let s = t.sheet_palette();
            assert_eq!((s.window, s.well, s.input), (t.panel, t.panel_darker, t.input), "{b:?}");
            assert!(luminance(s.window) > 0.3, "{b:?} stays light");
        }
    }

    /// `with_tokens` puts the previous tokens back.
    #[test]
    fn with_tokens_restores_the_tokens() {
        let ctx = egui::Context::default();
        apply(&ctx, Brightness::MediumDark);
        let before = Tokens::get(&ctx).panel;
        let inside = with_tokens(&ctx, Tokens::get(&ctx).sheet(), || Tokens::get(&ctx).panel);
        assert_eq!(inside, rgb(0x323232));
        assert_eq!(Tokens::get(&ctx).panel, before);
    }

    fn rgb(hex: u32) -> Color32 {
        Color32::from_rgb((hex >> 16) as u8, (hex >> 8) as u8, hex as u8)
    }

    /// The default level (Medium Dark) takes the palette the user supplied for the main window and
    /// the Home screen.
    #[test]
    fn the_default_level_follows_the_supplied_palette() {
        let t = Tokens::for_brightness(Brightness::default());
        assert_eq!(Brightness::default(), Brightness::MediumDark);
        for (name, got, want) in [
            ("app bar", t.app_bar, 0x535353),
            ("Control bar and Tools panel", t.bar, 0x535353),
            ("panels", t.panel, 0x4d4d4d),
            ("panel tab rows and document tabs", t.tab_strip, 0x424242),
            ("pasteboard", t.pasteboard, 0x282828),
            ("rulers", t.ruler, 0x474747),
            ("status bar", t.status_bar, 0x4b4b4b),
            ("selected row", t.row_selected, 0x6b6b6b),
            ("accent", t.accent, 0x2680eb),
            ("primary buttons", t.accent_strong, 0x1273e6),
            ("Home screen", t.home, 0x1e1e1e),
            ("Home cards", t.home_card, 0x2c2c2c),
            ("inputs, as before", t.input, 0x454545),
        ] {
            assert_eq!(got, rgb(want), "{name}");
        }
    }

    /// The palette keeps text readable: white on a primary button and body text on every surface
    /// at 4.5:1 or more, and nothing below the contrast it had before the palette (the earlier
    /// values are written out here). A hovered row stays apart from the selected one.
    #[test]
    fn the_default_level_keeps_its_text_readable() {
        let t = Tokens::for_brightness(Brightness::MediumDark);
        let white = contrast(Color32::WHITE, t.accent_strong);
        assert!(white >= 4.5, "white on a primary button: {white:.2}");
        for (name, bg) in [
            ("panel", t.panel),
            ("bar", t.bar),
            ("app bar", t.app_bar),
            ("status bar", t.status_bar),
            ("tab row", t.tab_strip),
            ("input", t.input),
            ("darker panel", t.panel_darker),
            ("Home", t.home),
            ("Home card", t.home_card),
        ] {
            let c = contrast(t.text, bg);
            assert!(c >= 4.5, "text on the {name}: {c:.2}");
        }
        // (now, before): text, dim text and icons on a selected row, dim text on the panels and
        // bars, the ruler's numbers, a divider and an input's border on a panel.
        for (name, now, before) in [
            ("text on a selected row", contrast(t.text, t.row_selected), contrast(rgb(0xd1d1d1), rgb(0x52677c))),
            ("dim text on a selected row", contrast(t.text_dim, t.row_selected), contrast(rgb(0xb0b0b0), rgb(0x52677c))),
            ("an icon on a selected row", contrast(t.icon, t.row_selected), contrast(rgb(0xc2c2c2), rgb(0x52677c))),
            ("dim text on a panel", contrast(t.text_dim, t.panel), contrast(rgb(0xb0b0b0), rgb(0x535353))),
            ("dim text on a bar", contrast(t.text_dim, t.bar), contrast(rgb(0xb0b0b0), rgb(0x535353))),
            ("dim text on the status bar", contrast(t.text_dim, t.status_bar), contrast(rgb(0xb0b0b0), rgb(0x535353))),
            ("an icon on a panel", contrast(t.icon, t.panel), contrast(rgb(0xc2c2c2), rgb(0x535353))),
            ("ruler numbers", contrast(t.ruler_tick, t.ruler), contrast(rgb(0x8a8a8a), rgb(0x333333))),
            ("a divider on a panel", contrast(t.divider, t.panel), contrast(rgb(0x4b4b4b), rgb(0x535353))),
            ("an input's border on a panel", contrast(t.input_border, t.panel), contrast(rgb(0x5f5f5f), rgb(0x535353))),
            ("text in an input", contrast(t.text, t.input), contrast(rgb(0xd1d1d1), rgb(0x454545))),
        ] {
            assert!(now >= before, "{name}: {now:.2}, was {before:.2}");
        }
        assert_ne!(t.row_selected, t.hover, "a hovered row looks selected");
        assert!(contrast(t.row_selected, t.hover) >= 1.1, "a hovered row is hard to tell from the selected one");
        for other in [t.panel, t.bar, t.divider, t.button, t.input] {
            assert_ne!(t.row_selected, other, "the selected row's fill is its own");
        }
    }

    /// Only the default level changes: the surfaces it sets apart keep, in the other levels, the
    /// colours they had, and the light levels stay light.
    #[test]
    fn the_other_levels_keep_their_colours() {
        for b in [Brightness::Dark, Brightness::MediumLight, Brightness::Light] {
            let t = Tokens::for_brightness(b);
            assert_eq!((t.bar, t.status_bar), (t.panel, t.panel), "{b:?}: bars");
            assert_eq!((t.home, t.home_card, t.home_card_hover), (t.panel_darker, t.panel_darker, t.hover), "{b:?}: Home");
            assert_eq!((t.accent, t.accent_strong), (rgb(0x378ef0), rgb(0x1473e6)), "{b:?}: accents");
        }
        for b in [Brightness::MediumLight, Brightness::Light] {
            let t = Tokens::for_brightness(b);
            assert!(!t.dark);
            for c in [t.bar, t.status_bar, t.panel, t.home, t.home_card, t.home_card_hover, t.pasteboard] {
                assert!(luminance(c) > 0.3, "{b:?}: {c:?} is dark");
            }
        }
        // Each level's chrome is lighter than the level before it.
        let levels = Brightness::ALL.map(Tokens::for_brightness);
        for w in levels.windows(2) {
            let [a, b] = [&w[0], &w[1]];
            for (name, x, y) in [
                ("app bar", a.app_bar, b.app_bar),
                ("bars", a.bar, b.bar),
                ("panels", a.panel, b.panel),
                ("status bar", a.status_bar, b.status_bar),
                ("tab rows", a.tab_strip, b.tab_strip),
                ("pasteboard", a.pasteboard, b.pasteboard),
                ("rulers", a.ruler, b.ruler),
            ] {
                assert!(luminance(x) < luminance(y), "{name}: {x:?}, then {y:?}");
            }
        }
    }

    /// On every level's pasteboard, and on the Canvas Color choices, the active artboard's outline
    /// shows (3:1 or more) and so does its shadow; a light canvas keeps the black outline.
    #[test]
    fn artboard_outlines_and_shadows_show_on_every_pasteboard() {
        let mut canvases: Vec<Tokens> = Brightness::ALL.map(Tokens::for_brightness).to_vec();
        for grey in [0xff, 0xc8, 0x96, 0x5a] {
            canvases.push(Tokens { pasteboard: Color32::from_gray(grey), ..Tokens::for_brightness(Brightness::MediumDark) });
        }
        for t in canvases {
            let edge = contrast(t.artboard_edge(true), t.pasteboard);
            assert!(edge >= 3.0, "outline on {:?}: {edge:.2}", t.pasteboard);
            assert_eq!(t.artboard_edge(true) == Color32::BLACK, !t.dark_pasteboard());
            // The nearer shadow over the pasteboard (premultiplied black at that alpha).
            let a = f32::from(t.page_shadow().0.a()) / 255.0;
            let p = t.pasteboard;
            let shaded =
                Color32::from_rgb((f32::from(p.r()) * (1.0 - a)) as u8, (f32::from(p.g()) * (1.0 - a)) as u8, (f32::from(p.b()) * (1.0 - a)) as u8);
            let shadow = contrast(shaded, p);
            assert!(shadow >= 1.15, "shadow on {p:?}: {shadow:.2}");
        }
        assert!(Tokens::for_brightness(Brightness::MediumDark).dark_pasteboard());
        assert!(!Tokens::for_brightness(Brightness::Light).dark_pasteboard());
    }
}
