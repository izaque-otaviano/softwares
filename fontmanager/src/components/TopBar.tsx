import { forwardRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, LayoutGrid, List, PanelLeft, Search, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useUi, DEFAULT_TEXT } from "@/store/ui";
import { cn, WEIGHT_NAMES } from "@/lib/utils";
import { Input, Select } from "./ui/input";
import { Button, Segmented } from "./ui/button";

const TITLES: Record<string, string> = {
  providers: "Provedores", settings: "Configurações",
  all: "Todas as fontes", active: "Ativas", cached: "Baixadas", favorites: "Favoritas", local: "Instaladas no sistema",
};

/** Campo de busca do macOS (NSSearchField). */
export const SearchBox = forwardRef<HTMLInputElement, { className?: string }>(({ className }, ref) => {
  const search = useUi((s) => s.search);
  const set = useUi((s) => s.set);
  const [text, setText] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => set("search", text), 200); // debounce
    return () => clearTimeout(t);
  }, [text, set]);
  useEffect(() => setText(search), [search]);
  return (
    <div className={cn("relative w-56", className)}>
      <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-label-2" />
      <Input ref={ref} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar" aria-label="Buscar famílias (Ctrl/⌘ K)" className="rounded-[7px] bg-fill pl-7 pr-7 shadow-none [&::-webkit-search-cancel-button]:hidden" />
      {text && <button aria-label="Limpar busca" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-label-3 hover:text-label-2" onClick={() => setText("")}><XCircle className="size-3.5 fill-current text-window" /></button>}
    </div>
  );
});
SearchBox.displayName = "SearchBox";

/** Barra de ferramentas unificada com a barra de título (arrastável). */
export const Toolbar = forwardRef<HTMLInputElement, { count?: number; showLayout?: boolean; showSearch?: boolean }>(({ count, showLayout = true, showSearch = true }, ref) => {
  const s = useUi();
  const cols = useQuery({ queryKey: ["collections"], queryFn: api.collections, enabled: s.view === "collection" });
  const provs = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const title =
    s.view === "collection" ? cols.data?.find((c) => c.id === s.collectionId)?.name ?? "Coleção"
    : s.provider && s.view === "all" ? provs.data?.find((p) => p.id === s.provider)?.name ?? s.provider
    : TITLES[s.view] ?? "";
  return (
    <header data-tauri-drag-region className="relative flex h-[52px] shrink-0 items-center gap-2 border-b border-separator bg-toolbar px-3 backdrop-blur-xl">
      <Button variant="plain" size="icon" aria-label={s.sidebarOpen ? "Ocultar barra lateral" : "Mostrar barra lateral"} onClick={() => s.set("sidebarOpen", !s.sidebarOpen)}><PanelLeft /></Button>
      {showLayout && (
        <Segmented label="Visualização" value={s.layout} onChange={(v) => s.set("layout", v)}
          items={[{ value: "grid", title: "Grade", icon: <LayoutGrid /> }, { value: "list", title: "Lista", icon: <List /> }]} />
      )}
      <div data-tauri-drag-region className="pointer-events-none min-w-0 flex-1 truncate px-2 text-center">
        <span className="text-[13px] font-semibold">{title}</span>
        {count !== undefined && <span className="tabular ml-1.5 text-[12px] text-label-2">{count.toLocaleString("pt-BR")}</span>}
      </div>
      {showLayout && (
        <label className="hidden items-center gap-2 md:flex" title="Tamanho da prévia">
          <span className="text-[11px] text-label-2">A</span>
          <input type="range" min={12} max={120} value={s.previewSize} onChange={(e) => s.set("previewSize", +e.target.value)} aria-label="Tamanho da prévia" className="w-28" />
          <span className="text-[17px] text-label-2">A</span>
        </label>
      )}
      {showSearch ? <SearchBox ref={ref} className="ml-1 w-40 lg:w-56" /> : <span className="w-7" />}
    </header>
  );
});
Toolbar.displayName = "Toolbar";

/** Barra de filtros e de prévia, logo abaixo da barra de ferramentas. */
export function FilterBar() {
  const s = useUi();
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-separator bg-window px-3 py-2">
      <Input value={s.previewText} onChange={(e) => s.set("previewText", e.target.value)} placeholder="Digite um texto de prévia" aria-label="Texto de prévia" className="min-w-40 max-w-md flex-1" />
      <Select value={s.previewWeight} onChange={(e) => s.set("previewWeight", +e.target.value)} aria-label="Peso da prévia">
        {Object.entries(WEIGHT_NAMES).map(([w, n]) => <option key={w} value={w}>{n}</option>)}
      </Select>
      <Segmented label="Estilo" value={s.previewItalic ? "i" : "n"} onChange={(v) => s.set("previewItalic", v === "i")}
        items={[{ value: "n", label: "Normal" }, { value: "i", label: "Itálico" }]} />
      <Select aria-label="Categoria" value={s.category} onChange={(e) => s.set("category", e.target.value)}>
        <option value="">Todas as categorias</option>
        {cats.data?.map((c) => <option key={c} value={c}>{CATEGORY[c] ?? c}</option>)}
      </Select>
      <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={s.variableOnly} onChange={(e) => s.set("variableOnly", e.target.checked)} /> Variáveis</label>
      <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={s.italicOnly} onChange={(e) => s.set("italicOnly", e.target.checked)} /> Com itálico</label>
      <Button className="ml-auto" variant={s.compareOpen ? "primary" : "push"} onClick={() => s.set("compareOpen", !s.compareOpen)} disabled={s.compare.length === 0 && !s.compareOpen}>
        <GitCompare /> Comparar{s.compare.length > 0 && ` (${s.compare.length})`}
      </Button>
    </div>
  );
}

export const CATEGORY: Record<string, string> = {
  "sans-serif": "Sem serifa", serif: "Serifada", display: "Display", handwriting: "Manuscrita", monospace: "Monoespaçada",
};

export { DEFAULT_TEXT };
