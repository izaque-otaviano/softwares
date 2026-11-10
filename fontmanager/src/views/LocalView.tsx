import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/TopBar";

const PAGE = 100;

/** Inventário de fontes instaladas (somente leitura). Separado do catálogo remoto. */
export function LocalView() {
  const search = useUi((s) => s.search);
  const { previewText, previewSize } = useUi();
  const [rescan, setRescan] = useState(0);
  const q = useInfiniteQuery({
    queryKey: ["local", search, rescan],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.localFonts(search || undefined, pageParam, PAGE, rescan > 0 && pageParam === 0),
    getNextPageParam: (last, all) => { const n = all.reduce((a, p) => a + p[1].length, 0); return n < last[0] ? n : undefined; },
  });
  const total = q.data?.pages[0]?.[0] ?? 0;
  const items = q.data?.pages.flatMap((p) => p[1]) ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <h1 className="font-semibold">Fontes locais</h1>
        <span className="text-xs text-muted-foreground">{total} famílias instaladas no sistema (somente leitura — este app nunca as modifica)</span>
        <div className="ml-auto flex w-64 items-center gap-2"><SearchBox /></div>
        <Button size="sm" variant="outline" onClick={() => setRescan((n) => n + 1)}><RefreshCw /> Reescanear</Button>
      </div>
      <ul className="flex-1 overflow-auto">
        {q.isLoading && <li className="p-4 text-sm text-muted-foreground">Lendo fontes instaladas…</li>}
        {items.map((f) => (
          <li key={f.family} className="border-b px-4 py-2">
            <div className="flex items-baseline gap-2 text-xs text-muted-foreground"><b className="text-sm text-foreground">{f.family}</b> {f.faces} estilo(s) <span className="truncate" title={f.samplePath}>{f.samplePath}</span></div>
            <div className="truncate" style={{ fontFamily: `"${f.family}", system-ui`, fontSize: previewSize }}>{previewText}</div>
          </li>
        ))}
        {q.hasNextPage && <li className="p-3 text-center"><Button size="sm" variant="outline" onClick={() => q.fetchNextPage()}>Carregar mais</Button></li>}
        {!q.isLoading && items.length === 0 && <li className="p-6 text-sm text-muted-foreground">Nenhuma fonte local encontrada.</li>}
      </ul>
    </div>
  );
}
