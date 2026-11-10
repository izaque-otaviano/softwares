import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToasts } from "@/store/toasts";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function CollectionsDialog({ open, onOpenChange, familyKey, member }: { open: boolean; onOpenChange: (o: boolean) => void; familyKey: string; member: number[] }) {
  const qc = useQueryClient();
  const cols = useQuery({ queryKey: ["collections"], queryFn: api.collections });
  const [name, setName] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["collections"] }); qc.invalidateQueries({ queryKey: ["detail"] }); qc.invalidateQueries({ queryKey: ["catalog"] }); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Adicionar a coleções" description="Marque as coleções que devem conter esta família.">
        <ul className="max-h-64 space-y-1 overflow-auto">
          {cols.data?.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
                <input type="checkbox" checked={member.includes(c.id)} onChange={async (e) => { await api.collectionMember(c.id, familyKey, e.target.checked); refresh(); }} />
                {c.name} <span className="ml-auto text-xs text-muted-foreground">{c.count}</span>
              </label>
            </li>
          ))}
          {cols.data?.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Nenhuma coleção ainda.</li>}
        </ul>
        <form className="mt-3 flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try { const c = await api.createCollection(name); await api.collectionMember(c.id, familyKey, true); setName(""); refresh(); }
          catch (err) { useToasts.getState().push({ tone: "error", text: (err as Error).message }); }
        }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova coleção" aria-label="Nome da nova coleção" maxLength={80} />
          <Button type="submit" disabled={!name.trim()}><Plus /> Criar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
