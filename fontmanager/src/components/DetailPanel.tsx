import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { weightName, cn } from "@/lib/utils";
import type { FamilyDetail } from "@/lib/types";
import { ActivationButton } from "./ActivationButton";
import { phaseLabel } from "./phaseLabel";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useFontPreview } from "./useFontPreview";
import { CharGrid } from "./CharGrid";
import { WebTab } from "./WebTab";
import { CollectionsDialog } from "./CollectionsDialog";
import { ensurePreview } from "@/lib/fontLoader";

function VariantLine({ d, weight, italic, text, size }: { d: FamilyDetail; weight: number; italic: boolean; text: string; size: number }) {
  const { style, ready } = useFontPreview(d.summary, weight, italic);
  return (
    <div className="border-b py-2">
      <div className="mb-0.5 text-[11px] text-muted-foreground">{weight} · {weightName(weight)}{italic ? " Itálico" : ""}</div>
      <div className={cn("break-words leading-tight", !ready && "opacity-40")} style={{ ...style, fontSize: size }}>{text}</div>
    </div>
  );
}

function VariableTester({ d, text, size }: { d: FamilyDetail; text: string; size: number }) {
  const axis = d.sources.flatMap((s) => s.axes).find((a) => a.tag === "wght");
  const [w, setW] = useState(400);
  const range: [number, number] = axis ? [axis.min, axis.max] : [d.summary.weights[0] ?? 100, d.summary.weights.at(-1) ?? 900];
  const { style, ready } = useFontPreview(d.summary, w, false, range);
  return (
    <div className="rounded-md border bg-card p-3">
      <label className="flex items-center gap-3 text-xs font-medium">
        Eixo wght: <span className="tabular-nums">{w}</span>
        <input type="range" min={range[0]} max={range[1]} value={Math.min(Math.max(w, range[0]), range[1])} onChange={(e) => setW(+e.target.value)} className="flex-1" aria-label="Peso (eixo wght)" />
      </label>
      <div className={cn("mt-2 break-words leading-tight", !ready && "opacity-40")} style={{ ...style, fontSize: size }}>{text}</div>
      {!ready && <p className="mt-1 text-[11px] text-muted-foreground">Prévia variável requer o CDN do Google ou o arquivo em cache.</p>}
    </div>
  );
}

