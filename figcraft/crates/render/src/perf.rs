//! Counters for what the retained renderer does with a change, for profiling and the tests that
//! keep a drag cheap: how often a move's pixels were copied instead of drawn, why not when not,
//! and where the time of a patch went. They count on the thread that renders (the render worker's;
//! it hands each render's counts over with the image), read as a [`Snapshot`]. The timings of the
//! drawing itself (pictures, clips, text, shadows) are taken only while [`set_detail`] is on: a
//! clock read for every layer drawn is not free (in a browser least of all).

use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};

/// Why a move could not be copied (see [`crate::moved`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum NoCopy {
    /// The view panned, layers were skipped, a backdrop blur reaches around, or grain is on the
    /// page: the copy path was not tried.
    NotTried = 0,
    /// Nothing changed, or too many layers did.
    Count,
    /// A changed layer changed in more than its position (or its parent, page or visibility).
    NotAMove,
    /// The layers moved by different amounts.
    DifferentDeltas,
    /// The move is not a whole number of device pixels.
    FractionalDelta,
    /// A move of zero pixels.
    ZeroDelta,
    /// An ancestor that is not a plain container (mask, boolean, blend, blur, rotated clip...).
    Ancestor,
    /// Nothing opaque to copy (a translucent, blurred, masked or rotated layer).
    NothingOpaque,
    /// Two copies would overlap.
    Overlap,
}

impl NoCopy {
    pub const ALL: [NoCopy; 9] = [
        NoCopy::NotTried,
        NoCopy::Count,
        NoCopy::NotAMove,
        NoCopy::DifferentDeltas,
        NoCopy::FractionalDelta,
        NoCopy::ZeroDelta,
        NoCopy::Ancestor,
        NoCopy::NothingOpaque,
        NoCopy::Overlap,
    ];

    pub fn name(self) -> &'static str {
        match self {
            NoCopy::NotTried => "not tried",
            NoCopy::Count => "count",
            NoCopy::NotAMove => "not a move",
            NoCopy::DifferentDeltas => "different deltas",
            NoCopy::FractionalDelta => "fractional delta",
            NoCopy::ZeroDelta => "zero delta",
            NoCopy::Ancestor => "ancestor",
            NoCopy::NothingOpaque => "nothing opaque",
            NoCopy::Overlap => "overlap",
        }
    }
}

const REASONS: usize = NoCopy::ALL.len();

/// What the renderer counted.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Snapshot {
    /// Patches whose changed layers' pixels were copied.
    pub copied: u64,
    /// Patches of changed layers that were drawn instead, by [`NoCopy`] reason.
    pub not_copied: [u64; REASONS],
    /// Nanoseconds planning the copy (`moved::plan_or_why`).
    pub plan_ns: u64,
    /// Nanoseconds deciding a patch (`plan_patch`: diffing, areas, shifting and copying pixels).
    pub patch_plan_ns: u64,
    /// Nanoseconds drawing the patched areas.
    pub patch_draw_ns: u64,
    /// Nanoseconds drawing whole views.
    pub full_ns: u64,
    /// Areas drawn by patches, and their device pixels.
    pub patch_rects: u64,
    pub patch_pixels: u64,
    /// Layers whose drop shadows were cast (not skipped as hidden).
    pub shadows: u64,
    /// Renders that reused the image, patched it, or drew it whole.
    pub reused: u64,
    pub partial: u64,
    pub full: u64,
    /// With [`set_detail`] on: nanoseconds casting drop shadows, preparing image paints, filling
    /// with them, drawing clipped children (what they draw included), drawing text and
    /// prefetching pictures.
    pub shadow_ns: u64,
    pub image_ns: u64,
    pub image_fill_ns: u64,
    pub clip_ns: u64,
    pub text_ns: u64,
    pub prefetch_ns: u64,
}

impl Snapshot {
    /// This thread's counters now.
    pub fn now() -> Self {
        COUNTS.with(|c| *c.borrow())
    }

    /// What was counted since `earlier`.
    pub fn since(&self, earlier: &Self) -> Self {
        self.zip(earlier, u64::wrapping_sub)
    }

