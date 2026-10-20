//! Retained canvas rendering: keep the last rendered view and, for the next one, re-render only
//! what changed: the strips a pan uncovers and the areas of layers that were edited.
//!
//! Views are snapped to whole device pixels so that, at one zoom, the pixels of every render line
//! up and a pan is an integer shift of the previous image. Anything the partial path can't vouch
//! for (another zoom, page or set of options, new fonts, a page-level edit, a large change) is a
//! full render, the same as [`render_view`].

use std::sync::Arc;

use figcraft_doc::{Document, EffectKind, NodeId, NodeKind};
use figcraft_geom::Rect;
use tiny_skia::{IntRect, Pixmap, PixmapPaint, Transform};

use crate::{Options, View, draw, moved, render_view};

mod tiles;
pub use tiles::{TILE, TILE_BUDGET, Tiles};

/// What a render had to do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Work {
    /// Nothing changed: the previous image as is.
    Reused,
    /// The previous image, shifted and/or patched where things changed.
    Partial {
        /// Device pixels rendered afresh.
        pixels: u64,
    },
    /// The whole view.
    Full,
}

/// Re-rendered areas beyond this many get merged into their bounding box.
const MAX_RECTS: usize = 8;
/// A change covering more than this share of the view renders it whole.
const MAX_PARTIAL_SHARE: f64 = 0.6;
/// More changed layers than this render the view whole.
pub(crate) const MAX_CHANGED: usize = 4096;
/// Effect margins beyond this many device pixels render the view whole.
const MAX_MARGIN_PX: f64 = 1024.0;

/// What a retained image was rendered from.
struct Frame {
    doc: Arc<Document>,
    page: NodeId,
    outline: bool,
    outline_extras: crate::Outline,
    outlined: Vec<NodeId>,
    lod: bool,
    draft: bool,
    skip: Vec<NodeId>,
    solo: Option<NodeId>,
    background: Option<figcraft_color::Color>,
    scale: u64,
    /// The view's top-left in device pixels (page origin × scale).
    px: (i64, i64),
    fonts: u64,
    /// Areas (page coordinates) of layers whose look depends on where a render cuts them, and the
    /// largest background blur (what backdrops read around).
    sensitive: Arc<Sensitive>,
    pix: Pixmap,
    /// Areas of `pix` never drawn (a render given up for a newer one): the next render draws them.
    holes: Vec<Px>,
}

#[derive(Default)]
pub(crate) struct Sensitive {
    areas: Vec<Rect>,
    backdrop_blur: f64,
    /// Pattern fill sources: an edit inside one shows wherever the pattern does.
    pattern_sources: Vec<NodeId>,
}

/// Grain effects (noise, texture) work on their layer's pixels, which end where a render cuts the
/// layer (texture scatters pixels from across the cut): grainy layers are redrawn whole.
pub(crate) fn sensitive(doc: &Document) -> Sensitive {
    let noisy = doc.nodes().filter(|n| n.effects.iter().any(|e| e.visible && matches!(e.kind, EffectKind::Noise(_) | EffectKind::Texture(_))));
    let pattern_sources = doc
        .nodes()
        .flat_map(|n| n.fills.iter().chain(&n.strokes))
        .filter_map(|p| match &p.kind {
            figcraft_color::PaintKind::Pattern(pt) => Some(NodeId(pt.source)),
            _ => None,
        })
        .collect();
    Sensitive { areas: noisy.filter_map(|n| draw::paint_bounds(doc, n.id)).collect(), backdrop_blur: crate::max_backdrop_blur(doc), pattern_sources }
}

/// Whether `id` is a pattern source or inside one in `doc`.
pub(crate) fn in_pattern_source(doc: &Document, s: &Sensitive, id: NodeId) -> bool {
    s.pattern_sources.iter().any(|src| *src == id || doc.is_ancestor(*src, id))
}

/// A view snapped outwards to whole device pixels: the origin on its zoom's pixel grid and one
/// more pixel each way. Returns the view and its origin in device pixels.
pub fn snap(view: &View) -> Option<(View, (i64, i64))> {
    let s = view.scale;
    let (fx, fy) = ((view.origin.0 * s).floor(), (view.origin.1 * s).floor());
    if !(s.is_finite() && s > 0.0 && fx.is_finite() && fy.is_finite() && fx.abs() < 1e15 && fy.abs() < 1e15) {
        return None;
    }
    let v = View {
        origin: (fx / s, fy / s),
        scale: s,
        width: view.width.saturating_add(1).clamp(1, 16_384),
        height: view.height.saturating_add(1).clamp(1, 16_384),
    };
    Some((v, (fx as i64, fy as i64)))
}

/// Device-pixel rectangle `[x0, x1) × [y0, y1)` in the frame.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Px {
    pub x0: i64,
    pub y0: i64,
    pub x1: i64,
    pub y1: i64,
}

impl Px {
    fn area(&self) -> u64 {
        (self.x1 - self.x0).max(0) as u64 * (self.y1 - self.y0).max(0) as u64
    }
    fn union(&self, o: &Px) -> Px {
        Px { x0: self.x0.min(o.x0), y0: self.y0.min(o.y0), x1: self.x1.max(o.x1), y1: self.y1.max(o.y1) }
    }
    fn clamp(&self, w: i64, h: i64) -> Option<Px> {
        let r = Px { x0: self.x0.max(0), y0: self.y0.max(0), x1: self.x1.min(w), y1: self.y1.min(h) };
        (r.x1 > r.x0 && r.y1 > r.y0).then_some(r)
    }
}

/// What the next render does against the kept image.
enum Outcome {
    /// The kept image shifted, and the areas to draw over it.
    Patch(Patched, Arc<Sensitive>),
    /// The whole view.
    Full(Arc<Sensitive>),
}

