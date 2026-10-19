//! The browser shell: web `Services` and the eframe web runner.

use std::cell::RefCell;
use std::sync::{Arc, Mutex, PoisonError};

use base64::Engine as _;
use figcraft_engine::Session;
use figcraft_engine::share::{self, ViewerConfig};
use figcraft_ui_egui::{BrowserFile, FigApp, Services};
use wasm_bindgen::JsCast as _;
use wasm_bindgen::prelude::*;

use crate::idb::{self, WebStorage};
use crate::store::{self, Library, Shared};

const CANVAS_ID: &str = "figcraft_canvas";
const LOADING_ID: &str = "figcraft_loading";

pub fn start() {
    eframe::WebLogger::init(log::LevelFilter::Info).ok();
    wasm_bindgen_futures::spawn_local(async {
        let Some(document) = web_sys::window().and_then(|w| w.document()) else {
            log::error!("no document");
            return;
        };
        let Some(canvas) = document.get_element_by_id(CANVAS_ID).and_then(|e| e.dyn_into::<web_sys::HtmlCanvasElement>().ok()) else {
            log::error!("missing <canvas id=\"{CANVAS_ID}\">");
            return;
        };
        // A shared prototype (`prototype.json` next to the page, or `?prototype=<file>`): fetched
        // before the app starts, while the page says it is loading.
        let shared = shared_prototype(&document).await;
        // The browser's copy of the work (not for a shared prototype, which edits nothing).
        let library: Option<Shared<WebStorage>> = if shared.is_none() {
            let storage = idb::open().await;
            Some(Arc::new(Mutex::new(Library::new(storage, &instance_token()))))
        } else {
            None
        };
        let mut options = eframe::WebOptions::default();
        // `?webgl`: force the WebGL2 backend (troubleshooting, and headless browsers whose WebGPU
        // adapter request returns nothing).
        if query().contains("webgl")
            && let eframe::egui_wgpu::WgpuSetup::CreateNew(create) = &mut options.wgpu_options.wgpu_setup
        {
            create.instance_descriptor.backends = eframe::wgpu::Backends::GL;
        }
        let result = eframe::WebRunner::new()
            .start(
                canvas,
                options,
                Box::new(move |cc| {
                    if let Some(rs) = &cc.wgpu_render_state {
                        log::info!("figcraft-web: wgpu backend {:?}", rs.adapter.get_info().backend);
                    }
                    let reduce_motion = web_sys::window().and_then(|w| w.match_media("(prefers-reduced-motion: reduce)").ok().flatten());
                    let chosen: Chosen = Arc::default();
                    let services =
                        Box::new(WebServices { reduce_motion, library: library.clone(), listing: RefCell::new(None), chosen: chosen.clone() });
                    // Viewer mode: only the prototype, never the editor.
                    if let Some(shared) = shared {
                        let mut fig = FigApp::new(Session::empty(), services);
                        match shared {
                            Ok((cfg, bytes)) => {
                                figcraft_ui_egui::viewer::open(&mut fig, &bytes, &cfg);
                            }
                            Err(e) => figcraft_ui_egui::viewer::fail(&mut fig, e),
                        }
                        if let (Some(title), Some(doc)) = (figcraft_ui_egui::viewer::title(&fig), web_sys::window().and_then(|w| w.document())) {
                            doc.set_title(&title);
                        }
                        return Ok(Box::new(WebShell { fig, library: None, chosen, problem_shown: false }));
                    }
                    let mut session = Session::new();
                    // Live sessions: the browser joins sessions a desktop app hosts; whatever arrives
                    // on the socket wakes the page for a frame.
                    let ctx = cc.egui_ctx.clone();
                    session.live.install(Box::new(figcraft_collab_net::NetLink::new(std::sync::Arc::new(move || ctx.request_repaint()))));
                    // Files are kept in the browser as they change, and come back after a reload.
                    let mut restored = (0, Vec::new());
                    if let Some(lib) = &library {
                        store::install(&mut session, lib);
                        // The browser is slower to write than a disk is to wait for: be quick.
                        session.filesave.idle_secs = 1.5;
                        session.filesave.min_gap_secs = 4.0;
                        let mut l = store::lock(lib);
                        l.prune(figcraft_engine::cmd::comment::now_secs());
                        let r = l.restore(&mut session);
                        restored = (r.opened, r.skipped);
                    }
                    let mut fig = FigApp::new(session, services);
                    fig.note_restored_from_browser(restored.0, &restored.1);
                    Ok(Box::new(WebShell { fig, library: library.clone(), chosen, problem_shown: false }))
                }),
            )
            .await;
        if let Some(el) = document.get_element_by_id(LOADING_ID) {
            match result {
                Ok(()) => el.remove(),
                Err(e) => el.set_inner_html(&format!("<p>FigCraft failed to start: {e:?}</p><p>A browser with WebGPU or WebGL2 is required.</p>")),
            }
        }
    });
}

