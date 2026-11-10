import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;

export function DialogContent({ className, children, title, description, ...p }: React.ComponentProps<typeof D.Content> & { title: string; description?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
      <D.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card p-5 shadow-xl", className)} {...p}>
        <D.Title className="text-base font-semibold">{title}</D.Title>
        <D.Description className={description ? "mt-1 text-sm text-muted-foreground" : "sr-only"}>{description ?? title}</D.Description>
        <div className="mt-4">{children}</div>
        <D.Close aria-label="Fechar" className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
