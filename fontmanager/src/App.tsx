import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Info, Loader2, X } from "lucide-react";
import { api, IS_TAURI, listen } from "@/lib/api";
import { useUi, type Theme } from "@/store/ui";
import { useToasts } from "@/store/toasts";
import { useFontActions } from "@/lib/actions";
import type { Phase } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { FilterBar, Toolbar } from "@/components/TopBar";
import { FontList } from "@/components/FontList";
import { DetailPanel } from "@/components/DetailPanel";
import { CompareView } from "@/components/CompareView";
import { ProvidersView } from "@/views/ProvidersView";
import { SettingsView } from "@/views/SettingsView";
import { LocalView } from "@/views/LocalView";
import { LicenseDialog } from "@/components/LicenseDialog";
import { cn } from "@/lib/utils";

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/** Notificações no canto superior direito, em material translúcido, como banners do macOS. */
function Toaster() {
  const { list, dismiss } = useToasts();
  const icon = { success: <CheckCircle2 className="size-4 text-green" />, error: <AlertCircle className="size-4 text-red" />, warning: <AlertCircle className="size-4 text-orange" />, info: <Info className="size-4 text-accent" /> };
  return (
    <div className="pointer-events-none fixed right-3 top-[60px] z-[60] flex w-[min(92vw,340px)] flex-col gap-2" role="region" aria-label="Notificações" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex items-start gap-2.5 rounded-[12px] bg-toolbar p-3 text-[12px] leading-snug shadow-popover backdrop-blur-2xl">
          <span className="mt-px">{icon[t.tone]}</span>
          <span className="min-w-0 flex-1 break-words">{t.text}</span>
          <button aria-label="Dispensar" onClick={() => dismiss(t.id)} className="text-label-3 hover:text-label-2"><X className="size-3.5" /></button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { view, selected, compareOpen, theme, sidebarOpen } = useUi();
  const set = useUi((s) => s.set);
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const actions = useFontActions();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const syncing = useUi((s) => s.phases["__sync"]);
  const [count, setCount] = useState<number | undefined>();

  useEffect(() => { const t = settings.data?.find(([k]) => k === "theme")?.[1] as Theme | undefined; if (t) set("theme", t); }, [settings.data, set]);
  useEffect(() => {
    applyTheme(theme);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => theme === "system" && applyTheme("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  // Barra lateral recolhe sozinha em janelas estreitas.
  useEffect(() => {
    const mq = matchMedia("(max-width: 760px)");
    const on = () => mq.matches && set("sidebarOpen", false);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [set]);

  useEffect(() => {
    const offs: Promise<() => void>[] = [
      listen<{ key: string } & Phase>("activation", ({ key, ...p }) => useUi.getState().setPhase(key, p as Phase)),
      listen<string>("sync", (s) => { useUi.getState().setPhase("__sync", s === "start" ? { phase: "resolving" } : null); if (s === "done") qc.invalidateQueries(); }),
      listen<number>("restored", (n) => { useToasts.getState().push({ tone: "info", text: `${n} fonte(s) ativa(s) registrada(s) de novo no sistema.` }); qc.invalidateQueries(); }),
    ];
    return () => { offs.forEach((o) => o.then((f) => f())); };
  }, [qc]);

  // Atalhos: ⌘/Ctrl K busca, ⌘/Ctrl , configurações, ⌘/Ctrl \ barra lateral, A ativa/desativa, D baixa, F favorita, Esc fecha.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName);
      const sel = useUi.getState().selected;
      const withDetail = (fn: (d: Awaited<ReturnType<typeof api.familyDetail>>) => unknown) =>
        sel && qc.fetchQuery({ queryKey: ["detail", sel], queryFn: () => api.familyDetail(sel), staleTime: 0 }).then(fn);
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); if (!["all", "active", "cached", "favorites", "collection", "local"].includes(useUi.getState().view)) useUi.getState().setView("all"); setTimeout(() => searchRef.current?.focus()); }
      else if (mod && e.key === ",") { e.preventDefault(); useUi.getState().setView("settings"); }
      else if (mod && e.key === "\\") { e.preventDefault(); set("sidebarOpen", !useUi.getState().sidebarOpen); }
      else if (e.key === "Escape") { if (useUi.getState().compareOpen) set("compareOpen", false); else if (sel) set("selected", null); }
      else if (!typing && !mod && sel) {
        const k = e.key.toLowerCase();
        if (k === "a") withDetail((d) => d.summary.state === "active" || d.summary.state === "partial" ? actions.deactivate(sel, d.summary.name) : d.summary.state === "inactive" && d.summary.installable ? actions.activate(sel, d.summary.name) : undefined);
        else if (k === "d") withDetail((d) => !d.summary.cached && d.summary.installable && d.summary.state !== "system" && actions.download(sel, d.summary.name));
        else if (k === "f") withDetail(async (d) => { await api.setFavorite(sel, !d.summary.favorite); qc.invalidateQueries(); });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qc, set, actions]);

  const isList = ["all", "active", "cached", "favorites", "collection"].includes(view);
  const showInspector = isList && selected && !compareOpen;

  return (
    <div className="flex h-full">
      {sidebarOpen && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col bg-window">
        <Toolbar ref={searchRef} count={isList || view === "local" ? count : undefined} showLayout={isList} showSearch={isList || view === "local"} />
        {!IS_TAURI && (
          <div role="note" className="shrink-0 border-b border-separator bg-orange/10 px-4 py-1.5 text-[12px] text-label-2">
            Prévia no navegador: sem o app instalado, nada é baixado, ativado ou salvo.
          </div>
        )}
        {syncing && (
          <div role="status" className="flex shrink-0 items-center gap-2 border-b border-separator px-4 py-1.5 text-[12px] text-label-2"><Loader2 className="size-3.5 animate-spin" /> Sincronizando catálogos…</div>
        )}
        {isList && <FilterBar />}
        <div className="relative flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {isList && (compareOpen ? <CompareView /> : <FontList onCount={setCount} />)}
            {view === "local" && <LocalView onCount={setCount} />}
            {view === "providers" && <ProvidersView />}
            {view === "settings" && <SettingsView />}
          </div>
          {showInspector && (
            <div className={cn("absolute inset-y-0 right-0 z-30 w-[min(100%,380px)] border-l border-separator shadow-popover",
              "xl:static xl:z-auto xl:w-[380px] xl:shrink-0 xl:shadow-none")}>
              <DetailPanel />
            </div>
          )}
        </div>
      </main>
      <Toaster />
      <LicenseDialog />
    </div>
  );
}
