import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useToasts } from "@/store/toasts";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Group, GroupRow } from "@/components/ui/dialog";
import { useUi } from "@/store/ui";
import { cn } from "@/lib/utils";

const STATUS = { ok: ["bg-green", "Disponível"], needs_config: ["bg-orange", "Precisa de configuração"], not_available: ["bg-red", "Indisponível"] } as const;

export function ProvidersView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const setView = useUi((s) => s.setView);
  const sync = useMutation({
    mutationFn: (id?: string) => api.sync(id),
    onSuccess: (r) => {
      r.forEach((o) => useToasts.getState().push(o.error ? { tone: "error", text: `${o.providerId}: ${o.error}` } : { tone: "success", text: `${o.providerId} sincronizado: ${o.report!.inserted} novas, ${o.report!.updated} atualizadas, ${o.report!.removed} removidas.` }));
      if (r.length === 0) useToasts.getState().push({ tone: "info", text: "Nenhum provedor com catálogo para sincronizar." });
      qc.invalidateQueries();
    },
    onError: (e) => useToasts.getState().push({ tone: "error", text: (e as Error).message }),
  });
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        <Group footer="Uma família presente em mais de um provedor aparece uma vez só. Origem, versão, licença e variantes de cada provedor ficam guardadas separadamente.">
          <GroupRow title="Sincronizar catálogos" desc="Atualiza só o que mudou desde a última vez.">
            <Button variant="primary" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
              {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar tudo
            </Button>
          </GroupRow>
        </Group>
        {q.data?.map((p) => {
          const [dot, label] = STATUS[p.status];
          const caps = [p.hasCatalog && "catálogo", p.hasCdn && "CDN para web", p.canInstallFiles && "arquivos para ativar"].filter(Boolean).join(", ");
          return (
            <Group key={p.id} title={p.name} footer={p.note ?? undefined}>
              <GroupRow title={<span className="flex items-center gap-2"><span className={cn("size-2 rounded-full", dot)} />{label}</span>} desc={caps ? `Oferece ${caps}.` : "Nenhum recurso disponível nesta versão."}>
                <span className="flex items-center gap-2">
                  {p.hasCatalog && p.status === "ok" && <Button disabled={sync.isPending} onClick={() => sync.mutate(p.id)} aria-label={`Sincronizar ${p.name}`}>Sincronizar</Button>}
                  {p.status === "needs_config" && <Button onClick={() => setView("settings")}>Configurar</Button>}
                  <Switch checked={p.status !== "not_available"} disabled={p.status === "not_available"} aria-label={`Usar ${p.name}`} onCheckedChange={async (v) => { await api.setProviderEnabled(p.id, v); qc.invalidateQueries({ queryKey: ["providers"] }); }} />
                </span>
              </GroupRow>
            </Group>
          );
        })}
      </div>
    </div>
  );
}
