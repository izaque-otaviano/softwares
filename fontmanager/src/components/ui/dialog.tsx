import * as D from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;

/** Folha (sheet) no estilo macOS: desce do topo da janela. */
export function DialogContent({ className, children, title, description, ...p }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/20" />
      <D.Content className={cn("fixed left-1/2 top-12 z-50 w-[min(92vw,440px)] -translate-x-1/2 rounded-[12px] bg-window p-5 shadow-popover", className)} {...p}>
        <D.Title className="text-[13px] font-semibold">{title}</D.Title>
        <D.Description className={description ? "mt-0.5 text-[12px] text-label-2" : "sr-only"}>{description ?? title}</D.Description>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex justify-end">
          <D.Close className="h-[26px] rounded-[6px] bg-control px-4 text-[13px] font-medium shadow-control">Concluído</D.Close>
        </div>
      </D.Content>
    </D.Portal>
  );
}

/** Grupo inset (estilo Ajustes do Sistema): linhas dentro de um bloco arredondado. */
export function Group({ title, footer, children, className }: { title?: string; footer?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title && <h3 className="mb-1.5 px-2 text-[13px] font-semibold text-label">{title}</h3>}
      <div className="divide-y divide-separator overflow-hidden rounded-[10px] bg-fill-2 ring-[0.5px] ring-separator">{children}</div>
      {footer && <div className="mt-1.5 px-2 text-[11px] text-label-2">{footer}</div>}
    </section>
  );
}

export function GroupRow({ title, desc, children }: { title: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-4 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{title}</div>
        {desc && <div className="mt-0.5 text-[11px] leading-snug text-label-2">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  );
}
