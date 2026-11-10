import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FamilySummary } from "@/lib/types";

/**
 * Prévia em imagem para provedores sem CDN de fontes (Font Squirrel): o PNG oficial do provedor com o
 * nome da família desenhado na própria fonte. Depois que a fonte é baixada, a prévia passa a ser a fonte real.
 */
export function RemotePreview({ f, height, className }: { f: FamilySummary; height: number; className?: string }) {
  const q = useQuery({ queryKey: ["previewImage", f.key], queryFn: () => api.previewImage(f.key), staleTime: Infinity, retry: 0 });
  const [broken, setBroken] = useState(false);
  if (!q.data || broken)
    return <span className={cn("text-[12px] text-label-3", className)}>{q.isLoading && !broken ? "" : "Prévia indisponível. Baixe a fonte para vê-la."}</span>;
  return (
    <img
      onError={() => setBroken(true)}
      src={q.data}
      alt={`Amostra de ${f.name}`}
      loading="lazy"
      draggable={false}
      className={cn("max-w-full object-contain object-left dark:invert", className)}
      style={{ height: Math.max(18, Math.round(height * 0.8)) }}
    />
  );
}
