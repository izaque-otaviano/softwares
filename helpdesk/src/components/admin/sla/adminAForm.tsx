import { useId, useState, type ReactNode } from 'react';
import { ApiError } from '@/api/errors';
import { Banner, Input, Select } from '@/components/ui';

/** "45 min", "2 h", "1 h 30 min". */
export function formatMinutes(total: number | null | undefined): string {
  if (total === null || total === undefined) return '—';
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Erros por campo devolvidos pelo backend (`fieldErrors`), pela chave do DTO. */
export const serverFieldError = (e: unknown, key: string): string | undefined => (e instanceof ApiError ? e.fieldErrors?.[key]?.[0] : undefined);

/** Mensagem geral do erro de salvar (400/403/409/rede). 403 mantém o texto padrão e o formulário aberto. */
export const saveErrorMessage = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'Não foi possível salvar. Tente novamente.');

/** Aviso padrão do que vale só neste navegador. */
export function LocalOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <Banner tone="info" title="Somente neste navegador">
      {children} O backend ainda não tem este recurso.
    </Banner>
  );
}

export function ReadOnlyNotice({ children }: { children: ReactNode }) {
  return (
    <div className="px-6 pt-2">
      <Banner tone="info">{children}</Banner>
    </div>
  );
}

type Unit = 'min' | 'h';
const initialUnit = (v: number | null): Unit => (v !== null && v > 0 && v % 60 === 0 ? 'h' : 'min');
const toText = (v: number | null, u: Unit) => (v === null ? '' : String(u === 'h' ? v / 60 : v));

export interface DurationFieldProps {
  label: string;
  /** Minutos; null = vazio. */
  value: number | null;
  onChange: (minutes: number | null) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

/** Duração em minutos digitada como número + unidade (minutos ou horas). */
export function DurationField({ label, value, onChange, error, hint, required, disabled }: DurationFieldProps) {
  const id = useId();
  const [unit, setUnit] = useState<Unit>(() => initialUnit(value));
  const [text, setText] = useState(() => toText(value, initialUnit(value)));

  const emit = (t: string, u: Unit) => {
    const n = Number(t.replace(',', '.'));
    if (t.trim() === '' || Number.isNaN(n)) return onChange(null);
    onChange(Math.round(u === 'h' ? n * 60 : n));
  };

  return (
    <div role="group" aria-labelledby={`${id}-l`} className="block">
      <span id={`${id}-l`} className="mb-1 block text-xs font-semibold text-fg">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </span>
      <div className="flex items-start gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={unit === 'h' ? 0.25 : 1}
          aria-label={`${label}: valor`}
          aria-required={required || undefined}
          aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
          invalid={Boolean(error)}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emit(e.target.value, unit);
          }}
          className="w-28"
        />
        <Select
          aria-label={`${label}: unidade`}
          value={unit}
          disabled={disabled}
          onValueChange={(u) => {
            const next = u as Unit;
            // Mantém o número digitado e reinterpreta na nova unidade.
            setUnit(next);
            emit(text, next);
          }}
          options={[
            { value: 'min', label: 'minutos' },
            { value: 'h', label: 'horas' },
          ]}
          className="w-28"
        />
      </div>
      {hint && !error ? (
        <p id={`${id}-h`} className="mt-1 text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
      <div aria-live="polite">
        {error ? (
          <p id={`${id}-e`} className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