struct Start {
    snapped: View,
    px: (i64, i64),
    fonts: u64,
    outcome: Outcome,
}

/// The kept image brought to the new view, with what is left to draw on it.
struct Patched {
    pix: Pixmap,
    /// Areas of `pix` to draw, in device pixels (none: it is as it should be).
    damage: Vec<Px>,
    /// Their area.
    pixels: u64,
    /// Device pixels drawn past each area, for effects that read around (discarded).
    margin: i64,
    /// The kept image was moved (a pan): every pixel of it is different from what was shown.
    shifted: bool,
    /// Areas that were copied from elsewhere in the image (a layer that only moved): they differ
    /// from what was shown too, but cost nothing to draw.
    copied: Vec<Px>,
}

/// The areas of the image that differ from the previous one, `[x, y, width, height]` in device
/// pixels: what a texture upload has to send. `None`: all of it (another zoom, a pan, a whole
/// render).
pub type Dirty = Option<Vec<[u32; 4]>>;

fn dirty_of(p: &Patched) -> Dirty {
    if p.shifted {
        return None;
    }
    p.damage
        .iter()
        .chain(&p.copied)
        .map(|d| Some([u32::try_from(d.x0).ok()?, u32::try_from(d.y0).ok()?, u32::try_from(d.x1 - d.x0).ok()?, u32::try_from(d.y1 - d.y0).ok()?]))
        .collect()
}

impl Patched {
    /// Draw the damaged areas.
    fn draw(&mut self, doc: &Document, page: NodeId, view: &View, px: (i64, i64), opts: &Options) -> Option<()> {
        for d in &self.damage {
            crate::perf::count(|s| {
                s.patch_rects += 1;
                s.patch_pixels += d.area();
            });
            render_into(doc, page, view, px, d, self.margin, opts, &mut self.pix)?;
        }
        Some(())
    }
}

/// Rows of a piece the browser draws between frames: not fewer, not more.
pub const MIN_ROWS: u32 = 16;
pub const MAX_ROWS: u32 = 512;

/// One piece of a render in pieces.
enum Piece {
    /// Decode picture levels the view draws from (in parallel where there are threads).
    Decode(Vec<crate::prefetch::Need>),
    /// Draw an area of the image.
    Draw(Px),
}

/// A render in pieces: [`Retained::begin`], then [`Sliced::step`] until it is done, then
/// [`Retained::finish`].
pub struct Sliced {
    doc: Arc<Document>,
    page: NodeId,
    view: View,
    px: (i64, i64),
    fonts: u64,
    opts: Options,
    sens: Arc<Sensitive>,
    pix: Pixmap,
    pieces: Vec<Piece>,
    next: usize,
    margin: i64,
    work: Work,
    dirty: Dirty,
    /// Pieces up to here draw (or decode for) the visible part of the view: once they have run,
    /// the screen is covered.
    focus_end: usize,
    /// The image may be shown before it is finished: every area not drawn yet is blank (a pan's
    /// uncovered strips, a whole render). An edit's patch keeps stale pixels until drawn and isn't.
    showable: bool,
    /// Pixels copied from kept tiles instead of drawn.
    tiled: u64,
    /// Tiles may be taken from the finished image.
    tiles_ok: bool,
}

impl Sliced {
    /// Run pieces until `more` says to stop (it is asked after each one; at least one runs).
    /// Returns whether every piece has run.
    pub fn step(&mut self, more: &mut dyn FnMut() -> bool) -> bool {
        while let Some(piece) = self.pieces.get(self.next) {
            match piece {
                Piece::Decode(needs) => crate::prefetch::run(&self.doc, self.doc.color_profile, needs),
                // A band that fails to draw is left as it was (stale pixels beat none).
                Piece::Draw(d) => {
                    let _ = render_into(&self.doc, self.page, &self.view, self.px, d, self.margin, &self.opts, &mut self.pix);
                }
            }
            self.next += 1;
            if !more() {
                break;
            }
        }
        self.is_done()
    }

    pub fn is_done(&self) -> bool {
        self.next >= self.pieces.len()
    }

    /// Pieces run and in all.
    pub fn progress(&self) -> (usize, usize) {
        (self.next, self.pieces.len())
    }

    /// The rows the draw pieces cover in all, for timing how long a row takes.
    pub fn rows(&self) -> u64 {
        self.pieces.iter().map(|p| if let Piece::Draw(d) = p { (d.y1 - d.y0).max(0) as u64 } else { 0 }).sum()
    }

    /// The view the finished render shows (snapped to device pixels).
    pub fn view(&self) -> &View {
        &self.view
    }

    /// Whether the pieces covering the visible part of the view (the focus given to
    /// [`Retained::begin_focused`]) have all run.
    pub fn focus_done(&self) -> bool {
        self.next >= self.focus_end
    }

    /// Whether the image may be shown unfinished (see [`Sliced::image`]).
    pub fn showable(&self) -> bool {
        self.showable
    }

    /// The image as drawn so far: what is not drawn yet is blank when [`Sliced::showable`].
    pub fn image(&self) -> &Pixmap {
        &self.pix
    }

    /// Pieces run so far (an index for [`Sliced::drawn`]).
    pub fn ran(&self) -> usize {
        self.next
    }

    /// The areas (`[x, y, w, h]`) the draw pieces from `from` up to those run so far covered.
    pub fn drawn(&self, from: usize) -> Vec<[u32; 4]> {
        self.pieces
            .get(from..self.next)
            .unwrap_or_default()
            .iter()
            .filter_map(|p| match p {
                Piece::Draw(d) => px_rect(d),
                Piece::Decode(_) => None,
            })
            .collect()
    }

