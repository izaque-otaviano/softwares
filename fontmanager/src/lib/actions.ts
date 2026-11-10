import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUi } from "@/store/ui";
import { useToasts } from "@/store/toasts";

/** Ativar/desativar com tratamento de erro e atualização das listas. Nunca sinaliza sucesso em falha. */
export function useFontActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["catalog"] });
    qc.invalidateQueries({ queryKey: ["detail"] });
    qc.invalidateQueries({ queryKey: ["info"] });
  };
  return {
    refresh,
    async activate(key: string, name: string) {
      const { setPhase } = useUi.getState();
      setPhase(key, { phase: "resolving" });
      try {
        const r = await api.activate(key);
        if (r.outcome === "already_in_system") {
          setPhase(key, null);
          useToasts.getState().push({ tone: "info", text: r.message });
        } else {
          // As fases ActiveInSystem → WaitingApp chegam por evento; garante o estado final mesmo sem eventos.
          setPhase(key, { phase: "waiting_app" });
          useToasts.getState().push({ tone: "success", text: `${name}: registrada no sistema. Aplicativos já abertos podem exigir atualização da lista de fontes.` });
        }
      } catch (e) {
        const message = (e as Error).message;
        setPhase(key, { phase: "error", message });
        useToasts.getState().push({ tone: "error", text: `Erro ao ativar ${name}: ${message}` });
      }
      refresh();
    },
    async deactivate(key: string, name: string) {
      try {
        const r = await api.deactivate(key);
        useUi.getState().setPhase(key, null);
        if (r.warnings.length) useToasts.getState().push({ tone: "warning", text: `${name}: ${r.warnings.join("; ")}` });
        else if (r.keptByOtherOwners > 0)
          useToasts.getState().push({ tone: "info", text: `${name}: ${r.keptByOtherOwners} arquivo(s) continuam ativos porque outra coleção os usa.` });
        else useToasts.getState().push({ tone: "success", text: `${name} desativada.` });
      } catch (e) {
        useToasts.getState().push({ tone: "error", text: `Erro ao desativar ${name}: ${(e as Error).message}` });
      }
      refresh();
    },
  };
}
