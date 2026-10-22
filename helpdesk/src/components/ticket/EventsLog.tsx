import { CheckCircle2 } from 'lucide-react';
import { relativeTime } from '@/lib/time';
import type { AuditEvent, Ticket } from '@/types/domain';

const KIND_LABEL: Record<AuditEvent['kind'], string> = {
  notification: 'Notificação',
  sla: 'SLA',
  field_change: 'Alteração de campo',
  client_meta: 'Metadados técnicos',
  ai_triage: 'Classificação de IA',
};

/** Classificações de IA com confiança, a partir dos campos personalizados do ticket. */
export function aiClassifications(fields: Ticket['customFields']): string[] {
  const rows: Array<[string, string, string]> = [
    ['Tópico', 'topico', 'topico_confianca'],
    ['Idioma', 'idioma', 'idioma_confianca'],
    ['Sentimento', 'sentimento', 'sentimento_confianca'],
  ];
  return rows
    .filter(([, v]) => fields[v])
    .map(([label, v, c]) => `${label}: ${fields[v]}${fields[c] ? ` (confiança ${fields[c]}%)` : ''}`);
}

export function EventRow({ event, now, fields }: { event: AuditEvent; now: Date; fields?: Ticket['customFields'] }) {
  const meta = event.meta ? Object.entries(event.meta) : [];
  const ai = event.kind === 'ai_triage' && fields ? aiClassifications(fields) : [];
  return (
    <div data-testid="event" data-kind={event.kind} className="flex gap-3 pl-[14px] text-xs text-fg-muted">
      <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <p>
          <span className="sr-only">{KIND_LABEL[event.kind]}: </span>
          <span className="text-fg">{event.text}</span> · <time dateTime={event.createdAt}>{relativeTime(event.createdAt, now)}</time>
        </p>
        {meta.length > 0 ? (
          <ul className="mt-0.5">
            {meta.map(([k, v]) => (
              <li key={k}>
                {k}: {v}
              </li>
            ))}
          </ul>
        ) : null}
        {ai.length > 0 ? (
          <ul className="mt-0.5">
            {ai.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
