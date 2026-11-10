import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Circle, Globe, HardDrive, Library, Plus, Settings, SlidersHorizontal, Star, Folder, Power, Trash2, Play, Square } from "lucide-react";
import { api, IS_TAURI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUi, type View } from "@/store/ui";
import { useToasts } from "@/store/toasts";
import { Input } from "./ui/input";

const IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform || navigator.userAgent);

const LIBRARY: { id: View; label: string; icon: typeof Library }[] = [
  { id: "all", label: "Todas as fontes", icon: Library },
  { id: "active", label: "Ativas", icon: Power },
  { id: "cached", label: "Baixadas", icon: ArrowDownToLine },
  { id: "local", label: "Instaladas no sistema", icon: HardDrive },
  { id: "favorites", label: "Favoritas", icon: Star },
];

function Row({ active, onClick, icon, label, count, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className={cn("group flex h-7 items-center rounded-[6px]", active ? "bg-selection" : "hover:bg-fill-2")}>
      <button onClick={onClick} aria-current={active ? "page" : undefined} className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-[13px]">
        <span className="text-accent [&_svg]:size-[15px]">{icon}</span>
        <span className="truncate">{label}</span>
        {count !== undefined && <span className="tabular ml-auto text-[11px] text-label-2">{count}</span>}
      </button>
      {children}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="group/s mb-0.5 flex h-6 items-center px-2 text-[11px] font-semibold text-label-2">
        {title}
        {action && <span className="ml-auto opacity-0 group-hover/s:opacity-100 focus-within:opacity-100">{action}</span>}
      </div>
      {children}
    </div>
  );
}

export function Sidebar() {
  const { view, collectionId, setView, provider } = useUi();
  const set = useUi((s) => s.set);
  const qc = useQueryClient();
  const cols = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const provs = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); useToasts.getState().push({ tone: "success", text: ok }); qc.invalidateQueries(); }
    catch (e) { useToasts.getState().push({ tone: "error", text: (e as Error).message }); }
  };

  return (
    <nav className="flex h-full w-[220px] shrink-0 flex-col border-r border-separator bg-sidebar backdrop-blur-xl" aria-label="Barra lateral">
      {/* Área dos botões de semáforo (macOS) / título do app (Windows) — arrastável */}
      <div data-tauri-drag-region className={cn("flex shrink-0 items-center px-4", IS_MAC && IS_TAURI ? "h-[52px]" : "h-[52px]")}>
        {!(IS_MAC && IS_TAURI) && <span className="pointer-events-none text-[13px] font-semibold text-label-2">Font Manager</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
        <Section title="Biblioteca">
          {LIBRARY.map((n) => (
            <Row key={n.id} active={view === n.id && !(n.id === "all" && provider)} onClick={() => { set("provider", ""); setView(n.id); }} icon={<n.icon />} label={n.label} />
          ))}
        </Section>
        <Section title="Provedores">
          {provs.data?.filter((p) => p.hasCatalog).map((p) => (
            <Row key={p.id} active={view === "all" && provider === p.id} onClick={() => { setView("all"); set("provider", p.id); }} icon={<Globe />} label={p.name} />
          ))}
        </Section>
        <Section title="Coleções" action={<button aria-label="Nova coleção" onClick={() => setAdding((a) => !a)} className="rounded p-0.5 text-label-2 hover:bg-fill"><Plus className="size-3.5" /></button>}>
          {adding && (
            <form className="px-1 py-1" onSubmit={async (e) => { e.preventDefault(); await run(() => api.createCollection(name), `Coleção ${name} criada.`); setName(""); setAdding(false); }}>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setAdding(false)} placeholder="Nome da coleção" aria-label="Nome da coleção" maxLength={80} className="h-6" />
            </form>
          )}
          {cols.data?.map((c) => (
            <Row key={c.id} active={view === "collection" && collectionId === c.id} onClick={() => setView("collection", c.id)} icon={<Folder />} label={c.name} count={c.count}>
              <span className="hidden pr-1 group-hover:flex focus-within:flex">
                <button aria-label={`Ativar coleção ${c.name}`} title="Ativar todas" className="rounded p-1 text-label-2 hover:text-accent" onClick={() => run(async () => {
                  const r = await api.activateCollection(c.id);
                  const bad = r.filter((x) => x.error);
                  if (bad.length) throw new Error(`${bad.length} família(s) não ativadas: ${bad[0].error}`);
                }, `Coleção ${c.name} ativada.`)}><Play className="size-3" /></button>
                <button aria-label={`Desativar coleção ${c.name}`} title="Desativar todas" className="rounded p-1 text-label-2 hover:text-label" onClick={() => run(() => api.deactivateCollection(c.id), `Coleção ${c.name} desativada.`)}><Square className="size-3" /></button>
                <button aria-label={`Excluir coleção ${c.name}`} title="Excluir coleção (as fontes ficam)" className="rounded p-1 text-label-2 hover:text-red" onClick={() => run(() => api.deleteCollection(c.id), `Coleção ${c.name} excluída.`)}><Trash2 className="size-3" /></button>
              </span>
            </Row>
          ))}
          {!adding && cols.data?.length === 0 && (
            <button onClick={() => setAdding(true)} className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-[13px] text-label-2 hover:bg-fill-2">
              <Circle className="size-[15px] text-label-3" /> Nova coleção
            </button>
          )}
        </Section>
      </div>
      <div className="border-t border-separator px-2.5 py-2">
        <Row active={view === "providers"} onClick={() => setView("providers")} icon={<SlidersHorizontal />} label="Gerenciar provedores" />
        <Row active={view === "settings"} onClick={() => setView("settings")} icon={<Settings />} label="Configurações" />
      </div>
    </nav>
  );
}
