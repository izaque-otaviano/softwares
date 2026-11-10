/**
 * MODO DEMONSTRAÇÃO – usado SOMENTE quando a interface roda num navegador comum (sem Tauri), para
 * desenvolver/inspecionar o layout. Nenhuma fonte é realmente baixada ou registrada aqui, e a
 * interface exibe um aviso permanente. O aplicativo empacotado nunca usa este módulo.
 */
import type { FamilySummary } from "./types";

// Famílias reais do Google Fonts, para que a prévia use as fontes de verdade via CDN.
const NAMES: [string, string, boolean][] = [
  ["Inter", "sans-serif", true], ["Roboto", "sans-serif", true], ["Open Sans", "sans-serif", true], ["Lora", "serif", true],
  ["Playfair Display", "serif", true], ["Merriweather", "serif", false], ["Fira Code", "monospace", true], ["JetBrains Mono", "monospace", true],
  ["Lobster", "display", false], ["Pacifico", "handwriting", false], ["Montserrat", "sans-serif", true], ["Poppins", "sans-serif", false],
  ["Space Grotesk", "sans-serif", true], ["DM Serif Display", "serif", false], ["Caveat", "handwriting", true], ["Bebas Neue", "display", false],
  ["Fraunces", "serif", true], ["Space Mono", "monospace", false], ["Syne", "sans-serif", true], ["Bricolage Grotesque", "sans-serif", true],
  ["Instrument Serif", "serif", false], ["Archivo", "sans-serif", true], ["IBM Plex Mono", "monospace", false], ["Abril Fatface", "display", false],
  ["Cormorant Garamond", "serif", false], ["Work Sans", "sans-serif", true], ["Nunito", "sans-serif", true], ["Rubik", "sans-serif", true],
  ["Libre Baskerville", "serif", false], ["Permanent Marker", "handwriting", false], ["Unbounded", "display", true], ["Manrope", "sans-serif", true],
];

const store = {
  fams: NAMES.map(([name, category, variable], i): FamilySummary => ({
    key: name.toLowerCase().replace(/[^a-z0-9]/g, ""), name, category, providers: i % 3 === 0 ? ["fontsource", "google"] : ["fontsource"],
    weights: [400, 500, 700], hasItalic: i % 2 === 0, variable, license: "OFL-1.1", favorite: i === 4, state: "inactive",
    cached: false, installable: true, previewCdn: "google", previewId: name,
  })),
  collections: [{ id: 1, name: "Identidade visual", count: 4 }, { id: 2, name: "Editorial", count: 2 }],
  settings: { scope: "session", theme: "system" } as Record<string, string>,
};

// Estados de exemplo para visualizar a interface (não são ativações reais).
store.fams[1].state = "active"; store.fams[1].cached = true;
store.fams[2].cached = true;
store.fams[3].state = "system";
store.fams[9].state = "active"; store.fams[9].cached = true;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockInvoke(cmd: string, a: Record<string, unknown> = {}): Promise<unknown> {
  await sleep(30);
  switch (cmd) {
    case "query_catalog": {
      const q = a.query as { text?: string; offset: number; limit: number; view?: string; category?: string };
      let list = store.fams;
      if (q.text) list = list.filter((f) => f.name.toLowerCase().includes(q.text!.toLowerCase()));
      if (q.category) list = list.filter((f) => f.category === q.category);
      if (q.view === "favorites") list = list.filter((f) => f.favorite);
      if (q.view === "active") list = list.filter((f) => f.state === "active");
      return { total: list.length, items: list.slice(q.offset, q.offset + q.limit) };
    }
    case "family_detail": {
      const s = store.fams.find((f) => f.key === a.key)!;
      return {
        summary: s, collections: [],
        sources: s.providers.map((p) => ({
          providerId: p, providerFamilyId: s.name, origin: "google", version: "v1", license: "OFL-1.1", licenseUrl: null, lastModified: null,
          subsets: ["latin", "cyrillic"], variable: s.variable, axes: s.variable ? [{ tag: "wght", min: 400, max: 700, default: 400 }] : [],
          variants: s.weights.flatMap((w) => [{ weight: w, style: "normal" }, ...(s.hasItalic ? [{ weight: w, style: "italic" }] : [])]),
        })),
      };
    }
    case "categories": return ["display", "handwriting", "monospace", "sans-serif", "serif"];
    case "list_providers":
      return [
        { id: "fontsource", name: "Fontsource", hasCatalog: true, canInstallFiles: true, hasCdn: true, status: "ok", note: "Modo demonstração" },
        { id: "google", name: "Google Fonts", hasCatalog: true, canInstallFiles: true, hasCdn: true, status: "needs_config", note: null },
        { id: "bunny", name: "Bunny Fonts", hasCatalog: false, canInstallFiles: false, hasCdn: true, status: "ok", note: "Somente CDN" },
        { id: "fontshare", name: "Fontshare", hasCatalog: false, canInstallFiles: false, hasCdn: false, status: "not_available", note: "Sem API pública documentada." },
      ];
    case "list_collections": return store.collections;
    case "get_settings": return Object.entries(store.settings);
    case "set_setting": store.settings[a.key as string] = a.value as string; return null;
    case "app_info": return { version: "demo", backend: "demonstração (sem backend nativo)", os: "browser", defaultScope: "session", cacheBytes: 0, catalogCount: store.fams.length };
    case "set_favorite": { const f = store.fams.find((x) => x.key === a.key); if (f) f.favorite = a.on as boolean; return null; }
    case "local_fonts": return [0, []];
    case "recent_log": return [];
    case "sync_catalog": return [];
    case "generate_css":
      return {
        linkHtml: '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">',
        importCss: "@import url('...');", fontFamilyRule: "font-family: 'Inter', sans-serif;", fontFaceCss: null, react: "// demo", nextjs: "// demo", notes: ["Modo demonstração"], selfHostFiles: [],
      };
    default:
      throw new Error(`Modo demonstração: "${cmd}" exige o aplicativo desktop (backend nativo).`);
  }
}