    /// Pixels copied from kept tiles instead of drawn.
    pub fn tiled(&self) -> u64 {
        self.tiled
    }

    /// Whether `view` (a screen, same zoom) lies inside this render, so letting it finish shows it
    /// (its focus is drawn first and the margin nearest it next).
    pub fn covers(&self, view: &View) -> bool {
        let Some((v, p)) = snap(view) else { return false };
        if v.scale.to_bits() != self.view.scale.to_bits() {
            return false;
        }
        let (x0, y0) = (p.0 - self.px.0, p.1 - self.px.1);
        let (x1, y1) = (x0 + i64::from(view.width), y0 + i64::from(view.height));
        x0 >= 0 && y0 >= 0 && x1 <= i64::from(self.view.width) && y1 <= i64::from(self.view.height)
    }

    /// Pixels the pieces not run yet would draw.
    pub fn left(&self) -> u64 {
        self.pieces.get(self.next..).unwrap_or_default().iter().map(|p| if let Piece::Draw(d) = p { d.area() } else { 0 }).sum()
    }
}

fn px_rect(d: &Px) -> Option<[u32; 4]> {
    Some([u32::try_from(d.x0).ok()?, u32::try_from(d.y0).ok()?, u32::try_from(d.x1 - d.x0).ok()?, u32::try_from(d.y1 - d.y0).ok()?])
}

/// Make `d` of `pix` blank (transparent).
fn blank(pix: &mut Pixmap, d: &Px) {
    let w = i64::from(pix.width());
    let Ok(row) = usize::try_from(w * 4) else { return };
    let (x0, x1) = (d.x0.clamp(0, w), d.x1.clamp(0, w));
    let (Ok(a), Ok(n)) = (usize::try_from(x0 * 4), usize::try_from((x1 - x0) * 4)) else { return };
    let data = pix.data_mut();
    for y in d.y0.max(0)..d.y1 {
        let Ok(y) = usize::try_from(y) else { continue };
        let at = y * row + a;
        if let Some(s) = data.get_mut(at..at + n) {
            s.fill(0);
        }
    }
}

fn new_pixmap_for(v: &View) -> Option<Pixmap> {
    Pixmap::new(v.width.clamp(1, 16_384), v.height.clamp(1, 16_384))
}

/// Keeps the last rendered view; see the module docs.
#[derive(Default)]
pub struct Retained {
    last: Option<Frame>,
    /// What the last render changed against the one before.
    dirty: Dirty,
    /// Blocks of earlier renders, for coming back to a region ([`Tiles`]).
    tiles: Tiles,
}

impl Retained {
    /// Forget the kept image (the next render is full).
    pub fn clear(&mut self) {
        self.last = None;
        self.dirty = None;
    }

    /// The kept image.
    pub fn image(&self) -> Option<&Pixmap> {
        self.last.as_ref().map(|f| &f.pix)
    }

    /// The bytes of the kept image and tiles.
    pub fn bytes(&self) -> usize {
        self.last.as_ref().map_or(0, |f| f.pix.data().len()) + self.tiles.bytes()
    }

    /// The kept tiles ([`Tiles`]).
    pub fn tiles(&self) -> &Tiles {
        &self.tiles
    }

    /// Keep tiles under `budget` bytes from now on (0: none), dropping those held.
    pub fn set_tile_budget(&mut self, budget: usize) {
        self.tiles = Tiles::new(budget);
    }

    /// Forget the kept image and the tiles.
    pub fn clear_all(&mut self) {
        self.clear();
        self.tiles.clear();
    }

    /// What the last render changed in the image against the one before it ([`Dirty`]).
    pub fn dirty(&self) -> Option<&[[u32; 4]]> {
        self.dirty.as_deref()
    }

    /// Decide what rendering `view` takes against the kept image: patch it (the previous image
    /// shifted, with the areas to redraw) or draw it whole. `None` for a view that can't be put on
    /// a pixel grid.
    fn start(&mut self, doc: &Arc<Document>, page: NodeId, view: &View, opts: &Options) -> Option<Start> {
        // A view that can't be put on a pixel grid (non-finite or absurd) draws nothing.
        let Some((snapped, px)) = snap(view) else {
            self.last = None;
            return None;
        };
        let fonts = figcraft_text::layout_generation();
        let mut sens = None;
        if let Some(last) = self.last.take()
            && last.page == page
            && last.outline == opts.outline_mode
            && last.outline_extras == opts.outline
            // Hidden layers drawn as outlines aren't in the bounds patches are cut from.
            && !opts.outline.hidden
            && last.outlined == opts.outlined
            && last.lod == opts.lod
            && last.draft == opts.draft
            && last.solo == opts.solo
            && last.background == opts.background
            && last.scale == snapped.scale.to_bits()
            && last.pix.width() == snapped.width
            && last.pix.height() == snapped.height
            && last.fonts == fonts
            // Images are decoded into the file's colour space: a new profile redraws everything.
            && last.doc.color_profile == doc.color_profile
        {
            let same_doc = Arc::ptr_eq(&last.doc, doc);
            let s = if same_doc { last.sensitive.clone() } else { Arc::new(sensitive(doc)) };
            let t = web_time::Instant::now();
            let patched =
                plan_patch(last, doc, page, &snapped, px, &s, &opts.skip, !opts.outline_mode && opts.outlined.is_empty() && opts.solo.is_none());
            let ns = crate::perf::ns_since(t);
            crate::perf::count(|s| s.patch_plan_ns += ns);
            if let Some(patched) = patched {
                return Some(Start { snapped, px, fonts, outcome: Outcome::Patch(patched, s) });
            }
            sens = Some(s);
        }
        let s = sens.unwrap_or_else(|| Arc::new(sensitive(doc)));
        Some(Start { snapped, px, fonts, outcome: Outcome::Full(s) })
    }

