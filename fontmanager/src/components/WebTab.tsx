import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, FolderDown } from "lucide-react";
import { api, pickFolder } from "@/lib/api";
import { cn, weightName } from "@/lib/utils";
import { useToasts } from "@/store/toasts";
import type { Cdn, CssRequest, FamilyDetail, Style } from "@/lib/types";
import { Button } from "./ui/button";
import { Select } from "./ui/input";

const CDNS: { id: Cdn; label: string; need: (d: FamilyDetail) => boolean }[] = [
  { id: "google", label: "Google Fonts", need: (d) => d.sources.some((s) => s.providerId === "google" || s.origin === "google") },
  { id: "bunny", label: "Bunny Fonts", need: (d) => d.sources.some((s) => s.providerId === "google" || s.origin === "google") },
  { id: "fontsource", label: "Fontsource (jsDelivr)", need: (d) => d.sources.some((s) => s.providerId === "fontsource") },
  { id: "self_hosted", label: "Hospedagem local", need: () => true },
];
const DISPLAYS = ["swap", "auto", "block", "fallback", "optional"];

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="overflow-hidden rounded-[10px] bg-fill-2 ring-[0.5px] ring-separator">
      <div className="flex items-center justify-between border-b border-separator px-3 py-1">
        <span className="text-[12px] font-medium text-label-2">{title}</span>
        <Button size="sm" variant="plain" aria-label={`Copiar ${title}`} onClick={async () => { await navigator.clipboard.writeText(code); setOk(true); setTimeout(() => setOk(false), 1500); }}>
          {ok ? <Check className="text-green" /> : <Copy />} {ok ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="max-h-64 overflow-auto p-3 font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-[11.5px] leading-relaxed whitespace-pre-wrap break-all"><code>{code}</code></pre>
    </div>
  );
}

export function WebTab({ detail }: { detail: FamilyDetail }) {
  const available = CDNS.filter((c) => c.need(detail));
  const [cdn, setCdn] = useState<Cdn>(available[0]?.id ?? "self_hosted");
  const [weights, setWeights] = useState<number[]>([]);
  const [styles, setStyles] = useState<Style[]>(["normal"]);
  const [variable, setVariable] = useState(false);
  const [display, setDisplay] = useState("swap");
  const [subsets, setSubsets] = useState<string[]>([]);

  // Variantes reais = união das origens que sustentam o CDN escolhido.
  const real = useMemo(() => {
    const srcs = detail.sources.filter((s) =>
      cdn === "fontsource" ? s.providerId === "fontsource" : cdn === "self_hosted" ? true : s.providerId === "google" || s.origin === "google");
    const ws = new Set<number>(); const st = new Set<Style>();
    srcs.forEach((s) => s.variants.forEach((v) => { ws.add(v.weight); st.add(v.style); }));
    return { weights: [...ws].sort((a, b) => a - b), styles: [...st], variable: srcs.some((s) => s.variable), subsets: [...new Set(srcs.flatMap((s) => s.subsets))] };
  }, [detail, cdn]);

  useEffect(() => {
    setWeights((w) => { const keep = w.filter((x) => real.weights.includes(x)); return keep.length ? keep : real.weights.includes(400) ? [400] : real.weights.slice(0, 1); });
    setStyles((s) => { const keep = s.filter((x) => real.styles.includes(x)); return keep.length ? keep : ["normal"]; });
    if (!real.variable) setVariable(false);
  }, [real]);

  const req: CssRequest = { cdn, weights, styles, variable, display, subsets };
  const out = useQuery({
    queryKey: ["css", detail.summary.key, req],
    queryFn: () => api.generateCss(detail.summary.key, req),
    enabled: weights.length > 0,
    retry: false,
  });

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-[12px] text-label-2">Provedor / CDN
          <Select className="flex w-full" value={cdn} onChange={(e) => setCdn(e.target.value as Cdn)}>
            {available.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </label>
        <label className="space-y-1 text-[12px] text-label-2">font-display
          <Select className="flex w-full" value={display} onChange={(e) => setDisplay(e.target.value)}>
            {DISPLAYS.map((d) => <option key={d}>{d}</option>)}
          </Select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-[12px] text-label-2">Pesos disponíveis ({real.weights.length})</legend>
        <div className="flex flex-wrap gap-1.5">
          {real.weights.map((w) => (
            <button key={w} aria-pressed={weights.includes(w)} onClick={() => toggle(weights, w, setWeights)}
              className={cn("rounded-[6px] px-2 py-1 text-[12px] shadow-control", weights.includes(w) ? "bg-accent text-accent-contrast" : "bg-control hover:bg-fill-2")}>
              {w} <span className="opacity-70">{weightName(w)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4 text-[13px]">
        {(["normal", "italic"] as Style[]).map((s) => (
          <label key={s} className={cn("flex items-center gap-1.5", !real.styles.includes(s) && "opacity-40")}>
            <input type="checkbox" disabled={!real.styles.includes(s)} checked={styles.includes(s)} onChange={() => toggle(styles, s, setStyles)} />
            {s === "normal" ? "Normal" : "Itálico"}
          </label>
        ))}
        <label className={cn("flex items-center gap-1.5", !real.variable && "opacity-40")}>
          <input type="checkbox" disabled={!real.variable} checked={variable} onChange={(e) => setVariable(e.target.checked)} />
          Fonte variável
        </label>
      </div>

      {real.subsets.length > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-[12px] text-label-2">Subsets {cdn === "fontsource" ? "" : "(o Google/Bunny aplicam unicode-range automaticamente)"}</legend>
          <div className="flex flex-wrap gap-1.5">
            {real.subsets.map((s) => (
              <button key={s} aria-pressed={subsets.includes(s)} onClick={() => toggle(subsets, s, setSubsets)}
                className={cn("rounded-[6px] px-2 py-0.5 text-[12px] shadow-control", subsets.includes(s) ? "bg-accent text-accent-contrast" : "bg-control hover:bg-fill-2")}>{s}</button>
            ))}
          </div>
        </fieldset>
      )}

      {out.isError && <p role="alert" className="rounded-[10px] bg-red/10 p-3 text-[13px] text-red">{(out.error as Error).message}</p>}
      {out.data && (
        <div className="space-y-3">
          {out.data.notes.map((n) => <p key={n} className="text-[11px] text-label-2">{n}</p>)}
          {out.data.linkHtml && <CodeBlock title="Link HTML" code={out.data.linkHtml} />}
          {out.data.importCss && <CodeBlock title="CSS com @import" code={out.data.importCss} />}
          <CodeBlock title="Regra font-family" code={out.data.fontFamilyRule} />
          {out.data.fontFaceCss && <CodeBlock title="Regras @font-face" code={out.data.fontFaceCss} />}
          <CodeBlock title="React" code={out.data.react} />
          <CodeBlock title="Next.js" code={out.data.nextjs} />
          {cdn === "self_hosted" && (
            <Button variant="push" onClick={async () => {
              const dest = await pickFolder();
              if (!dest) { useToasts.getState().push({ tone: "info", text: "Escolha uma pasta no aplicativo desktop para exportar." }); return; }
              try {
                const files = await api.exportSelfHosted(detail.summary.key, req, dest);
                useToasts.getState().push({ tone: "success", text: `${files.length} arquivo(s) exportados para ${dest}` });
              } catch (e) { useToasts.getState().push({ tone: "error", text: (e as Error).message }); }
            }}><FolderDown /> Exportar arquivos e fonts.css</Button>
          )}
        </div>
      )}
    </div>
  );
}
