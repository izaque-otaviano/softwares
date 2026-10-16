//! Windows: embed the icon and version info in figcraft.exe and size its main thread's stack
//! (no-op elsewhere). Everywhere: embed the optional web viewer for File ▸ Export prototype as
//! website… from `FIGCRAFT_WEB_BUNDLE_DIR` (a `trunk build --release` output of apps/figcraft-web;
//! docs/share-prototype.md). Unset, the app builds without it and the export asks for a folder.
use std::fmt::Write as _;
use std::io::Write as _;
use std::path::{Path, PathBuf};

fn main() {
    web_bundle();
    println!("cargo::rerun-if-changed=../../assets/app-icon/figcraft.ico");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        let mut res = winresource::WindowsResource::new();
        let ico = "../../assets/app-icon/figcraft.ico";
        if std::path::Path::new(ico).exists() {
            res.set_icon(ico);
        }
        res.set("ProductName", "FigCraft");
        res.set("FileDescription", "FigCraft");
        res.set("CompanyName", "ArtCraft");
        if let Err(e) = res.compile() {
            println!("cargo::warning=winresource: {e}");
        }
        // Windows starts the main thread with 1 MB of stack, Linux and macOS with 8 MB. Layers
        // nest up to 256 deep in an export, and that recursion needs the same room everywhere.
        let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
        println!("cargo::rustc-link-arg-bins={}", if msvc { "/STACK:8388608" } else { "-Wl,--stack,8388608" });
    }
    let sha = std::env::var("FIGCRAFT_BUILD_SHA").unwrap_or_default();
    println!("cargo::rustc-env=FIGCRAFT_BUILD_SHA={sha}");
    println!("cargo::rerun-if-env-changed=FIGCRAFT_BUILD_SHA");
}

/// `$OUT_DIR/web_bundle.rs`: `WEB_BUNDLE`, every file of the web build deflated (empty without one).
/// `FIGCRAFT_WEB_BUNDLE_REQUIRED` makes a missing or broken build folder an error (release CI).
fn web_bundle() {
    println!("cargo::rerun-if-env-changed=FIGCRAFT_WEB_BUNDLE_DIR");
    println!("cargo::rerun-if-env-changed=FIGCRAFT_WEB_BUNDLE_REQUIRED");
    let out = PathBuf::from(std::env::var_os("OUT_DIR").unwrap_or_default());
    let mut src = String::from(
        "/// The web viewer built in (`FIGCRAFT_WEB_BUNDLE_DIR`).\npub static WEB_BUNDLE: &[figcraft_engine::share::EmbeddedFile] = &[\n",
    );
    if let Some(dir) = std::env::var_os("FIGCRAFT_WEB_BUNDLE_DIR").filter(|d| !d.is_empty()).map(PathBuf::from) {
        match embed(&dir, &out.join("web_bundle")) {
            Ok(entries) => src.push_str(&entries),
            Err(e) if std::env::var_os("FIGCRAFT_WEB_BUNDLE_REQUIRED").is_some() => {
                println!("cargo::error=FIGCRAFT_WEB_BUNDLE_DIR={}: {e}", dir.display())
            }
            Err(e) => println!("cargo::warning=building without the web viewer: FIGCRAFT_WEB_BUNDLE_DIR={}: {e}", dir.display()),
        }
    }
    src.push_str("];\n");
    if let Err(e) = std::fs::write(out.join("web_bundle.rs"), src) {
        println!("cargo::error=writing web_bundle.rs: {e}");
    }
}

/// Deflate every file under `dir` (hidden ones and an exported site's own files left out) into
/// `into`; returns the `EmbeddedFile` entries.
fn embed(dir: &Path, into: &Path) -> Result<String, String> {
    let dir = dir.canonicalize().map_err(|e| e.to_string())?;
    println!("cargo::rerun-if-changed={}", dir.display());
    let mut files = Vec::new();
    collect(&dir, "", 0, &mut files)?;
    if !files.iter().any(|(r, _)| r == "index.html") || !files.iter().any(|(r, _)| r.ends_with(".wasm")) {
        return Err("no index.html and .wasm there: run `trunk build --release` in apps/figcraft-web first".into());
    }
    std::fs::create_dir_all(into).map_err(|e| e.to_string())?;
    let mut src = String::new();
    for (i, (rel, path)) in files.iter().enumerate() {
        println!("cargo::rerun-if-changed={}", path.display());
        let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
        let mut enc = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::new(9));
        enc.write_all(&bytes).map_err(|e| e.to_string())?;
        let deflated = enc.finish().map_err(|e| e.to_string())?;
        let target = into.join(format!("{i}.deflate"));
        std::fs::write(&target, deflated).map_err(|e| e.to_string())?;
        let _ = writeln!(
            src,
            "    figcraft_engine::share::EmbeddedFile {{ path: {rel:?}, deflated: include_bytes!({:?}), size: {} }},",
            target.display().to_string(),
            bytes.len()
        );
    }
    Ok(src)
}

fn collect(dir: &Path, rel: &str, depth: usize, out: &mut Vec<(String, PathBuf)>) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(dir).map_err(|e| format!("{}: {e}", dir.display()))?.flatten().collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for e in entries {
        let name = e.file_name().to_string_lossy().into_owned();
        let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        if name.starts_with('.') || matches!(path.as_str(), "prototype.json" | "prototype.figcraft" | "_headers" | "LEIA-ME.txt" | "HOSTING.md") {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            if depth < 4 {
                collect(&p, &path, depth + 1, out)?;
            }
        } else if p.is_file() {
            out.push((path, p));
        }
    }
    if out.len() > 256 {
        return Err("more than 256 files: that isn't a web build".into());
    }
    Ok(())
}