    /// Render `view` of `page`, reusing the previous render where nothing changed. Returns the
    /// view actually drawn (snapped to device pixels, see [`snap`]), the image and what it took.
    pub fn render(&mut self, doc: &Arc<Document>, page: NodeId, view: &View, opts: &Options) -> Option<(View, &Pixmap, Work)> {
        let Start { snapped, px, fonts, outcome } = self.start(doc, page, view, opts)?;
        let mut dirty = None;
        let t = web_time::Instant::now();
        let (pix, s, work) = match outcome {
            Outcome::Patch(mut p, s) => match p.draw(doc, page, &snapped, px, opts) {
                Some(()) => {
                    let ns = crate::perf::ns_since(t);
                    crate::perf::count(|s| s.patch_draw_ns += ns);
                    dirty = dirty_of(&p);
                    (p.pix, s, if p.pixels == 0 && p.copied.is_empty() { Work::Reused } else { Work::Partial { pixels: p.pixels } })
                }
                // A patch that can't be drawn: the whole view.
                None => (render_view(doc, page, &snapped, opts)?, s, Work::Full),
            },
            Outcome::Full(s) => {
                let pix = render_view(doc, page, &snapped, opts)?;
                let ns = crate::perf::ns_since(t);
                crate::perf::count(|s| s.full_ns += ns);
                (pix, s, Work::Full)
            }
        };
        crate::perf::count(|s| match work {
            Work::Reused => s.reused += 1,
            Work::Partial { .. } => s.partial += 1,
            Work::Full => s.full += 1,
        });
        self.dirty = dirty;
        let frame = self.keep(doc, page, (&snapped, px, fonts), opts, pix, s);
        Some((snapped, &frame.pix, work))
    }

    /// Start rendering `view` in pieces (the browser draws on the one thread that also runs the UI:
    /// a render in one go freezes it): the pictures to decode, then the areas to draw as bands of
    /// about `rows` rows. Run the pieces with [`Sliced::step`] and keep the result with
    /// [`Retained::finish`]. The same image as [`Retained::render`] (bands that cut an effect are
    /// drawn with the margin patches use). Dropping a [`Sliced`] unfinished forgets the kept image
    /// (the next render is whole); [`Retained::abandon`] keeps what it drew.
    pub fn begin(&mut self, doc: &Arc<Document>, page: NodeId, view: &View, opts: &Options, rows: u32) -> Option<Sliced> {
        self.begin_focused(doc, page, view, opts, Some(rows), None)
    }

