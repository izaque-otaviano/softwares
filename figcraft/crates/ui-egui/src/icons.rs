//! FigCraft's icon set: [Lucide](https://lucide.dev) icons (ISC) plus a few originals drawn in
//! Lucide's style (MIT OR Apache-2.0), all SVG files under `assets/ui/lucide/` (the originals in
//! `assets/ui/lucide/original/`), each listed in `ATTRIBUTION.md`.
//!
//! The SVGs are embedded at build time ([`lucide`]), rasterised with resvg at the exact physical
//! pixel size they are shown at (so they are crisp at any display scale, with the stroke thinned
//! or thickened to suit the size) and cached as white-mask textures per (icon, size); painting
//! tints the mask with the caller's colour, so hover, active and disabled looks are just colours.
//!
//! Two exceptions are the repository owner's own art (`crate::brand`, listed in `ATTRIBUTION.md`):
//! `Logo` (the app icon) and `Document` (the pen-nib file mark). No icon from any other product is
//! used or traced anywhere.

use egui::{Color32, Painter, Pos2, Rect, Vec2, pos2, vec2};

pub(crate) mod lucide;
#[cfg(test)]
mod snapshot_tests;
#[cfg(test)]
mod tests;

macro_rules! icons {
    ($($(#[$m:meta])* $name:ident,)*) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        pub enum Icon {
            $($(#[$m])* $name,)*
        }

        impl Icon {
            /// Every icon, in declaration order (the icon gallery, tests).
            pub const ALL: &[Icon] = &[$(Icon::$name,)*];
        }
    };
}

icons! {
    Move,
    Scale,
    Hand,
    Frame,
    Section,
    Slice,
    Rectangle,
    Line,
    Arrow,
    Ellipse,
    Polygon,
    Star,
    Image,
    Pen,
    Pencil,
    Text,
    Comment,
    Actions,
    Chevron,
    ChevronRight,
    ChevronLeft,
    ChevronUp,
    Plus,
    Minus,
    Eye,
    EyeOff,
    Lock,
    Unlock,
    Component,
    Instance,
    ComponentSet,
    Group,
    Vector,
    Bend,
    PaintBucket,
    Lasso,
    Cut,
    Boolean,
    Page,
    Check,
    Close,
    /// Window buttons: minimise, maximise, restore.
    WinMinimize,
    WinMaximize,
    WinRestore,
    Search,
    Grid,
    AlignLeft,
    AlignHCenter,
    AlignRight,
    AlignTop,
    AlignVCenter,
    AlignBottom,
    DistributeH,
    DistributeV,
    Rotate,
    FlipH,
    FlipV,
    CornerRadius,
    IndependentCorners,
    LinkOn,
    LinkOff,
    LayoutH,
    LayoutV,
    LayoutWrap,
    LayoutGrid,
    AutoLayout,
    ClipContent,
    Effects,
    Styles,
    Menu,
    Play,
    Home,
    Bell,
    Panels,
    Help,
    Dots,
    Mask,
    TextAlignLeft,
    TextAlignCenter,
    TextAlignRight,
    TextAlignJustify,
    TextTop,
    TextMiddle,
    TextBottom,
    Eyedropper,
    Code,
    Assets,
    /// Libraries: an open book.
    Library,
    Layers,
    Opacity,
    Blend,
    Export,
    StrokeIcon,
    Fill,
    Sun,
    Moon,
    Undo,
    Redo,
    Union,
    Subtract,
    Intersect,
    Exclude,
    Hug,
    FillContainer,
    Fixed,
    PaddingH,
    PaddingV,
    Gap,
    Reset,
    Detach,
    Variable,
    Clock,
    Eraser,
    /// Variable width: a stroke swelling in the middle with a width handle above and below.
    VariableWidth,
    /// Shape builder: merge regions (and the tool).
    ShapeBuilder,
    /// Shape builder: remove regions.
    ShapeBuilderRemove,
    Swap,
    Link,
    Prototype,
    /// The prototype preview pane: a small window playing a frame.
    Preview,
    Section2,
    /// The FigCraft logo, in its own colours (the app icon; `crate::brand`).
    Logo,
    /// A FigCraft document: a pen nib (tabs, open and recent files; `crate::brand`).
    Document,
    /// Ignore auto layout: a layer pinned at an offset inside its frame.
    AbsolutePosition,
    /// A component slot: a dashed frame with a plus, a place that takes any content.
    Slot,
    /// Edit settings: two sliders.
    Adjust,
    /// Show as a list.
    ViewList,
    /// Show as a grid of swatches.
    ViewGrid,
    /// Add an emoji reaction: a smiling face.
    Reaction,
    /// Drag to reorder: two columns of three dots.
    DragHandle,
    /// Arc start: a circle with a radius to the dot where the arc begins.
    ArcStart,
    /// Arc sweep: a circle with a wedge cut out of it.
    ArcSweep,
    /// Arc ratio: a ring.
    ArcRatio,
    /// A colour outside the screen's gamut: a triangle with an exclamation mark.
    GamutWarning,
    /// Online: a globe (a circle with its equator and a meridian).
    Online,
    /// In a live session others get into: a point sending waves to both sides.
    LiveShared,
    /// A file of yours on a server that only you get into: a point inside a closed ring.
    LivePrivate,
    /// The presenter's screens panel: a column of small screens beside the page.
    Screens,
    /// Open in a window of its own: a window with a title strip and an arrow leaving it.
    NewWindow,
    /// Resources (components, plugins) in the bottom dock: building blocks.
    Resources,
    /// Full screen: four corners pointing outwards.
    Fullscreen,
}

/// The SVG file behind `icon`, as its key under `assets/ui/lucide/` (without `.svg`): a Lucide
/// icon by its name, or `original/…` for one drawn for FigCraft in Lucide's style. `None` for the
/// owner's own art (`Logo`, `Document`: `crate::brand`).
pub(crate) fn source(icon: Icon) -> Option<&'static str> {
    use Icon::*;
    Some(match icon {
        // The dock's tools.
        Move => "mouse-pointer-2",
        Scale => "scaling",
        Hand => "hand",
        Frame => "frame",
        Section | Section2 => "original/section",
        Slice => "slice",
        Rectangle | StrokeIcon | WinMaximize => "square",
        Line | Minus | WinMinimize => "minus",
        Arrow => "move-up-right",
        Ellipse => "circle",
        Polygon => "triangle",
        Star => "star",
        Image => "image",
        Pen => "pen-tool",
        Pencil => "pencil",
        Text => "type",
        Comment => "message-circle",
        Resources => "blocks",
        Fullscreen => "maximize",
        Actions => "zap",
        // Interface.
        Chevron => "chevron-down",
        ChevronRight => "chevron-right",
        ChevronLeft => "chevron-left",
        ChevronUp => "chevron-up",
        Plus => "plus",
        Eye => "eye",
        EyeOff => "eye-off",
        Lock => "lock",
        Unlock => "lock-open",
        Check => "check",
        Close => "x",
        WinRestore => "copy",
        Search => "search",
        Menu => "menu",
        Play => "play",
        Home => "house",
        Bell => "bell",
        Panels => "panel-left",
        Help => "circle-question-mark",
        Dots => "ellipsis",
        DragHandle => "grip-vertical",
        Sun => "sun",
        Moon => "moon",
        Clock => "clock",
        Undo => "undo-2",
        Redo => "redo-2",
        Reset => "rotate-ccw",
        Swap => "arrow-left-right",
        Online => "globe",
        LiveShared => "radio",
        LivePrivate => "circle-dot",
        GamutWarning => "triangle-alert",
        Reaction => "smile-plus",
        NewWindow => "square-arrow-out-up-right",
        Preview => "monitor-play",
        Screens => "layout-panel-left",
        // Components and variables.
        Component => "component",
        Instance => "diamond",
        ComponentSet => "original/component-set",
        Detach => "original/detach",
        Variable => "original/variable",
        Slot => "square-dashed-plus",
        Styles => "swatch-book",
        Library => "book-open",
        Assets => "circle-plus",
        Layers => "layers",
        Page => "file",
        Group => "group",
        // Vector editing and shapes.
        Vector => "vector-square",
        Bend => "spline",
        PaintBucket => "paint-bucket",
        Lasso => "lasso",
        Cut => "scissors",
        Eraser => "eraser",
        Eyedropper => "pipette",
        VariableWidth => "original/variable-width",
        ShapeBuilder => "original/shape-builder",
        ShapeBuilderRemove => "original/shape-builder-remove",
        Boolean | Union => "squares-unite",
        Subtract => "squares-subtract",
        Intersect => "squares-intersect",
        Exclude => "squares-exclude",
        Mask => "contrast",
        Fill => "original/fill",
        Opacity | Blend => "droplet",
        Effects => "sparkles",
        ArcStart => "original/arc-start",
        ArcSweep => "original/arc-sweep",
        ArcRatio => "original/arc-ratio",
        // Position, alignment and layout.
        AlignLeft => "align-start-vertical",
        AlignHCenter => "align-center-vertical",
        AlignRight => "align-end-vertical",
        AlignTop => "align-start-horizontal",
        AlignVCenter => "align-center-horizontal",
        AlignBottom => "align-end-horizontal",
        DistributeH => "align-horizontal-distribute-center",
        DistributeV => "align-vertical-distribute-center",
        Rotate => "rotate-cw",
        FlipH => "flip-horizontal-2",
        FlipV => "flip-vertical-2",
        CornerRadius => "square-round-corner",
        IndependentCorners => "scan",
        LinkOn | Link => "link",
        LinkOff => "unlink",
        Grid => "grid-3x3",
        LayoutGrid | ViewGrid => "layout-grid",
        LayoutH => "original/flow-horizontal",
        LayoutV => "original/flow-vertical",
        LayoutWrap => "original/flow-wrap",
        AutoLayout => "layout-list",
        ClipContent => "crop",
        Hug => "original/hug",
        FillContainer => "original/fill-container",
        Fixed => "original/fixed",
        PaddingH => "original/padding-horizontal",
        PaddingV => "original/padding-vertical",
        Gap => "original/gap",
        AbsolutePosition => "original/absolute-position",
        Adjust => "sliders-vertical",
        ViewList => "list",
        // Text.
        TextAlignLeft => "text-align-start",
        TextAlignCenter => "text-align-center",
        TextAlignRight => "text-align-end",
        TextAlignJustify => "text-align-justify",
        TextTop => "align-vertical-justify-start",
        TextMiddle => "align-vertical-justify-center",
        TextBottom => "align-vertical-justify-end",
        // Modes and sharing.
        Code => "code-xml",
        Export => "upload",
        Prototype => "circle-play",
        Logo | Document => return None,
    })
}

/// Paint `icon` centred in `rect` (the largest square that fits it, on whole physical pixels) in
/// `color`.
pub fn paint(painter: &Painter, rect: Rect, icon: Icon, color: Color32) {
    match icon {
        // The logo keeps its own colours; the document mark takes `color`.
        Icon::Logo => crate::brand::paint(painter, rect, crate::brand::Art::Logo, Color32::WHITE),
        Icon::Document => crate::brand::paint(painter, rect, crate::brand::Art::Document, color),
        _ => lucide::paint(painter, rect, icon, color),
    }
}

/// [`paint`] with the light (finer) stroke, for the dock.
pub fn paint_light(painter: &Painter, rect: Rect, icon: Icon, color: Color32) {
    match icon {
        Icon::Logo | Icon::Document => paint(painter, rect, icon, color),
        _ => lucide::paint_light(painter, rect, icon, color),
    }
}

/// Allocate a square icon button; returns the response. `active` paints the selected look.
pub fn button(ui: &mut egui::Ui, icon: Icon, size: f32, active: bool, tooltip: &str) -> egui::Response {
    let t = crate::theme::Tokens::get(ui.ctx());
    let (rect, resp) = ui.allocate_exact_size(vec2(size, size), egui::Sense::click());
    let bg = if active {
        t.selected_row
    } else if resp.is_pointer_button_down_on() {
        t.pressed
    } else if resp.hovered() {
        t.hover
    } else {
        Color32::TRANSPARENT
    };
    ui.painter().rect_filled(rect, egui::CornerRadius::same(5), bg);
    let col = if active { t.accent_text } else { t.icon };
    paint(ui.painter(), Rect::from_center_size(rect.center(), Vec2::splat(glyph_size(size))), icon, col);
    if tooltip.is_empty() {
        return resp;
    }
    let resp = crate::a11y::Tip::tip(resp, tooltip);
    // Shown pressed (an open option): a pressed toggle to screen readers.
    if active {
        crate::a11y::toggle(&resp, tooltip, true);
    }
    resp
}

/// The icon size inside a `size`-point button: 18 in the usual 24 px ones, 14 in compact ones, 20
/// in large ones.
fn glyph_size(size: f32) -> f32 {
    if size >= 28.0 {
        20.0
    } else if size >= 22.0 {
        18.0
    } else {
        14.0
    }
}

/// Every icon at the sizes the UI uses, labelled: for reviewing the set (`ui.set {iconGallery}`).
pub fn gallery(ctx: &egui::Context) {
    let t = crate::theme::Tokens::get(ctx);
    egui::Area::new(egui::Id::new("icon_gallery")).order(egui::Order::Foreground).fixed_pos(Pos2::ZERO).show(ctx, |ui| {
        let screen = ctx.content_rect();
        let (r, _) = ui.allocate_exact_size(screen.size(), egui::Sense::click());
        ui.painter().rect_filled(r, 0.0, t.panel);
        let cols = ((screen.width() - 20.0) / 138.0).floor().max(1.0) as usize;
        for (i, icon) in Icon::ALL.iter().enumerate() {
            let x = 10.0 + (i % cols) as f32 * 138.0;
            let y = 10.0 + (i / cols) as f32 * 70.0;
            for (dx, size) in [(0.0, 12.0), (16.0, 16.0), (36.0, 20.0), (60.0, 24.0), (90.0, 32.0)] {
                paint(ui.painter(), Rect::from_min_size(pos2(x + dx, y), Vec2::splat(size)), *icon, t.icon);
            }
            ui.painter().text(pos2(x, y + 40.0), egui::Align2::LEFT_TOP, format!("{icon:?}"), egui::FontId::proportional(10.0), t.text);
        }
    });
}
