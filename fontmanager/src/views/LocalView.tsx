import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useUi, DEFAULT_TEXT } from "@/store/ui";
import { Button } from "@/components/ui/button";

const PAGE = 100;

/** Fontes instaladas no sistema (somente leitura). Separadas do catálogo remoto. */
export function LocalView({ onCount }: { onCount?: (n: number) => void }) {
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
  useEffect(() => onCount?.(total), [total, onCount]);
  const items = q.data?.pages.flatMap((p) => p[1]) ?? [];
  const text = previewText === DEFAULT_TEXT ? "AaBbGg" : previewText;
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-separator px-4 py-2 text-[12px] text-label-2">
        Somente leitura: este app nunca altera nem remove fontes instaladas.
        <Button className="ml-auto" onClick={() => setRescan((n) => n + 1)}><RefreshCw /> Ler de novo</Button>
      </div>
      <ul className="flex-1 overflow-auto">
        {q.isLoading && <li className="p-5 text-[13px] text-label-2">Lendo as fontes instaladas…</li>}
        {items.map((f) => (
          <li key={f.family} className="flex items-center gap-4 border-b border-separator px-4 py-2.5">
            <div className="w-56 shrink-0">
              <div className="truncate text-[13px] font-medium">{f.family}</div>
              <div className="truncate text-[11px] text-label-2" title={f.samplePath}>{f.faces} {f.faces === 1 ? "estilo" : "estilos"}</div>
            </div>
            <div className="min-w-0 flex-1 truncate leading-tight" style={{ fontFamily: `"${f.family}", system-ui`, fontSize: Math.min(previewSize, 48) }}>{text}</div>
          </li>
        ))}
        {q.hasNextPage && <li className="p-3 text-center"><Button onClick={() => q.fetchNextPage()}>Mostrar mais</Button></li>}
        {!q.isLoading && items.length === 0 && (
          <li className="flex flex-col items-center gap-1 p-10 text-center">
            <span className="text-[17px] font-semibold text-label-2">Nenhuma fonte encontrada</span>
            <span className="text-[13px] text-label-3">Clique em Ler de novo para varrer as pastas de fontes do sistema.</span>
          </li>
        )}
      </ul>
    </div>
  );
}
