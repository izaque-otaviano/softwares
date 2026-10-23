import { useRef } from 'react';
import { Button, Modal } from '@/components/ui';
import { fieldControlId } from './CustomFieldsSection';
import { useFormStore } from './formStore';

/**
 * Campos obrigatórios pendentes ao resolver/fechar. Dois jeitos de chegar aqui:
 *  - `client`: o Helpdesk antecipa o que o servidor vai exigir (nada foi enviado; dá para "Enviar assim mesmo", e o
 *    servidor decide);
 *  - `server`: o servidor recusou com `required_custom_fields` (nada foi fechado nem gravado).
 * Nos dois casos o texto da resposta continua no editor e cada campo tem um atalho para focar o controle no painel.
 */
export function RequiredFieldsDialog() {
  const prompt = useFormStore((s) => s.requiredPrompt);
  const { dismissRequired, sendAnyway } = useFormStore.getState();
  const first = prompt?.fields[0];
  // "Ir ao campo": o foco vai para o controle do painel e NÃO volta para quem abriu o diálogo.
  const goingTo = useRef<string | null>(null);
  const focusField = (key: string, slug: string) => {
    goingTo.current = fieldControlId(key, slug);
    useFormStore.getState().focusField(key, slug);
  };
  return (
    <Modal
      open={prompt !== null}
      onOpenChange={(o) => !o && dismissRequired()}
      title="Faltam campos obrigatórios"
      description={
        prompt?.source === 'server'
          ? 'O ticket não foi resolvido: preencha os campos abaixo e envie de novo. Sua resposta continua no editor.'
          : 'Este formulário pede os campos abaixo antes de resolver ou fechar. Sua resposta continua no editor.'
      }
      size="md"
      onCloseAutoFocus={(event) => {
        const id = goingTo.current;
        goingTo.current = null;
        if (!id) return;
        event.preventDefault();
        document.getElementById(id)?.focus();
      }}
      footer={
        <>
          <Button variant="outline" onClick={dismissRequired}>
            Voltar ao ticket
          </Button>
          {prompt?.source === 'client' ? (
            <Button variant="outline" onClick={() => void sendAnyway()}>
              Enviar assim mesmo
            </Button>
          ) : null}
          {prompt && first ? (
            <Button variant="primary" onClick={() => focusField(prompt.key, first.slug)}>
              Preencher agora
            </Button>
          ) : null}
        </>
      }
    >
      <ul aria-label="Campos pendentes" className="flex flex-col gap-1">
        {prompt?.fields.map((f) => (
          <li key={f.slug} className="flex min-h-8 items-center justify-between gap-3 rounded bg-surface-1 px-3 py-1">
            <span className="min-w-0 truncate text-sm text-fg">{f.title}</span>
            <Button size="md" variant="ghost" aria-label={`Ir ao campo ${f.title}`} onClick={() => focusField(prompt.key, f.slug)}>
              Ir ao campo
            </Button>
          </li>
        ))}
      </ul>
      {prompt?.source === 'client' ? <p className="mt-3 text-xs text-fg-muted">O servidor confere de novo ao enviar; se tudo estiver certo ele resolve o ticket mesmo assim.</p> : null}
    </Modal>
  );
}
