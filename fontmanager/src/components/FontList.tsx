import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GitCompare, Lock, Star } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUi, DEFAULT_TEXT } from "@/store/ui";
import type { CatalogQuery, FamilySummary } from "@/lib/types";
import { ActivateButton, DownloadButton } from "./ActivationButton";
import { useFontPreview } from "./useFontPreview";
import { RemotePreview } from "./RemotePreview";

const PAGE = 80;

export function useCatalogFilters(): Omit<CatalogQuery, "offset" | "limit"> {
  const s = useUi();
  return useMemo(
    () => ({
      text: s.search || undefined,
      category: s.category || undefined,
      provider: s.provider || undefined,
      variableOnly: s.variableOnly,
      italicOnly: s.italicOnly,
      view: s.view === "all" ? undefined : s.view,
      collectionId: s.view === "collection" ? (s.collectionId ?? undefined) : undefined,
    }),
    [s.search, s.category, s.provider, s.variableOnly, s.italicOnly, s.view, s.collectionId],
  );
}

/** Indicador no canto, como em gerenciadores do macOS: ponto verde = ativa; cadeado = do sistema. */
function StateMark({ f }: { f: FamilySummary }) {
  if (f.state === "active" || f.state === "partial") return <span className="size-2 shrink-0 rounded-full bg-green" title="Ativa no sistema" aria-label="Ativa" role="img" />;
  if (f.state === "system") return <Lock className="size-3 shrink-0 text-accent" aria-label="Instalada no sistema" />;
  return null;
}

function Actions({ f }: { f: FamilySummary }) {
  const compare = useUi((s) => s.compare);
  const toggleCompare = useUi((s) => s.toggleCompare);
  const qc = useQueryClient();
  const inCompare = compare.includes(f.key);
  return (
    <div className="flex items-center gap-0.5">
      <button
        aria-label={inCompare ? `Remover ${f.name} da comparação` : `Comparar ${f.name}`}
        aria-pressed={inCompare}
        title="Comparar"
        onClick={(e) => { e.stopPropagation(); toggleCompare(f.key); }}
        className={cn("inline-flex size-6 items-center justify-center rounded-[5px] text-label-3 opacity-0 hover:bg-fill-2 hover:text-label-2 group-hover:opacity-100 focus-visible:opacity-100", inCompare && "text-accent opacity-100")}
      >
        <GitCompare className="size-[14px]" />
      </button>
      <button
        aria-label={f.favorite ? `Remover ${f.name} das favoritas` : `Favoritar ${f.name}`}
        aria-pressed={f.favorite}
        title={f.favorite ? "Favorita" : "Favoritar"}
        onClick={async (e) => { e.stopPropagation(); await api.setFavorite(f.key, !f.favorite); qc.invalidateQueries({ queryKey: ["catalog"] }); }}
        className={cn("inline-flex size-6 items-center justify-center rounded-[5px] text-label-3 opacity-0 hover:bg-fill-2 hover:text-label-2 group-hover:opacity-100 focus-visible:opacity-100", f.favorite && "text-orange opacity-100")}
      >
        <Star className={cn("size-[14px]", f.favorite && "fill-current")} />
      </button>
      <DownloadButton f={f} />
      <span className="ml-1"><ActivateButton f={f} /></span>
    </div>
  );
}

function Card({ f, grid }: { f: FamilySummary; grid: boolean }) {
  const { previewText, previewSize, previewWeight, previewItalic, selected } = useUi();
  const set = useUi((s) => s.set);
  const { style, ready } = useFontPreview(f, previewWeight, previewItalic);
  const isSel = selected === f.key;
  // Na grade, o texto padrão vira o espécime curto clássico.
  const text = grid && previewText === DEFAULT_TEXT ? "AaBbGg" : previewText || f.name;
  const count = f.weights.length * (f.hasItalic ? 2 : 1);
  // Sem CDN de fontes e ainda não baixada: mostra a imagem oficial do provedor.
  const imagePreview = f.previewCdn === "fontsquirrel" && !f.cached;

  if (grid)
    return (
      <div
        role="option"
        aria-selected={isSel}
        tabIndex={-1}
        onClick={() => set("selected", f.key)}
        className={cn(
          "group relative flex h-full flex-col overflow-hidden rounded-[10px] bg-card ring-1 ring-separator",
          isSel && "ring-2 ring-accent",
        )}
      >
        <div className="flex items-center gap-1.5 px-3 pt-2.5">
          <StateMark f={f} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-label-2" title={f.name}>{f.name}</span>
          {count > 0 && <span className="tabular text-[12px] text-label-3" title={`${count} estilos`}>{count}</span>}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3" aria-hidden={!ready && !imagePreview}>
          {imagePreview ? <RemotePreview f={f} height={previewSize} className="object-center" /> : <span className={cn("truncate leading-none transition-opacity duration-300", !ready && "text-label-3 opacity-40")} style={{ ...style, fontSize: previewSize }}>{text}</span>}
        </div>
        <div className="flex items-center justify-end px-2 pb-2">
          {f.variable && <span className="mr-auto pl-1 text-[11px] text-label-3">Variável</span>}
          <Actions f={f} />
        </div>
      </div>
    );

  return (
    <div
      role="option"
      aria-selected={isSel}
      tabIndex={-1}
      onClick={() => set("selected", f.key)}
      className={cn("group flex h-full items-center gap-4 border-b border-separator px-4", isSel ? "bg-accent/10" : "hover:bg-fill-2")}
    >
      <div className="w-44 shrink-0">
        <div className="flex items-center gap-1.5"><StateMark f={f} /><span className="truncate text-[13px] font-medium" title={f.name}>{f.name}</span></div>
        <div className="mt-0.5 text-[11px] text-label-2">{count} {count === 1 ? "estilo" : "estilos"}{f.variable && ", variável"}</div>
      </div>
      {imagePreview ? (
        <div className="min-w-0 flex-1"><RemotePreview f={f} height={previewSize} /></div>
      ) : (
        <div className={cn("min-w-0 flex-1 truncate leading-tight transition-opacity duration-300", !ready && "text-label-3 opacity-40")} style={{ ...style, fontSize: previewSize }} aria-hidden={!ready}>
          {text}
        </div>
      )}
      <Actions f={f} />
    </div>
  );
}

