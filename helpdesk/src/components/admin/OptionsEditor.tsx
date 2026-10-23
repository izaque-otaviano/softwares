import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton, Input } from '@/components/ui';
import { OPTION_MAX } from '@/lib/customFields';
import type { FieldOption } from '@/types/domain';

/**
 * Editor das opções da lista suspensa: a ordem da lista é a ordem de exibição, rótulos únicos (sem diferenciar caixa).
 * Opção que já existe mantém o `value` guardado nos tickets mesmo que o rótulo mude; opção nova usa o rótulo como valor.
 */
export function OptionsEditor({ value, onChange, disabled, invalid, id, describedBy }: { value: FieldOption[]; onChange: (next: FieldOption[]) => void; disabled?: boolean; invalid?: boolean; id?: string; describedBy?: string }) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>();

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    if (label.length > OPTION_MAX) return setDraftError(`Use no máximo ${OPTION_MAX} caracteres.`);
    if (value.some((o) => o.label.toLowerCase() === label.toLowerCase() || o.value.toLowerCase() === label.toLowerCase())) return setDraftError(`A opção "${label}" já existe.`);
    onChange([...value, { value: label, label, fresh: true }]);
    setDraft('');
    setDraftError(undefined);
  };
  const move = (i: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(i, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };
  const rename = (i: number, label: string) => onChange(value.map((o, j) => (j === i ? (o.fresh ? { ...o, label, value: label.trim() } : { ...o, label }) : o)));

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Opções da lista">
      {value.length > 0 ? (
        <ol className="flex flex-col gap-1">
          {value.map((o, i) => (
            <li key={`${o.value}-${i}`} className="flex items-center gap-1">
              <span aria-hidden="true" className="w-5 shrink-0 text-right text-xs text-fg-muted tabular-nums">
                {i + 1}
              </span>
              <Input aria-label={`Opção ${i + 1}`} value={o.label} disabled={disabled} maxLength={OPTION_MAX} onChange={(e) => rename(i, e.target.value)} className="min-w-0 flex-1" />
              <IconButton label={`Subir opção ${o.label || i + 1}`} icon={<ArrowUp />} variant="ghost" disabled={disabled || i === 0} onClick={() => move(i, i - 1)} />
              <IconButton label={`Descer opção ${o.label || i + 1}`} icon={<ArrowDown />} variant="ghost" disabled={disabled || i === value.length - 1} onClick={() => move(i, i + 1)} />
              <IconButton label={`Remover opção ${o.label || i + 1}`} icon={<X />} variant="ghost" disabled={disabled} onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex items-start gap-2">
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-label="Nova opção"
          placeholder="Nova opção"
          value={draft}
          invalid={invalid || Boolean(draftError)}
          disabled={disabled}
          maxLength={OPTION_MAX}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button variant="outline" leadingIcon={<Plus />} disabled={disabled || !draft.trim()} onClick={add}>
          Adicionar
        </Button>
      </div>
      {draftError ? (
        <p role="alert" className="text-xs text-danger">
          {draftError}
        </p>
      ) : null}
    </div>
  );
}
