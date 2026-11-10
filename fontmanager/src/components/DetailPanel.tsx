import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { weightName, cn } from "@/lib/utils";
import type { FamilyDetail } from "@/lib/types";
import { ActivateButton, DownloadButton } from "./ActivationButton";
import { phaseLabel } from "./phaseLabel";
import { Button } from "./ui/button";
import { Group, GroupRow } from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useFontPreview } from "./useFontPreview";
import { CharGrid } from "./CharGrid";
import { WebTab } from "./WebTab";
import { CollectionsDialog } from "./CollectionsDialog";
import { CATEGORY } from "./TopBar";
import { RemotePreview } from "./RemotePreview";
import { providerName } from "@/lib/utils";

function VariantLine({ d, weight, italic, text, size }: { d: FamilyDetail; weight: number; italic: boolean; text: string; size: number }) {
  const { style, ready } = useFontPreview(d.summary, weight, italic);
  return (
    <div className="py-2.5">
      <div className="mb-1 text-[11px] text-label-2">{weightName(weight)}{italic ? " Itálico" : ""} <span className="tabular text-label-3">{weight}</span></div>
      <div className={cn("break-words leading-tight transition-opacity duration-300", !ready && "opacity-0")} style={{ ...style, fontSize: size }}>{text}</div>
    </div>
  );
}

function VariableTester({ d, text, size }: { d: FamilyDetail; text: string; size: number }) {
  const axis = d.sources.flatMap((s) => s.axes).find((a) => a.tag === "wght");
  const range: [number, number] = axis ? [axis.min, axis.max] : [d.summary.weights[0] ?? 100, d.summary.weights.at(-1) ?? 900];
  const [w, setW] = useState(Math.min(Math.max(400, range[0]), range[1]));
  const { style, ready } = useFontPreview(d.summary, w, false, range);
  return (
    <div className="mb-3 rounded-[10px] bg-fill-2 p-3 ring-[0.5px] ring-separator">
      <label className="flex items-center gap-3 text-[12px]">
        <span className="text-label-2">Peso variável</span>
        <input type="range" min={range[0]} max={range[1]} value={w} onChange={(e) => setW(+e.target.value)} className="flex-1" aria-label="Eixo de peso (wght)" />
        <span className="tabular w-8 text-right">{w}</span>
      </label>
      <div className={cn("mt-2 break-words leading-tight transition-opacity duration-300", !ready && "opacity-0")} style={{ ...style, fontSize: size }}>{text}</div>
      {!ready && <p className="mt-1 text-[11px] text-label-2">A prévia variável precisa do CDN do Google ou do arquivo baixado.</p>}
    </div>
  );
}

