import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banner } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  breadcrumb?: Crumb[];
  title: ReactNode;
  /** Badge ou texto ao lado do título (ex.: "Ativo"). */
  titleAside?: ReactNode;
  description?: ReactNode;
  learnMoreHref?: string;
  /** CTA(s) à direita. */
  actions?: ReactNode;
  /** Banner dispensável opcional. */
  banner?: { tone?: 'info' | 'warning'; title?: string; children: ReactNode; onDismiss: () => void };
  className?: string;
}

/** Breadcrumb → H1 → descrição + "Saiba mais" → CTA à direita. */
export function PageHeader({ breadcrumb, title, titleAside, description, learnMoreHref, actions, banner, className }: PageHeaderProps) {
  return (
    <header className={cn('px-6 pt-5', className)}>
      {breadcrumb?.length ? (
        <nav aria-label="Trilha de navegação" className="mb-2 text-xs text-fg-muted">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumb.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {c.to ? (
                  <Link to={c.to} className="rounded-xs text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {banner ? (
        <div className="relative mb-4">
          <Banner tone={banner.tone ?? 'info'} title={banner.title} onDismiss={banner.onDismiss}>
            {banner.children}
          </Banner>
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-normal text-fg">{title}</h1>
            {titleAside}
          </div>
          {description ? (
            <p className="mt-1 max-w-[68ch] text-sm text-fg-muted">
              {description}
              {learnMoreHref ? (
                <>
                  {' '}
                  <a href={learnMoreHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 rounded-xs text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
                    Saiba mais
                    <ExternalLink aria-hidden className="h-3 w-3" />
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export interface EditFooterProps {
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  saveLabel?: string;
  disabled?: boolean;
}

/** Rodapé fixo das páginas de edição: Cancelar (link) e Salvar (azul). */
export function EditFooter({ onCancel, onSave, saving, saveLabel = 'Salvar', disabled }: EditFooterProps) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-4 border-t border-line bg-surface px-6 py-3">
      <button type="button" onClick={onCancel} className="rounded-xs text-sm text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="inline-flex h-8 items-center rounded bg-action px-4 text-sm font-semibold text-fg-inverse outline-none transition-colors duration-100 hover:bg-action-hover focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? 'Salvando...' : saveLabel}
      </button>
    </div>
  );
}

