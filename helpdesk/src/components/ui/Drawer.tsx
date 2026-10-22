import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DialogCloseButton, ignoreToastInteraction, useDialogFocus } from './dialogShared';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título do diálogo (obrigatório: nomeia o `dialog` para leitores de tela). */
  title: string;
  description?: string;
  children: ReactNode;
  /** Rodapé fixo (ex.: Cancelar / Aplicar filtros). Alinhado à direita. */
  footer?: ReactNode;
  /** Classe de largura do painel. Padrão `w-right` (380px). */
  width?: string;
  /** Substitui o foco inicial. Por padrão vai para o primeiro campo do corpo (ou para "Fechar" se não houver). */
  onOpenAutoFocus?: (event: Event) => void;
  className?: string;
  /** Classes do corpo rolável (padrão `px-4 py-4`). */
  bodyClassName?: string;
}

/**
 * Painel lateral direito sobre um scrim. Esc e clique no scrim fecham, o foco fica preso dentro do painel e
 * volta ao elemento que abriu o Drawer ao fechar.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'w-right',
  onOpenAutoFocus,
  className,
  bodyClassName,
}: DrawerProps) {
  const { bodyRef, onOpenAutoFocus: handleOpenAutoFocus, onCloseAutoFocus } = useDialogFocus(open, onOpenAutoFocus);

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
            'anim-slide-in-right fixed inset-y-0 right-0 z-50 flex h-full max-w-full flex-col border-l border-line bg-surface shadow-pop outline-none',
            'data-[state=closed]:anim-fade-out',
            width,
            className,
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <RadixDialog.Title className="text-md font-semibold text-fg">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-fg-muted">{description}</RadixDialog.Description>
              ) : null}
            </div>
            <DialogCloseButton className="-mr-2 -mt-1" />
          </div>
          <div ref={bodyRef} className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName ?? 'px-4 py-4')}>
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line px-4 py-3">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
