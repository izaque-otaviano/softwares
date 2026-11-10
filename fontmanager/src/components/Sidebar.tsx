import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, HardDrive, Library, Plus, Power, Settings, Star, FolderOpen, Trash2, Play, Square } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUi, type View } from "@/store/ui";
import { useToasts } from "@/store/toasts";
import { Input } from "./ui/input";

const NAV: { id: View; label: string; icon: typeof Library }[] = [
  { id: "all", label: "Todas as fontes", icon: Library },
  { id: "active", label: "Fontes ativas", icon: Power },
  { id: "local", label: "Fontes locais", icon: HardDrive },
  { id: "favorites", label: "Favoritos", icon: Star },
];

export function Sidebar() {
  const { view, collectionId, setView } = useUi();
  const qc = useQueryClient();
  const cols = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const Item = ({ id, label, icon: Icon }: (typeof NAV)[number]) => (
    <button
      onClick={() => setView(id)}
      aria-current={view === id ? "page" : undefined}
      title={label}
      className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", view === id && "bg-accent font-medium")}
    >
      <Icon className="size-4 shrink-0" /> <span className="hidden md:inline">{label}</span>
    </button>
  );
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); useToasts.getState().push({ tone: "success", text: ok }); qc.invalidateQueries(); }
    catch (e) { useToasts.getState().push({ tone: "error", text: (e as Error).message }); }
  };
  return (
    <nav className="flex h-full w-14 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-card p-2 md:w-60" aria-label="Navegação principal">
      <div className="mb-2 hidden items-center gap-2 px-2.5 py-1 md:flex">
        <span className="grid size-6 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">Aa</span>
        <span className="font-semibold">Font Manager</span>
      </div>
      {NAV.map((n) => <Item key={n.id} {...n} />)}

      <div className="mt-3 flex items-center justify-between px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="hidden md:inline">Coleções</span>
        <button aria-label="Nova coleção" onClick={() => setAdding((a) => !a)} className="rounded p-0.5 hover:bg-muted"><Plus className="size-3.5" /></button>
      </div>
      {adding && (
        <form className="hidden px-1 md:block" onSubmit={async (e) => {
          e.preventDefault();
          await run(() => api.createCollection(name), "Coleção criada.");
          setName(""); setAdding(false);
        }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome e Enter" aria-label="Nome da coleção" maxLength={80} className="h-8" />
        </form>
      )}
      {cols.data?.map((c) => (
        <div key={c.id} className={cn("group flex items-center rounded-md hover:bg-muted", view === "collection" && collectionId === c.id && "bg-accent")}>
          <button onClick={() => setView("collection", c.id)} title={c.name} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm">
            <FolderOpen className="size-4 shrink-0" /> <span className="hidden truncate md:inline">{c.name}</span>
            <span className="ml-auto hidden text-xs text-muted-foreground md:inline">{c.count}</span>
          </button>
          <span className="hidden pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 md:flex">
            <button aria-label={`Ativar coleção ${c.name}`} title="Ativar todas" className="rounded p-1 hover:bg-card" onClick={() => run(async () => {
              const r = await api.activateCollection(c.id);
              const bad = r.filter((x) => x.error);
              if (bad.length) throw new Error(`${bad.length} falha(s): ${bad[0].error}`);
            }, `Coleção ${c.name} ativada.`)}><Play className="size-3.5" /></button>
            <button aria-label={`Desativar coleção ${c.name}`} title="Desativar todas" className="rounded p-1 hover:bg-card" onClick={() => run(() => api.deactivateCollection(c.id), `Coleção ${c.name} desativada.`)}><Square className="size-3.5" /></button>
            <button aria-label={`Excluir coleção ${c.name}`} title="Excluir (não apaga fontes)" className="rounded p-1 hover:bg-card" onClick={() => run(() => api.deleteCollection(c.id), "Coleção excluída.")}><Trash2 className="size-3.5" /></button>
          </span>
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-1 pt-3">
        <Item id="providers" label="Provedores" icon={Globe} />
        <Item id="settings" label="Configurações" icon={Settings} />
      </div>
    </nav>
  );
}
