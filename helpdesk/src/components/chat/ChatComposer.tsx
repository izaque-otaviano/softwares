import { Paperclip, SendHorizontal, Sparkles, X, Zap } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Button, IconButton, Menu, MenuContent, MenuItems, MenuTrigger, Switch, Textarea, type MenuItemSpec } from '@/components/ui';
import { cn } from '@/lib/cn';
import { toast } from '@/store/useUi';
import type { Chat, ChatMacro, ChatMessage, ChatQuickReply } from '@/types/chat';
import { fillTemplate, formatBytes, normalizeText } from './chatUtils';

const TYPING_REFRESH_MS = 2500;
const TYPING_IDLE_MS = 3500;
const MAX_SUGGESTIONS = 8;
const MAX_FILES = 10;

export interface ComposerSnippet {
  key: string;
  kind: 'quick' | 'macro';
  label: string;
  text: string;
  macroId?: string;
}

export interface ChatComposerProps {
  chat: Chat;
  initialDraft: string;
  onDraftChange: (text: string) => void;
  quickReplies: ChatQuickReply[];
  macros: ChatMacro[];
  replyTo: ChatMessage | null;
  onClearReply: () => void;
  /** Texto pela sala em tempo real. `false` = sem conexão (nada foi enviado). */
  onSendText: (body: string, opts: { internalNote: boolean; replyToId: string | null }) => boolean;
  onSendFiles: (input: { body: string; files: File[]; internalNote: boolean; replyToId: string | null }) => Promise<boolean>;
  onTyping: (isTyping: boolean) => void;
  onApplyMacro: (macroId: string) => void;
  connected: boolean;
}

const isMac = (): boolean => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || '');

