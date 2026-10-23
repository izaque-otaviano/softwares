import * as RadixDialog from '@radix-ui/react-dialog';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { DialogCloseButton, ignoreToastInteraction, useDialogFocus } from './dialogShared';

export type ModalSize = 'sm' | 'md' | 'lg';

/** Larguras da escala padrão do Tailwind (nada de px solto): sm 384, md 576, lg 768. */
const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
};

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título do diálogo (obrigatório: nomeia o `dialog` para leitores de tela). */
  title: string;
  description?: string;
  children?: ReactNode;
  /** Rodapé com borda superior, alinhado à direita (ex.: Cancelar / Salvar). */
  footer?: ReactNode;
  /** Largura máxima: sm 384px, md 576px (padrão), lg 768px. */
  size?: ModalSize;
  /** Substitui o foco inicial. Por padrão vai para o primeiro campo do corpo (ou para "Fechar" se não houver). */
  onOpenAutoFocus?: (event: Event) => void;
  /** Ao fechar: chame `event.preventDefault()` para decidir o foco você mesmo (senão volta a quem o tinha ao abrir). */
  onCloseAutoFocus?: (event: Event) => void;
  className?: string;
}

/**
 * Diálogo centralizado, raio 8. Esc e clique no scrim fecham, o foco fica preso dentro dele e volta ao
 * elemento que o abriu. Posicionado com `inset` + margem automática (sem transform, que a animação de
 * entrada sobrescreveria).
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  onOpenAutoFocus,
  onCloseAutoFocus: customCloseAutoFocus,
  className,
}: ModalProps) {
  const { bodyRef, onOpenAutoFocus: handleOpenAutoFocus, onCloseAutoFocus: restoreFocus } = useDialogFocus(open, onOpenAutoFocus);
  const onCloseAutoFocus = (event: Event) => {
    customCloseAutoFocus?.(event);
    if (!event.defaultPrevented) restoreFocus(event);
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="anim-fade-in fixed inset-0 z-50 bg-ink-active/50 data-[state=closed]:anim-fade-out" />
        <RadixDialog.Content
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
          onInteractOutside={ignoreToastInteraction}
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'anim-pop-in fixed inset-4 z-50 m-auto flex h-fit max-h-[calc(100vh-2rem)] flex-col rounded-lg border border-line bg-surface shadow-menu outline-none',
            'data-[state=closed]:anim-fade-out',
            SIZE[size],
            className,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-4 pt-5">
            <div className="min-w-0">
              <RadixDialog.Title className="text-md font-semibold text-fg">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-fg-muted">{description}</RadixDialog.Description>
              ) : null}
            </div>
            <DialogCloseButton className="-mr-2 -mt-1" />
          </div>
          {children != null && children !== false ? (
            <div ref={bodyRef} className={cn('min-h-0 flex-1 overflow-y-auto px-6', footer ? 'pb-4' : 'pb-5')}>
              {children}
            </div>
          ) : null}
          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-6 py-3">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/* -------------------------------------------------------------------------- */
/* ConfirmModal                                                                */
/* -------------------------------------------------------------------------- */

export interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  /** Padrão "Cancelar". */
  cancelLabel?: string;
  /** `danger` (padrão) pinta o botão de vermelho e dá o foco inicial a Cancelar; `primary` usa azul e foca a confirmação. */
  tone?: 'danger' | 'primary';
  /**
   * Chamado ao confirmar. Se devolver uma Promise, o modal fica ocupado até ela resolver e então fecha.
   * Se ela rejeitar, o modal continua aberto para nova tentativa; quem chama deve reportar o erro (ex.: toast).
   */
  onConfirm: () => void | Promise<void>;
  /** Força o estado "ocupado" (ex.: quando o pai controla a requisição). */
  loading?: boolean;
  className?: string;
}

/** Confirmação para toda ação destrutiva. O foco inicial vai para Cancelar quando `tone="danger"`. */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'danger',
  onConfirm,
  loading = false,
  className,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;

  const requestOpenChange = (next: boolean) => {
    // Não deixa Esc/clique fora/Cancelar interromperem uma confirmação em andamento.
    if (!next && busy) return;
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (busy) return;
    const result = onConfirm();
    if (result instanceof Promise) {
      setPending(true);
      try {
        await result;
      } catch {
        // Mantém o modal aberto para nova tentativa; reportar o erro é responsabilidade de quem passou onConfirm.
        setPending(false);
        return;
      }
      setPending(false);
    }
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={requestOpenChange}
      title={title}
      description={description}
      size="sm"
      className={className}
      onOpenAutoFocus={(event) => {
        // Destrutivo: foco em Cancelar (Enter nunca apaga por engano). Demais: foco direto na confirmação.
        event.preventDefault();
        (tone === 'danger' ? cancelRef : confirmRef).current?.focus();
      }}
      footer={
        <>
          {/* Os mesmos Button do kit: uma só fonte de verdade para cores, hover, desabilitado e largura estável no loading. */}
          <Button
            ref={cancelRef}
            variant="outline"
            aria-disabled={busy || undefined}
            className={cn(busy && 'cursor-not-allowed opacity-50')}
            onClick={() => requestOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={tone} loading={busy} onClick={() => void handleConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
