import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useUi } from "@/store/ui";
import { useToasts } from "@/store/toasts";

/** Ativar / baixar / desativar. Nunca sinaliza sucesso em falha; mensagens usam o mesmo verbo da ação. */
export function useFontActions() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["catalog"] });
    qc.invalidateQueries({ queryKey: ["detail"] });
    qc.invalidateQueries({ queryKey: ["info"] });
  };
  const toast = useToasts.getState().push;
  return {
    refresh,
    async activate(key: string, name: string, acceptLicense = false) {
      const { setPhase, setBusy } = useUi.getState();
      setBusy(key, "activate");
      setPhase(key, { phase: "resolving" });
      try {
        const r = await api.activate(key, acceptLicense ? { acceptLicense: true } : undefined);
        if (r.outcome === "license_required") {
          // Baixada, mas NÃO registrada: o usuário precisa ler e aceitar a licença.
          setPhase(key, null);
          useUi.getState().set("licensePrompt", { key, name, license: r.license ?? "desconhecida", text: r.licenseText ?? "" });
        } else if (r.outcome === "already_in_system") {
          setPhase(key, null);
          toast({ tone: "info", text: r.message });
        } else {
          setPhase(key, { phase: "waiting_app" });
          toast({ tone: "success", text: `${name} ativada no sistema. Apps já abertos podem precisar recarregar a lista de fontes.` });
        }
      } catch (e) {
        const message = (e as Error).message;
        setPhase(key, { phase: "error", message });
        toast({ tone: "error", text: `Não foi possível ativar ${name}: ${message}` });
      } finally {
        setBusy(key, null);
      }
      refresh();
    },
    async download(key: string, name: string) {
      const { setPhase, setBusy } = useUi.getState();
      setBusy(key, "download");
      setPhase(key, { phase: "resolving" });
      try {
        const n = await api.download(key);
        setPhase(key, null);
        toast({ tone: "success", text: `${name} baixada (${n} arquivo${n === 1 ? "" : "s"}). Disponível offline, ainda não ativada.` });
      } catch (e) {
        setPhase(key, null);
        toast({ tone: "error", text: `Não foi possível baixar ${name}: ${(e as Error).message}` });
      } finally {
        setBusy(key, null);
      }
      refresh();
    },
    async deactivate(key: string, name: string) {
      try {
        const r = await api.deactivate(key);
        useUi.getState().setPhase(key, null);
        if (r.warnings.length) toast({ tone: "warning", text: `${name}: ${r.warnings.join("; ")}` });
        else if (r.keptByOtherOwners > 0) toast({ tone: "info", text: `${name} continua ativa: uma coleção ativa também a usa.` });
        else toast({ tone: "success", text: `${name} desativada. Os arquivos continuam disponíveis offline.` });
      } catch (e) {
        toast({ tone: "error", text: `Não foi possível desativar ${name}: ${(e as Error).message}` });
      }
      refresh();
    },
  };
}
