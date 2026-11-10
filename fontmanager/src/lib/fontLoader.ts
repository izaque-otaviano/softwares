/**
 * Carrega prévias SOB DEMANDA e sem instalar nada: linhas visíveis da lista pedem a fonte;
 * linhas fora da tela (virtualizadas) não existem, então nada é baixado antecipadamente.
 * Ordem de preferência: arquivo em cache (offline) → Google Fonts CDN → Fontsource/jsDelivr.
 */
import { api } from "./api";
import type { FamilySummary } from "./types";

type Loadable = Pick<FamilySummary, "key" | "name" | "previewCdn" | "previewId" | "cached" | "weights" | "hasItalic">;

const done = new Map<string, Promise<boolean>>();
const lru: string[] = [];
const links = new Map<string, HTMLLinkElement>();
const faces = new Map<string, FontFace>();
const MAX_LOADED = 160;
const listeners = new Set<() => void>();

export function subscribeFonts(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const bump = () => listeners.forEach((l) => l());

export function nearestWeight(weights: number[], want: number) {
  if (!weights.length) return want;
  return weights.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
}

function touch(id: string) {
  const i = lru.indexOf(id);
  if (i >= 0) lru.splice(i, 1);
  lru.push(id);
  while (lru.length > MAX_LOADED) {
    const old = lru.shift()!;
    done.delete(old);
    links.get(old)?.remove();
    links.delete(old);
    const f = faces.get(old);
    if (f) document.fonts.delete(f);
    faces.delete(old);
  }
}

export function googleCssUrl(name: string, weight: number, italic: boolean, range?: [number, number]) {
  const fam = encodeURIComponent(name).replace(/%20/g, "+");
  const w = range ? `${range[0]}..${range[1]}` : String(weight);
  return `https://fonts.googleapis.com/css2?family=${fam}:${italic ? `ital,wght@1,${w}` : `wght@${w}`}&display=swap`;
}

function loadLink(id: string, href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = () => resolve(true);
    l.onerror = () => {
      l.remove();
      resolve(false);
    };
    document.head.appendChild(l);
    links.set(id, l);
  });
}

/** Garante a variante (peso/estilo) carregada. Resolve `true` quando o navegador a tem. */
export function ensurePreview(f: Loadable, weight: number, italic: boolean, range?: [number, number]): Promise<boolean> {
  const w = range ? weight : nearestWeight(f.weights, weight);
  const it = italic && f.hasItalic;
  const id = `${f.key}|${range ? range.join("-") : w}|${it ? "i" : "n"}`;
  const hit = done.get(id);
  if (hit) {
    touch(id);
    return hit;
  }
  const p = (async () => {
    try {
      if (f.cached) {
        const buf = await api.cachedFontBytes(f.key, w, it);
        const face = new FontFace(f.name, buf, { weight: range ? `${range[0]} ${range[1]}` : String(w), style: it ? "italic" : "normal" });
        await face.load();
        document.fonts.add(face);
        faces.set(id, face);
        return true;
      }
    } catch {
      /* cai para a CDN */
    }
    try {
      if (f.previewCdn === "google") {
        const ok = await loadLink(id, googleCssUrl(f.name, w, it, range));
        if (ok) await document.fonts.load(`${it ? "italic " : ""}${w} 16px "${f.name}"`);
        return ok;
      }
      if (f.previewCdn === "fontsource" && f.previewId) {
        const url = `https://cdn.jsdelivr.net/fontsource/fonts/${f.previewId}@latest/latin-${w}-${it ? "italic" : "normal"}.woff2`;
        const face = new FontFace(f.name, `url(${url}) format("woff2")`, { weight: String(w), style: it ? "italic" : "normal" });
        await face.load();
        document.fonts.add(face);
        faces.set(id, face);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  })().then((ok) => {
    if (!ok) done.delete(id); // permite nova tentativa (ex.: voltou a rede)
    bump();
    return ok;
  });
  done.set(id, p);
  touch(id);
  return p;
}
