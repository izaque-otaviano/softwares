//! FigCraft in the browser.
//!
//! Runs the same [`figcraft_ui_egui::FigApp`] as the desktop app through eframe's web runner
//! (wgpu: WebGPU where available, WebGL2 otherwise). Build with `trunk build --release` from this
//! directory; the site lands in `dist/web` (see `packaging/web/README.md`).
//!
//! Differences from the desktop app:
//! - no TCP control server (browsers can't listen on sockets);
//! - no native file dialogs yet: the session starts with one new document;
//! - links open in a new browser tab;
//! - live sessions: it joins sessions a desktop app hosts (File ▸ Join live session…) but can't
//!   host one. A page served over `https://` can only reach sessions on the same computer
//!   (browsers block `ws://` from secure pages); serve it over `http://` on a trusted network to
//!   join from other machines.
//!
//! URL query flag: `?webgl` forces the WebGL2 backend instead of WebGPU.
//!
//! Viewer mode (a shared prototype, File ▸ Export prototype as website… in the desktop app): with
//! a `prototype.json` next to `index.html`, or `?prototype=<file>` in the address (a path inside
//! the site), the page fetches that file and shows only its prototype, locked: no editor and no
//! way back to it. `?start=<frame name or id>` (and `flow`, `title`) override where it starts.
//! See `figcraft_engine::share` and `docs/share-prototype.md`.

#[cfg(target_arch = "wasm32")]
mod web;

#[cfg(target_arch = "wasm32")]
fn main() {
    web::start();
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {
    eprintln!("figcraft-web only runs in the browser: build it with `trunk build --release` in apps/figcraft-web");
}