fn query() -> String {
    web_sys::window().and_then(|w| w.location().search().ok()).unwrap_or_default()
}

/// The shared prototype this page shows, if it is one: its config and the file's bytes, or why
/// they can't be had. `None`: no `?prototype=` and no `prototype.json` (a 404, or a host's
/// fallback page instead of JSON), so the editor starts as usual.
async fn shared_prototype(document: &web_sys::Document) -> Option<Result<(ViewerConfig, Vec<u8>), String>> {
    let q = query();
    let cfg = match ViewerConfig::from_query(&q) {
        Some(cfg) => cfg,
        None => {
            let (status, body) = fetch(share::CONFIG_FILE, share::MAX_CONFIG_BYTES).await.ok()?;
            // Hosts that answer every address with a page (a single-page-app fallback) aren't a config.
            if !(200..300).contains(&status) || body.iter().find(|b| !b.is_ascii_whitespace()) != Some(&b'{') {
                return None;
            }
            ViewerConfig::parse(&String::from_utf8_lossy(&body)).map(|c| c.with_query(&q))
        }
    };
    let cfg = match cfg {
        Ok(cfg) => cfg,
        Err(e) => return Some(Err(e)),
    };
    if let Some(el) = document.get_element_by_id(LOADING_ID) {
        el.set_inner_html("Loading prototype&hellip;");
    }
    Some(match fetch(&cfg.file, share::MAX_DOC_BYTES).await {
        Ok((status, bytes)) if (200..300).contains(&status) => Ok((cfg, bytes)),
        Ok((404, _)) => Err(format!("{} wasn't found next to this page", cfg.file)),
        Ok((status, _)) => Err(format!("{}: the server answered {status}", cfg.file)),
        Err(e) => Err(format!("{}: {e}", cfg.file)),
    })
}

/// GET `url` (relative to the page): the status and the body, refused past `max` bytes.
async fn fetch(url: &str, max: usize) -> Result<(u16, Vec<u8>), String> {
    let window = web_sys::window().ok_or("no window")?;
    let resp = wasm_bindgen_futures::JsFuture::from(window.fetch_with_str(url)).await.map_err(|e| format!("couldn't download it ({e:?})"))?;
    let resp: web_sys::Response = resp.dyn_into().map_err(|_| "not a response".to_string())?;
    let status = resp.status();
    if !resp.ok() {
        return Ok((status, Vec::new()));
    }
    let buf = resp.array_buffer().map_err(|e| format!("{e:?}"))?;
    let buf = wasm_bindgen_futures::JsFuture::from(buf).await.map_err(|e| format!("the download broke off ({e:?})"))?;
    let bytes = js_sys::Uint8Array::new(&buf);
    if bytes.length() as usize > max {
        return Err("it is too large".into());
    }
    Ok((status, bytes.to_vec()))
}

/// A file chosen with the browser's file chooser: its name and bytes, waiting to be opened.
type Chosen = Arc<Mutex<Vec<(String, Vec<u8>)>>>;

struct WebShell {
    fig: FigApp,
    library: Option<Shared<WebStorage>>,
    chosen: Chosen,
    /// The storage's last problem was told to the user (again only after it clears).
    problem_shown: bool,
}

impl eframe::App for WebShell {
    // `FigApp::ui` runs its own per-frame logic first (fonts, theme), like the desktop app.
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.fig.ui(ui);
        self.after_frame(ui.ctx());
    }
}