function SystemTab({ d }: { d: FamilyDetail }) {
  const phase = useUi((s) => s.phases[d.summary.key]);
  const [vis, setVis] = useState<boolean | null | undefined>(undefined);
  const active = d.summary.state === "active" || d.summary.state === "partial";
  const dot = (on: boolean | "warn") => <span className={cn("mt-1 size-2 shrink-0 rounded-full", on === "warn" ? "bg-orange" : on ? "bg-green" : "bg-label-3")} />;
  return (
    <div className="space-y-4">
      <Group title="Estado da ativação" footer="Nenhuma API pública informa se Photoshop, Illustrator, Figma ou Word já recarregaram a lista de fontes. Confira no aplicativo; se a fonte não aparecer, recarregue a lista dele ou reinicie-o.">
        <div className="flex gap-2.5 px-3 py-2.5">{dot(active)}<div><div className="text-[13px]">Registrada no sistema</div><div className="text-[11px] text-label-2">{active ? "O sistema aceitou o registro." : d.summary.state === "system" ? "Já estava instalada. Este app não a altera." : "Não registrada."}</div></div></div>
        <div className="flex gap-2.5 px-3 py-2.5">{dot(active)}<div><div className="text-[13px]">Aplicativos notificados</div><div className="text-[11px] text-label-2">{active ? "Aviso oficial de mudança de fontes enviado (Windows: WM_FONTCHANGE; macOS: Core Text)." : "Nenhum aviso enviado."}</div></div></div>
        <div className="flex gap-2.5 px-3 py-2.5">{dot(active ? "warn" : false)}<div><div className="text-[13px]">Reconhecida pelo aplicativo</div><div className="text-[11px] text-label-2">{active ? "Aguardando atualização do aplicativo. Não dá para confirmar automaticamente." : "—"}</div></div></div>
      </Group>
      {phase && <p className="px-2 text-[12px] text-label-2">Última etapa: {phaseLabel(phase)}{phase.phase === "error" && `. ${phase.message}`}</p>}
      <Group footer="A verificação roda num processo novo. Ela não prova que um app já aberto recarregou a lista.">
        <GroupRow title="Visível para novos processos" desc={vis === undefined ? "Consulta o sistema agora." : vis === null ? "Não foi possível verificar neste sistema." : vis ? "Sim, o sistema lista esta família." : "Não, o sistema não lista esta família."}>
          <Button disabled={!active} onClick={async () => setVis(await api.checkVisibility(d.summary.name))}>Verificar</Button>
        </GroupRow>
      </Group>
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

  if (q.isError) return <aside className="p-4 text-[13px] text-red">{(q.error as Error).message}</aside>;
  if (!d) return <aside className="p-4 text-[13px] text-label-2">Carregando…</aside>;
  const f = d.summary;
  const variants = [...new Map(d.sources.flatMap((s) => s.variants).map((v) => [`${v.weight}${v.style}`, v])).values()].sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));
  const size = Math.min(previewSize, 56);
  const meta = [f.category && (CATEGORY[f.category] ?? f.category), variants.length > 0 && `${variants.length} ${variants.length === 1 ? "estilo" : "estilos"}`, f.license ?? (f.providers.includes("fontsquirrel") ? "licença conhecida ao baixar" : null)].filter(Boolean).join(", ");
  const imagePreview = f.previewCdn === "fontsquirrel" && !f.cached;

  return (
    <aside className="flex h-full flex-col overflow-hidden bg-window" aria-label={`Detalhes de ${f.name}`}>
      <header className="px-5 pb-4 pt-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.01em]" data-selectable>{f.name}</h2>
            <p className="mt-0.5 text-[12px] text-label-2">{meta}</p>
            <p className="mt-0.5 text-[11px] text-label-3">De {f.providers.map(providerName).join(" e ")}{f.variable ? ". Fonte variável" : ""}</p>
          </div>
          <Button variant="plain" size="icon-sm" aria-label="Fechar detalhes" onClick={() => set("selected", null)}><X /></Button>
        </div>
        <div className="mt-4 flex items-center gap-1">
          <ActivateButton f={f} size="lg" showPhase />
          <DownloadButton f={f} size="icon" />
          <span className="flex-1" />
          <Button variant="plain" size="icon" aria-pressed={f.favorite} aria-label={f.favorite ? "Remover das favoritas" : "Favoritar"} title={f.favorite ? "Favorita" : "Favoritar"}
            onClick={async () => { await api.setFavorite(f.key, !f.favorite); qc.invalidateQueries(); }}>
            <Star className={cn(f.favorite && "fill-current text-orange")} />
          </Button>
          <Button variant="plain" size="icon" aria-label="Adicionar a coleções" title={`Coleções${d.collections.length ? ` (${d.collections.length})` : ""}`} onClick={() => setColOpen(true)}><FolderPlus /></Button>
        </div>
      </header>
      <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col">
        <div className="flex justify-center border-b border-separator px-4 pb-3">
          <TabsList aria-label="Seções">
            <TabsTrigger value="preview">Prévia</TabsTrigger>
            <TabsTrigger value="chars">Caracteres</TabsTrigger>
            <TabsTrigger value="web">Web</TabsTrigger>
            <TabsTrigger value="sources">Origens</TabsTrigger>
            <TabsTrigger value="system">Sistema</TabsTrigger>
          </TabsList>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-8">
          <TabsContent value="preview">
            {imagePreview && (
              <div className="mb-3 rounded-[10px] bg-fill-2 p-3 ring-[0.5px] ring-separator">
                <RemotePreview f={f} height={34} />
                <p className="mt-2 text-[11px] text-label-2">Amostra em imagem do Font Squirrel. Baixe a fonte para testar o seu texto.</p>
              </div>
            )}
            {!imagePreview && f.variable && <VariableTester d={d} text={previewText || f.name} size={size} />}
            <div className="divide-y divide-separator">
              {!imagePreview && variants.map((v) => <VariantLine key={`${v.weight}${v.style}`} d={d} weight={v.weight} italic={v.style === "italic"} text={previewText || f.name} size={size} />)}
            </div>
          </TabsContent>
          <TabsContent value="chars"><CharGridFor d={d} /></TabsContent>
          <TabsContent value="web"><WebTab detail={d} /></TabsContent>
          <TabsContent value="sources">
            <div className="space-y-4">
              {d.sources.map((s) => (
                <Group key={s.providerId} title={providerName(s.providerId)}>
                  <GroupRow title="Identificador"><span className="text-label-2" data-selectable>{s.providerFamilyId}</span></GroupRow>
                  <GroupRow title="Versão"><span className="text-label-2">{s.version ?? "Não informada"}</span></GroupRow>
                  <GroupRow title="Licença" desc={s.licenseUrl ?? undefined}><span className="text-label-2">{s.license ?? (s.providerId === "fontsquirrel" ? "Conhecida ao baixar" : "Não informada")}</span></GroupRow>
                  {s.origin && <GroupRow title={s.providerId === "fontsquirrel" ? "Fundição" : "Origem"}><span className="text-label-2">{s.origin}</span></GroupRow>}
                  <GroupRow title="Atualizada"><span className="text-label-2">{s.lastModified ?? "—"}</span></GroupRow>
                  <GroupRow title="Subsets" desc={s.subsets.join(", ") || "—"} />
                  <GroupRow title="Variantes" desc={s.variants.map((v) => `${v.weight}${v.style === "italic" ? " itálico" : ""}`).join(", ") || "—"} />
                  <GroupRow title="Eixos" desc={s.axes.map((a) => `${a.tag} de ${a.min} a ${a.max}`).join(", ") || (s.variable ? "Variável, eixos não informados" : "Fonte estática")} />
                </Group>
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
