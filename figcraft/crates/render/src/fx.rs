//! Raster effects on premultiplied RGBA8 pixmaps: blur (3× box ≈ Gaussian), dilate/erode (spread),
//! alpha extraction and tinting.

use tiny_skia::Pixmap;

/// Box radii for three passes approximating a Gaussian of `sigma` (Kovesi).
fn box_sizes(sigma: f64) -> [usize; 3] {
    let n = 3.0;
    let w_ideal = (12.0 * sigma * sigma / n + 1.0).sqrt();
    let mut wl = w_ideal.floor() as i64;
    if wl % 2 == 0 {
        wl -= 1;
    }
    let wu = wl + 2;
    let m_ideal = (12.0 * sigma * sigma - n * (wl * wl) as f64 - 4.0 * n * wl as f64 - 3.0 * n) / (-4.0 * wl as f64 - 4.0);
    let m = m_ideal.round() as i64;
    let r = |i: i64| -> usize {
        let w = if i < m { wl } else { wu };
        ((w.max(1) - 1) / 2) as usize
    };
    [r(0), r(1), r(2)]
}

/// `acc / div` for `acc` up to a few million, as a multiply and a shift: `recip` is
/// [`reciprocal`] of `div`.
#[inline(always)]
fn divide(acc: u32, recip: u64) -> u8 {
    ((u64::from(acc) * recip) >> 32) as u8
}

/// The multiplier that makes [`divide`] exact for sums up to `255 × div` (`div` up to a few
/// thousand): `acc × ceil(2³² / div) >> 32 = acc / div`, whole-number division.
fn reciprocal(div: u32) -> u64 {
    (1u64 << 32).div_ceil(u64::from(div.max(1)))
}

/// One horizontal box pass of radius `r` over `h` rows of `w` pixels of `N` channels: a running sum
/// over the window `x - r ..= x + r`, transparent outside.
fn box_blur_h<const N: usize>(src: &[u8], dst: &mut [u8], w: usize, r: usize) {
    if r == 0 {
        dst.copy_from_slice(src);
        return;
    }
    let div = (2 * r + 1) as u32;
    let recip = reciprocal(div);
    for (srow, drow) in src.chunks_exact(w * N).zip(dst.chunks_exact_mut(w * N)) {
        let (spx, dpx) = (srow.as_chunks::<N>().0, drow.as_chunks_mut::<N>().0);
        let mut acc = [0u32; N];
        for px in spx.iter().take(r.min(w.saturating_sub(1)) + 1) {
            for c in 0..N {
                acc[c] += u32::from(px[c]);
            }
        }
        for (x, out) in dpx.iter_mut().enumerate() {
            for c in 0..N {
                out[c] = divide(acc[c], recip);
            }
            if let Some(px) = spx.get(x + r + 1) {
                for c in 0..N {
                    acc[c] += u32::from(px[c]);
                }
            }
            if x >= r
                && let Some(px) = spx.get(x - r)
            {
                for c in 0..N {
                    // The window held it: no underflow.
                    acc[c] = acc[c].wrapping_sub(u32::from(px[c]));
                }
            }
        }
    }
}

/// One vertical box pass of radius `r` over `h` rows of `row` bytes: the same running sum down
/// every column at once (whole rows at a time, so the memory is walked in order).
fn box_blur_v(src: &[u8], dst: &mut [u8], row: usize, h: usize, r: usize) {
    if r == 0 {
        dst.copy_from_slice(src);
        return;
    }
    let div = (2 * r + 1) as u32;
    let recip = reciprocal(div);
    fn rows(data: &[u8], y: usize, row: usize) -> Option<&[u8]> {
        data.get(y * row..(y + 1) * row)
    }
    let mut acc = vec![0u32; row];
    for y in 0..=r.min(h.saturating_sub(1)) {
        if let Some(s) = rows(src, y, row) {
            for (a, v) in acc.iter_mut().zip(s) {
                *a += u32::from(*v);
            }
        }
    }
    for (y, out) in dst.chunks_exact_mut(row).enumerate() {
        for (o, a) in out.iter_mut().zip(&acc) {
            *o = divide(*a, recip);
        }
        if let Some(s) = rows(src, y + r + 1, row) {
            for (a, v) in acc.iter_mut().zip(s) {
                *a += u32::from(*v);
            }
        }
        if y >= r
            && let Some(s) = rows(src, y - r, row)
        {
            for (a, v) in acc.iter_mut().zip(s) {
                *a = a.wrapping_sub(u32::from(*v));
            }
        }
    }
}

