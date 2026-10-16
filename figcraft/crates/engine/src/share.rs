//! Sharing a prototype as a static website: File ▸ Export prototype as website…
//! (`file.exportPrototypeSite`).
//!
//! The site is the FigCraft web build (`apps/figcraft-web`, `trunk build --release`) with the
//! document and a small config beside it:
//!
//! | File | What it is |
//! |---|---|
//! | `index.html`, `figcraft-web-<hash>.js`, `figcraft-web-<hash>_bg.wasm` | the web build |
//! | [`DOC_FILE`] | the document, with only what playing it needs (no version history, branches or comments) |
//! | [`CONFIG_FILE`] | [`ViewerConfig`]: which file, where it starts, the page title |
//! | `_headers` | Netlify / Cloudflare Pages header rules (MIME type, caching) |
//! | `LEIA-ME.txt` | how to put it online (Portuguese: the person sharing reads it) |
//!
//! The web build reads [`CONFIG_FILE`] next to its `index.html` (or `?prototype=<file>` in the
//! address) and then shows only the prototype: no editor, no way back to it. Any static host
//! works; dragging the folder onto Netlify Drop (<https://app.netlify.com/drop>) gives a link.
//!
//! The desktop app gets the web build at build time (`FIGCRAFT_WEB_BUNDLE_DIR`, see
//! `docs/share-prototype.md`) and hands it over with [`register_embedded`]; without it the command
//! takes a `bundle` folder.

use std::io::Read as _;
use std::sync::OnceLock;

use figcraft_doc::{Document, NodeId, NodeKind};
use serde_json::{Value, json};

use crate::params::{id, string};
use crate::{EngineError, Result, Session, bad};

/// The config the viewer reads next to `index.html`.
pub const CONFIG_FILE: &str = "prototype.json";
/// The document the export writes.
pub const DOC_FILE: &str = "prototype.figcraft";
/// The `format` field of [`CONFIG_FILE`].
pub const CONFIG_FORMAT: &str = "figcraft-prototype";
/// The most a config may hold (bytes).
pub const MAX_CONFIG_BYTES: usize = 64 * 1024;
/// The most a shared document may hold (bytes): what the viewer agrees to download.
pub const MAX_DOC_BYTES: usize = 512 * 1024 * 1024;
/// The longest file name, start, flow or title a config keeps (characters).
const MAX_FIELD: usize = 500;
/// The most a web build may hold in all (bytes).
const MAX_BUNDLE_BYTES: u64 = 128 * 1024 * 1024;

/// What the viewer opens: the document's file (relative to the page) and where it starts.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ViewerConfig {
    /// The document, as a path relative to `index.html` ([`is_safe_relative`]).
    pub file: String,
    /// The frame to start on: its id ("12", "0:12") or its name.
    pub start: Option<String>,
    /// The flow to start: its name (used when `start` is unset or not found).
    pub flow: Option<String>,
    /// The page title (default: the flow's name, else the file's).
    pub title: Option<String>,
}

/// `s` cut to [`MAX_FIELD`] characters, trimmed; `None` when empty.
fn field(s: &str) -> Option<String> {
    let t: String = s.trim().chars().filter(|c| !c.is_control()).take(MAX_FIELD).collect();
    (!t.is_empty()).then_some(t)
}

/// A path the viewer may fetch: relative to the page and inside its folder. No scheme or host
/// (`https:`, `//`), no absolute path, no `..`, no backslash, no query or fragment, no control
/// characters. A shared link can then only show a file of the site it is on.
pub fn is_safe_relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= MAX_FIELD
        && !path.starts_with('/')
        && !path.chars().any(|c| c.is_control() || matches!(c, '\\' | ':' | '?' | '#' | '%'))
        && path.split('/').all(|seg| !seg.is_empty() && seg != "." && seg != "..")
}

impl ViewerConfig {
    /// The config for `file` (it must be [`is_safe_relative`]).
    pub fn for_file(file: &str) -> std::result::Result<Self, String> {
        let file = file.trim();
        if !is_safe_relative(file) {
            return Err(format!("`{}` isn't a file name inside the site", clip(file, 80)));
        }
        Ok(Self { file: file.to_string(), ..Self::default() })
    }

