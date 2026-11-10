import { useEffect, useState, type CSSProperties } from "react";
import { ensurePreview, nearestWeight } from "@/lib/fontLoader";
import type { FamilySummary } from "@/lib/types";

/** Pede a prévia ao montar (linhas virtualizadas só montam quando visíveis) e informa quando está pronta. */
export function useFontPreview(f: FamilySummary, weight: number, italic: boolean, range?: [number, number]) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    setReady(false);
    const t = setTimeout(() => {
      ensurePreview(f, weight, italic, range).then((ok) => alive && setReady(ok));
    }, 120); // evita disparar downloads durante rolagem rápida
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [f.key, f.name, f.cached, f.previewCdn, f.previewId, weight, italic, range?.[0], range?.[1]]);

  const style: CSSProperties = {
    fontFamily: ready ? `"${f.name}", system-ui, sans-serif` : "system-ui, sans-serif",
    fontWeight: range ? weight : nearestWeight(f.weights, weight),
    fontStyle: italic && f.hasItalic ? "italic" : "normal",
  };
  return { style, ready };
}