    /// [`Retained::begin`], drawing the part of the view in `focus` (what the screen shows; the
    /// rest is margin for a pan) first: its pictures, then its bands, then the margin's, the side
    /// with more margin (where a pan is heading) first. `rows: None` draws each area in one piece
    /// (a renderer with threads splits it itself). Areas held as tiles ([`Tiles`]) are copied.
    pub fn begin_focused(
        &mut self,
        doc: &Arc<Document>,
        page: NodeId,
        view: &View,
        opts: &Options,
        rows: Option<u32>,
        focus: Option<&View>,
    ) -> Option<Sliced> {
        let Start { snapped, px, fonts, outcome } = self.start(doc, page, view, opts)?;
        let rows = rows.map(|r| i64::from(r.clamp(MIN_ROWS, MAX_ROWS)));
        let (w, h) = (i64::from(snapped.width), i64::from(snapped.height));
        let mut dirty = None;
        let mut shifted = false;
        let (mut pix, damage, margin, work, sens) = match outcome {
            Outcome::Patch(p, s) => {
                let work = if p.pixels == 0 && p.copied.is_empty() { Work::Reused } else { Work::Partial { pixels: p.pixels } };
                dirty = dirty_of(&p);
                shifted = p.shifted;
                (p.pix, p.damage, p.margin, work, s)
            }
            Outcome::Full(s) => {
                let reach = crate::backdrop_reach(s.backdrop_blur, snapped.scale).ceil();
                // Grain works on whole layers and a backdrop that reaches past a band needs the
                // whole view: those draw in one piece.
                let band = rows.unwrap_or(MAX_ROWS.into()) as f64;
                let whole = !s.areas.is_empty() || !reach.is_finite() || reach > band / 2.0;
                let all = vec![Px { x0: 0, y0: 0, x1: w, y1: h }];
                (new_pixmap_for(&snapped)?, all, if whole { 0 } else { reach as i64 + 1 }, Work::Full, s)
            }
        };
        let splits = !matches!(work, Work::Full) || margin > 0;
        // The focus in frame pixels (the whole frame without one).
        let focus_px = focus
            .and_then(|f| {
                let (fv, fp) = snap(f)?;
                (fv.scale.to_bits() == snapped.scale.to_bits()).then_some(())?;
                let (x0, y0) = (fp.0 - px.0, fp.1 - px.1);
                Px { x0, y0, x1: x0 + i64::from(f.width) + 1, y1: y0 + i64::from(f.height) + 1 }.clamp(w, h)
            })
            .unwrap_or(Px { x0: 0, y0: 0, x1: w, y1: h });
        // Kept tiles fill what they can; the backdrop reach keeps them off the frame's edges.
        let tiles_ok = self.tiles.sync(doc, page, opts, fonts, &sens);
        let reach = crate::backdrop_reach(sens.backdrop_blur, snapped.scale).ceil();
        let reach = if reach.is_finite() { reach.min(1e6) as i64 } else { i64::MAX / 4 };
        let mut tiled = 0;
        let damage = if tiles_ok && splits {
            let (left, copied) = self.tiles.fill(&mut pix, px, snapped.scale, reach, damage);
            tiled = copied;
            left
        } else {
            damage
        };
        // Visible areas first, then the margin.
        let (mut inside, mut outside): (Vec<Px>, Vec<Px>) = (Vec::new(), Vec::new());
        for d in damage {
            if !splits {
                inside.push(d);
                continue;
            }
            let hit = Px { x0: d.x0.max(focus_px.x0), y0: d.y0.max(focus_px.y0), x1: d.x1.min(focus_px.x1), y1: d.y1.min(focus_px.y1) };
            if hit.x1 > hit.x0 && hit.y1 > hit.y0 {
                inside.push(hit);
                outside.extend(subtract(d, hit));
            } else {
                outside.push(d);
            }
        }
        // The margin nearest the screen first, the side with more margin (ahead of a pan) before
        // the other.
        let (ahead_x, ahead_y) = ((w - focus_px.x1) - focus_px.x0, (h - focus_px.y1) - focus_px.y0);
        let gap = |d: &Px| -> i64 {
            let gx = if d.x1 <= focus_px.x0 {
                focus_px.x0 - d.x1 + i64::from(ahead_x > 0) * w
            } else if d.x0 >= focus_px.x1 {
                d.x0 - focus_px.x1 + i64::from(ahead_x < 0) * w
            } else {
                0
            };
            let gy = if d.y1 <= focus_px.y0 {
                focus_px.y0 - d.y1 + i64::from(ahead_y > 0) * h
            } else if d.y0 >= focus_px.y1 {
                d.y0 - focus_px.y1 + i64::from(ahead_y < 0) * h
            } else {
                0
            };
            gx.max(gy)
        };
        let band = |list: Vec<Px>, out: &mut Vec<Px>| {
            for d in list {
                match rows {
                    Some(rows) if splits => {
                        let mut y = d.y0;
                        while y < d.y1 {
                            let y1 = (y + rows).min(d.y1);
                            out.push(Px { y0: y, y1, ..d });
                            y = y1;
                        }
                    }
                    _ => out.push(d),
                }
            }
        };
        let mut near = Vec::new();
        band(inside, &mut near);
        let mut far = Vec::new();
        band(outside, &mut far);
        far.sort_by_key(|d| gap(d));
        // A pan's uncovered strips hold stale pixels until drawn: blank them, so the image can be
        // shown before it is finished.
        let showable = shifted || matches!(work, Work::Full);
        if shifted {
            for d in near.iter().chain(&far) {
                blank(&mut pix, d);
            }
        }
        // Pictures not held yet decode first: those on screen, then the margin's. One piece for
        // each where there is one thread (the browser), all at once where they decode in parallel.
        let all_needs = crate::prefetch::missing(doc, &crate::prefetch::needs(doc, page, &snapped, opts));
        let (near_needs, far_needs): (Vec<_>, Vec<_>) = match focus {
            Some(f) => {
                let shown = crate::prefetch::needs(doc, page, f, opts);
                all_needs.into_iter().partition(|n| shown.contains(n))
            }
            None => (all_needs, Vec::new()),
        };
        let decode = |needs: Vec<crate::prefetch::Need>, out: &mut Vec<Piece>| {
            if needs.is_empty() {
                return;
            }
            if cfg!(target_arch = "wasm32") || rows.is_some() {
                out.extend(needs.into_iter().map(|n| Piece::Decode(vec![n])));
            } else {
                out.push(Piece::Decode(needs));
            }
        };
        let mut pieces: Vec<Piece> = Vec::new();
        decode(near_needs, &mut pieces);
        pieces.extend(near.into_iter().map(Piece::Draw));
        let focus_end = pieces.len();
        decode(far_needs, &mut pieces);
        pieces.extend(far.into_iter().map(Piece::Draw));
        Some(Sliced {
            doc: doc.clone(),
            page,
            view: snapped,
            px,
            fonts,
            opts: opts.clone(),
            sens,
            pix,
            pieces,
            next: 0,
            margin,
            work,
            dirty,
            focus_end,
            showable,
            tiled,
            tiles_ok,
        })
    }

    /// Give up an unfinished [`Sliced`] render for a newer one but keep what it drew: the next
    /// render draws the rest (where it still shows) along with its own areas.
    pub fn abandon(&mut self, done: Sliced) {
        let holes: Vec<Px> =
            done.pieces.get(done.next..).unwrap_or_default().iter().filter_map(|p| if let Piece::Draw(d) = p { Some(*d) } else { None }).collect();
        let Sliced { doc, page, view, px, fonts, opts, sens, pix, .. } = done;
        self.dirty = None;
        self.keep(&doc, page, (&view, px, fonts), &opts, pix, sens);
        if let Some(f) = self.last.as_mut() {
            f.holes = holes;
        }
    }

    /// Keep a finished [`Sliced`] render as the last image; returns it like [`Retained::render`].
    pub fn finish(&mut self, done: Sliced) -> Option<(View, &Pixmap, Work)> {
        let Sliced { doc, page, view, px, fonts, opts, sens, pix, work, next, pieces, dirty, tiles_ok, .. } = done;
        if next < pieces.len() {
            return None;
        }
        if tiles_ok {
            let reach = crate::backdrop_reach(sens.backdrop_blur, view.scale).ceil();
            if reach.is_finite() && reach < 1e6 {
                self.tiles.store(&pix, px, view.scale, reach as i64, &sens);
            }
        }
        self.dirty = dirty;
        crate::perf::count(|s| match work {
            Work::Reused => s.reused += 1,
            Work::Partial { .. } => s.partial += 1,
            Work::Full => s.full += 1,
        });
        let frame = self.keep(&doc, page, (&view, px, fonts), &opts, pix, sens);
        Some((view, &frame.pix, work))
    }