/// The largest blur standard deviation drawn (pixels): wider blurs look the same.
pub const MAX_SIGMA: f64 = 500.0;

/// Three box passes each way over `data`, `w` × `h` pixels of `N` channels, in place.
fn blur_channels<const N: usize>(data: &mut [u8], w: usize, h: usize, radii: [usize; 3]) {
    if w == 0 || h == 0 || data.len() != w * h * N {
        return;
    }
    let mut tmp = vec![0u8; data.len()];
    // Horizontal: data → tmp → data → tmp. Vertical: tmp → data → tmp → data.
    box_blur_h::<N>(data, &mut tmp, w, radii[0]);
    box_blur_h::<N>(&tmp, data, w, radii[1]);
    box_blur_h::<N>(data, &mut tmp, w, radii[2]);
    box_blur_v(&tmp, data, w * N, h, radii[0]);
    box_blur_v(data, &mut tmp, w * N, h, radii[1]);
    box_blur_v(&tmp, data, w * N, h, radii[2]);
}

/// Gaussian-like blur of the whole pixmap with standard deviation `sigma` (pixels).
pub fn blur(p: &mut Pixmap, sigma: f64) {
    if !(sigma.is_finite() && sigma > 0.3) {
        return;
    }
    let (w, h) = (p.width() as usize, p.height() as usize);
    blur_channels::<4>(p.data_mut(), w, h, box_sizes(sigma.min(MAX_SIGMA)));
}

/// [`blur`] of the alpha channel alone, for shadows (which are tinted afterwards: only their alpha
/// matters), a quarter of the work. The pixmap comes back white at the blurred alpha.
pub fn blur_alpha(p: &mut Pixmap, sigma: f64) {
    if !(sigma.is_finite() && sigma > 0.3) {
        return;
    }
    let (w, h) = (p.width() as usize, p.height() as usize);
    let mut plane: Vec<u8> = p.data().as_chunks::<4>().0.iter().map(|px| px[3]).collect();
    blur_channels::<1>(&mut plane, w, h, box_sizes(sigma.min(MAX_SIGMA)));
    for (px, a) in p.data_mut().as_chunks_mut::<4>().0.iter_mut().zip(plane) {
        *px = [a, a, a, a];
    }
}

/// Grow (`r > 0`) or shrink (`r < 0`) the alpha of a pixmap by `r` pixels (square structuring
/// element, separable max/min). Colour channels follow alpha (tinted afterwards anyway).
pub fn morph(p: &mut Pixmap, r: i32) {
    if r == 0 {
        return;
    }
    let grow = r > 0;
    let r = r.unsigned_abs().min(400) as usize;
    let (w, h) = (p.width() as usize, p.height() as usize);
    let alpha: Vec<u8> = p.data().as_chunks::<4>().0.iter().map(|c| c.get(3).copied().unwrap_or(0)).collect();
    let pass = |src: &[u8], w: usize, h: usize, horizontal: bool| -> Vec<u8> {
        let mut out = vec![0u8; src.len()];
        for y in 0..h {
            for x in 0..w {
                let mut v: u8 = if grow { 0 } else { 255 };
                let (lo, hi) = (x.saturating_sub(r), (x + r).min(w.saturating_sub(1)));
                for k in lo..=hi {
                    let idx = if horizontal { y * w + k } else { k * h + y };
                    let s = src.get(idx).copied().unwrap_or(0);
                    v = if grow { v.max(s) } else { v.min(s) };
                }
                // Shrinking treats outside as empty.
                if !grow && (x < r || x + r >= w) {
                    v = 0;
                }
                let o = if horizontal { y * w + x } else { x * h + y };
                if let Some(d) = out.get_mut(o) {
                    *d = v;
                }
            }
        }
        out
    };
    let a1 = pass(&alpha, w, h, true);
    // Vertical pass: treat columns as rows by swapping roles.
    let mut a2 = vec![0u8; a1.len()];
    for x in 0..w {
        for y in 0..h {
            let mut v: u8 = if grow { 0 } else { 255 };
            let (lo, hi) = (y.saturating_sub(r), (y + r).min(h.saturating_sub(1)));
            for k in lo..=hi {
                let s = a1.get(k * w + x).copied().unwrap_or(0);
                v = if grow { v.max(s) } else { v.min(s) };
            }
            if !grow && (y < r || y + r >= h) {
                v = 0;
            }
            if let Some(d) = a2.get_mut(y * w + x) {
                *d = v;
            }
        }
    }
    for (px, a) in p.data_mut().as_chunks_mut::<4>().0.iter_mut().zip(a2) {
        px.copy_from_slice(&[a, a, a, a]);
    }
}

