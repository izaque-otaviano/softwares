//! Counters for what a pointer gesture costs, for profiling and the tests that keep a drag cheap:
//! how many times the engine's move handler, the preview and the normalisation ran and how long
//! each took, how many auto layout frames were re-solved and how often snap targets were gathered.
//! They count on the thread that does the work (the UI thread, or a test's), so tests running
//! side by side don't see each other's; read them as a [`Snapshot`] and compare with an earlier
//! one with [`Snapshot::since`].

use std::cell::Cell;

/// A counter: an index into this thread's counters.
#[derive(Clone, Copy, Debug)]
pub struct Counter(usize);

macro_rules! counters {
    ($($name:ident: $doc:literal),* $(,)?) => {
        counters!(@consts 0usize; $($name: $doc,)*);

        const COUNT: usize = [$(stringify!($name)),*].len();

        thread_local! {
            static VALUES: [Cell<u64>; COUNT] = const { [const { Cell::new(0) }; COUNT] };
        }

        /// The counters' values at one moment.
        #[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
        #[allow(non_snake_case)]
        pub struct Snapshot {
            $(#[doc = $doc] pub $name: u64,)*
        }

        impl Snapshot {
            /// This thread's counters now.
            pub fn now() -> Self {
                VALUES.with(|v| Self { $($name: v.get($name.0).map_or(0, Cell::get),)* })
            }

            /// What was counted since `earlier`.
            pub fn since(&self, earlier: &Self) -> Self {
                Self { $($name: self.$name.wrapping_sub(earlier.$name),)* }
            }
        }
    };
    (@consts $i:expr; $name:ident: $doc:literal, $($rest:tt)*) => {
        #[doc = $doc]
        pub const $name: Counter = Counter($i);
        counters!(@consts $i + 1; $($rest)*);
    };
    (@consts $i:expr;) => {};
}

counters! {
    POINTER_CALLS: "`Session::pointer` calls.",
    POINTER_NS: "Nanoseconds inside `Session::pointer`.",
    MOVES: "Move-gesture drags handled (after the drag slop).",
    MOVE_NS: "Nanoseconds in the move handler before it calls the preview (snapping, rounding).",
    SNAP_NS: "Nanoseconds in `Targets::snap_move`.",
    GATHERS: "`Targets::gather` calls (snap candidates collected).",
    PREVIEWS: "`Session::preview` calls.",
    PREVIEW_NS: "Nanoseconds inside `Session::preview` in all.",
    PREVIEW_EDIT_NS: "Nanoseconds of the preview's own edit (the closure), the clone included.",
    NORMALIZE_NS: "Nanoseconds in `normalize` (derived state) during a preview.",
    PREVIEW_COMPARE_NS: "Nanoseconds comparing the previewed document with the one shown.",
    LAYOUT_FRAMES: "Auto layout frames solved by `normalize`.",
}

/// Nanoseconds since `t`, saturating.
pub(crate) fn ns_since(t: web_time::Instant) -> u64 {
    u64::try_from(t.elapsed().as_nanos()).unwrap_or(u64::MAX)
}

/// Add `n` to `counter` (on this thread).
pub(crate) fn add(counter: &Counter, n: u64) {
    VALUES.with(|v| {
        if let Some(c) = v.get(counter.0) {
            c.set(c.get().wrapping_add(n));
        }
    });
}

/// Count one more on `counter`.
pub(crate) fn bump(counter: &Counter) {
    add(counter, 1);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_snapshot_counts_what_happened_since_the_last() {
        let a = Snapshot::now();
        bump(&GATHERS);
        add(&SNAP_NS, 5);
        let d = Snapshot::now().since(&a);
        assert_eq!((d.GATHERS, d.SNAP_NS), (1, 5));
        // Another thread's counts are its own.
        std::thread::spawn(|| bump(&GATHERS)).join().unwrap();
        assert_eq!(Snapshot::now().since(&a).GATHERS, 1);
    }
}