    /// Keep `pix`, the render of `at`: the snapped view, its top-left device pixel and the font
    /// generation the render started with (fonts arriving meanwhile leave it stale).
    fn keep(
        &mut self,
        doc: &Arc<Document>,
        page: NodeId,
        at: (&View, (i64, i64), u64),
        opts: &Options,
        pix: Pixmap,
        sensitive: Arc<Sensitive>,
    ) -> &Frame {
        let (view, px, fonts) = at;
        self.last.insert(Frame {
            doc: doc.clone(),
            page,
            outline: opts.outline_mode,
            outline_extras: opts.outline,
            outlined: opts.outlined.clone(),
            lod: opts.lod,
            draft: opts.draft,
            skip: opts.skip.clone(),
            solo: opts.solo,
            background: opts.background,
            scale: view.scale.to_bits(),
            px,
            fonts,
            sensitive,
            pix,
            holes: Vec::new(),
        })
    }
}

/// Page rectangle → device pixels of a frame whose top-left is `px`, rounded outwards plus a pixel
/// of anti-aliasing.
pub(crate) fn to_px(r: Rect, scale: f64, px: (i64, i64)) -> Option<Px> {
    let (x0, y0, x1, y1) = ((r.x0 * scale).floor() - 1.0, (r.y0 * scale).floor() - 1.0, (r.x1 * scale).ceil() + 1.0, (r.y1 * scale).ceil() + 1.0);
    if !(x0.is_finite() && y0.is_finite() && x1.is_finite() && y1.is_finite())
        || x0.abs() > 1e15
        || y0.abs() > 1e15
        || x1.abs() > 1e15
        || y1.abs() > 1e15
    {
        return None;
    }
    Some(Px { x0: x0 as i64 - px.0, y0: y0 as i64 - px.1, x1: x1 as i64 - px.0, y1: y1 as i64 - px.1 })
}

/// Page areas a change to `id` in `doc` affects on `page`; `None` when only a full render will do.
pub(crate) fn changed_areas(doc: &Document, page: NodeId, id: NodeId, out: &mut Vec<Rect>) -> Option<()> {
    let Some(n) = doc.node(id) else { return Some(()) };
    if n.is_page() {
        // Page background, page order or top-level layers.
        return if id == page { None } else { Some(()) };
    }
    if doc.page_of(id) != Some(page) {
        return Some(());
    }
    out.push(draw::shown_paint_bounds(doc, id)?);
    // A mask clips the layers above it.
    if n.is_mask {
        let parent = n.parent?;
        if parent == page {
            return None;
        }
        out.push(draw::paint_bounds(doc, parent)?);
    }
    // Ancestors that paint from their children's pixels (booleans, effects, masks): all of them.
    for a in doc.ancestors(id) {
        let Some(an) = doc.node(a) else { break };
        if an.is_page() {
            break;
        }
        if matches!(an.kind, NodeKind::BooleanOp { .. }) || an.is_mask || an.effects.iter().any(|e| e.visible) {
            out.push(draw::paint_bounds(doc, a)?);
        }
    }
    Some(())
}

