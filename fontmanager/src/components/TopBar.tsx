import { forwardRef, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, LayoutGrid, List, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUi, DEFAULT_TEXT } from "@/store/ui";
import { cn, WEIGHT_NAMES } from "@/lib/utils";
import { Input, Select } from "./ui/input";
import { Button } from "./ui/button";

export const SearchBox = forwardRef<HTMLInputElement>((_, ref) => {
  const search = useUi((s) => s.search);
  const set = useUi((s) => s.set);
  const [text, setText] = useState(search);
  // Debounce: só consulta o catálogo 200 ms depois da última tecla.
  useEffect(() => {
    const t = setTimeout(() => set("search", text), 200);
    return () => clearTimeout(t);
  }, [text, set]);
  useEffect(() => setText(search), [search]);
  return (
    <div className="relative min-w-40 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
      <Input ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="Pesquisar famílias…  (Ctrl/⌘ K)" aria-label="Pesquisar famílias" className="pl-8 pr-8" />
      {text && <button aria-label="Limpar busca" className="absolute right-2 top-2.5 text-muted-foreground" onClick={() => setText("")}><X className="size-4" /></button>}
    </div>
  );
});
SearchBox.displayName = "SearchBox";

export const TopBar = forwardRef<HTMLInputElement>((_, ref) => {
  const s = useUi();
  const cats = useQuery({ queryKey: ["categories"], queryFn: api.categories });
  const provs = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const compareCount = s.compare.length;
  return (
    <header className="space-y-2 border-b bg-card px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox ref={ref} />
        <Select aria-label="Categoria" value={s.category} onChange={(e) => s.set("category", e.target.value)}>
          <option value="">Todas as categorias</option>
          {cats.data?.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select aria-label="Provedor" value={s.provider} onChange={(e) => s.set("provider", e.target.value)}>
          <option value="">Todos os provedores</option>
          {provs.data?.filter((p) => p.hasCatalog).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={s.variableOnly} onChange={(e) => s.set("variableOnly", e.target.checked)} /> Variáveis</label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={s.italicOnly} onChange={(e) => s.set("italicOnly", e.target.checked)} /> Com itálico</label>
        <div className="flex rounded-md border" role="group" aria-label="Layout">
          {(["list", "grid"] as const).map((l) => (
            <button key={l} aria-pressed={s.layout === l} aria-label={l === "list" ? "Lista" : "Grade"} onClick={() => s.set("layout", l)} className={cn("p-2", s.layout === l ? "bg-accent" : "hover:bg-muted")}>
              {l === "list" ? <List className="size-4" /> : <LayoutGrid className="size-4" />}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Input value={s.previewText} onChange={(e) => s.set("previewText", e.target.value)} placeholder={DEFAULT_TEXT} aria-label="Texto de prévia" className="min-w-48 flex-[2]" />
        <label className="flex items-center gap-2 text-xs">Tamanho <input type="range" min={12} max={120} value={s.previewSize} onChange={(e) => s.set("previewSize", +e.target.value)} aria-label="Tamanho da prévia" className="w-28" /><span className="w-8 tabular-nums">{s.previewSize}</span></label>
        <label className="flex items-center gap-1.5 text-xs">Peso
          <Select value={s.previewWeight} onChange={(e) => s.set("previewWeight", +e.target.value)} aria-label="Peso da prévia" className="h-8">
            {Object.entries(WEIGHT_NAMES).map(([w, n]) => <option key={w} value={w}>{w} {n}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={s.previewItalic} onChange={(e) => s.set("previewItalic", e.target.checked)} /> Itálico</label>
        <Button size="sm" variant={s.compareOpen ? "default" : "outline"} onClick={() => s.set("compareOpen", !s.compareOpen)} disabled={compareCount === 0 && !s.compareOpen}>
          <GitCompare /> Comparar{compareCount > 0 && ` (${compareCount})`}
        </Button>
      </div>
    </header>
  );
});
TopBar.displayName = "TopBar";
