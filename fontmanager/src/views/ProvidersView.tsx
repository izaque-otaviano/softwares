import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useToasts } from "@/store/toasts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useUi } from "@/store/ui";

const STATUS = { ok: ["success", "Disponível"], needs_config: ["warning", "Requer configuração"], not_available: ["danger", "Integração indisponível"] } as const;

export function ProvidersView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const set = useUi((s) => s.set);
  const sync = useMutation({
    mutationFn: (id?: string) => api.sync(id),
    onSuccess: (r) => {
      r.forEach((o) => useToasts.getState().push(o.error ? { tone: "error", text: `${o.providerId}: ${o.error}` } : { tone: "success", text: `${o.providerId}: +${o.report!.inserted} novas, ${o.report!.updated} atualizadas, ${o.report!.removed} removidas.` }));
      if (r.length === 0) useToasts.getState().push({ tone: "info", text: "Nenhum provedor com catálogo disponível para sincronizar." });
      qc.invalidateQueries();
    },
    onError: (e) => useToasts.getState().push({ tone: "error", text: (e as Error).message }),
  });
  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Provedores</h1>
        <Button size="sm" className="ml-auto" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
          {sync.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizar tudo
        </Button>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        Cada provedor é um adaptador independente. Famílias presentes em mais de um aparecem uma única vez, mantendo origem, versão, licença e variantes de cada um.
      </p>
      <ul className="grid max-w-3xl gap-3">
        {q.data?.map((p) => {
          const [tone, label] = STATUS[p.status];
          return (
            <li key={p.id} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{p.name}</h2>
                <Badge tone={tone}>{label}</Badge>
                {p.hasCatalog && <Badge>catálogo</Badge>}
                {p.hasCdn && <Badge>CDN</Badge>}
                {p.canInstallFiles && <Badge>arquivos TTF/OTF</Badge>}
                <span className="ml-auto flex items-center gap-2">
                  {p.hasCatalog && p.status !== "needs_config" && (
                    <Button size="sm" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(p.id)} aria-label={`Sincronizar ${p.name}`}><RefreshCw /> Sincronizar</Button>
                  )}
                  {p.status === "needs_config" && <Button size="sm" variant="outline" onClick={() => set("view", "settings")}>Configurar</Button>}
                  <Switch checked={p.status !== "not_available"} disabled={p.status === "not_available"} aria-label={`Ativar provedor ${p.name}`} onCheckedChange={async (v) => { await api.setProviderEnabled(p.id, v); qc.invalidateQueries({ queryKey: ["providers"] }); }} />
                </span>
              </div>
              {p.note && <p className="mt-2 text-sm text-muted-foreground">{p.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
