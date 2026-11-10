import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { useToasts } from "@/store/toasts";
import { useUi, type Theme } from "@/store/ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b py-3">
      <div className="min-w-0 flex-1"><div className="font-medium">{title}</div>{desc && <div className="text-xs text-muted-foreground">{desc}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

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
    <div className="h-full overflow-auto p-6">
      <h1 className="mb-2 text-xl font-semibold">Configurações</h1>
      <div className="max-w-3xl">
        <Row title="Tema" desc="Claro, escuro ou o do sistema.">
          <Select value={theme} aria-label="Tema" onChange={(e) => { setUi("theme", e.target.value as Theme); save("theme", e.target.value); }}>
            <option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option>
          </Select>
        </Row>
        <Row title="Escopo da ativação" desc="Sessão: vale até sair/reiniciar o computador. Persistente: fica registrada para o seu usuário (Windows: chave do usuário; macOS: escopo User).">
          <Select value={get("scope", "session")} aria-label="Escopo" onChange={(e) => save("scope", e.target.value)}>
            <option value="session">Sessão</option><option value="persistent">Persistente (usuário)</option>
          </Select>
        </Row>
        <Row title="Preferir fontes variáveis" desc="Menos arquivos, mas alguns aplicativos (ex.: versões antigas do Word) lidam mal com fontes variáveis.">
          <Switch checked={get("prefer_variable") === "true"} onCheckedChange={(v) => save("prefer_variable", String(v))} aria-label="Preferir fontes variáveis" />
        </Row>
        <Row title="Restaurar fontes ativas ao abrir" desc="Registra de novo as fontes ativas que o sistema esqueceu (ex.: após reiniciar).">
          <Switch checked={get("restore_on_startup", "true") !== "false"} onCheckedChange={(v) => save("restore_on_startup", String(v))} aria-label="Restaurar fontes ao abrir" />
        </Row>
        <Row title="Desativar tudo ao sair" desc="Desregistra as fontes ativadas por este app quando ele fecha. Os arquivos continuam no cache (uso offline).">
          <Switch checked={get("deactivate_on_exit") === "true"} onCheckedChange={(v) => save("deactivate_on_exit", String(v))} aria-label="Desativar ao sair" />
        </Row>
        <Row title="Chave da API do Google Fonts (opcional)" desc="Gratuita. Habilita o catálogo oficial do Google; sem ela o catálogo vem do espelho Fontsource. Fica guardada só neste computador.">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (apiKey.trim()) save("google_api_key", apiKey); }}>
            <Input type="password" autoComplete="off" value={apiKey} placeholder={get("google_api_key") ? "•••••••• (salva)" : "Cole a chave"} onChange={(e) => setApiKey(e.target.value)} aria-label="Chave de API do Google Fonts" className="w-52" />
            <Button type="submit" variant="outline" disabled={!apiKey.trim()}>Salvar</Button>
          </form>
        </Row>
        <Row title="Fontes ativas" desc="Desativa de uma vez tudo o que este app registrou. Não toca em fontes instaladas por você ou pelo sistema.">
          <Button variant="outline" onClick={async () => { try { const n = await api.deactivateAll(); useToasts.getState().push({ tone: "success", text: `${n} arquivo(s) desativados.` }); qc.invalidateQueries(); } catch (e) { useToasts.getState().push({ tone: "error", text: (e as Error).message }); } }}>Desativar todas</Button>
        </Row>
        <h2 className="mb-1 mt-6 font-semibold">Sobre e diagnóstico</h2>
        <dl className="grid grid-cols-[170px_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Versão</dt><dd>{info.data?.version}</dd>
          <dt className="text-muted-foreground">Sistema / backend</dt><dd>{info.data?.os} · {info.data?.backend}</dd>
          <dt className="text-muted-foreground">Famílias no catálogo</dt><dd>{info.data?.catalogCount}</dd>
          <dt className="text-muted-foreground">Cache de fontes</dt><dd>{info.data ? formatBytes(info.data.cacheBytes) : "—"}</dd>
        </dl>
        <h2 className="mb-1 mt-6 font-semibold">Histórico de operações</h2>
        <ul className="max-h-72 overflow-auto rounded-md border bg-card text-xs">
          {log.data?.length === 0 && <li className="p-3 text-muted-foreground">Nada registrado ainda.</li>}
          {log.data?.map((l) => (
            <li key={l.id} className="flex gap-2 border-b px-3 py-1.5 last:border-0">
              <span className="w-40 shrink-0 text-muted-foreground">{l.ts.replace("T", " ").replace("Z", "")}</span>
              <span className={l.status === "ok" ? "text-success" : "text-danger"}>{l.kind}</span>
              <span className="min-w-0 flex-1 break-words">{l.familyKey} {l.detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
