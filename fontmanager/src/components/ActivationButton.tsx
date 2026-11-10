import { AlertCircle, ArrowDownToLine, Check, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "./ui/button";
import { useUi } from "@/store/ui";
import { useFontActions } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { phaseLabel } from "./phaseLabel";
import type { FamilySummary } from "@/lib/types";

const stop = (e: React.MouseEvent) => e.stopPropagation();

/**
 * A ação principal do app. Pílula preenchida na cor de destaque (o único elemento chamativo da interface).
 * Estados reais: Ativar → Baixando…/Registrando… → Ativa (clicar desativa) | Erro → Tentar de novo.
 */
export function ActivateButton({ f, size = "sm", showPhase = false }: { f: FamilySummary; size?: "sm" | "default" | "lg"; showPhase?: boolean }) {
  const phase = useUi((s) => s.phases[f.key]);
  const op = useUi((s) => s.busyOp[f.key]);
  const { activate, deactivate } = useFontActions();
  const width = size === "lg" ? "min-w-[112px]" : size === "default" ? "min-w-[92px]" : "min-w-[68px]";

  if (op === "activate" && phase)
    return (
      <Button variant="primary" size={size} disabled className={cn(width, "disabled:opacity-80")} onClick={stop} aria-live="polite">
        <Loader2 className="animate-spin" /> {showPhase ? phaseLabel(phase) : phase.phase === "registering" ? "Registrando…" : "Ativando…"}
      </Button>
    );

  if (f.state === "system")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-label-2" title="Instalada no sistema por você ou pelo SO. Este app não a altera.">
        <Lock className="size-3" /> No sistema
      </span>
    );

  if (f.state === "active" || f.state === "partial")
    return (
      <Button
        size={size}
        onClick={(e) => { stop(e); deactivate(f.key, f.name); }}
        aria-pressed
        aria-label={`${f.name} ativa. Desativar`}
        title="Clique para desativar"
        className={cn(width, "group rounded-full bg-green/15 text-green shadow-none hover:bg-red/12 hover:text-red")}
      >
        <Check className="group-hover:hidden" /><span className="group-hover:hidden">{f.state === "partial" ? "Parcial" : "Ativa"}</span>
        <span className="hidden group-hover:inline">Desativar</span>
      </Button>
    );

  if (phase?.phase === "error" && !op)
    return (
      <Button variant="primary" size={size} className={cn(width, "bg-red")} title={phase.message} onClick={(e) => { stop(e); activate(f.key, f.name); }}>
        <AlertCircle /> Tentar de novo
      </Button>
    );

  return (
    <Button
      variant="primary"
      size={size}
      className={width}
      disabled={!f.installable || !!op}
      title={f.installable ? `Ativar ${f.name} no sistema` : "Nenhum provedor oferece arquivo TTF/OTF autorizado para esta família"}
      onClick={(e) => { stop(e); activate(f.key, f.name); }}
    >
      Ativar
    </Button>
  );
}

/** Ação secundária, discreta: só baixa para uso offline, sem registrar no sistema. */
export function DownloadButton({ f, size = "icon-sm" }: { f: FamilySummary; size?: "icon-sm" | "icon" }) {
  const op = useUi((s) => s.busyOp[f.key]);
  const phase = useUi((s) => s.phases[f.key]);
  const { download } = useFontActions();
  if (f.state === "system") return null;
  if (op === "download")
    return (
      <span className="inline-flex size-6 items-center justify-center text-label-2" role="status" aria-label={phase ? phaseLabel(phase) : "Baixando…"} title={phase ? phaseLabel(phase) : "Baixando…"}>
        <Loader2 className="size-[15px] animate-spin" />
      </span>
    );
  if (f.cached)
    return (
      <span className="inline-flex size-6 items-center justify-center text-label-3" title="Baixada: disponível offline" aria-label="Baixada, disponível offline">
        <CheckCircle2 className="size-[15px]" />
      </span>
    );
  return (
    <Button
      variant="plain"
      size={size}
      disabled={!f.installable || !!op}
      aria-label={`Baixar ${f.name} para uso offline`}
      title="Baixar para uso offline (sem ativar)"
      onClick={(e) => { stop(e); download(f.key, f.name); }}
    >
      <ArrowDownToLine />
    </Button>
  );
}
