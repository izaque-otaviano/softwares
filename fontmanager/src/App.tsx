import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { api, IS_TAURI, listen } from "@/lib/api";
import { useUi, type Theme } from "@/store/ui";
import { useToasts } from "@/store/toasts";
import { useFontActions } from "@/lib/actions";
import type { Phase } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { FontList } from "@/components/FontList";
import { DetailPanel } from "@/components/DetailPanel";
import { CompareView } from "@/components/CompareView";
import { ProvidersView } from "@/views/ProvidersView";
import { SettingsView } from "@/views/SettingsView";
import { LocalView } from "@/views/LocalView";
import { cn } from "@/lib/utils";

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function Toaster() {
  const { list, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" role="region" aria-label="Notificações" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto flex gap-2 rounded-md border bg-card p-3 text-sm shadow-lg",
          t.tone === "error" && "border-danger/50", t.tone === "success" && "border-success/50", t.tone === "warning" && "border-warning/60")}>
          <span className="min-w-0 flex-1 break-words">{t.text}</span>
          <button aria-label="Dispensar" onClick={() => dismiss(t.id)} className="text-muted-foreground"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { view, selected, compareOpen, theme } = useUi();
  const set = useUi((s) => s.set);
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const actions = useFontActions();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const syncing = useUi((s) => s.phases["__sync"]);

  useEffect(() => { const t = settings.data?.find(([k]) => k === "theme")?.[1] as Theme | undefined; if (t) set("theme", t); }, [settings.data, set]);
  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => theme === "system" && applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);

  // Eventos reais do núcleo: fases da ativação, sincronização e restauração.
  useEffect(() => {
    const offs: Promise<() => void>[] = [
      listen<{ key: string } & Phase>("activation", ({ key, ...p }) => useUi.getState().setPhase(key, p as Phase)),
      listen<string>("sync", (s) => { useUi.getState().setPhase("__sync", s === "start" ? { phase: "resolving" } : null); if (s === "done") qc.invalidateQueries(); }),
      listen<number>("restored", (n) => { useToasts.getState().push({ tone: "info", text: `${n} fonte(s) ativa(s) restaurada(s) no sistema.` }); qc.invalidateQueries(); }),
    ];
    return () => { offs.forEach((o) => o.then((f) => f())); };
  }, [qc]);

  // Atalhos de teclado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName);
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); useUi.getState().setView("all"); searchRef.current?.focus(); }
      else if (mod && e.key === ",") { e.preventDefault(); useUi.getState().setView("settings"); }
      else if (e.key === "Escape") { if (useUi.getState().compareOpen) set("compareOpen", false); else if (useUi.getState().selected) set("selected", null); }
      else if (!typing && !mod && e.key.toLowerCase() === "a" && useUi.getState().selected) {
        // A = ativar/desativar a família selecionada
        const key = useUi.getState().selected!;
        qc.fetchQuery({ queryKey: ["detail", key], queryFn: () => api.familyDetail(key), staleTime: 0 }).then((d) =>
          d.summary.state === "active" || d.summary.state === "partial" ? actions.deactivate(key, d.summary.name) : d.summary.state === "inactive" && d.summary.installable ? actions.activate(key, d.summary.name) : undefined);
      } else if (!typing && !mod && e.key.toLowerCase() === "f" && useUi.getState().selected) {
        const key = useUi.getState().selected!;
        qc.fetchQuery({ queryKey: ["detail", key], queryFn: () => api.familyDetail(key), staleTime: 0 }).then(async (d) => { await api.setFavorite(key, !d.summary.favorite); qc.invalidateQueries(); });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qc, set, actions]);

  const isList = ["all", "active", "favorites", "collection"].includes(view);
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {!IS_TAURI && (
          <div role="note" className="border-b border-warning/50 bg-warning/10 px-4 py-1.5 text-xs">
            Modo demonstração (navegador): sem backend nativo — nada é baixado, ativado ou salvo. Use o aplicativo desktop para as funções reais.
          </div>
        )}
        {syncing && (
          <div role="status" className="flex items-center gap-2 border-b bg-accent px-4 py-1.5 text-xs"><Loader2 className="size-3.5 animate-spin" /> Sincronizando catálogo dos provedores…</div>
        )}
        {isList && <TopBar ref={searchRef} />}
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {isList && (compareOpen ? <CompareView /> : <FontList />)}
            {view === "local" && <LocalView />}
            {view === "providers" && <ProvidersView />}
            {view === "settings" && <SettingsView />}
          </div>
          {isList && selected && !compareOpen && (
            <div className="absolute inset-y-0 right-0 z-30 w-[min(100vw-3.5rem,440px)] border-l bg-background shadow-xl lg:static lg:z-auto lg:w-[420px] lg:shrink-0 lg:shadow-none">
              <DetailPanel />
            </div>
          )}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