/// Replace every pixel with `color` (non-premultiplied RGBA 0..1) at the pixel's alpha × color alpha.
pub fn tint(p: &mut Pixmap, color: [f32; 4]) {
    let [r, g, b, a] = color;
    // The result depends on the pixel's alpha alone: work it out once for each of the 256.
    let mut table = [[0u8; 4]; 256];
    for (i, out) in table.iter_mut().enumerate() {
        let alpha = i as f32 / 255.0 * a;
        let q = |c: f32| (c * alpha * 255.0).round().clamp(0.0, 255.0) as u8;
        *out = [q(r), q(g), q(b), (alpha * 255.0).round().clamp(0.0, 255.0) as u8];
    }
    for px in p.data_mut().as_chunks_mut::<4>().0 {
        *px = table[usize::from(px[3])];
    }
}

/// Invert the alpha (premultiplied white with alpha 1-a): used for inner shadows.
pub fn invert_alpha(p: &mut Pixmap) {
    for px in p.data_mut().as_chunks_mut::<4>().0 {
        let a = 255 - px.get(3).copied().unwrap_or(0);
        px.copy_from_slice(&[a, a, a, a]);
    }
}

/// Multiply every pixel of `p` by the alpha of `m` (same size); `invert` uses 1-alpha.
pub fn mask_by(p: &mut Pixmap, m: &Pixmap, invert: bool) {
    for (px, mp) in p.data_mut().as_chunks_mut::<4>().0.iter_mut().zip(m.data().chunks_exact(4)) {
        let ma = u32::from(mp.get(3).copied().unwrap_or(0));
        let ma = if invert { 255 - ma } else { ma };
        for c in px.iter_mut() {
            *c = ((u32::from(*c) * ma + 127) / 255) as u8;
        }
    }
}

/// `src`'s alpha moved by `(dx, dy)` pixels, as premultiplied white (what a shadow is cast from).
/// Nothing is drawn past the edges.
pub(crate) fn shifted_alpha(src: &Pixmap, dx: i32, dy: i32) -> Option<Pixmap> {
    let mut out = Pixmap::new(src.width(), src.height())?;
    overlap_rows(&mut out, (dx, dy), src, |dst, from, _, _| {
        for (d, s) in dst.chunks_exact_mut(4).zip(from.chunks_exact(4)) {
            let a = s.get(3).copied().unwrap_or(0);
            d.copy_from_slice(&[a, a, a, a]);
        }
    });
    Some(out)
}

/// Call `f(dst_row, src_row, row, first_col)` for each row where `src`, with its top-left at `at`
/// on `dst`, overlaps it (premultiplied RGBA bytes of the overlapping columns; `row` and
/// `first_col` in `src`'s pixels). Nothing past either edge is visited.
pub(crate) fn overlap_rows(dst: &mut Pixmap, at: (i32, i32), src: &Pixmap, mut f: impl FnMut(&mut [u8], &[u8], i64, i64)) {
    let (dw, dh) = (i64::from(dst.width()), i64::from(dst.height()));
    let (sw, sh) = (i64::from(src.width()), i64::from(src.height()));
    let (ax, ay) = (i64::from(at.0), i64::from(at.1));
    let (c0, c1) = ((-ax).max(0), sw.min(dw - ax));
    let (r0, r1) = ((-ay).max(0), sh.min(dh - ay));
    if c1 <= c0 || r1 <= r0 {
        return;
    }
    let len = (c1 - c0) as usize * 4;
    let s = src.data();
    let d = dst.data_mut();
    for r in r0..r1 {
        let (si, di) = ((r * sw + c0) as usize * 4, ((r + ay) * dw + ax + c0) as usize * 4);
        if let (Some(sp), Some(dp)) = (s.get(si..si + len), d.get_mut(di..di + len)) {
            f(dp, sp, r, c0);
        }
    }
}