    /// Read [`CONFIG_FILE`]'s text. Unknown fields are ignored; a missing or unsafe `file`, or
    /// fields of the wrong type, are errors (said in words the viewer can show).
    pub fn parse(text: &str) -> std::result::Result<Self, String> {
        if text.len() > MAX_CONFIG_BYTES {
            return Err(format!("{CONFIG_FILE} is too large"));
        }
        let v: Value = serde_json::from_str(text).map_err(|e| format!("{CONFIG_FILE} isn't valid JSON: {e}"))?;
        let Value::Object(o) = &v else {
            return Err(format!("{CONFIG_FILE} must hold a JSON object"));
        };
        if let Some(f) = o.get("format").filter(|f| !f.is_null())
            && f.as_str() != Some(CONFIG_FORMAT)
        {
            return Err(format!("{CONFIG_FILE}: `format` must be \"{CONFIG_FORMAT}\""));
        }
        let text_field = |key: &str| -> std::result::Result<Option<String>, String> {
            match o.get(key) {
                None | Some(Value::Null) => Ok(None),
                Some(Value::String(s)) => Ok(field(s)),
                // A frame id may be written as a number.
                Some(Value::Number(n)) if key == "start" => Ok(n.as_u64().map(|n| n.to_string())),
                Some(_) => Err(format!("{CONFIG_FILE}: `{key}` must be text")),
            }
        };
        let file = match o.get("file") {
            Some(Value::String(s)) => s.clone(),
            _ => return Err(format!("{CONFIG_FILE}: `file` (the document's file name) is missing")),
        };
        let mut cfg = Self::for_file(&file)?;
        cfg.start = text_field("start")?;
        cfg.flow = text_field("flow")?;
        cfg.title = text_field("title")?;
        Ok(cfg)
    }

    /// From the page address's query (`?prototype=<file>&start=<frame>&flow=<name>&title=<text>`,
    /// with or without the `?`): `None` without a `prototype` parameter, an error when its file
    /// isn't [`is_safe_relative`].
    pub fn from_query(query: &str) -> Option<std::result::Result<Self, String>> {
        let params = query_params(query);
        let file = params.iter().find(|(k, _)| k == "prototype").map(|(_, v)| v.clone())?;
        Some(Self::for_file(&file).map(|c| c.with_query(query)))
    }

    /// `start`, `flow` and `title` from the address's query override the config's (a link to one
    /// screen of a shared site: `…/?start=Checkout`).
    pub fn with_query(mut self, query: &str) -> Self {
        for (k, v) in query_params(query) {
            match k.as_str() {
                "start" => self.start = field(&v),
                "flow" => self.flow = field(&v),
                "title" => self.title = field(&v),
                _ => {}
            }
        }
        self
    }

    /// The config as [`CONFIG_FILE`] writes it.
    pub fn to_json(&self) -> Value {
        let mut v = json!({"format": CONFIG_FORMAT, "version": 1, "file": self.file});
        for (k, f) in [("start", &self.start), ("flow", &self.flow), ("title", &self.title)] {
            if let Some(s) = f {
                v[k] = json!(s);
            }
        }
        v
    }
}

/// `s` cut to `n` characters.
fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// The `key=value` pairs of a URL query, decoded (`+` is a space, `%XX` a byte; bad escapes are
/// kept as written). At most 64 pairs.
pub fn query_params(query: &str) -> Vec<(String, String)> {
    let q = query.strip_prefix('?').unwrap_or(query);
    let q = q.split('#').next().unwrap_or_default();
    q.split('&').filter(|p| !p.is_empty()).take(64).map(|p| p.split_once('=').unwrap_or((p, ""))).map(|(k, v)| (decode(k), decode(v))).collect()
}

