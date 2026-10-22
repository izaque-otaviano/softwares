import { Send, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Drawer, Input } from '@/components/ui';
import { cn } from '@/lib/cn';

const SUGGESTIONS = [
  'Como criar um gatilho?',
  'Quantas licenças de agente restam?',
  'Como adicionar um campo personalizado?',
  'Quais macros estão sem uso?',
];

interface Message {
  from: 'user' | 'ai';
  text: string;
}

/** Resposta mockada (sem IA real) escolhida por palavra-chave. */
export function copilotReply(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('gatilho')) return 'Em Objetos e regras › Gatilhos, use "Criar gatilho", defina as condições e as ações e salve. O gatilho passa a valer para novos tickets.';
  if (q.includes('licen')) return 'Você usa 4 das 5 licenças de agente. Para liberar uma, suspenda um membro em Pessoas › Membros da equipe.';
  if (q.includes('campo')) return 'Vá em Objetos e regras › Campos e clique em "Adicionar campo". Escolha o tipo, dê um nome e salve.';
  if (q.includes('macro')) return 'Em Início, a tabela "Uso de recursos" mostra quantas macros não foram usadas nos últimos 30 dias.';
  return 'Esta é uma resposta de demonstração. Pergunte sobre gatilhos, campos, macros ou licenças para ver exemplos.';
}

export interface CopilotProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Painel lateral do Copiloto: chips de sugestões, conversa e campo de pergunta. */
export function Copilot({ open, onOpenChange }: CopilotProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { from: 'user', text: q }]);
    setDraft('');
    setThinking(true);
    timer.current = setTimeout(() => {
      setMessages((m) => [...m, { from: 'ai', text: copilotReply(q) }]);
      setThinking(false);
    }, 400);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Como posso ajudar?"
      description="O Copiloto responde dúvidas sobre a central de administração."
      footer={
        <form onSubmit={submit} className="flex w-full items-center gap-2">
          <Input
            aria-label="Pergunte ao Copiloto"
            placeholder="Pergunte ao Copiloto"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" variant="primary" leadingIcon={<Send />} disabled={!draft.trim() || thinking}>
            Enviar
          </Button>
        </form>
      }
    >
      <div className="flex flex-col gap-4 py-2">
        {messages.length === 0 ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
              <Sparkles aria-hidden className="h-4 w-4 text-ai" />
              Sugestões
            </p>
            <ul className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-pill border border-line-strong bg-surface px-3 py-1 text-left text-xs text-fg outline-none transition-colors duration-100 hover:bg-hover focus-visible:shadow-focus"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul aria-live="polite" className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <li
                key={i}
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  m.from === 'user' ? 'self-end bg-ink-active text-fg-inverse' : 'self-start border border-line bg-surface-1 text-fg',
                )}
              >
                {m.text}
              </li>
            ))}
            {thinking ? <li className="self-start text-xs text-fg-muted">Pensando...</li> : null}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
