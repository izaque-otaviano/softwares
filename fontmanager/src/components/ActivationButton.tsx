import { AlertTriangle, Check, Download, Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { useUi } from "@/store/ui";
import { useFontActions } from "@/lib/actions";
import { phaseLabel } from "./phaseLabel";
import type { FamilySummary } from "@/lib/types";

export function ActivationButton({ f, compact = false }: { f: FamilySummary; compact?: boolean }) {
  const phase = useUi((s) => s.phases[f.key]);
  const { activate, deactivate } = useFontActions();
  const busy = phase && ["resolving", "downloading", "registering"].includes(phase.phase);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (busy)
    return (
      <Button size="sm" variant="outline" disabled aria-label={phaseLabel(phase)} onClick={stop}>
        <Loader2 className="animate-spin" /> {!compact && phaseLabel(phase)}
        {compact && <span className="sr-only">{phaseLabel(phase)}</span>}
      </Button>
    );

  if (f.state === "system")
    return (
      <Badge tone="neutral" title="Já instalada no sistema; este app não a modifica">
        <Check className="size-3" /> No sistema
      </Badge>
    );

  if (f.state === "active" || f.state === "partial")
    return (
      <span className="flex items-center gap-2" onClick={stop}>
        {phase?.phase === "waiting_app" && !compact && (
          <span className="hidden text-xs text-warning xl:inline">Aguardando atualização do aplicativo</span>
        )}
        <Badge tone="success"><span className="size-1.5 rounded-full bg-success" /> {f.state === "partial" ? "Parcial" : "Ativa"}</Badge>
        <Button size="sm" variant="outline" onClick={() => deactivate(f.key, f.name)} aria-label={`Desativar ${f.name}`}>
          <PowerOff /> {!compact && "Desativar"}
        </Button>
      </span>
    );

  return (
    <span className="flex items-center gap-2" onClick={stop}>
      {phase?.phase === "error" && (
        <span className="flex items-center gap-1 text-xs text-danger" title={phase.message}>
          <AlertTriangle className="size-3.5" /> {!compact && "Erro ao ativar"}
        </span>
      )}
      <Button
        size="sm"
        disabled={!f.installable}
        title={f.installable ? undefined : "Nenhum provedor oferece arquivo TTF/OTF autorizado para esta família"}
        onClick={() => activate(f.key, f.name)}
        aria-label={`Ativar ${f.name}`}
      >
        {f.cached ? <Power /> : <Download />} {!compact && "Ativar"}
      </Button>
    </span>
  );
}