    /// Both counts added (several renders' together).
    pub fn plus(&self, other: &Self) -> Self {
        self.zip(other, u64::wrapping_add)
    }

    fn zip(&self, o: &Self, f: fn(u64, u64) -> u64) -> Self {
        let mut not_copied = [0; REASONS];
        for (i, slot) in not_copied.iter_mut().enumerate() {
            *slot = f(self.not_copied.get(i).copied().unwrap_or(0), o.not_copied.get(i).copied().unwrap_or(0));
        }
        Self {
            copied: f(self.copied, o.copied),
            not_copied,
            plan_ns: f(self.plan_ns, o.plan_ns),
            patch_plan_ns: f(self.patch_plan_ns, o.patch_plan_ns),
            patch_draw_ns: f(self.patch_draw_ns, o.patch_draw_ns),
            full_ns: f(self.full_ns, o.full_ns),
            patch_rects: f(self.patch_rects, o.patch_rects),
            patch_pixels: f(self.patch_pixels, o.patch_pixels),
            shadows: f(self.shadows, o.shadows),
            reused: f(self.reused, o.reused),
            partial: f(self.partial, o.partial),
            full: f(self.full, o.full),
            shadow_ns: f(self.shadow_ns, o.shadow_ns),
            image_ns: f(self.image_ns, o.image_ns),
            image_fill_ns: f(self.image_fill_ns, o.image_fill_ns),
            clip_ns: f(self.clip_ns, o.clip_ns),
            text_ns: f(self.text_ns, o.text_ns),
            prefetch_ns: f(self.prefetch_ns, o.prefetch_ns),
        }
    }

    /// How many patches were not copied for `why`.
    pub fn not_copied_for(&self, why: NoCopy) -> u64 {
        self.not_copied.get(why as usize).copied().unwrap_or(0)
    }

    /// The reasons patches were drawn instead of copied, with their counts (nonzero ones).
    pub fn reasons(&self) -> Vec<(NoCopy, u64)> {
        NoCopy::ALL.iter().map(|w| (*w, self.not_copied_for(*w))).filter(|(_, n)| *n > 0).collect()
    }
}

thread_local! {
    static COUNTS: RefCell<Snapshot> = RefCell::new(Snapshot::default());
}

static DETAIL: AtomicBool = AtomicBool::new(false);

/// Time the drawing itself too (see the module docs).
pub fn set_detail(on: bool) {
    DETAIL.store(on, Relaxed);
}

/// Change this thread's counts.
pub(crate) fn count(f: impl FnOnce(&mut Snapshot)) {
    COUNTS.with(|c| {
        if let Ok(mut s) = c.try_borrow_mut() {
            f(&mut s);
        }
    });
}

pub(crate) fn not_copied(why: NoCopy) {
    count(|s| {
        if let Some(n) = s.not_copied.get_mut(why as usize) {
            *n += 1;
        }
    });
}

pub(crate) fn ns_since(t: web_time::Instant) -> u64 {
    u64::try_from(t.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

/// A field of the counts.
pub(crate) type Field = fn(&mut Snapshot) -> &mut u64;

/// Adds the time from its start to a field when dropped; only made while [`set_detail`] is on.
pub(crate) struct Timed(Field, web_time::Instant);

impl Timed {
    pub(crate) fn start(field: Field) -> Option<Timed> {
        DETAIL.load(Relaxed).then(|| Timed(field, web_time::Instant::now()))
    }
}

impl Drop for Timed {
    fn drop(&mut self) {
        let ns = ns_since(self.1);
        count(|s| *(self.0)(s) += ns);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_are_the_threads_own_and_details_wait_for_the_switch() {
        let a = Snapshot::now();
        count(|s| s.copied += 2);
        not_copied(NoCopy::FractionalDelta);
        std::thread::spawn(|| count(|s| s.copied += 5)).join().unwrap();
        let d = Snapshot::now().since(&a);
        assert_eq!((d.copied, d.not_copied_for(NoCopy::FractionalDelta)), (2, 1));
        assert_eq!(d.reasons(), vec![(NoCopy::FractionalDelta, 1)]);
        assert_eq!(d.plus(&d).copied, 4);
    }
}