export function FontList({ onCount }: { onCount?: (n: number) => void }) {
  const filters = useCatalogFilters();
  const layout = useUi((s) => s.layout);
  const previewSize = useUi((s) => s.previewSize);
  const selected = useUi((s) => s.selected);
  const set = useUi((s) => s.set);
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  const q = useInfiniteQuery({
    queryKey: ["catalog", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.queryCatalog({ ...filters, offset: pageParam, limit: PAGE }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: (prev) => prev,
  });

  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total ?? 0;
  useEffect(() => onCount?.(total), [total, onCount]);
  const grid = layout === "grid";
  const GAP = 12;
  const cols = grid ? Math.max(1, Math.floor((width - 24 + GAP) / (260 + GAP))) : 1;
  const rowH = grid ? Math.max(150, Math.round(previewSize * 1.25) + 100) + GAP : Math.max(64, Math.round(previewSize * 1.3) + 24);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const rows = Math.ceil(total / cols);
  const v = useVirtualizer({ count: rows, getScrollElement: () => scroller.current, estimateSize: () => rowH, overscan: 4, paddingStart: grid ? GAP : 0, paddingEnd: GAP });
  useEffect(() => { v.measure(); }, [rowH, cols, v]);

  const vis = v.getVirtualItems();
  const lastVisible = vis.length ? vis[vis.length - 1].index : 0;
  useEffect(() => {
    if ((lastVisible + 3) * cols >= items.length && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [lastVisible, cols, items.length, q]);

  // ↑/↓ (lista) e ←/→/↑/↓ (grade) navegam entre os itens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const step = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: grid ? 1 : 0, ArrowLeft: grid ? -1 : 0 }[e.key];
      if (!step) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || t.closest("[role=tablist],[role=radiogroup]")) return;
      e.preventDefault();
      const idx = items.findIndex((i) => i.key === selected);
      const next = Math.min(items.length - 1, Math.max(0, idx < 0 ? 0 : idx + step));
      if (items[next]) {
        set("selected", items[next].key);
        v.scrollToIndex(Math.floor(next / cols));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, cols, grid, set, v]);

  if (q.isError) return <div className="p-6 text-[13px] text-red">Não foi possível carregar o catálogo: {(q.error as Error).message}</div>;
  if (!q.isLoading && total === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
        <p className="text-[17px] font-semibold text-label-2">Nenhuma fonte</p>
        <p className="max-w-xs text-[13px] text-label-3">Mude a busca ou os filtros. Catálogo vazio? Sincronize em Gerenciar provedores.</p>
      </div>
    );

  return (
    <div ref={scroller} className="h-full overflow-auto" role="listbox" aria-label="Famílias de fontes" aria-busy={q.isFetching}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {vis.map((vr) => (
          <div
            key={vr.key}
            style={{
              position: "absolute", top: 0, left: 0, width: "100%", height: vr.size, transform: `translateY(${vr.start}px)`,
              ...(grid ? { display: "grid", gap: GAP, padding: `0 12px ${GAP}px`, gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : {}),
            }}
          >
            {Array.from({ length: cols }, (_, c) => {
              const i = vr.index * cols + c;
              if (i >= total) return null;
              const f = items[i];
              return f ? <Card key={f.key} f={f} grid={grid} /> : <div key={c} className={cn("bg-fill-2", grid ? "rounded-[10px]" : "border-b border-separator")} aria-hidden />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
