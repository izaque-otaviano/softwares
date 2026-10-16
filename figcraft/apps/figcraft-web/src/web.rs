//! The browser shell: web `Services` and the eframe web runner.

use figcraft_engine::Session;
use figcraft_engine::share::{self, ViewerConfig};
use figcraft_ui_egui::{FigApp, Services};
use wasm_bindgen::JsCast as _;

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
                Box::new(|cc| {
                    if let Some(rs) = &cc.wgpu_render_state {
                        log::info!("figcraft-web: wgpu backend {:?}", rs.adapter.get_info().backend);
                    }
                    let reduce_motion = web_sys::window().and_then(|w| w.match_media("(prefers-reduced-motion: reduce)").ok().flatten());
                    let services = Box::new(WebServices { reduce_motion });
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
                        return Ok(Box::new(WebShell { fig }));
                    }
                    let mut session = Session::new();
                    // Live sessions: the browser joins sessions a desktop app hosts; whatever arrives
                    // on the socket wakes the page for a frame.
                    let ctx = cc.egui_ctx.clone();
                    session.live.install(Box::new(figcraft_collab_net::NetLink::new(std::sync::Arc::new(move || ctx.request_repaint()))));
                    let fig = FigApp::new(session, services);
                    Ok(Box::new(WebShell { fig }))
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

struct WebShell {
    fig: FigApp,
}

impl eframe::App for WebShell {
    // `FigApp::ui` runs its own per-frame logic first (fonts, theme), like the desktop app.
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.fig.ui(ui);
    }
}

/// Browser services. File dialogs return nothing for now (the trait's defaults); the clipboard
/// goes through egui's own web clipboard handling.
struct WebServices {
    /// `prefers-reduced-motion: reduce` (it follows the setting while the page is open).
    reduce_motion: Option<web_sys::MediaQueryList>,
}

impl Services for WebServices {
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