/// Composite `src` at `opacity` onto `dst` (top-left at `at`) with plus-darker (linear burn:
/// `max(0, backdrop + source - 1)`, through the W3C general compositing formula), which
/// tiny-skia lacks.
pub fn plus_darker(dst: &mut Pixmap, at: (i32, i32), src: &Pixmap, opacity: f32) {
    let o = if opacity.is_finite() { opacity.clamp(0.0, 1.0) } else { 0.0 };
    overlap_rows(dst, at, src, |dp, sp, _, _| {
        for (d, s) in dp.chunks_exact_mut(4).zip(sp.chunks_exact(4)) {
            let f = |v: u8| f32::from(v) / 255.0;
            let sa = f(s[3]) * o;
            if sa <= 0.0 {
                continue;
            }
            let da = f(d[3]);
            for c in 0..3 {
                let (sc, dc) = (f(s[c]) * o, f(d[c]));
                let v = sc * (1.0 - da) + dc * (1.0 - sa) + (sa * dc + da * sc - sa * da).max(0.0);
                d[c] = (v.clamp(0.0, 1.0) * 255.0).round() as u8;
            }
            d[3] = ((sa + da - sa * da).clamp(0.0, 1.0) * 255.0).round() as u8;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The blur as it was written first: the reference the fast one must match to the bit.
    fn blur_reference(p: &mut Pixmap, sigma: f64) {
        fn h_pass(src: &[u8], dst: &mut [u8], w: usize, h: usize, r: usize) {
            if r == 0 {
                dst.copy_from_slice(src);
                return;
            }
            let div = (2 * r + 1) as u32;
            for y in 0..h {
                let row = y * w * 4;
                let mut acc = [0u32; 4];
                for x in 0..=r.min(w.saturating_sub(1)) {
                    for c in 0..4 {
                        acc[c] += u32::from(src[row + x * 4 + c]);
                    }
                }
                for x in 0..w {
                    for c in 0..4 {
                        dst[row + x * 4 + c] = (acc[c] / div) as u8;
                    }
                    let add = x + r + 1;
                    if add < w {
                        for c in 0..4 {
                            acc[c] += u32::from(src[row + add * 4 + c]);
                        }
                    }
                    if x >= r {
                        for c in 0..4 {
                            acc[c] = acc[c].saturating_sub(u32::from(src[row + (x - r) * 4 + c]));
                        }
                    }
                }
            }
        }
        fn transpose(src: &[u8], dst: &mut [u8], w: usize, h: usize) {
            for y in 0..h {
                for x in 0..w {
                    let (s, d) = ((y * w + x) * 4, (x * h + y) * 4);
                    dst[d..d + 4].copy_from_slice(&src[s..s + 4]);
                }
            }
        }
        let sigma = sigma.min(MAX_SIGMA);
        let (w, h) = (p.width() as usize, p.height() as usize);
        let radii = box_sizes(sigma);
        let mut a = p.data().to_vec();
        let mut b = vec![0u8; a.len()];
        for r in radii {
            h_pass(&a, &mut b, w, h, r);
            std::mem::swap(&mut a, &mut b);
        }
        transpose(&a, &mut b, w, h);
        std::mem::swap(&mut a, &mut b);
        for r in radii {
            h_pass(&a, &mut b, h, w, r);
            std::mem::swap(&mut a, &mut b);
        }
        transpose(&a, &mut b, h, w);
        p.data_mut().copy_from_slice(&b);
    }

    fn noisy(w: u32, h: u32, seed: u32) -> Pixmap {
        let mut p = Pixmap::new(w, h).unwrap();
        let mut s = seed.wrapping_mul(2_654_435_761) | 1;
        for v in p.data_mut() {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            *v = (s >> 24) as u8;
        }
        p
    }

    #[test]
    fn the_fast_blur_matches_the_first_one_to_the_bit() {
        // Sizes around the radii (a window wider than the image included), one-pixel strips, odd
        // and even sides.
        for (w, h) in [(1, 1), (1, 9), (9, 1), (7, 5), (16, 16), (33, 20), (64, 3), (3, 64), (101, 77)] {
            for sigma in [0.31, 0.8, 1.5, 3.0, 7.5, 20.0, 60.0, 500.0] {
                let p = noisy(w, h, w * 31 + h);
                let (mut fast, mut slow) = (p.clone(), p.clone());
                blur(&mut fast, sigma);
                blur_reference(&mut slow, sigma);
                assert_eq!(fast.data(), slow.data(), "{w}×{h} sigma {sigma}");
            }
        }
    }

    #[test]
    fn the_alpha_blur_is_the_alpha_of_the_blur() {
        for sigma in [0.5, 2.0, 9.0, 40.0] {
            let p = noisy(53, 41, 7);
            let mut full = p.clone();
            blur(&mut full, sigma);
            let mut alpha = p.clone();
            blur_alpha(&mut alpha, sigma);
            for (f, a) in full.data().as_chunks::<4>().0.iter().zip(alpha.data().as_chunks::<4>().0) {
                assert_eq!(f[3], a[3], "sigma {sigma}");
                assert_eq!(*a, [a[3]; 4]);
            }
        }
    }

    #[test]
    fn the_reciprocal_divides_exactly() {
        for div in [3u32, 5, 7, 21, 101, 255, 1001, 2001] {
            let recip = reciprocal(div);
            for acc in (0..=255 * div).step_by(7).chain([255 * div, 255 * div - 1, div, div - 1]) {
                assert_eq!(u32::from(divide(acc, recip)), (acc / div).min(255), "{acc} / {div}");
            }
        }
    }

    #[test]
    fn a_shifted_alpha_is_the_layer_moved_with_nothing_past_the_edges() {
        let mut p = Pixmap::new(6, 5).unwrap();
        for (i, px) in p.data_mut().as_chunks_mut::<4>().0.iter_mut().enumerate() {
            *px = [1, 2, 3, (i + 1) as u8];
        }
        for (dx, dy) in [(0, 0), (2, 1), (-3, 2), (1, -4), (9, 9), (-9, 0)] {
            let moved = shifted_alpha(&p, dx, dy).unwrap();
            // The way a shadow was cast before: the layer drawn at the offset on a clear pixmap.
            let mut reference = Pixmap::new(6, 5).unwrap();
            reference.draw_pixmap(dx, dy, p.as_ref(), &tiny_skia::PixmapPaint::default(), tiny_skia::Transform::identity(), None);
            for (m, r) in moved.data().as_chunks::<4>().0.iter().zip(reference.data().as_chunks::<4>().0) {
                assert_eq!(*m, [r[3]; 4], "offset {dx},{dy}");
            }
        }
    }

    #[test]
    fn tint_follows_the_alpha_of_each_pixel() {
        let mut p = Pixmap::new(256, 1).unwrap();
        for (i, px) in p.data_mut().as_chunks_mut::<4>().0.iter_mut().enumerate() {
            *px = [9, 9, 9, i as u8];
        }
        tint(&mut p, [1.0, 0.5, 0.0, 0.5]);
        for (i, px) in p.data().as_chunks::<4>().0.iter().enumerate() {
            let alpha = i as f32 / 255.0 * 0.5;
            let q = |c: f32| (c * alpha * 255.0).round().clamp(0.0, 255.0) as u8;
            assert_eq!(*px, [q(1.0), q(0.5), q(0.0), (alpha * 255.0).round() as u8], "alpha {i}");
        }
    }

    #[test]
    fn blur_spreads_and_conserves() {
        let mut p = Pixmap::new(64, 64).unwrap();
        let i = (32 * 64 + 32) * 4;
        p.data_mut()[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
        let before: u32 = p.data().iter().map(|v| u32::from(*v)).sum();
        blur(&mut p, 3.0);
        let after: u32 = p.data().iter().map(|v| u32::from(*v)).sum();
        assert!(p.data()[i + 3] < 255);
        // Integer rounding loses a little.
        assert!(after <= before && after > 0, "{before} {after}");
    }

    #[test]
    fn morph_grows() {
        let mut p = Pixmap::new(20, 20).unwrap();
        let i = (10 * 20 + 10) * 4;
        p.data_mut()[i..i + 4].copy_from_slice(&[255, 255, 255, 255]);
        morph(&mut p, 2);
        let count = p.data().as_chunks::<4>().0.iter().filter(|c| c[3] == 255).count();
        assert_eq!(count, 25);
        morph(&mut p, -2);
        let count = p.data().as_chunks::<4>().0.iter().filter(|c| c[3] == 255).count();
        assert_eq!(count, 1);
    }

    #[test]
    fn box_sizes_sane() {
        for s in [0.5, 1.0, 4.0, 50.0] {
            let b = box_sizes(s);
            assert!(b.iter().all(|r| *r < 1000));
        }
    }
}