/// The previous frame brought to `px` for `doc`, with the areas to render; `None` when a full
/// render is the better (or only correct) choice.
fn plan_patch(
    last: Frame,
    doc: &Arc<Document>,
    page: NodeId,
    view: &View,
    px: (i64, i64),
    s: &Sensitive,
    skip: &[NodeId],
    allow_copies: bool,
) -> Option<Patched> {
    let (w, h) = (i64::from(view.width), i64::from(view.height));
    let (dx, dy) = (px.0.checked_sub(last.px.0)?, px.1.checked_sub(last.px.1)?);
    if dx.abs() >= w || dy.abs() >= h {
        return None;
    }
    // Background blurs read the backdrop around them, so a change shows that far off: under a blur
    // beside a changed layer, and at the old view's edge (where the backdrop used to end).
    let reach = crate::backdrop_reach(s.backdrop_blur.max(last.sensitive.backdrop_blur), view.scale).ceil();
    if !reach.is_finite() || reach > MAX_MARGIN_PX {
        return None;
    }
    let reach = reach as i64;
    let mut damage: Vec<Px> = Vec::new();
    // Areas the last render never drew (it was given up for a newer one), where they are now.
    let holes = !last.holes.is_empty();
    for o in &last.holes {
        damage.push(Px { x0: o.x0 - dx - reach, y0: o.y0 - dy - reach, x1: o.x1 - dx + reach, y1: o.y1 - dy + reach });
    }
    let allow_copies = allow_copies && !holes;
    // Strips a pan uncovers.
    if dx > 0 {
        damage.push(Px { x0: w - dx - reach, y0: 0, x1: w, y1: h });
    } else if dx < 0 {
        damage.push(Px { x0: 0, y0: 0, x1: reach - dx, y1: h });
    }
    if dy > 0 {
        damage.push(Px { x0: 0, y0: h - dy - reach, x1: w, y1: h });
    } else if dy < 0 {
        damage.push(Px { x0: 0, y0: 0, x1: w, y1: reach - dy });
    }
    // Layers that changed, where they were and where they are now; layers that began or stopped
    // being left out of the render (a drag draws the moved layers itself) count as changed.
    let skipped: Vec<NodeId> = skip.iter().chain(&last.skip).filter(|id| skip.contains(id) != last.skip.contains(id)).copied().collect();
    let mut copies: Vec<moved::Copy> = Vec::new();
    let mut repair: Vec<Px> = Vec::new();
    if !Arc::ptr_eq(&last.doc, doc) || !skipped.is_empty() {
        let mut areas = Vec::new();
        for id in skipped.iter() {
            changed_areas(&last.doc, page, *id, &mut areas)?;
            changed_areas(doc, page, *id, &mut areas)?;
        }
        let changed = if Arc::ptr_eq(&last.doc, doc) { Vec::new() } else { doc.changed_ids(&last.doc, MAX_CHANGED)? };
        for id in &changed {
            // shortcut: an edited pattern source redraws the whole view; patch the patterned layers' areas when that shows up in profiles.
            if in_pattern_source(doc, s, *id) || in_pattern_source(&last.doc, &last.sensitive, *id) {
                return None;
            }
        }
        // Layers that only moved (a drag): the pixels they covered are copied, not drawn.
        let plain_view =
            dx == 0 && dy == 0 && reach == 0 && skipped.is_empty() && allow_copies && s.areas.is_empty() && last.sensitive.areas.is_empty();
        let t = web_time::Instant::now();
        let plan = if plain_view { moved::plan_or_why(&last.doc, doc, page, &changed, view.scale, px, (w, h)) } else { Err(moved::NoCopy::NotTried) };
        let ns = crate::perf::ns_since(t);
        crate::perf::count(|s| s.plan_ns += ns);
        match plan {
            Ok(plan) => {
                crate::perf::count(|s| s.copied += 1);
                copies = plan.copies;
                repair = plan.repair;
                areas.extend(plan.areas);
            }
            Err(why) => {
                crate::perf::not_copied(why);
                for id in &changed {
                    changed_areas(&last.doc, page, *id, &mut areas)?;
                    changed_areas(doc, page, *id, &mut areas)?;
                }
            }
        }
        for r in areas {
            if let Some(p) = to_px(r, view.scale, px) {
                damage.push(Px { x0: p.x0 - reach, y0: p.y0 - reach, x1: p.x1 + reach, y1: p.y1 + reach });
            }
        }
    }
    let mut damage: Vec<Px> = damage.iter().filter_map(|d| d.clamp(w, h)).collect();
    // What is copied needs no drawing.
    for c in &copies {
        damage = damage.iter().flat_map(|d| subtract(*d, c.dst)).collect();
    }
    damage.extend(repair.iter().filter_map(|d| d.clamp(w, h)));
    if damage.is_empty() && dx == 0 && dy == 0 && copies.is_empty() {
        return Some(Patched { pix: last.pix, damage: Vec::new(), pixels: 0, margin: 0, shifted: false, copied: Vec::new() });
    }
    // Layers whose look depends on where they are cut are redrawn whole.
    let sensitive: Vec<Px> = s.areas.iter().chain(last.sensitive.areas.iter()).filter_map(|r| to_px(*r, view.scale, px)).collect();
    for _ in 0..4 {
        let mut grew = false;
        for d in damage.iter_mut() {
            for a in &sensitive {
                let hits = a.x0 < d.x1 && d.x0 < a.x1 && a.y0 < d.y1 && d.y0 < a.y1;
                if hits && a.union(d) != *d {
                    *d = a.union(d);
                    grew = true;
                }
            }
        }
        if !grew {
            break;
        }
    }
    let mut damage = merge(damage.iter().filter_map(|d| d.clamp(w, h)).collect());
    // Too many areas: join the pair that costs the fewest pixels to draw as one, until few are left.
    while damage.len() > MAX_RECTS {
        let mut best: Option<(u64, usize, usize)> = None;
        for i in 0..damage.len() {
            for j in i + 1..damage.len() {
                let (Some(a), Some(b)) = (damage.get(i), damage.get(j)) else { continue };
                let extra = a.union(b).area().saturating_sub(a.area() + b.area());
                if best.is_none_or(|(e, _, _)| extra < e) {
                    best = Some((extra, i, j));
                }
            }
        }
        let (_, i, j) = best?;
        let (a, b) = (*damage.get(i)?, *damage.get(j)?);
        damage.swap_remove(j);
        *damage.get_mut(i)? = a.union(&b);
    }
    let pixels: u64 = damage.iter().map(Px::area).sum();
    if pixels as f64 > MAX_PARTIAL_SHARE * (w * h) as f64 {
        return None;
    }
    // Rendered with the backdrop reach as a margin (so blurs see their whole backdrop), keeping the inside.
    let mut pix = last.pix;
    shift(&mut pix, dx, dy)?;
    let copied = copy_areas(&mut pix, &copies)?;
    Some(Patched { pix, damage, pixels, margin: reach + 1, shifted: dx != 0 || dy != 0, copied })
}

/// `a` without `b`: up to four rectangles.
fn subtract(a: Px, b: Px) -> Vec<Px> {
    let hit = Px { x0: a.x0.max(b.x0), y0: a.y0.max(b.y0), x1: a.x1.min(b.x1), y1: a.y1.min(b.y1) };
    if hit.x1 <= hit.x0 || hit.y1 <= hit.y0 {
        return vec![a];
    }
    let mut out = Vec::with_capacity(4);
    let mut add = |r: Px| {
        if r.x1 > r.x0 && r.y1 > r.y0 {
            out.push(r);
        }
    };
    add(Px { x0: a.x0, y0: a.y0, x1: a.x1, y1: hit.y0 });
    add(Px { x0: a.x0, y0: hit.y1, x1: a.x1, y1: a.y1 });
    add(Px { x0: a.x0, y0: hit.y0, x1: hit.x0, y1: hit.y1 });
    add(Px { x0: hit.x1, y0: hit.y0, x1: a.x1, y1: hit.y1 });
    out
}

