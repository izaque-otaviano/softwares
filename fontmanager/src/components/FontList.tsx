import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { GitCompare, Star } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUi } from "@/store/ui";
import type { CatalogQuery, FamilySummary } from "@/lib/types";
import { ActivationButton } from "./ActivationButton";
import { Badge } from "./ui/badge";
import { useFontPreview } from "./useFontPreview";

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
      view: s.view === "all" ? undefined : s.view === "collection" ? "collection" : s.view,
      collectionId: s.view === "collection" ? (s.collectionId ?? undefined) : undefined,
    }),
    [s.search, s.category, s.provider, s.variableOnly, s.italicOnly, s.view, s.collectionId],
  );
}

function Row({ f, grid }: { f: FamilySummary; grid: boolean }) {
  const { previewText, previewSize, previewWeight, previewItalic, selected, compare } = useUi();
  const set = useUi((s) => s.set);
  const toggleCompare = useUi((s) => s.toggleCompare);
  const qc = useQueryClient();
  const { style, ready } = useFontPreview(f, previewWeight, previewItalic);
  const isSel = selected === f.key;

  return (
    <div
      role="option"
      aria-selected={isSel}
      tabIndex={-1}
      onClick={() => set("selected", f.key)}
      className={cn(
        "group flex h-full cursor-default flex-col gap-1 border-b px-4 py-2.5 hover:bg-muted/60",
        grid && "rounded-lg border bg-card",
        isSel && "bg-accent hover:bg-accent",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-[4ch] shrink truncate text-sm font-semibold" title={f.name}>{f.name}</span>
        {!grid && <Badge className="hidden sm:inline-flex">{f.weights.length} {f.weights.length === 1 ? "estilo" : "pesos"}</Badge>}
        {f.variable && <Badge tone="primary">Variável</Badge>}
        {!grid && f.providers.length > 1 && <Badge title={f.providers.join(", ")}>{f.providers.length} fontes</Badge>}
        <span className="ml-auto flex items-center gap-1.5">
          <button
            aria-label={compare.includes(f.key) ? "Remover da comparação" : "Comparar"}
            aria-pressed={compare.includes(f.key)}
            onClick={(e) => { e.stopPropagation(); toggleCompare(f.key); }}
            className={cn("rounded p-1 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus:opacity-100", compare.includes(f.key) && "text-primary opacity-100")}
          >
            <GitCompare className="size-4" />
          </button>
          <button
            aria-label={f.favorite ? "Remover dos favoritos" : "Favoritar"}
            aria-pressed={f.favorite}
            onClick={async (e) => { e.stopPropagation(); await api.setFavorite(f.key, !f.favorite); qc.invalidateQueries({ queryKey: ["catalog"] }); }}
            className={cn("rounded p-1 text-muted-foreground hover:bg-muted", f.favorite && "text-warning")}
          >
            <Star className={cn("size-4", f.favorite && "fill-current")} />
          </button>
          <ActivationButton f={f} compact={grid} />
        </span>
      </div>
      <div
        className={cn("truncate leading-tight transition-opacity", !ready && "opacity-40")}
        style={{ ...style, fontSize: previewSize }}
        aria-hidden={!ready}
      >
        {previewText || f.name}
      </div>
    </div>
  );
}

export function FontList() {
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
  const grid = layout === "grid";
  const cols = grid ? Math.max(1, Math.floor(width / 320)) : 1;
  const rowH = Math.max(grid ? 120 : 84, Math.round(previewSize * 1.3) + 54);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const rows = Math.ceil(total / cols);
  const v = useVirtualizer({ count: rows, getScrollElement: () => scroller.current, estimateSize: () => rowH, overscan: 6 });

  // Carregamento progressivo: ao chegar perto do fim do que já foi carregado, busca a próxima página.
  const vis = v.getVirtualItems();
  const lastVisible = vis.length ? vis[vis.length - 1].index : 0;
  useEffect(() => {
    if ((lastVisible + 3) * cols >= items.length && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [lastVisible, cols, items.length, q]);

  // Navegação por teclado (↑/↓) entre os itens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp"].includes(e.key)) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      e.preventDefault();
      const idx = items.findIndex((i) => i.key === selected);
      const next = Math.min(items.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? cols : -cols)));
      if (items[next]) {
        set("selected", items[next].key);
        v.scrollToIndex(Math.floor(next / cols));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selected, cols, set, v]);

  if (q.isError) return <div className="p-6 text-sm text-danger">Erro ao carregar o catálogo: {(q.error as Error).message}</div>;
  if (!q.isLoading && total === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center text-muted-foreground">
        <p className="font-medium text-foreground">Nenhuma família encontrada</p>
        <p className="text-sm">Ajuste a busca ou os filtros. Se o catálogo estiver vazio, sincronize em “Provedores”.</p>
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
              ...(grid ? { display: "grid", gap: 12, padding: "6px 12px", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : {}),
            }}
          >
            {Array.from({ length: cols }, (_, c) => {
              const f = items[vr.index * cols + c];
              if (vr.index * cols + c >= total) return null;
              return f ? <Row key={f.key} f={f} grid={grid} /> : <div key={c} className="m-1 animate-pulse rounded bg-muted/60" aria-hidden />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