function SystemTab({ d }: { d: FamilyDetail }) {
  const phase = useUi((s) => s.phases[d.summary.key]);
  const [vis, setVis] = useState<boolean | null | undefined>(undefined);
  const active = d.summary.state === "active" || d.summary.state === "partial";
  return (
    <div className="space-y-3 text-sm">
      <ol className="space-y-2">
        <li className="flex gap-2"><Badge tone={active ? "success" : "neutral"}>1</Badge><div><b>Registrada no sistema operacional</b><div className="text-xs text-muted-foreground">{active ? "Sim — o SO aceitou o registro." : d.summary.state === "system" ? "Já estava instalada (não gerenciada por este app)." : "Não registrada."}</div></div></li>
        <li className="flex gap-2"><Badge tone={active ? "success" : "neutral"}>2</Badge><div><b>Aplicativos notificados</b><div className="text-xs text-muted-foreground">{active ? "Notificação oficial do sistema emitida no registro (Windows: WM_FONTCHANGE; macOS: Core Text)." : "—"}</div></div></li>
        <li className="flex gap-2"><Badge tone="warning">3</Badge><div><b>Reconhecida pelo aplicativo</b><div className="text-xs text-muted-foreground">Não verificável automaticamente: o sistema não informa se Photoshop, Illustrator, Figma ou Word já enxergam a fonte. {active && "Confira no próprio aplicativo; se não aparecer, atualize a lista de fontes dele ou reinicie-o."}</div></div></li>
      </ol>
      {phase && <p className="text-xs"><b>Última etapa:</b> {phaseLabel(phase)}{phase.phase === "error" && ` — ${phase.message}`}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={!active} onClick={async () => setVis(await api.checkVisibility(d.summary.name))}>Verificar em processo novo</Button>
        {vis !== undefined && <span className="text-xs">{vis === null ? "Não foi possível verificar neste sistema." : vis ? "✓ Um processo novo enxerga a família." : "✗ Um processo novo não enxerga a família."}</span>}
      </div>
      <p className="text-xs text-muted-foreground">Essa verificação consulta o SO a partir de um processo separado; ela não prova que um aplicativo já aberto recarregou sua lista.</p>
    </div>
  );
}

export function DetailPanel() {
  const key = useUi((s) => s.selected)!;
  const set = useUi((s) => s.set);
  const { previewText, previewSize } = useUi();
  const [colOpen, setColOpen] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["detail", key], queryFn: () => api.familyDetail(key) });
  const d = q.data;

  useEffect(() => { if (d) ensurePreview(d.summary, 400, false); }, [d]);

  if (q.isError) return <aside className="p-4 text-sm text-danger">{(q.error as Error).message}</aside>;
  if (!d) return <aside className="p-4 text-sm text-muted-foreground">Carregando…</aside>;
  const f = d.summary;
  const variants = [...new Map(d.sources.flatMap((s) => s.variants).map((v) => [`${v.weight}${v.style}`, v])).values()].sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));

  return (
    <aside className="flex h-full flex-col overflow-hidden" aria-label={`Detalhes de ${f.name}`}>
      <header className="flex items-start gap-2 border-b p-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{f.name}</h2>
          <div className="mt-1 flex flex-wrap gap-1">
            {f.category && <Badge>{f.category}</Badge>}
            {f.license && <Badge>{f.license}</Badge>}
            {f.variable && <Badge tone="primary">Variável</Badge>}
            {f.providers.map((p) => <Badge key={p}>{p}</Badge>)}
          </div>
        </div>
        <Button size="icon" variant="ghost" aria-label="Fechar detalhes" onClick={() => set("selected", null)}><X /></Button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <ActivationButton f={f} />
        <Button size="sm" variant="ghost" aria-pressed={f.favorite} onClick={async () => { await api.setFavorite(f.key, !f.favorite); qc.invalidateQueries(); }}>
          <Star className={cn(f.favorite && "fill-current text-warning")} /> Favorito
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setColOpen(true)}><FolderPlus /> Coleções{d.collections.length > 0 && ` (${d.collections.length})`}</Button>
      </div>
      <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-3" aria-label="Seções">
          <TabsTrigger value="preview">Prévia</TabsTrigger>
          <TabsTrigger value="chars">Caracteres</TabsTrigger>
          <TabsTrigger value="web">Usar na Web</TabsTrigger>
          <TabsTrigger value="sources">Origens</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
        </TabsList>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
          <TabsContent value="preview">
            {f.variable && <div className="mb-3"><VariableTester d={d} text={previewText || f.name} size={previewSize} /></div>}
            {variants.map((v) => <VariantLine key={`${v.weight}${v.style}`} d={d} weight={v.weight} italic={v.style === "italic"} text={previewText || f.name} size={previewSize} />)}
          </TabsContent>
          <TabsContent value="chars"><CharGridFor d={d} /></TabsContent>
          <TabsContent value="web"><WebTab detail={d} /></TabsContent>
          <TabsContent value="sources">
            <div className="space-y-3">
              {d.sources.map((s) => (
                <div key={s.providerId} className="rounded-md border bg-card p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2 font-medium">{s.providerId}{s.origin && <Badge>origem: {s.origin}</Badge>}</div>
                  <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-xs">
                    <dt className="text-muted-foreground">ID no provedor</dt><dd>{s.providerFamilyId}</dd>
                    <dt className="text-muted-foreground">Versão</dt><dd>{s.version ?? "—"}</dd>
                    <dt className="text-muted-foreground">Licença</dt><dd>{s.license ?? "não informada"}{s.licenseUrl && ` (${s.licenseUrl})`}</dd>
                    <dt className="text-muted-foreground">Atualizada</dt><dd>{s.lastModified ?? "—"}</dd>
                    <dt className="text-muted-foreground">Subsets</dt><dd>{s.subsets.join(", ") || "—"}</dd>
                    <dt className="text-muted-foreground">Variantes</dt><dd>{s.variants.map((v) => `${v.weight}${v.style === "italic" ? "i" : ""}`).join(" ") || "—"}</dd>
                    <dt className="text-muted-foreground">Eixos</dt><dd>{s.axes.map((a) => `${a.tag} ${a.min}–${a.max}`).join(", ") || (s.variable ? "variável (eixos não informados)" : "estática")}</dd>
                  </dl>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="system"><SystemTab d={d} /></TabsContent>
        </div>
      </Tabs>
      <CollectionsDialog open={colOpen} onOpenChange={setColOpen} familyKey={f.key} member={d.collections} />
    </aside>
  );
}

function CharGridFor({ d }: { d: FamilyDetail }) {
  const { style } = useFontPreview(d.summary, 400, false);
  return <CharGrid fontStyle={{ ...style, fontSize: 22 }} />;
}
