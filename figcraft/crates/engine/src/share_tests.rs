//! Sharing a prototype as a static website: the viewer's config (junk-safe), where it starts, and
//! `file.exportPrototypeSite` (the files it writes, the stripped document, re-opening it).

use std::io::Write as _;

use serde_json::{Value, json};

use crate::Session;
use crate::share::{self, CONFIG_FILE, DOC_FILE, EmbeddedFile, ViewerConfig};
use figcraft_doc::NodeId;

fn ok(s: &mut Session, cmd: &str, p: Value) -> Value {
    s.execute(cmd, &p).unwrap_or_else(|e| panic!("{cmd} {p}: {e}"))
}

fn frame(s: &mut Session, name: &str, x: f64) -> NodeId {
    let v = ok(s, "frame.create", json!({"x": x, "y": 0, "width": 300, "height": 400, "name": name}));
    NodeId(v["id"].as_u64().unwrap())
}

/// A scratch folder of its own for each test.
fn scratch(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("figcraft-share-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    dir
}

/// A stand-in web build: what `trunk build --release` writes, in miniature.
fn fake_bundle(name: &str) -> std::path::PathBuf {
    let dir = scratch(&format!("bundle-{name}"));
    std::fs::create_dir_all(dir.join("snippets/x")).unwrap();
    std::fs::write(
        dir.join("index.html"),
        "<!DOCTYPE html><html><head><title>FigCraft</title></head><body><div id=\"figcraft_loading\">Loading FigCraft&hellip;</div></body></html>",
    )
    .unwrap();
    std::fs::write(dir.join("figcraft-web-abc123.js"), "export default function(){}").unwrap();
    std::fs::write(dir.join("figcraft-web-abc123_bg.wasm"), b"\0asm\x01\0\0\0").unwrap();
    std::fs::write(dir.join("snippets/x/inline0.js"), "export const a = 1;").unwrap();
    // A config left in the build folder is never copied from it.
    std::fs::write(dir.join(CONFIG_FILE), "{\"file\": \"other.figcraft\"}").unwrap();
    std::fs::write(dir.join(".DS_Store"), "x").unwrap();
    dir
}

/// Home, Details and Checkout frames, a flow "Buy" starting at Details, a comment, a saved
/// version and a branch.
fn prototype() -> (Session, [NodeId; 3]) {
    let mut s = Session::new();
    let ids = [("Home", 0.0), ("Details", 400.0), ("Checkout", 800.0)].map(|(n, x)| frame(&mut s, n, x));
    ok(&mut s, "proto.flow.add", json!({"start": ids[1], "name": "Buy"}));
    ok(&mut s, "proto.interaction.add", json!({"id": ids[1], "action": {"type": "navigate", "dest": ids[2]}}));
    ok(&mut s, "comment.add", json!({"x": 10, "y": 10, "text": "private note"}));
    ok(&mut s, "file.saveVersion", json!({"name": "v1"}));
    ok(&mut s, "branch.create", json!({"name": "Explore"}));
    ok(&mut s, "doc.switch", json!({"index": 0}));
    assert!(!s.ds().unwrap().versions.is_empty() && !s.ds().unwrap().branches.is_empty());
    (s, ids)
}

#[test]
fn config_parsing_takes_what_it_needs_and_refuses_the_rest_in_words() {
    let c = ViewerConfig::parse(
        r#"{"format": "figcraft-prototype", "version": 1, "file": "p.figcraft", "start": 12, "flow": " Buy ", "title": "Shop", "extra": [1]}"#,
    )
    .unwrap();
    assert_eq!(c, ViewerConfig { file: "p.figcraft".into(), start: Some("12".into()), flow: Some("Buy".into()), title: Some("Shop".into()) });
    assert_eq!(ViewerConfig::parse(r#"{"file": "a/b.figcraft", "start": "Home"}"#).unwrap().start.as_deref(), Some("Home"));
    // Round trip.
    let text = serde_json::to_string(&c.to_json()).unwrap();
    assert_eq!(ViewerConfig::parse(&text).unwrap(), c);
    for bad in [
        "",
        "null",
        "[1]",
        "\"x\"",
        "{",
        "{}",
        r#"{"file": 5}"#,
        r#"{"file": ""}"#,
        r#"{"file": "../secret.figcraft"}"#,
        r#"{"file": "/etc/passwd"}"#,
        r#"{"file": "https://evil.example/x.figcraft"}"#,
        r#"{"file": "//evil.example/x.figcraft"}"#,
        r#"{"file": "a\\b.figcraft"}"#,
        r#"{"file": "a.figcraft?x=1"}"#,
        r#"{"file": "a//b"}"#,
        r#"{"file": "a/./b"}"#,
        r#"{"file": "%2e%2e/x"}"#,
        r#"{"file": "a\u0000b"}"#,
        r#"{"file": "p.figcraft", "start": [1]}"#,
        r#"{"file": "p.figcraft", "title": {"x": 1}}"#,
        r#"{"file": "p.figcraft", "format": "something else"}"#,
    ] {
        let e = ViewerConfig::parse(bad).expect_err(bad);
        assert!(!e.is_empty());
    }
    assert!(ViewerConfig::parse(&format!("{{\"file\": \"{}\"}}", "x".repeat(70_000))).is_err(), "too large");
    // Long fields are cut, control characters dropped.
    let c = ViewerConfig::parse(&format!("{{\"file\": \"p.figcraft\", \"title\": \"{}\\u0007\"}}", "é".repeat(900))).unwrap();
    assert_eq!(c.title.unwrap().chars().count(), 500);
    // Junk never panics.
    let mut seed = 0x2545_F491_4F6C_DD1Du64;
    for n in 0..2000 {
        let len = n % 97;
        let text: String = (0..len)
            .map(|_| {
                seed ^= seed << 13;
                seed ^= seed >> 7;
                seed ^= seed << 17;
                *b"{}[]\":,0123456789.eE+-truefalsnl \\u/\x00\xff%?#filestart".get((seed % 50) as usize).unwrap_or(&b' ') as char
            })
            .collect();
        let _ = ViewerConfig::parse(&text);
        let _ = ViewerConfig::from_query(&text);
    }
}

#[test]
fn the_address_can_name_the_file_and_override_where_it_starts() {
    let c = ViewerConfig::from_query("?prototype=site%2Fp.figcraft&start=Check+out&title=Caf%C3%A9&flow=").unwrap().unwrap();
    assert_eq!(c.file, "site/p.figcraft");
    assert_eq!(c.start.as_deref(), Some("Check out"));
    assert_eq!(c.title.as_deref(), Some("Café"));
    assert_eq!(c.flow, None, "an empty value is unset");
    assert!(ViewerConfig::from_query("?webgl").is_none(), "no prototype parameter: the editor");
    assert!(ViewerConfig::from_query("").is_none());
    assert!(ViewerConfig::from_query("?prototype=https://evil.example/x").unwrap().is_err());
    assert!(ViewerConfig::from_query("?prototype=..%2Fx").unwrap().is_err());
    // Bad escapes are kept as written; a fragment is no part of it.
    assert_eq!(share::query_params("a=%zz%&b=%e9#c=1"), vec![("a".into(), "%zz%".into()), ("b".into(), "\u{FFFD}".into())]);
    let base = ViewerConfig::for_file("p.figcraft").unwrap();
    assert_eq!(base.clone().with_query("?start=7&webgl").start.as_deref(), Some("7"));
    assert_eq!(base.with_query("?webgl"), ViewerConfig::for_file("p.figcraft").unwrap());
}

#[test]
fn the_viewer_starts_where_the_config_says_or_falls_back() {
    let (s, [home, details, checkout]) = prototype();
    let doc = s.doc().unwrap();
    let cfg = |start: Option<&str>, flow: Option<&str>| ViewerConfig {
        file: DOC_FILE.into(),
        start: start.map(str::to_string),
        flow: flow.map(str::to_string),
        title: None,
    };
    let start = |c: ViewerConfig| share::resolve(doc, &c).unwrap();
    assert_eq!(start(cfg(Some(&checkout.to_string()), None)).0, checkout);
    assert_eq!(start(cfg(Some(&format!("0:{}", checkout.0)), None)).0, checkout, "Figma-style ids");
    assert_eq!(start(cfg(Some("Checkout"), None)), (checkout, "Untitled".into()));
    assert_eq!(start(cfg(None, Some("Buy"))), (details, "Buy".into()), "a flow's name is the title");
    // Unknown names fall back to the first flow, then the first frame.
    assert_eq!(start(cfg(Some("Nope"), Some("Nope"))).0, details);
    assert_eq!(start(cfg(Some("999999"), None)).0, details);
    let titled = ViewerConfig { title: Some("Shop".into()), ..cfg(Some("Home"), None) };
    assert_eq!(share::resolve(doc, &titled).unwrap(), (home, "Shop".into()));
    let empty = figcraft_doc::Document::new("Empty");
    assert!(share::resolve(&empty, &cfg(None, None)).is_err(), "nothing to present is an error, said in words");
}

#[test]
fn the_export_writes_a_site_that_opens_on_the_chosen_frame_without_history_or_comments() {
    let (mut s, [_, details, checkout]) = prototype();
    let bundle = fake_bundle("full");
    let out = scratch("site-full");
    let r = ok(&mut s, "file.exportPrototypeSite", json!({"path": out, "start": checkout, "bundle": bundle}));
    assert_eq!(r["start"], json!(checkout));
    for f in [
        "index.html",
        "figcraft-web-abc123.js",
        "figcraft-web-abc123_bg.wasm",
        "snippets/x/inline0.js",
        DOC_FILE,
        CONFIG_FILE,
        "_headers",
        "LEIA-ME.txt",
    ] {
        assert!(out.join(f).is_file(), "{f} missing: {r}");
    }
    assert!(!out.join(".DS_Store").exists(), "hidden files stay behind");
    let index = std::fs::read_to_string(out.join("index.html")).unwrap();
    assert!(index.contains("<title>Untitled</title>") && index.contains("Loading prototype"), "{index}");
    let headers = std::fs::read_to_string(out.join("_headers")).unwrap();
    assert!(headers.contains("application/wasm") && headers.contains("/prototype.json"));
    assert!(std::fs::read_to_string(out.join("LEIA-ME.txt")).unwrap().contains("app.netlify.com/drop"));
    // The config is the export's own (not the one in the build folder) and names the frame.
    let cfg = ViewerConfig::parse(&std::fs::read_to_string(out.join(CONFIG_FILE)).unwrap()).unwrap();
    assert_eq!((cfg.file.as_str(), cfg.start.clone()), (DOC_FILE, Some(checkout.to_string())));
    // The document: no versions, branches or comments, and the frames and interactions there.
    let bytes = std::fs::read(out.join(DOC_FILE)).unwrap();
    let loaded = figcraft_format::load_bytes_with_versions(&bytes).unwrap();
    assert!(loaded.versions.is_empty() && loaded.branches.is_empty() && loaded.doc.comments.is_empty());
    assert!(!loaded.doc.node(details).unwrap().interactions.is_empty());
    // It opens in a viewer session, at the frame chosen.
    let mut viewer = Session::empty();
    let (start, title) = share::open_viewer(&mut viewer, &bytes, &cfg).unwrap();
    assert_eq!((start, title.as_str()), (checkout, "Untitled"));
    assert!(!viewer.ds().unwrap().is_dirty(), "nothing to save");
    // Again into the same folder: the old build's hashed files go, the rest is replaced.
    std::fs::write(out.join("figcraft-web-old_bg.wasm"), "old").unwrap();
    let r = ok(&mut s, "file.exportPrototypeSite", json!({"path": out, "flow": "Buy", "title": "Shop <1>", "bundle": bundle}));
    assert_eq!((r["start"].clone(), r["flow"].clone(), r["title"].clone()), (json!(details), json!("Buy"), json!("Shop <1>")));
    assert!(!out.join("figcraft-web-old_bg.wasm").exists());
    assert!(std::fs::read_to_string(out.join("index.html")).unwrap().contains("<title>Shop &lt;1&gt;</title>"));
    let _ = std::fs::remove_dir_all(&out);
    let _ = std::fs::remove_dir_all(&bundle);
}

#[test]
fn the_export_defaults_to_the_selection_then_the_first_flow() {
    let (mut s, [home, details, _]) = prototype();
    let bundle = fake_bundle("defaults");
    let out = scratch("site-defaults");
    ok(&mut s, "select.set", json!({"ids": []}));
    assert_eq!(ok(&mut s, "file.exportPrototypeSite", json!({"path": out, "bundle": bundle}))["start"], json!(details), "the first flow");
    ok(&mut s, "select.set", json!({"ids": [home]}));
    assert_eq!(ok(&mut s, "file.exportPrototypeSite", json!({"path": out, "bundle": bundle}))["start"], json!(home), "the selected frame");
    let _ = std::fs::remove_dir_all(&out);
    let _ = std::fs::remove_dir_all(&bundle);
}

#[test]
fn the_export_refuses_bad_folders_bundles_and_params() {
    let (mut s, [home, ..]) = prototype();
    let bundle = fake_bundle("refuse");
    let ex = |s: &mut Session, p: Value| s.execute("file.exportPrototypeSite", &p).map_err(|e| e.to_string());
    // A folder of other things is never written into.
    let busy = scratch("busy");
    std::fs::create_dir_all(&busy).unwrap();
    std::fs::write(busy.join("holiday.jpg"), "x").unwrap();
    let e = ex(&mut s, json!({"path": busy, "bundle": bundle})).unwrap_err();
    assert!(e.contains("isn't empty"), "{e}");
    assert_eq!(std::fs::read_dir(&busy).unwrap().count(), 1);
    let file = busy.join("holiday.jpg");
    assert!(ex(&mut s, json!({"path": file, "bundle": bundle})).unwrap_err().contains("is a file"));
    // Not a web build.
    let e = ex(&mut s, json!({"path": scratch("nobuild"), "bundle": busy})).unwrap_err();
    assert!(e.contains("isn't a FigCraft web build"), "{e}");
    // No web build built in (tests never register one) and none given: said how to get one.
    let e = ex(&mut s, json!({"path": scratch("nobundle")})).unwrap_err();
    assert!(e.contains("FIGCRAFT_WEB_BUNDLE_DIR") && e.contains("bundle"), "{e}");
    assert!(!scratch("nobundle").exists(), "nothing written");
    for p in [
        json!({}),
        json!({"path": ""}),
        json!({"path": 5}),
        json!({"path": scratch("x"), "start": "nope", "bundle": bundle}),
        json!({"path": scratch("x"), "start": 987_654, "bundle": bundle}),
        json!({"path": scratch("x"), "flow": "Nope", "bundle": bundle}),
        json!({"path": scratch("x"), "flow": [1], "bundle": bundle}),
        json!({"path": scratch("x"), "title": {"x": 1}, "bundle": bundle}),
    ] {
        assert!(ex(&mut s, p.clone()).is_err(), "{p}");
    }
    let _ = home;
    let _ = std::fs::remove_dir_all(&busy);
    let _ = std::fs::remove_dir_all(&bundle);
}

#[test]
fn an_embedded_build_inflates_and_damage_is_an_error() {
    fn deflate(b: &[u8]) -> &'static [u8] {
        let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::best());
        e.write_all(b).unwrap();
        Box::leak(e.finish().unwrap().into_boxed_slice())
    }
    let html = b"<title>FigCraft</title>";
    let files = [
        EmbeddedFile { path: "index.html", deflated: deflate(html), size: html.len() as u64 },
        EmbeddedFile { path: "a_bg.wasm", deflated: deflate(b"wasm"), size: 4 },
    ];
    let b = share::inflate(&files).unwrap();
    assert_eq!(b, vec![("index.html".to_string(), html.to_vec()), ("a_bg.wasm".to_string(), b"wasm".to_vec())]);
    let wrong_size = [EmbeddedFile { size: 5, ..EmbeddedFile { path: "a_bg.wasm", deflated: deflate(b"wasm"), size: 0 } }];
    assert!(share::inflate(&wrong_size).is_err());
    let junk = [EmbeddedFile { path: "index.html", deflated: b"\xff\xff\xff", size: 3 }];
    assert!(share::inflate(&junk).is_err());
    let escape = [EmbeddedFile { path: "../index.html", deflated: deflate(b"x"), size: 1 }];
    assert!(share::inflate(&escape).is_err());
    assert!(!share::has_embedded_bundle());
}

#[test]
fn open_viewer_says_what_is_wrong_with_a_file() {
    let cfg = ViewerConfig::for_file(DOC_FILE).unwrap();
    let mut s = Session::empty();
    assert!(share::open_viewer(&mut s, b"not a figcraft file", &cfg).is_err());
    assert!(share::open_viewer(&mut s, b"", &cfg).is_err());
    let empty = figcraft_format::save_bytes(&figcraft_doc::Document::new("Empty"), None).unwrap();
    assert!(share::open_viewer(&mut s, &empty, &cfg).unwrap_err().contains("no frame"));
    assert!(s.docs.is_empty(), "a file that can't be presented isn't opened");
}
