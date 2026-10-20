//! The app and document icons: rasterises the masters in `assets/app-icon/` (the owner's pen logo
//! on its tile, and the document sheet around it; see `assets/app-icon/README.md`) with the `resvg`
//! CLI (`cargo install resvg`), the sizes up to 32 px from the `-small` variants (the same art,
//! larger on the tile, without the label). Writes `<name>-<size>.png` (macOS grid), the hicolor
//! theme entries and `<name>.ico`. The outputs are committed, so building and packaging never need
//! `resvg`.

use std::path::Path;
use std::process::Command;

const VIEW_BOX: &str = r#"viewBox="0 0 512 512""#;
/// macOS: the 512-unit tile padded onto Apple's 824/1024 icon grid (transparent margin).
const MAC_VIEW_BOX: &str = r#"viewBox="-62 -62 636 636""#;
/// At and below this size the renders come from the `-small` master.
const SMALL_MAX: u32 = 32;

/// One icon: its master's base name and where the hicolor theme shows it.
struct Set {
    name: &'static str,
    /// `apps` or `mimetypes`.
    hicolor_dir: &'static str,
    hicolor_name: &'static str,
}

const SETS: [Set; 2] = [
    Set { name: "figcraft", hicolor_dir: "apps", hicolor_name: "ai.storyteller.figcraft" },
    Set { name: "document", hicolor_dir: "mimetypes", hicolor_name: "application-x-figcraft" },
];

fn render(svg: &Path, size: u32, out: &Path) -> bool {
    let s = size.to_string();
    let ok = Command::new("resvg").args(["-w", &s, "-h", &s]).arg(svg).arg(out).status().is_ok_and(|st| st.success());
    if !ok {
        eprintln!("icon: resvg failed for {} (is it installed? `cargo install resvg`)", out.display());
    }
    ok
}

pub fn generate(root: &Path) -> bool {
    let dir = root.join("assets/app-icon");
    let tmp = root.join("target/icon");
    if std::fs::create_dir_all(&tmp).is_err() {
        eprintln!("icon: cannot write {}", tmp.display());
        return false;
    }
    let mut ok = true;
    for set in &SETS {
        ok &= generate_set(&dir, &tmp, set);
    }
    eprintln!("icon: wrote {}", dir.display());
    ok
}

fn generate_set(dir: &Path, tmp: &Path, set: &Set) -> bool {
    let name = set.name;
    // Windows and Linux show the tile edge to edge: each master as it is. macOS gets a padded copy.
    let mut tiles = Vec::new();
    for file in [format!("{name}.svg"), format!("{name}-small.svg")] {
        let Ok(svg) = std::fs::read_to_string(dir.join(&file)) else {
            eprintln!("icon: cannot read {}", dir.join(&file).display());
            return false;
        };
        if !svg.contains(VIEW_BOX) {
            eprintln!("icon: expected {VIEW_BOX} in {file}");
            return false;
        }
        let mac = tmp.join(format!("mac-{file}"));
        if std::fs::write(&mac, svg.replacen(VIEW_BOX, MAC_VIEW_BOX, 1)).is_err() {
            eprintln!("icon: cannot write {}", mac.display());
            return false;
        }
        tiles.push((dir.join(&file), mac));
    }
    let [(big_tile, big_mac), (small_tile, small_mac)] = &tiles[..] else { return false };
    let tile = |size: u32| if size <= SMALL_MAX { small_tile } else { big_tile };
    let mac = |size: u32| if size <= SMALL_MAX { small_mac } else { big_mac };
    let mut ok = true;
    for size in [16u32, 32, 48, 64, 128, 256, 512, 1024] {
        ok &= render(mac(size), size, &dir.join(format!("{name}-{size}.png")));
        if size <= 512 {
            let hd = dir.join(format!("hicolor/{size}x{size}/{}", set.hicolor_dir));
            let _ = std::fs::create_dir_all(&hd);
            ok &= render(tile(size), size, &hd.join(format!("{}.png", set.hicolor_name)));
        }
    }
    // Windows .ico (PNG-compressed entries).
    let sizes = [16u32, 20, 24, 32, 40, 48, 64, 128, 256];
    let pngs: Vec<Vec<u8>> = sizes
        .iter()
        .filter_map(|s| {
            let png = tmp.join(format!("ico-{name}-{s}.png"));
            render(tile(*s), *s, &png).then(|| std::fs::read(png).ok()).flatten()
        })
        .collect();
    ok &= pngs.len() == sizes.len();
    let mut ico = vec![0, 0, 1, 0, pngs.len() as u8, 0];
    let mut offset = 6 + 16 * pngs.len() as u32;
    for (s, png) in sizes.iter().zip(&pngs) {
        let b = if *s >= 256 { 0 } else { *s as u8 };
        ico.extend_from_slice(&[b, b, 0, 0, 1, 0, 32, 0]);
        ico.extend_from_slice(&(png.len() as u32).to_le_bytes());
        ico.extend_from_slice(&offset.to_le_bytes());
        offset += png.len() as u32;
    }
    for png in &pngs {
        ico.extend_from_slice(png);
    }
    ok &= std::fs::write(dir.join(format!("{name}.ico")), ico).is_ok();
    // Desktops draw the scalable theme icon mostly at panel and menu sizes: the small variant.
    let sd = dir.join(format!("hicolor/scalable/{}", set.hicolor_dir));
    let _ = std::fs::create_dir_all(&sd);
    ok &= std::fs::copy(dir.join(format!("{name}-small.svg")), sd.join(format!("{}.svg", set.hicolor_name))).is_ok();
    ok
}