impl WebShell {
    /// Files chosen in the browser's dialog open; the browser's copy follows the session; what the
    /// storage said about its writes reaches the user.
    fn after_frame(&mut self, ctx: &egui::Context) {
        let chosen = std::mem::take(&mut *self.chosen.lock().unwrap_or_else(PoisonError::into_inner));
        for (name, bytes) in chosen {
            let data = base64::engine::general_purpose::STANDARD.encode(bytes);
            if self.fig.run("file.openData", serde_json::json!({"data": data, "name": name})).is_some() {
                self.fig.ui.home = false;
            }
        }
        let Some(library) = &self.library else { return };
        let mut lib = store::lock(library);
        lib.sync_session(&self.fig.session, figcraft_engine::cmd::comment::now_secs());
        let (pending, state) = {
            let storage = lib.storage();
            storage.pump();
            (storage.pending(), storage.state())
        };
        match state {
            idb::State::Problem(e) => {
                lib.set_problem(Some(e.clone()));
                if !self.problem_shown {
                    self.problem_shown = true;
                    self.fig.toast(e.to_string());
                }
            }
            idb::State::Recovered => {
                lib.set_problem(None);
                self.problem_shown = false;
            }
            idb::State::Quiet => {}
        }
        // (An idle page draws no frames: look again while the browser still has writes to take.)
        if pending {
            ctx.request_repaint_after(std::time::Duration::from_millis(500));
        }
    }
}

/// This tab's token, kept by the tab across reloads (not shared with other tabs: each has its own
/// open files).
fn instance_token() -> String {
    let storage = web_sys::window().and_then(|w| w.session_storage().ok().flatten());
    if let Some(t) = storage.as_ref().and_then(|s| s.get_item("figcraft-instance").ok().flatten()).filter(|t| store::valid_id(t)) {
        return t;
    }
    let token = format!("{:x}{:x}", js_sys::Date::now() as u64, (js_sys::Math::random() * 1e12) as u64);
    if let Some(s) = &storage {
        let _ = s.set_item("figcraft-instance", &token);
    }
    token
}

/// Hand `bytes` to the user as a download named `name`.
fn download_bytes(name: &str, bytes: &[u8]) -> bool {
    let go = || -> Result<(), JsValue> {
        let document = web_sys::window().and_then(|w| w.document()).ok_or("no document")?;
        let parts = js_sys::Array::of1(&js_sys::Uint8Array::from(bytes));
        let opts = web_sys::BlobPropertyBag::new();
        opts.set_type("application/octet-stream");
        let blob = web_sys::Blob::new_with_u8_array_sequence_and_options(&parts, &opts)?;
        let url = web_sys::Url::create_object_url_with_blob(&blob)?;
        let a = document.create_element("a")?.dyn_into::<web_sys::HtmlAnchorElement>()?;
        a.set_href(&url);
        a.set_download(name);
        a.style().set_property("display", "none")?;
        let body = document.body().ok_or("no body")?;
        body.append_child(&a)?;
        a.click();
        a.remove();
        // The browser has taken the download by now.
        if let Some(window) = web_sys::window() {
            let revoke = Closure::once_into_js(move || {
                let _ = web_sys::Url::revoke_object_url(&url);
            });
            let _ = window.set_timeout_with_callback_and_timeout_and_arguments_0(revoke.unchecked_ref(), 30_000);
        }
        Ok(())
    };
    match go() {
        Ok(()) => true,
        Err(e) => {
            log::error!("couldn't start the download of {name}: {e:?}");
            false
        }
    }
}

/// Ask for a file with the browser's file chooser; the file lands in `chosen` when it is read.
fn choose_file(chosen: &Chosen, exts: &[&str]) {
    let go = || -> Result<(), JsValue> {
        let document = web_sys::window().and_then(|w| w.document()).ok_or("no document")?;
        let input = document.create_element("input")?.dyn_into::<web_sys::HtmlInputElement>()?;
        input.set_type("file");
        input.set_accept(&exts.iter().map(|e| format!(".{e}")).collect::<Vec<_>>().join(","));
        let chosen = chosen.clone();
        let reader = input.clone();
        let on_change = Closure::once_into_js(move |_: web_sys::Event| {
            let Some(file) = reader.files().and_then(|f| f.get(0)) else { return };
            let name = file.name();
            wasm_bindgen_futures::spawn_local(async move {
                match JsFuture::from(file.array_buffer()).await {
                    Ok(buf) => {
                        let bytes = js_sys::Uint8Array::new(&buf);
                        if bytes.length() as usize <= share::MAX_DOC_BYTES {
                            chosen.lock().unwrap_or_else(PoisonError::into_inner).push((name, bytes.to_vec()));
                        } else {
                            log::error!("{name}: too large");
                        }
                    }
                    Err(e) => log::error!("couldn't read {name}: {e:?}"),
                }
            });
        });
        input.set_onchange(Some(on_change.unchecked_ref()));
        input.click();
        Ok(())
    };
    if let Err(e) = go() {
        log::error!("couldn't open the file chooser: {e:?}");
    }
}