/// Percent-decode a query component.
fn decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while let Some(&c) = b.get(i) {
        let hex = b.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
        match (c, hex) {
            (b'%', Some(x)) => {
                out.push(x);
                i += 3;
            }
            (b'+', _) => {
                out.push(b' ');
                i += 1;
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// The flows of every page, the active page's first.
fn flows(doc: &Document, first: Option<NodeId>) -> Vec<figcraft_doc::proto::Flow> {
    let mut pages: Vec<NodeId> = first.into_iter().collect();
    pages.extend(doc.pages.iter().copied().filter(|p| Some(*p) != first));
    pages
        .iter()
        .filter_map(|p| match &doc.node(*p)?.kind {
            NodeKind::Page { flows, .. } => Some(flows.clone()),
            _ => None,
        })
        .flatten()
        .collect()
}

/// The page the file opens on: its current page when it has one, else the first.
fn home_page(doc: &Document) -> Option<NodeId> {
    doc.current_page.filter(|p| doc.pages.contains(p)).or_else(|| doc.first_page())
}

/// The frame `start` names: a top-level frame's id (or a layer inside one), else a top-level
/// frame's name (the home page's first).
fn named_frame(doc: &Document, start: &str) -> Option<NodeId> {
    if let Ok(id) = start.parse::<NodeId>()
        && let Some(f) = doc.top_level_frame(id)
    {
        return Some(f);
    }
    let home = home_page(doc);
    let mut pages: Vec<NodeId> = home.into_iter().collect();
    pages.extend(doc.pages.iter().copied().filter(|p| Some(*p) != home));
    pages.iter().flat_map(|p| doc.top_frames(*p)).find(|f| doc.node(*f).is_some_and(|n| n.name.trim() == start.trim()))
}

/// Where the viewer starts and the title it shows, as the config asks: `start` (a frame), else
/// `flow` (by name), else the home page's first flow, else its first frame (any page's, when it
/// has none). A `start` or `flow` the file doesn't have falls back the same way.
pub fn resolve(doc: &Document, cfg: &ViewerConfig) -> std::result::Result<(NodeId, String), String> {
    let home = home_page(doc);
    let flows = flows(doc, home);
    let by_flow = cfg.flow.as_deref().and_then(|name| flows.iter().find(|f| f.name.trim() == name.trim()));
    let start = cfg
        .start
        .as_deref()
        .and_then(|s| named_frame(doc, s))
        .or_else(|| by_flow.and_then(|f| doc.top_level_frame(f.start)))
        .or_else(|| flows.iter().find_map(|f| doc.top_level_frame(f.start)))
        .or_else(|| home.and_then(|p| doc.top_frames(p).first().copied()))
        .or_else(|| doc.pages.iter().find_map(|p| doc.top_frames(*p).first().copied()))
        .ok_or_else(|| "this file has no frame to present".to_string())?;
    let playing = flows.iter().find(|f| f.start == start).map(|f| f.name.clone());
    let title = cfg.title.clone().or(playing).and_then(|t| field(&t)).or_else(|| field(&doc.name)).unwrap_or_else(|| "Prototype".into());
    Ok((start, title))
}

/// Open the shared file `bytes` (named as `cfg.file`) as the session's active document, read-only
/// in effect (nothing can edit it in the viewer) and with no unsaved changes. Returns where it
/// starts and its title.
pub fn open_viewer(s: &mut Session, bytes: &[u8], cfg: &ViewerConfig) -> std::result::Result<(NodeId, String), String> {
    if bytes.len() > MAX_DOC_BYTES {
        return Err(format!("{} is too large to open here", cfg.file));
    }
    let (doc, _) = crate::cmd::file::load_bytes(bytes, &cfg.file).map_err(|e| e.to_string())?;
    let (start, title) = resolve(&doc, cfg)?;
    let mut ds = crate::DocState::new(doc, None);
    if let Some(page) = ds.doc.page_of(start) {
        ds.page = page;
    }
    ds.mark_saved();
    s.docs.push(ds);
    s.active = s.docs.len() - 1;
    Ok((start, title))
}

/// What a viewer opens from disk (the desktop app's `--viewer`, to try an export): a site folder
/// (its [`CONFIG_FILE`]), a [`CONFIG_FILE`] itself, or a document. Returns the config and the
/// document's bytes; errors are in words the viewer can show.
#[cfg(not(target_arch = "wasm32"))]
pub fn read_site(path: &std::path::Path) -> std::result::Result<(ViewerConfig, Vec<u8>), String> {
    let config =
        if path.is_dir() { Some(path.join(CONFIG_FILE)) } else { path.file_name().filter(|n| *n == CONFIG_FILE).map(|_| path.to_path_buf()) };
    let read = |p: &std::path::Path, max: usize| -> std::result::Result<Vec<u8>, String> {
        let len = std::fs::metadata(p).map_err(|e| format!("{}: {e}", p.display()))?.len();
        if len > max as u64 {
            return Err(format!("{} is too large", p.display()));
        }
        std::fs::read(p).map_err(|e| format!("{}: {e}", p.display()))
    };
    match config {
        Some(config) => {
            let text = read(&config, MAX_CONFIG_BYTES)?;
            let cfg = ViewerConfig::parse(&String::from_utf8_lossy(&text))?;
            let dir = config.parent().unwrap_or(std::path::Path::new("."));
            Ok((cfg.clone(), read(&dir.join(&cfg.file), MAX_DOC_BYTES)?))
        }
        None => {
            let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let cfg = ViewerConfig::for_file(&name).unwrap_or(ViewerConfig { file: name, ..ViewerConfig::default() });
            Ok((cfg, read(path, MAX_DOC_BYTES)?))
        }
    }
}

/// The document with only what playing it needs: no comments, dev handoff snapshots, published
/// library, recent colours, image presets or annotation categories. (Version history and branches
/// live beside the document in a `.figcraft` file and aren't written at all.)
pub fn playback_doc(doc: &Document) -> Document {
    let mut d = doc.clone();
    d.comments.clear();
    d.dev_snapshots.clear();
    d.published = None;
    d.document_colors.clear();
    d.image_presets.clear();
    d.annotation_categories = None;
    d
}

/// One file of the web build embedded in an app ([`register_embedded`]): raw-deflated bytes and
/// the size they inflate to.
pub struct EmbeddedFile {
    pub path: &'static str,
    pub deflated: &'static [u8],
    pub size: u64,
}

static EMBEDDED: OnceLock<&'static [EmbeddedFile]> = OnceLock::new();

/// Hand the engine the web build the app embeds (the desktop app's build script writes it from
/// `FIGCRAFT_WEB_BUNDLE_DIR`). An empty list means none; only the first call counts.
pub fn register_embedded(files: &'static [EmbeddedFile]) {
    if !files.is_empty() {
        let _ = EMBEDDED.set(files);
    }
}

/// The app has a web build built in: the export needs no `bundle` folder.
pub fn has_embedded_bundle() -> bool {
    EMBEDDED.get().is_some_and(|f| !f.is_empty())
}

/// A web build's files: (path relative to its folder, bytes).
pub type Bundle = Vec<(String, Vec<u8>)>;

/// The embedded web build, inflated.
fn embedded_bundle() -> Option<Result<Bundle>> {
    EMBEDDED.get().filter(|f| !f.is_empty()).map(|f| inflate(f))
}

/// Embedded files, inflated (each must inflate to exactly its size).
pub fn inflate(files: &[EmbeddedFile]) -> Result<Bundle> {
    let mut out = Vec::with_capacity(files.len());
    let mut total = 0u64;
    for f in files.iter() {
        total = total.saturating_add(f.size);
        if f.size > MAX_BUNDLE_BYTES || total > MAX_BUNDLE_BYTES || !is_safe_relative(f.path) {
            return Err(EngineError::Other(format!("the built-in web viewer is damaged ({})", f.path)));
        }
        let mut bytes = Vec::with_capacity(usize::try_from(f.size).unwrap_or(0));
        let read = flate2::read::DeflateDecoder::new(f.deflated).take(f.size.saturating_add(1)).read_to_end(&mut bytes);
        if read.is_err() || bytes.len() as u64 != f.size {
            return Err(EngineError::Other(format!("the built-in web viewer is damaged ({})", f.path)));
        }
        out.push((f.path.to_string(), bytes));
    }
    check_bundle(out)
}

/// Files of an earlier export (or the site's own) that a web build folder may also hold: never
/// copied from it.
fn is_site_file(path: &str) -> bool {
    matches!(path, CONFIG_FILE | DOC_FILE | "_headers" | "LEIA-ME.txt" | ".htaccess" | "HOSTING.md")
}

/// A web build read from folder `dir` (what `trunk build --release` writes: `index.html`, the
/// `.js` glue and the `.wasm`, maybe a `snippets/` folder). Hidden files and the site's own files
/// are left out.
#[cfg(not(target_arch = "wasm32"))]
pub fn read_bundle_dir(dir: &std::path::Path) -> Result<Bundle> {
    /// A web build has a handful of files; refuse folders that are clearly something else.
    const MAX_BUNDLE_FILES: usize = 256;
    fn walk(dir: &std::path::Path, rel: &str, depth: usize, out: &mut Bundle, total: &mut u64) -> Result<()> {
        let err = |e: std::io::Error| EngineError::Other(format!("{}: {e}", dir.display()));
        let mut entries: Vec<_> = std::fs::read_dir(dir).map_err(err)?.flatten().collect();
        entries.sort_by_key(std::fs::DirEntry::file_name);
        for e in entries {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                continue;
            }
            let path = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
            let meta = e.metadata().map_err(err)?;
            if meta.is_dir() {
                if depth < 4 {
                    walk(&e.path(), &path, depth + 1, out, total)?;
                }
                continue;
            }
            if !meta.is_file() || is_site_file(&path) || !is_safe_relative(&path) {
                continue;
            }
            *total = total.saturating_add(meta.len());
            if out.len() >= MAX_BUNDLE_FILES || *total > MAX_BUNDLE_BYTES {
                return Err(EngineError::Other(format!("{} is too large to be a FigCraft web build", dir.display())));
            }
            out.push((path, std::fs::read(e.path()).map_err(err)?));
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(dir, "", 0, &mut out, &mut 0)?;
    check_bundle(out)
}

#[cfg(target_arch = "wasm32")]
pub fn read_bundle_dir(dir: &std::path::Path) -> Result<Bundle> {
    Err(EngineError::Other(format!("{}: no file system in the browser", dir.display())))
}

/// A web build has an `index.html` and a `.wasm` file.
fn check_bundle(files: Bundle) -> Result<Bundle> {
    let has = |f: &dyn Fn(&str) -> bool| files.iter().any(|(p, _)| f(p));
    if !has(&|p| p == "index.html") || !has(&|p| p.ends_with(".wasm")) {
        return Err(EngineError::Other(
            "that folder isn't a FigCraft web build: it needs index.html and a .wasm file (run `trunk build --release` in apps/figcraft-web)".into(),
        ));
    }
    Ok(files)
}

/// `s` safe inside HTML text and attribute values.
fn html_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
}

/// The web build's `index.html` with the prototype's title (shown in the tab and in link previews
/// before the app starts) and a loading line that says what is coming.
fn site_index(html: &[u8], title: &str) -> Vec<u8> {
    let text = String::from_utf8_lossy(html);
    let mut text = text.into_owned();
    if let (Some(a), Some(b)) = (text.find("<title>"), text.find("</title>"))
        && a < b
    {
        text.replace_range(a + "<title>".len()..b, &html_escape(title));
    }
    text.replace("Loading FigCraft&hellip;", "Loading prototype&hellip;").into_bytes()
}

/// Netlify / Cloudflare Pages header rules: the web build's (`packaging/web/_headers`), and the
/// prototype's own files always revalidated (a new export to the same site shows at once).
pub const HEADERS: &str = "# Netlify / Cloudflare Pages header rules. Other hosts: set the same headers.
/*
  X-Content-Type-Options: nosniff

/*.wasm
  Content-Type: application/wasm
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/index.html
  Cache-Control: no-cache

/
  Cache-Control: no-cache

/prototype.json
  Cache-Control: no-cache

/prototype.figcraft
  Content-Type: application/octet-stream
  Cache-Control: no-cache
";

/// How to put the site online, for the person sharing it.
pub fn readme(title: &str) -> String {
    format!(
        "{title}: protótipo do FigCraft para compartilhar
==============================================

Esta pasta é um site pronto. Quem abrir o link vê só o protótipo (sem o editor).

Para colocar no ar (grátis, sem instalar nada):

  1. Abra https://app.netlify.com/drop no navegador.
  2. Arraste esta pasta inteira para a página.
  3. Copie o link que aparece (algo como https://nome-aleatorio.netlify.app) e envie.

  Para o link continuar no ar, crie uma conta grátis no Netlify quando ele pedir.
  Para atualizar: exporte de novo para esta mesma pasta e arraste outra vez.

Outros jeitos: GitHub Pages, Cloudflare Pages ou qualquer hospedagem de arquivos estáticos
(envie todos os arquivos desta pasta, sem mudar os nomes).

Abrir direto do computador (clicando duas vezes em index.html) não funciona: o navegador
bloqueia. Para testar sem internet, dentro desta pasta rode:
  python3 -m http.server 8000
e abra http://localhost:8000

Para começar em outra tela, acrescente ao link: ?start=Nome%20da%20tela

O que tem aqui:
  index.html, figcraft-web-*.js, figcraft-web-*_bg.wasm   o visualizador do FigCraft
  {DOC_FILE}                                     o arquivo (sem histórico nem comentários)
  {CONFIG_FILE}                                       qual arquivo abrir e em que tela começar
  _headers                                             configuração para Netlify/Cloudflare
"
    )
}

/// Every file of the site for document `doc` (laid out for `cfg`), with web build `bundle`.
pub fn site_files(doc: &Document, cfg: &ViewerConfig, title: &str, bundle: Bundle) -> Result<Bundle> {
    let bytes = figcraft_format::save_bytes(&playback_doc(doc), None).map_err(|e| EngineError::Other(e.to_string()))?;
    let mut out: Bundle = bundle
        .into_iter()
        .filter(|(p, _)| !is_site_file(p))
        .map(|(p, b)| if p == "index.html" { (p, site_index(&b, title)) } else { (p, b) })
        .collect();
    out.push((cfg.file.clone(), bytes));
    let config = serde_json::to_vec_pretty(&cfg.to_json()).map_err(|e| EngineError::Other(e.to_string()))?;
    out.push((CONFIG_FILE.into(), config));
    out.push(("_headers".into(), HEADERS.as_bytes().to_vec()));
    out.push(("LEIA-ME.txt".into(), readme(title).into_bytes()));
    Ok(out)
}

/// `file.exportPrototypeSite`.
pub(crate) fn export_site(s: &mut Session, p: &Value) -> Result<Value> {
    let cmd = "file.exportPrototypeSite";
    let path = match p.get("path") {
        Some(Value::String(path)) if !path.trim().is_empty() => path.clone(),
        _ => return Err(bad(cmd, "`path`: the folder to write the website into")),
    };
    let ds = s.ds()?;
    let doc = &ds.doc;
    // Where it starts: the frame asked for, else the flow asked for, else (as Present) the
    // selected frame, the page's first flow or its first frame.
    let start = match p.get("start").filter(|v| !v.is_null()) {
        Some(_) => Some(id(p, "start").and_then(|i| doc.top_level_frame(i)).ok_or_else(|| bad(cmd, "`start` isn't a frame or inside one"))?),
        None => None,
    };
    let flow = match p.get("flow").filter(|v| !v.is_null()) {
        Some(Value::String(f)) => Some(f.trim().to_string()),
        Some(_) => return Err(bad(cmd, "`flow` must be a flow's name")),
        None => None,
    };
    let page_flows = flows(doc, Some(ds.page));
    if let Some(f) = &flow
        && !page_flows.iter().any(|x| x.name.trim() == f)
    {
        return Err(bad(cmd, format!("no flow named `{}`", clip(f, 80))));
    }
    let title = match p.get("title").filter(|v| !v.is_null()) {
        Some(Value::String(t)) => field(t),
        Some(_) => return Err(bad(cmd, "`title` must be text")),
        None => None,
    };
    let start = start.or_else(|| {
        if flow.is_some() {
            return None;
        }
        ds.selection.first().and_then(|i| doc.top_level_frame(*i)).or_else(|| page_flows.first().and_then(|f| doc.top_level_frame(f.start)))
    });
    let mut cfg = ViewerConfig { file: DOC_FILE.into(), start: start.map(|s| s.to_string()), flow, title };
    let mut d = (**doc).clone();
    d.current_page = Some(ds.page);
    let (start, title) = resolve(&d, &cfg).map_err(|e| bad(cmd, e))?;
    // (A flow is named when the viewer starts where it does: its picker shows it playing.)
    if cfg.flow.is_none() {
        cfg.flow = page_flows.iter().find(|f| f.start == start).map(|f| f.name.clone());
    }
    cfg.start = Some(start.to_string());
    let bundle = match string(p, "bundle").filter(|b| !b.trim().is_empty()) {
        Some(dir) => read_bundle_dir(std::path::Path::new(&dir))?,
        None => embedded_bundle().unwrap_or_else(|| {
            Err(EngineError::Disabled(
                cmd.into(),
                "this FigCraft build doesn't include the web viewer: pass `bundle` (a folder with `trunk build --release` output from apps/figcraft-web), or use a build made with FIGCRAFT_WEB_BUNDLE_DIR (docs/share-prototype.md)".into(),
            ))
        })?,
    };
    let files = site_files(&d, &cfg, &title, bundle)?;
    write_site(&path, &files)?;
    let bytes: usize = files.iter().map(|(_, b)| b.len()).sum();
    Ok(json!({
        "path": path,
        "start": start,
        "title": title,
        "flow": cfg.flow,
        "files": files.iter().map(|(p, b)| json!({"name": p, "bytes": b.len()})).collect::<Vec<_>>(),
        "bytes": bytes,
    }))
}

/// Write `files` into folder `dir`: a new or empty folder, or an earlier export (it has a
/// [`CONFIG_FILE`]; its old web build files go first). Anything else is refused: an export never
/// mixes its files into a folder of other things.
#[cfg(not(target_arch = "wasm32"))]
fn write_site(dir: &str, files: &Bundle) -> Result<()> {
    let root = std::path::Path::new(dir);
    let err = |e: std::io::Error| EngineError::Other(format!("{dir}: {e}"));
    if root.is_file() {
        return Err(EngineError::Other(format!("{dir} is a file, not a folder")));
    }
    if root.is_dir() {
        let names: Vec<String> = std::fs::read_dir(root).map_err(err)?.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        let visible: Vec<&String> = names.iter().filter(|n| !n.starts_with('.')).collect();
        if !visible.is_empty() && !root.join(CONFIG_FILE).is_file() {
            return Err(EngineError::Other(format!("{dir} isn't empty: pick an empty folder (or one exported before) for the website")));
        }
        // An earlier export: its hashed web build files would be left behind.
        for n in visible.iter().filter(|n| n.starts_with("figcraft-web") && (n.ends_with(".js") || n.ends_with(".wasm"))) {
            let _ = std::fs::remove_file(root.join(n.as_str())); // what can't go stays unused: harmless
        }
    }
    std::fs::create_dir_all(root).map_err(err)?;
    for (rel, bytes) in files {
        if !is_safe_relative(rel) {
            return Err(EngineError::Other(format!("refusing to write {rel}")));
        }
        let target = root.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(err)?;
        }
        crate::cmd::file::write(&target.to_string_lossy(), bytes)?;
    }
    Ok(())
}

#[cfg(target_arch = "wasm32")]
fn write_site(dir: &str, _files: &Bundle) -> Result<()> {
    Err(EngineError::Other(format!("{dir}: no file system in the browser")))
}
