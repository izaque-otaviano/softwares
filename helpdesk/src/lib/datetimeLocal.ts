/** Conversões entre o `value` de `<input type="datetime-local">` (hora local) e ISO UTC no minuto. */

export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(Math.floor(d.getTime() / 60_000) * 60_000).toISOString();
}

/** "35 min", "2 h 10 min"; `—` se o término vier antes do início. */
export function formatDuration(startedIso: string, endedIso: string): string {
  const ms = Date.parse(endedIso) - Date.parse(startedIso);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
