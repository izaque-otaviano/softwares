import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Input, Switch } from '@/components/ui';
import type { WorkWindow } from '@/types/admin-a';
import { isTime, toMinutes, validateWindows, WEEKDAYS, windowsOf } from './calendarUtils';

/** Barra de 24 h com as faixas do dia (só visual; o texto das faixas é a fonte de verdade). */
function DayBar({ windows }: { windows: WorkWindow[] }) {
  return (
    <div aria-hidden className="relative h-3 w-full min-w-40 rounded-xs bg-surface-2">
      {windows
        .filter((w) => isTime(w.start) && isTime(w.end) && toMinutes(w.end) > toMinutes(w.start))
        .map((w, i) => (
          <span key={i} className="absolute inset-y-0 rounded-xs bg-action" style={{ left: `${(toMinutes(w.start) / 1440) * 100}%`, width: `${((toMinutes(w.end) - toMinutes(w.start)) / 1440) * 100}%` }} />
        ))}
    </div>
  );
}

export interface WeekEditorProps {
  windows: WorkWindow[];
  onChange: (next: WorkWindow[]) => void;
  disabled?: boolean;
  /** Mostra os erros (depois da primeira tentativa de salvar). */
  showErrors?: boolean;
}

/** Editor visual do horário de atendimento: por dia da semana, uma ou mais faixas. */
export function WeekEditor({ windows, onChange, disabled, showErrors }: WeekEditorProps) {
  const errors = validateWindows(windows);

  const setDay = (day: number, list: WorkWindow[]) => onChange([...windows.filter((w) => w.weekday !== day), ...list].sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));

  const copyMondayToWeekdays = () => {
    const monday = windowsOf(windows, 0);
    onChange([...windows.filter((w) => w.weekday > 4), ...[0, 1, 2, 3, 4].flatMap((d) => monday.map((w) => ({ ...w, weekday: d })))]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">Horário de atendimento por dia da semana</h2>
        {disabled ? null : (
          <Button variant="ghost" onClick={copyMondayToWeekdays} disabled={windowsOf(windows, 0).length === 0}>
            Copiar segunda para seg a sex
          </Button>
        )}
      </div>
      <ul className="divide-y divide-line rounded border border-line">
        {WEEKDAYS.map((label, day) => {
          const list = windowsOf(windows, day);
          const open = list.length > 0;
          const error = showErrors ? errors[day] : undefined;
          return (
            <li key={day} className="grid grid-cols-1 gap-2 px-3 py-3 md:grid-cols-[170px_minmax(0,1fr)_200px] md:items-start">
              <Switch
                checked={open}
                disabled={disabled}
                aria-label={`${label}: atende`}
                label={label}
                onCheckedChange={(on) => setDay(day, on ? [{ weekday: day, start: '09:00', end: '18:00' }] : [])}
              />
              <div className="space-y-2">
                {open ? (
                  list.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${label}, faixa ${i + 1}: início`}
                        value={w.start}
                        disabled={disabled}
                        invalid={Boolean(error)}
                        onChange={(e) => setDay(day, list.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                        className="w-36"
                      />
                      <span aria-hidden className="text-fg-muted">
                        até
                      </span>
                      <Input
                        type="time"
                        aria-label={`${label}, faixa ${i + 1}: fim`}
                        value={w.end}
                        disabled={disabled}
                        invalid={Boolean(error)}
                        onChange={(e) => setDay(day, list.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                        className="w-36"
                      />
                      {disabled ? null : (
                        <IconButton label={`${label}: remover faixa ${i + 1}`} icon={<Trash2 />} onClick={() => setDay(day, list.filter((_, j) => j !== i))} />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="pt-1 text-sm text-fg-muted">Sem atendimento</p>
                )}
                {open && !disabled ? (
                  <Button
                    variant="ghost"
                    leadingIcon={<Plus />}
                    aria-label={`${label}: adicionar faixa`}
                    onClick={() => {
                      const last = list[list.length - 1];
                      const start = last && isTime(last.end) && toMinutes(last.end) < 1380 ? last.end : '13:00';
                      setDay(day, [...list, { weekday: day, start, end: '18:00' }]);
                    }}
                  >
                    Adicionar faixa
                  </Button>
                ) : null}
                {error ? (
                  <p role="alert" className="text-xs text-danger">
                    {error}
                  </p>
                ) : null}
              </div>
              <div className="pt-2">
                <DayBar windows={list} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
