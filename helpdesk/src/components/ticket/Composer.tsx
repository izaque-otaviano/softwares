import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useDirectory } from '@/components/lists/useDirectory';
import { Input, TagInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import { toast } from '@/store/useUi';
import type { Attachment } from '@/types/domain';
import { mockAiTransform } from './AiMenu';
import { ComposerToolbar } from './ComposerToolbar';
import { hasBodyContent, useFormEntry, useFormStore } from './formStore';
import { AttachmentChip } from './MessageBubble';
import { ReplyModeSwitch } from './ReplyModeSwitch';

const PLACEHOLDER = {
  public: 'Escreva sua resposta ao cliente…',
  internal: 'Escreva uma observação interna…',
  call: 'Registre o resumo da chamada…',
} as const;

function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function Composer({ ticketKey }: { ticketKey: string }) {
  const entry = useFormEntry(ticketKey);
  const users = useDirectory();
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const mode = entry?.replyMode ?? 'public';
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const lastRev = useRef(entry?.bodyRev ?? 0);
  const aiTimer = useRef<ReturnType<typeof setTimeout>>();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: () => PLACEHOLDER[modeRef.current] }),
    ],
    content: entry?.bodyHtml ?? '',
    editorProps: { attributes: { 'aria-label': 'Mensagem', 'aria-multiline': 'true', role: 'textbox', class: 'min-h-[72px] max-h-48 overflow-y-auto px-3 py-2 text-sm text-fg outline-none' } },
    onUpdate: ({ editor: ed }) => useFormStore.getState().setBody(ticketKey, ed.isEmpty ? '' : ed.getHTML()),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  // Relê o corpo quando algo fora do editor o muda (macro, envio, reset).
  const rev = entry?.bodyRev;
  useEffect(() => {
    if (!editor || rev === undefined || rev === lastRev.current) return;
    lastRev.current = rev;
    const html = useFormStore.getState().forms[ticketKey]?.bodyHtml ?? '';
    editor.commands.setContent(html, false);
    if (!hasBodyContent(html)) setFiles([]);
  }, [rev, editor, ticketKey]);

  useEffect(() => () => clearTimeout(aiTimer.current), []);

  const addFiles = useCallback((list: File[]) => {
    if (list.length) setFiles((prev) => [...prev, ...list.map((f) => ({ name: f.name, size: f.size }))]);
  }, []);

  const runAi = (action: string) => {
    if (!editor) return;
    const text = editor.getText({ blockSeparator: '\n\n' }).trim();
    if (!text) {
      toast.info('Escreva algo para a IA transformar');
      return;
    }
    setAiBusy(true);
    aiTimer.current = setTimeout(() => {
      editor.commands.setContent(textToHtml(mockAiTransform(text, action)), true);
      setAiBusy(false);
    }, 700);
  };

  if (!entry) return null;
  const note = mode === 'internal';
  const call = mode === 'call';
  const requester = entry.values.requesterId ? users.get(entry.values.requesterId) : undefined;
  const store = useFormStore.getState();
  const ccValues = entry.values.ccIds.map((id) => users.get(id)?.email ?? id);

  const onCcChange = (emails: string[]) => {
    const byEmail = new Map([...users.values()].map((u) => [u.email.toLowerCase(), u.id]));
    store.patch(ticketKey, { ccIds: emails.map((e) => byEmail.get(e.toLowerCase()) ?? e) });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };
  const onPaste = (e: ClipboardEvent) => {
    const pasted = Array.from(e.clipboardData.files);
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  return (
    <div
      data-testid="composer"
      data-mode={mode}
      className={cn('shrink-0 border-t border-line px-6 py-3', note ? 'bg-note-bg' : 'bg-surface')}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <ReplyModeSwitch mode={mode} allowCall={!entry.isNew} onChange={(m) => store.setReplyMode(ticketKey, m)} />
        {mode === 'public' && requester ? (
          <>
            <span className="inline-flex items-center gap-1 text-sm text-fg">
              <span className="text-fg-muted">Para</span>
              <span className="font-semibold">{requester.name}</span>
              <button
                type="button"
                aria-label="Alterar solicitante"
                onClick={() => document.querySelector<HTMLElement>('[aria-label="Solicitante"], #requester')?.focus()}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-fg-muted outline-none hover:bg-hover focus-visible:shadow-focus"
              >
                <Pencil aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
            {!entry.ccOpen ? (
              <button type="button" onClick={() => store.setCcOpen(ticketKey, true)} className="rounded-xs text-sm text-action outline-none hover:text-action-hover focus-visible:shadow-focus">
                CC
              </button>
            ) : null}
          </>
        ) : null}
        {note ? <span className="text-sm font-semibold text-note-badgeText">Observação interna</span> : null}
        {call ? (
          <Input
            aria-label="Insira um número"
            placeholder="Insira um número"
            inputMode="tel"
            value={entry.callNumber}
            onChange={(e) => store.setCallNumber(ticketKey, e.target.value)}
            className="w-48"
          />
        ) : null}
      </div>
      {mode === 'public' && entry.ccOpen ? (
        <div className="mb-2 flex items-start gap-2">
          <span className="pt-1.5 text-sm text-fg-muted">CC</span>
          <div className="min-w-0 flex-1">
            <TagInput
              aria-label="CC (e-mails)"
              placeholder="Adicionar e-mails"
              value={ccValues}
              onChange={onCcChange}
              validate={(t) => (/^\S+@\S+\.\S+$/.test(t) ? null : 'Informe um e-mail válido')}
              suggestions={[...users.values()].filter((u) => u.role !== 'agent').slice(0, 20).map((u) => u.email)}
            />
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          'rounded border bg-surface transition-colors duration-100',
          focused ? 'border-action shadow-focus' : dragging ? 'border-action' : 'border-line-strong',
          note && !focused && 'border-note-badge',
        )}
      >
        <EditorContent editor={editor} />
        {files.length > 0 ? (
          <ul aria-label="Anexos" className="flex flex-wrap gap-2 px-3 pb-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="max-w-full">
                <AttachmentChip file={f} onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="border-t border-line px-1">
          <ComposerToolbar editor={editor} note={note} aiBusy={aiBusy} onAi={runAi} onFiles={addFiles} />
        </div>
      </div>
    </div>
  );
}