/** Compositor: digitar "/" abre as respostas rápidas e macros (com busca); Ctrl/Cmd+Enter envia. */
export function ChatComposer(props: ChatComposerProps) {
  const { chat, initialDraft, onDraftChange, quickReplies, macros, replyTo, onClearReply, onSendText, onSendFiles, onTyping, onApplyMacro, connected } = props;
  const [value, setValue] = useState(initialDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [internalNote, setInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [active, setActive] = useState(0);
  const [slashClosed, setSlashClosed] = useState(false);
  const macroToApply = useRef<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const typingState = useRef({ on: false, last: 0, idle: undefined as ReturnType<typeof setTimeout> | undefined });

  const snippets = useMemo<ComposerSnippet[]>(
    () => [
      ...quickReplies.filter((q) => q.active && q.context === 'chat').map((q) => ({ key: `q${q.id}`, kind: 'quick' as const, label: q.label, text: q.text })),
      ...macros.filter((m) => m.active).map((m) => ({ key: `m${m.id}`, kind: 'macro' as const, label: m.name, text: m.body, macroId: m.id })),
    ],
    [quickReplies, macros],
  );

  const slash = !slashClosed && value.startsWith('/') && !value.includes('\n');
  const matches = useMemo(() => {
    if (!slash) return [];
    const q = normalizeText(value.slice(1).trim());
    return snippets.filter((s) => !q || normalizeText(`${s.label} ${s.text}`).includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [slash, value, snippets]);

  useEffect(() => setActive(0), [value]);

  // Para de avisar "digitando" e limpa o timer ao sair.
  useEffect(() => {
    const ref = typingState.current;
    return () => {
      if (ref.idle) clearTimeout(ref.idle);
      if (ref.on) onTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTyping = () => {
    const t = typingState.current;
    if (t.idle) clearTimeout(t.idle);
    t.idle = undefined;
    if (t.on) {
      t.on = false;
      onTyping(false);
    }
  };

  const noteTyping = (text: string) => {
    if (internalNote || !text.trim()) {
      stopTyping();
      return;
    }
    const t = typingState.current;
    const now = Date.now();
    if (!t.on || now - t.last > TYPING_REFRESH_MS) {
      t.on = true;
      t.last = now;
      onTyping(true);
    }
    if (t.idle) clearTimeout(t.idle);
    t.idle = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const change = (text: string) => {
    setValue(text);
    setSlashClosed(false);
    onDraftChange(text);
    noteTyping(text);
  };

  const insert = (s: ComposerSnippet) => {
    const text = fillTemplate(s.text, chat);
    macroToApply.current = s.macroId ?? null;
    setSlashClosed(true);
    const next = slash ? text : value ? `${value.replace(/\s+$/, '')}\n${text}` : text;
    change(next);
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(next.length, next.length);
      }
    });
  };

  const submit = async () => {
    const text = value.trim();
    if ((!text && files.length === 0) || sending) return;
    setSending(true);
    try {
      const reply = replyTo?.id ?? null;
      let ok: boolean;
      if (files.length > 0) ok = await onSendFiles({ body: text, files, internalNote, replyToId: reply });
      else ok = onSendText(text, { internalNote, replyToId: reply });
      if (!ok) {
        if (files.length === 0) toast.error('Sem conexão com a conversa. Aguarde a reconexão e tente de novo; o texto foi mantido.');
        return;
      }
      stopTyping();
      if (macroToApply.current) {
        onApplyMacro(macroToApply.current);
        macroToApply.current = null;
      }
      setValue('');
      setFiles([]);
      setSlashClosed(false);
      onDraftChange('');
      onClearReply();
      taRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        insert(matches[active]!);
        return;
      }
    }
    if (slash && e.key === 'Escape') {
      e.preventDefault();
      setSlashClosed(true);
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const addFiles = (list: File[]) => {
    if (list.length === 0) return;
    if (files.length + list.length > MAX_FILES) toast.info(`Até ${MAX_FILES} arquivos por mensagem.`);
    setFiles((cur) => [...cur, ...list].slice(0, MAX_FILES));
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = Array.from(e.clipboardData?.files ?? []);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const macroItems: MenuItemSpec[] = snippets.map((s) => ({ id: s.key, label: `${s.kind === 'macro' ? 'Macro' : 'Resposta'}: ${s.label}`, onSelect: () => insert(s) }));
  const mod = isMac() ? 'Cmd' : 'Ctrl';
  const canSend = (value.trim().length > 0 || files.length > 0) && !sending;

  return (
    <div className={cn('shrink-0 border-t border-line px-4 pb-3 pt-2', internalNote ? 'bg-note-bg' : 'bg-surface')}>
      {replyTo ? (
        <div className="mb-2 flex items-start gap-2 rounded-xs border-l-2 border-action bg-surface-1 px-2 py-1 text-xs text-fg-muted">
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-fg">Respondendo a {replyTo.authorName}</span>
            <span className="block truncate">{replyTo.body || 'Anexo'}</span>
          </span>
          <IconButton label="Cancelar resposta" size="sm" icon={<X aria-hidden className="h-3.5 w-3.5" />} onClick={onClearReply} />
        </div>
      ) : null}
      {files.length > 0 ? (
        <ul aria-label="Anexos a enviar" className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex h-6 max-w-full items-center gap-1 rounded border border-line bg-surface px-2 text-xs">
              <Paperclip aria-hidden className="h-3 w-3 shrink-0 text-fg-muted" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-fg-muted">{formatBytes(f.size)}</span>
              <button type="button" aria-label={`Remover ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))} className="ml-1 rounded-xs px-1 text-fg-muted outline-none hover:bg-hover focus-visible:shadow-focus">
                <X aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative">
        {slash ? (
          <div className="absolute inset-x-0 bottom-full z-10 mb-1 overflow-hidden rounded border border-line bg-surface shadow-menu">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-fg-muted">{snippets.length === 0 ? 'Nenhuma resposta rápida ou macro cadastrada.' : 'Nada encontrado para a busca.'}</p>
            ) : (
              <ul id={listId} role="listbox" aria-label="Respostas rápidas e macros" className="max-h-60 overflow-y-auto py-1">
                {matches.map((s, i) => (
                  <li
                    key={s.key}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insert(s);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={cn('flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm', i === active && 'bg-action-soft')}
                  >
                    <span className="shrink-0 font-semibold text-fg">{s.label}</span>
                    <span className="shrink-0 rounded-xs bg-surface-2 px-1 text-2xs text-fg-muted">{s.kind === 'macro' ? 'Macro' : 'Resposta rápida'}</span>
                    <span className="min-w-0 truncate text-xs text-fg-muted">{fillTemplate(s.text, chat)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <Textarea
          ref={taRef}
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={stopTyping}
          minRows={2}
          autoGrow
          aria-controls={slash && matches.length > 0 ? listId : undefined}
          aria-activedescendant={slash && matches.length > 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          aria-label={internalNote ? 'Escrever nota interna' : 'Escrever mensagem ao cliente'}
          placeholder={internalNote ? 'Nota interna: só a equipe vê' : 'Escreva uma mensagem ou digite / para respostas rápidas'}
          className="max-h-40 overflow-y-auto"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          aria-label="Selecionar arquivos"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <IconButton label="Anexar arquivos" icon={<Paperclip aria-hidden className="h-4 w-4" />} onClick={() => fileRef.current?.click()} />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" leadingIcon={<Sparkles aria-hidden className="h-4 w-4" />} disabled={macroItems.length === 0}>
              Macros e respostas
            </Button>
          </MenuTrigger>
          <MenuContent align="start" className="max-h-72 overflow-y-auto">
            <MenuItems items={macroItems} />
          </MenuContent>
        </Menu>
        <Switch checked={internalNote} onCheckedChange={setInternalNote} label="Nota interna" />
        <span className="ml-auto flex items-center gap-3">
          {!connected ? (
            <span role="status" className="text-xs text-fg-muted">
              Reconectando...
            </span>
          ) : (
            <span className="hidden items-center gap-1 text-xs text-fg-muted sm:inline-flex">
              <Zap aria-hidden className="h-3 w-3" />
              {mod}+Enter envia
            </span>
          )}
          <Button variant={internalNote ? 'ink' : 'primary'} leadingIcon={<SendHorizontal aria-hidden className="h-4 w-4" />} loading={sending} disabled={!canSend} onClick={() => void submit()}>
            {internalNote ? 'Salvar nota' : 'Enviar'}
          </Button>
        </span>
      </div>
    </div>
  );
}
