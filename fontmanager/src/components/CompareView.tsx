import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { Button } from "./ui/button";
import { useFontPreview } from "./useFontPreview";
import type { FamilySummary } from "@/lib/types";

function Line({ f }: { f: FamilySummary }) {
  const { previewText, previewSize, previewWeight, previewItalic } = useUi();
  const toggle = useUi((s) => s.toggleCompare);
  const { style, ready } = useFontPreview(f, previewWeight, previewItalic);
  return (
    <div className="border-b px-4 py-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <b className="text-foreground">{f.name}</b>
        <Button size="icon" variant="ghost" className="ml-auto size-6" aria-label={`Remover ${f.name} da comparação`} onClick={() => toggle(f.key)}><X /></Button>
      </div>
      <div className={ready ? "" : "opacity-40"} style={{ ...style, fontSize: previewSize }}>{previewText || f.name}</div>
    </div>
  );
}

export function CompareView() {
  const keys = useUi((s) => s.compare);
  const set = useUi((s) => s.set);
  const res = useQueries({ queries: keys.map((k) => ({ queryKey: ["detail", k], queryFn: () => api.familyDetail(k) })) });
  return (
    <section className="flex h-full flex-col" aria-label="Comparar famílias">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <h2 className="font-semibold">Comparar ({keys.length})</h2>
        <span className="text-xs text-muted-foreground">Use o ícone de comparação nas linhas para adicionar (máx. 6). O texto, tamanho e peso vêm da barra superior.</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => set("compareOpen", false)}>Voltar à lista</Button>
      </header>
      <div className="flex-1 overflow-auto">
        {keys.length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhuma família selecionada para comparação.</p>}
        {res.map((r, i) => (r.data ? <Line key={keys[i]} f={r.data.summary} /> : null))}
      </div>
    </section>
  );
}
