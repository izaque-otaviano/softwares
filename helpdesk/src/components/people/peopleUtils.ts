import { openNewTicket } from '@/components/shell/openTab';
import { useFormStore } from '@/components/ticket/formStore';
import { useTabs } from '@/store/useTabs';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en', label: 'Inglês' },
  { value: 'es', label: 'Espanhol' },
  { value: 'fr', label: 'Francês' },
];

export const TIMEZONE_OPTIONS = [
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) Brasília' },
  { value: 'America/Manaus', label: '(GMT-04:00) Manaus' },
  { value: 'America/Rio_Branco', label: '(GMT-05:00) Rio Branco' },
  { value: 'America/Noronha', label: '(GMT-02:00) Fernando de Noronha' },
  { value: 'America/New_York', label: '(GMT-05:00) Nova York' },
  { value: 'Europe/Lisbon', label: '(GMT+00:00) Lisboa' },
];

export function timezoneLabel(tz: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz;
}

export function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

/** Pelo menos uma das opções, mesmo que o valor atual não esteja na lista padrão. */
export function withCurrent(options: { value: string; label: string }[], current: string) {
  return current && !options.some((o) => o.value === current) ? [...options, { value: current, label: current }] : options;
}

/**
 * Abre um novo ticket já com o solicitante preenchido: abre a aba `new-ticket:N` e grava o solicitante no
 * formStore antes de a tela montar (a página só inicializa o formulário se ele ainda não existir).
 */
export function openNewTicketFor(requesterId: string): void {
  openNewTicket();
  const key = useTabs.getState().activeTabId;
  if (!key || !key.startsWith('new-ticket:')) return;
  const store = useFormStore.getState();
  if (!store.forms[key]) store.init(key, null);
  useFormStore.getState().patch(key, { requesterId });
}
