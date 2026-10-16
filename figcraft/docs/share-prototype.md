# Sharing a prototype as a website

> **Last updated:** 2026-10-16 · **Change:** major (created: File ▸ Export prototype as website…,
> the web build's viewer mode, the desktop app's built-in web viewer)

Send someone a link; they open it in a browser and see only the prototype, never the editor. There
is no server of ours in between: FigCraft writes a static website (a folder of files) and any
static host serves it. The easiest is [Netlify Drop](https://app.netlify.com/drop): drag the folder
onto the page and it gives a link.

## In the app

1. Open the file, select the frame to start on (or none: the page's first flow, else its first
   frame).
2. **File ▸ Export prototype as website…** and pick where to save it. The site goes into a folder
   of its own there, named after the file: `<name> (site)`.
3. Drag that folder onto <https://app.netlify.com/drop> (or upload its contents to GitHub Pages,
   Cloudflare Pages, any web server) and send the link. Exporting again into the same folder and
   dragging it again updates the site. `LEIA-ME.txt` in the folder says the same in Portuguese.

The same as a command (control channel, MCP, `figcraft-cli run`), never opening a dialog:

```json
{"command": "file.exportPrototypeSite", "params": {"path": "/home/ana/Shop (site)", "start": 12, "flow": "Checkout", "title": "Shop", "bundle": "dist/web"}}
```

`path` is a new or empty folder, or one exported to before (anything else is refused, so an export
never scatters files into a folder of other things). `start` (a frame id), `flow` (a flow's name),
`title` and `bundle` are optional; `bundle` is a web build folder, needed only when the app has
none built in (below).

## What the folder holds

| File | What it is |
|---|---|
| `index.html`, `figcraft-web-<hash>.js`, `figcraft-web-<hash>_bg.wasm` (and `snippets/` if the build has one) | the FigCraft web build; the page title is the prototype's |
| `prototype.figcraft` | the file with only what playing needs: no version history, branches, comments, dev handoff snapshots or published library |
| `prototype.json` | `{"format": "figcraft-prototype", "version": 1, "file": "prototype.figcraft", "start": "12", "flow": "Checkout", "title": "Shop"}` |
| `_headers` | Netlify / Cloudflare Pages rules: `.wasm` as `application/wasm`, hashed files cached for good, `index.html`, `prototype.json` and `prototype.figcraft` always revalidated |
| `LEIA-ME.txt` | how to put it online, in Portuguese |

## The viewer (web build)

`apps/figcraft-web` starts in viewer mode when there is a `prototype.json` next to its
`index.html` (fetched at start; a 404, or a host's fallback page that isn't JSON, starts the editor
as before) or when the address has `?prototype=<file>`. It downloads the file, opens it through the
same loader as the desktop app and presents it locked:

- no way back to the editor: no Close button, Escape never ends the presentation (it still closes
  the shortcut list and brings hidden controls back), the presentation restarts if it ever ends;
- no Comments, no Inspect, no window of its own;
- kept: restart (R), flows, the screens panel (S), sizes (Z), full screen (F), hide UI
  (Cmd/Ctrl+\), the background colour (B), the shortcut list (?);
- the browser tab's title is the flow's name, else the file's;
- a missing or damaged file shows a short explanation instead.

Address parameters: `?start=<frame name or id>`, `flow=<name>` and `title=<text>` override the
config (a link straight to one screen: `https://….netlify.app/?start=Checkout`). `?prototype=`
takes only a path inside the site (no `https://`, `//`, `..`, absolute paths or queries), so a link
can't make a site show someone else's file. `?webgl` works as in the editor.

To try an export on the desktop: `figcraft --viewer "<name> (site)"` (or its `prototype.json`, or
any `.figcraft` file) opens the same locked viewer in a window with the system's title bar.

## Building the desktop app with the web viewer built in

The export needs the web build. The desktop app embeds it at build time from
`FIGCRAFT_WEB_BUNDLE_DIR`, a `trunk build --release` output folder (deflated: about 7 MiB added to
the binary for an 18 MiB `.wasm`). Without it everything builds, tests and runs; the menu item then
asks for a web build folder and the command for `bundle`.

Release CI (Linux runner; the bundle is the same for every desktop target):

```sh
# 1. trunk 0.21.14 (the release workflow's), the wasm target
rustup target add wasm32-unknown-unknown
curl -fsSL "https://github.com/trunk-rs/trunk/releases/download/v0.21.14/trunk-x86_64-unknown-linux-gnu.tar.gz" \
  | tar -xz -C "$HOME/.cargo/bin" trunk
# 2. the web build (profile `web-release`, wasm-opt -Oz; trunk fetches wasm-bindgen and wasm-opt itself)
(cd apps/figcraft-web && trunk build --release)   # → dist/web/ (index.html, figcraft-web-<hash>.js, …_bg.wasm)
# 3. the desktop app with it built in (absolute path; REQUIRED makes a missing build an error)
FIGCRAFT_WEB_BUNDLE_DIR="$PWD/dist/web" FIGCRAFT_WEB_BUNDLE_REQUIRED=1 cargo build --release -p figcraft
```

For other desktop jobs, build `dist/web` once (step 2) and hand it to them as an artifact, then set
`FIGCRAFT_WEB_BUNDLE_DIR` to its absolute path in their build step. A changed folder rebuilds the
app; with the variable unset the build warns nothing and embeds nothing. Set `CRAFT_FONTS_DIR` for
step 2 as the web release job does (Inter is embedded in the web build).

## Smoke test

`trunk build --release` (no craft-fonts), the export of `examples/ridgeline-onboarding.figcraft`
through `figcraft-cli run`, the folder served with `python3 -m http.server`, headless Chromium
(`--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --screenshot … "/?webgl"`):
the page fetched `prototype.json` and `prototype.figcraft` and showed the Onboarding flow's first
screen on its device with the bar's screens, flow, "1 / 4", `?`, Options and Restart, and no Close,
Comments or Inspect; `?prototype=missing.figcraft` showed the explanation.

## Not yet

- No password or expiry on a link: whoever has it sees the prototype (Netlify's own settings can add
  a password on paid plans).
- Fonts: browsers give the web build no system fonts, so the prototype's text needs the fonts the
  web build embeds: build it with `CRAFT_FONTS_DIR` (Inter, as the web release job does). A web
  build without craft-fonts draws the presenter's controls but not the prototype's text (seen in
  the smoke test below); families other than Inter aren't embedded yet. Images and videos are in the
  file and play as on the desktop.
- Comments from viewers, and one link that follows later edits (that is live sharing:
  [collaboration-parity](collaboration-parity.md)).
