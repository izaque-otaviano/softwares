import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { useUi } from "@/store/ui";
import { Button } from "./ui/button";
import { ActivateButton } from "./ActivationButton";
import { useFontPreview } from "./useFontPreview";
import type { FamilySummary } from "@/lib/types";

function Line({ f }: { f: FamilySummary }) {
  const { previewText, previewSize, previewWeight, previewItalic } = useUi();
  const toggle = useUi((s) => s.toggleCompare);
  const { style, ready } = useFontPreview(f, previewWeight, previewItalic);
  return (
    <div className="group border-b border-separator px-5 py-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[13px] text-label-2">{f.name}</span>
        <span className="ml-auto flex items-center gap-1">
          <ActivateButton f={f} />
          <Button size="icon-sm" variant="plain" aria-label={`Remover ${f.name} da comparação`} onClick={() => toggle(f.key)}><X /></Button>
        </span>
      </div>
      <div className={ready ? "break-words leading-tight" : "opacity-0"} style={{ ...style, fontSize: previewSize }}>{previewText || f.name}</div>
    </div>
  );
}

export function CompareView() {
  const keys = useUi((s) => s.compare);
  const res = useQueries({ queries: keys.map((k) => ({ queryKey: ["detail", k], queryFn: () => api.familyDetail(k) })) });
  return (
    <section className="h-full overflow-auto" aria-label="Comparar famílias">
      {keys.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <p className="text-[17px] font-semibold text-label-2">Nada para comparar</p>
          <p className="max-w-xs text-[13px] text-label-3">Passe o mouse num card e clique no ícone de comparar. Cabem até 6 famílias.</p>
        </div>
      ) : (
        res.map((r, i) => (r.data ? <Line key={keys[i]} f={r.data.summary} /> : null))
      )}
    </section>
  );
}