/// Copy each plan's source area of `pix` to its destination (all sources are read before any
/// destination is written). The destinations.
fn copy_areas(pix: &mut Pixmap, copies: &[moved::Copy]) -> Option<Vec<Px>> {
    let (w, h) = (i64::from(pix.width()), i64::from(pix.height()));
    let row = usize::try_from(w * 4).ok()?;
    // The rows of each source, read before any destination is written (a destination may
    // overlap another copy's source).
    let mut parts: Vec<Vec<u8>> = Vec::with_capacity(copies.len());
    for c in copies {
        let (src, dst) = (c.src.clamp(w, h)?, c.dst.clamp(w, h)?);
        if (src.x1 - src.x0, src.y1 - src.y0) != (dst.x1 - dst.x0, dst.y1 - dst.y0) || src != c.src || dst != c.dst {
            return None;
        }
        let n = usize::try_from((src.x1 - src.x0) * 4).ok()?;
        let mut part = Vec::with_capacity(n * usize::try_from(src.y1 - src.y0).ok()?);
        let data = pix.data();
        for y in src.y0..src.y1 {
            let at = usize::try_from(y).ok()? * row + usize::try_from(src.x0 * 4).ok()?;
            part.extend_from_slice(data.get(at..at + n)?);
        }
        parts.push(part);
    }
    let data = pix.data_mut();
    for (c, part) in copies.iter().zip(&parts) {
        let n = usize::try_from((c.dst.x1 - c.dst.x0) * 4).ok()?;
        for (k, y) in (c.dst.y0..c.dst.y1).enumerate() {
            let at = usize::try_from(y).ok()? * row + usize::try_from(c.dst.x0 * 4).ok()?;
            data.get_mut(at..at + n)?.copy_from_slice(part.get(k * n..(k + 1) * n)?);
        }
    }
    Some(copies.iter().map(|c| c.dst).collect())
}

/// Move the image's content by `(-dx, -dy)` pixels in place (what was at `(x, y)` goes to
/// `(x - dx, y - dy)`); the uncovered strips keep stale pixels for the caller to re-render.
fn shift(pix: &mut Pixmap, dx: i64, dy: i64) -> Option<()> {
    if dx == 0 && dy == 0 {
        return Some(());
    }
    let (w, h) = (i64::from(pix.width()), i64::from(pix.height()));
    let row = usize::try_from(w * 4).ok()?;
    let data = pix.data_mut();
    // Columns that survive the horizontal move, as byte ranges within a row.
    let (src_x, dst_x, n) = if dx >= 0 { (dx, 0, w - dx) } else { (0, -dx, w + dx) };
    let (src_x, dst_x, n) = (usize::try_from(src_x * 4).ok()?, usize::try_from(dst_x * 4).ok()?, usize::try_from(n * 4).ok()?);
    let ys: Box<dyn Iterator<Item = i64>> = if dy >= 0 { Box::new(0..h - dy) } else { Box::new((-dy..h).rev()) };
    for y in ys {
        let (src, dst) = (usize::try_from(y + dy).ok()? * row, usize::try_from(y).ok()? * row);
        if src + src_x + n > data.len() || dst + dst_x + n > data.len() {
            return None;
        }
        data.copy_within(src + src_x..src + src_x + n, dst + dst_x);
    }
    Some(())
}

/// The pixels a separate area costs beyond its own, for [`merge`].
const MERGE_SLACK: u64 = 6000;

/// Merge rectangles that overlap so much that their bounding box is no bigger than the two
/// (where a layer was and where it is now, a frame and its child…): no pixel renders twice.
fn merge(mut rects: Vec<Px>) -> Vec<Px> {
    let mut i = 0;
    while i < rects.len() {
        let mut j = i + 1;
        let mut merged = false;
        while j < rects.len() {
            let (Some(a), Some(b)) = (rects.get(i).copied(), rects.get(j).copied()) else { break };
            let u = a.union(&b);
            // Each area drawn separately pays for finding what lies in it (the layers, their text):
            // a few thousand pixels' worth, which is more than a thin strip's own.
            if u.area() <= a.area() + b.area() + MERGE_SLACK {
                if let Some(slot) = rects.get_mut(i) {
                    *slot = u;
                }
                rects.swap_remove(j);
                merged = true;
            } else {
                j += 1;
            }
        }
        if !merged {
            i += 1;
        }
    }
    rects
}

/// Render the frame pixels `d` (with `margin` more around, discarded) into `pix`. The margin stops
/// at the frame's edges: a whole render ends there, and what lies past it must not show in the
/// patch (a background blur at the edge reads the same backdrop either way).
#[allow(clippy::too_many_arguments)]
fn render_into(doc: &Document, page: NodeId, view: &View, px: (i64, i64), d: &Px, margin: i64, opts: &Options, pix: &mut Pixmap) -> Option<()> {
    let s = view.scale;
    let (fw, fh) = (i64::from(view.width), i64::from(view.height));
    let (left, top) = (margin.min(d.x0).max(0), margin.min(d.y0).max(0));
    let (right, bottom) = (margin.min(fw - d.x1).max(0), margin.min(fh - d.y1).max(0));
    let (ox, oy) = (d.x0 - left, d.y0 - top);
    let (rw, rh) = (u32::try_from(d.x1 - d.x0 + left + right).ok()?, u32::try_from(d.y1 - d.y0 + top + bottom).ok()?);
    // The same pixel grid as the frame: origin (px + offset) / scale.
    let sub = View { origin: ((px.0 + ox) as f64 / s, (px.1 + oy) as f64 / s), scale: s, width: rw, height: rh };
    let part = render_view(doc, page, &sub, opts)?;
    let inner =
        IntRect::from_xywh(i32::try_from(left).ok()?, i32::try_from(top).ok()?, u32::try_from(d.x1 - d.x0).ok()?, u32::try_from(d.y1 - d.y0).ok()?)?;
    let inner = part.clone_rect(inner)?;
    let copy = PixmapPaint { blend_mode: tiny_skia::BlendMode::Source, ..Default::default() };
    pix.draw_pixmap(i32::try_from(d.x0).ok()?, i32::try_from(d.y0).ok()?, inner.as_ref(), &copy, Transform::identity(), None);
    Some(())
}
