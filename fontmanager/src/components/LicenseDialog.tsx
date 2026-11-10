import * as D from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { useUi } from "@/store/ui";
import { useFontActions } from "@/lib/actions";
import { Button } from "./ui/button";

/**
 * Folha de confirmação de licença. Aparece quando a licença do pacote não é OFL nem Apache.
 * A fonte já foi baixada, mas nada é registrado no sistema até o usuário aceitar.
 */
export function LicenseDialog() {
  const p = useUi((s) => s.licensePrompt);
  const set = useUi((s) => s.set);
  const { activate } = useFontActions();
  const close = () => set("licensePrompt", null);
  const unlicensed = p && (p.license === "Freeware" || p.license === "Sem arquivo de licença");
  return (
    <D.Root open={!!p} onOpenChange={(o) => !o && close()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <D.Content className="fixed left-1/2 top-12 z-50 flex max-h-[80vh] w-[min(92vw,520px)] -translate-x-1/2 flex-col rounded-[12px] bg-window p-5 shadow-popover">
          {p && (
            <>
              <D.Title className="text-[13px] font-semibold">Licença de {p.name}</D.Title>
              <D.Description className="mt-0.5 text-[12px] text-label-2">
                {p.license}. A fonte foi baixada, mas só será ativada no sistema se você aceitar estes termos.
              </D.Description>
              {unlicensed && (
                <div role="alert" className="mt-3 flex gap-2 rounded-[8px] bg-orange/12 p-3 text-[12px] leading-snug">
                  <AlertTriangle className="mt-px size-4 shrink-0 text-orange" />
                  <span>Esta fonte não tem uma licença explícita do autor. O próprio Font Squirrel avisa que não garante o uso comercial. Use por sua conta e risco.</span>
                </div>
              )}
              <pre data-selectable className="mt-3 min-h-24 flex-1 overflow-auto whitespace-pre-wrap rounded-[8px] bg-fill-2 p-3 font-[ui-monospace,SFMono-Regular,Menlo,Consolas,monospace] text-[11.5px] leading-relaxed ring-[0.5px] ring-separator">
                {p.text || "O pacote não trouxe o texto da licença."}
              </pre>
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={close}>Cancelar</Button>
                <Button variant="primary" onClick={() => { const { key, name } = p; close(); activate(key, name, true); }}>Aceitar e ativar</Button>
              </div>
            </>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