use wasm_bindgen_futures::JsFuture;

/// Browser services. File dialogs return nothing for now (the trait's defaults); the clipboard
/// goes through egui's own web clipboard handling.
struct WebServices {
    /// `prefers-reduced-motion: reduce` (it follows the setting while the page is open).
    reduce_motion: Option<web_sys::MediaQueryList>,
    /// The files kept in the browser (none in viewer mode).
    library: Option<Shared<WebStorage>>,
    /// The listing of those, and when (`Date.now()`) it was read: it is read again after a second,
    /// not every frame.
    listing: RefCell<Option<(f64, Vec<BrowserFile>)>>,
    chosen: Chosen,
}

impl Services for WebServices {
    /// The browser's file chooser (the file opens a moment later, on a frame of the page).
    fn pick_open(&mut self, _title: &str, exts: &[&str]) -> Option<std::path::PathBuf> {
        choose_file(&self.chosen, exts);
        None
    }
    fn download(&mut self, name: &str, bytes: &[u8]) -> bool {
        download_bytes(name, bytes)
    }
    fn browser_files(&self) -> Vec<BrowserFile> {
        let Some(lib) = &self.library else { return Vec::new() };
        let now = js_sys::Date::now();
        let mut cache = self.listing.borrow_mut();
        if let Some((at, files)) = cache.as_ref()
            && now - at < 1000.0
        {
            return files.clone();
        }
        let lib = store::lock(lib);
        let files: Vec<BrowserFile> = lib
            .files()
            .into_iter()
            .map(|e| BrowserFile { open: lib.uid_of(&e.meta.id), id: e.meta.id, name: e.meta.name, modified: e.meta.modified, bytes: e.bytes })
            .collect();
        *cache = Some((now, files.clone()));
        files
    }
    fn browser_file_bytes(&mut self, id: &str) -> Option<Vec<u8>> {
        store::lock(self.library.as_ref()?).read(id)
    }
    fn browser_adopt(&mut self, id: &str, uid: u64) {
        if let Some(lib) = &self.library {
            store::lock(lib).adopt(id, uid);
        }
        *self.listing.borrow_mut() = None;
    }
    fn browser_delete(&mut self, id: &str) {
        if let Some(lib) = &self.library {
            store::lock(lib).remove(id);
        }
        *self.listing.borrow_mut() = None;
    }
    fn browser_problem(&self) -> Option<String> {
        store::lock(self.library.as_ref()?).problem().map(ToString::to_string)
    }

    fn open_url(&mut self, url: &str) {
        let Some(window) = web_sys::window() else { return };
        if let Err(e) = window.open_with_url_and_target(url, "_blank") {
            log::error!("couldn't open {url}: {e:?}");
        }
    }
    /// Same-tab navigation: the link replaces the page (the caller has checked it is a web, mail
    /// or phone link: never a `javascript:` one).
    fn open_url_here(&mut self, url: &str) {
        let Some(window) = web_sys::window() else { return };
        if let Err(e) = window.location().assign(url) {
            log::error!("couldn't open {url}: {e:?}");
        }
    }
    fn reduce_motion(&self) -> bool {
        self.reduce_motion.as_ref().is_some_and(web_sys::MediaQueryList::matches)
    }
    /// The browser's language (`navigator.language`).
    fn system_language(&self) -> Option<String> {
        web_sys::window().and_then(|w| w.navigator().language())
    }
    /// The Gamepad API's controllers with the standard mapping (its button order is the layout's;
    /// others are skipped). Browsers list controllers once one of their buttons is pressed.
    fn gamepad_held(&mut self) -> u32 {
        let Some(pads) = web_sys::window().and_then(|w| w.navigator().get_gamepads().ok()) else { return 0 };
        let mut held = 0;
        for pad in pads.iter().filter_map(|p| p.dyn_into::<web_sys::Gamepad>().ok()) {
            if pad.mapping() != web_sys::GamepadMappingType::Standard {
                continue;
            }
            for (i, b) in pad.buttons().iter().take(32).enumerate() {
                if b.dyn_into::<web_sys::GamepadButton>().is_ok_and(|b| b.pressed()) {
                    held |= 1 << i;
                }
            }
        }
        held
    }
}
