import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { useToasts } from "@/store/toasts";
import { useUi, type Theme } from "@/store/ui";
import { Button, Segmented } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Group, GroupRow } from "@/components/ui/dialog";

export function SettingsView() {
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const info = useQuery({ queryKey: ["info"], queryFn: api.appInfo });
  const log = useQuery({ queryKey: ["log"], queryFn: () => api.recentLog(40) });
  const theme = useUi((u) => u.theme);
  const setUi = useUi((u) => u.set);
  const get = (k: string, d = "") => s.data?.find(([key]) => key === k)?.[1] ?? d;
  const [apiKey, setApiKey] = useState("");
  useEffect(() => setApiKey(""), [s.data]);
  const save = async (k: string, v: string) => {
    try { await api.setSetting(k, v); qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["providers"] }); }
    catch (e) { useToasts.getState().push({ tone: "error", text: (e as Error).message }); }
  };
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        <Group title="Aparência">
          <GroupRow title="Tema">
            <Segmented label="Tema" value={theme} onChange={(v: Theme) => { setUi("theme", v); save("theme", v); }}
              items={[{ value: "system", label: "Automático" }, { value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} />
          </GroupRow>
        </Group>

        <Group title="Ativação" footer="Nenhum ajuste aqui altera fontes que você ou o sistema instalaram.">
          <GroupRow title="Duração" desc="Até sair: vale até encerrar a sessão ou reiniciar. Permanente: continua registrada para o seu usuário.">
            <Select value={get("scope", "session")} aria-label="Duração da ativação" onChange={(e) => save("scope", e.target.value)}>
              <option value="session">Até sair da sessão</option><option value="persistent">Permanente</option>
            </Select>
          </GroupRow>
          <GroupRow title="Preferir fontes variáveis" desc="Menos arquivos. Versões antigas de alguns apps, como o Word, lidam mal com elas.">
            <Switch checked={get("prefer_variable") === "true"} onCheckedChange={(v) => save("prefer_variable", String(v))} aria-label="Preferir fontes variáveis" />
          </GroupRow>
          <GroupRow title="Restaurar ao abrir" desc="Registra de novo as fontes ativas que o sistema esqueceu, por exemplo depois de reiniciar.">
            <Switch checked={get("restore_on_startup", "true") !== "false"} onCheckedChange={(v) => save("restore_on_startup", String(v))} aria-label="Restaurar fontes ativas ao abrir" />
          </GroupRow>
          <GroupRow title="Desativar tudo ao sair" desc="Os arquivos continuam baixados para uso offline.">
            <Switch checked={get("deactivate_on_exit") === "true"} onCheckedChange={(v) => save("deactivate_on_exit", String(v))} aria-label="Desativar tudo ao sair" />
          </GroupRow>
          <GroupRow title="Desativar todas agora" desc="Remove do sistema tudo o que este app ativou.">
            <Button variant="destructive" onClick={async () => { try { const n = await api.deactivateAll(); useToasts.getState().push({ tone: "success", text: `${n} arquivo(s) desativados.` }); qc.invalidateQueries(); } catch (e) { useToasts.getState().push({ tone: "error", text: (e as Error).message }); } }}>Desativar todas</Button>
          </GroupRow>
        </Group>

        <Group title="Google Fonts" footer="A chave é gratuita e fica só neste computador. Sem ela, o catálogo do Google vem do espelho Fontsource.">
          <GroupRow title="Chave da API" desc="Opcional. Habilita o catálogo oficial do Google.">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (apiKey.trim()) save("google_api_key", apiKey); }}>
              <Input type="password" autoComplete="off" value={apiKey} placeholder={get("google_api_key") ? "Salva" : "Cole a chave"} onChange={(e) => setApiKey(e.target.value)} aria-label="Chave da API do Google Fonts" className="w-44" />
              <Button type="submit" disabled={!apiKey.trim()}>Salvar</Button>
            </form>
          </GroupRow>
        </Group>

        <Group title="Sobre">
          <GroupRow title="Versão"><span className="text-label-2">{info.data?.version}</span></GroupRow>
          <GroupRow title="Sistema"><span className="text-label-2">{info.data?.os}, {info.data?.backend}</span></GroupRow>
          <GroupRow title="Famílias no catálogo"><span className="tabular text-label-2">{info.data?.catalogCount.toLocaleString("pt-BR")}</span></GroupRow>
          <GroupRow title="Fontes baixadas"><span className="tabular text-label-2">{info.data ? formatBytes(info.data.cacheBytes) : "—"}</span></GroupRow>
        </Group>

        <Group title="Histórico">
          {log.data?.length === 0 && <GroupRow title={<span className="text-label-2">Nenhuma operação ainda.</span>} />}
          {log.data?.map((l) => (
            <div key={l.id} className="flex gap-3 px-3 py-1.5 text-[12px]">
              <span className="tabular w-36 shrink-0 text-label-3">{l.ts.replace("T", " ").replace("Z", "")}</span>
              <span className={l.status === "ok" ? "text-label-2" : "text-red"}>{l.kind}</span>
              <span className="min-w-0 flex-1 break-words text-label-2">{l.familyKey} {l.detail}</span>
            </div>
          ))}
        </Group>
      </div>
    </div>
  );
}
