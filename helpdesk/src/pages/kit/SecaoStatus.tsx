import { Sparkles, Tag } from 'lucide-react';
import { useState } from 'react';
import {
  Avatar,
  Badge,
  Pill,
  SlaPill,
  StatusBadge,
  StatusDot,
  PRESENCE_LABEL,
  type BadgeTone,
  type PillTone,
  type Presence,
} from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { toast } from '@/store/useUi';
import { Celula, Cod, Grade, Secao, Subsecao, TabelaVariantes } from './Blocos';
import { NOMES, SLA_AGORA, SLA_EXEMPLOS } from './dados';

/* -------------------------------------------------------------------------- */
/* StatusBadge e StatusDot                                                     */
/* -------------------------------------------------------------------------- */

function StatusBadges() {
  return (
    <TabelaVariantes
      legenda="StatusBadge dos cinco status padrão"
      rotuloLinha="Status (cor)"
      colunas={['Visão do agente', 'Visão do cliente', 'Compacto', 'StatusDot']}
      linhas={DEFAULT_STATUSES.map((status) => ({
        id: status.id,
        rotulo: `${status.id} · ${status.color}`,
        celulas: [
          <StatusBadge key="a" status={status} />,
          <StatusBadge key="c" status={status} audience="end_user" />,
          <StatusBadge key="k" status={status} compact />,
          <span key="d" className="inline-flex items-center gap-2 text-sm">
            <StatusDot color={status.color} />
            {status.agentName}
          </span>,
        ],
      }))}
    />
  );
}

const PRESENCAS: Presence[] = ['available', 'away', 'offline'];

function Presencas() {
  return (
    <ul className="flex flex-wrap gap-x-8 gap-y-3">
      {PRESENCAS.map((presenca) => (
        <li key={presenca} className="inline-flex items-center gap-2 text-sm">
          <StatusDot presence={presenca} />
          {PRESENCE_LABEL[presenca]}
        </li>
      ))}
      <li className="inline-flex items-center gap-2 text-sm">
        <StatusDot color="open" label="Aberto" />
        com <Cod>label</Cod> (texto só para leitor de tela)
      </li>
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge e Pill                                                                */
/* -------------------------------------------------------------------------- */

const TONS_BADGE: { tom: BadgeTone; texto: string }[] = [
  { tom: 'neutral', texto: 'Campo padrão' },
  { tom: 'action', texto: 'Novo recurso' },
  { tom: 'danger', texto: 'Suspenso' },
  { tom: 'note', texto: 'Interno' },
  { tom: 'ai', texto: 'Sugerido por IA' },
  { tom: 'success', texto: 'Ativo' },
];

function Badges() {
  return (
    <TabelaVariantes
      legenda="Badge por tom e tamanho"
      rotuloLinha="Tom"
      colunas={['md (12px/600, raio 4)', 'sm (10px/600, raio 2)']}
      linhas={TONS_BADGE.map(({ tom, texto }) => ({
        id: tom,
        rotulo: tom,
        celulas: [
          <Badge key="m" tone={tom}>
            {texto}
          </Badge>,
          <Badge key="s" tone={tom} size="sm">
            {texto}
          </Badge>,
        ],
      }))}
    />
  );
}

const TONS_PILL: { tom: PillTone; texto: string }[] = [
  { tom: 'neutral', texto: 'vip' },
  { tom: 'action', texto: 'api' },
  { tom: 'danger', texto: 'urgente' },
  { tom: 'note', texto: 'nota interna' },
  { tom: 'ai', texto: 'sugestão' },
];

function Pills() {
  return (
    <TabelaVariantes
      legenda="Pill por tom"
      rotuloLinha="Tom"
      colunas={['Simples', 'Com ícone', 'Com remover']}
      linhas={TONS_PILL.map(({ tom, texto }) => ({
        id: tom,
        rotulo: tom,
        celulas: [
          <Pill key="s" tone={tom}>
            {texto}
          </Pill>,
          <Pill key="i" tone={tom} icon={tom === 'ai' ? <Sparkles /> : <Tag />}>
            {texto}
          </Pill>,
          <Pill key="r" tone={tom} onRemove={() => toast.info(`Tag “${texto}” removida`)} removeLabel={`Remover tag ${texto}`}>
            {texto}
          </Pill>,
        ],
      }))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* SlaPill                                                                     */
/* -------------------------------------------------------------------------- */

function SlaPills() {
  // Vence daqui a 1h 02m: vira âmbar em cerca de 2 minutos, com a pílula atualizando a cada 30 s.
  const [venceEm] = useState(() => new Date(Date.now() + 62 * 60_000).toISOString());
  return (
    <div className="flex flex-col gap-4">
      <TabelaVariantes
        legenda="SlaPill nos quatro estados"
        rotuloLinha="Estado"
        colunas={['Padrão', 'Compacta', 'Com meta (target)']}
        linhas={SLA_EXEMPLOS.map((sla, indice) => ({
          id: sla.id,
          rotulo: sla.rotulo,
          celulas: [
            <SlaPill key="p" dueAt={sla.dueAt} state={sla.state} now={SLA_AGORA} />,
            <SlaPill key="c" dueAt={sla.dueAt} state={sla.state} now={SLA_AGORA} compact />,
            <SlaPill key="t" dueAt={sla.dueAt} state={sla.state} now={SLA_AGORA} target={indice % 2 === 0 ? 'first_reply' : 'resolution'} />,
          ],
        }))}
      />
      <Grade colunas={3}>
        <Celula rotulo="Ao vivo" nota="Atualiza a cada 30 s e muda de cor sozinha.">
          <div>
            <SlaPill dueAt={venceEm} state="ok" target="first_reply" />
          </div>
        </Celula>
        <Celula rotulo="Ao vivo, compacta">
          <div>
            <SlaPill dueAt={venceEm} state="ok" compact />
          </div>
        </Celula>
      </Grade>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

const TAMANHOS_AVATAR = [20, 24, 32, 40, 56, 72];

/** Imagem inválida: dispara o erro de carregamento sem tocar na rede, para mostrar o fallback. */
const FOTO_QUEBRADA = 'data:image/png;base64,';

function Avatares() {
  return (
    <div className="flex flex-col gap-6">
      <Grade colunas={3}>
        <Celula rotulo="Sem nome e sem foto" nota="Círculo cinza com silhueta.">
          <div>
            <Avatar />
          </div>
        </Celula>
        <Celula rotulo="Com nome" nota="Iniciais sobre cor derivada do nome.">
          <div>
            <Avatar name="Marina Duarte" />
          </div>
        </Celula>
        <Celula rotulo="Um só nome">
          <div>
            <Avatar name="Rafael" />
          </div>
        </Celula>
        <Celula rotulo="Foto" nota="Imagem carregada.">
          <div>
            <Avatar name="Camila Nogueira" src="/favicon.svg" />
          </div>
        </Celula>
        <Celula rotulo="Foto quebrada, com nome" nota="Cai para as iniciais.">
          <div>
            <Avatar name="Henrique Salles" src={FOTO_QUEBRADA} />
          </div>
        </Celula>
        <Celula rotulo="Foto quebrada, sem nome" nota="Cai para a silhueta.">
          <div>
            <Avatar src={FOTO_QUEBRADA} />
          </div>
        </Celula>
      </Grade>

      <Celula rotulo="Presença" nota="O ponto aparece no canto e entra no nome acessível.">
        <ul className="flex flex-wrap gap-6">
          {PRESENCAS.map((presenca) => (
            <li key={presenca} className="flex items-center gap-3">
              <Avatar name="Beatriz Carvalho" presence={presenca} size={40} />
              <span className="text-sm text-fg-muted">{PRESENCE_LABEL[presenca]}</span>
            </li>
          ))}
        </ul>
      </Celula>

      <Celula rotulo="Tamanhos" nota="A fonte das iniciais acompanha o tamanho.">
        <ul className="flex flex-wrap items-end gap-4">
          {TAMANHOS_AVATAR.map((tamanho) => (
            <li key={tamanho} className="flex flex-col items-center gap-1">
              <Avatar name="Lucas Prado" size={tamanho} presence={tamanho >= 32 ? 'available' : undefined} />
              <span className="text-2xs text-fg-muted">{tamanho}px</span>
            </li>
          ))}
        </ul>
      </Celula>

      <Celula rotulo="Paleta de cores" nota="Paleta fechada de tokens, todas com contraste mínimo de 4,5:1 com o texto branco.">
        <ul className="flex flex-wrap gap-3">
          {NOMES.map((nome) => (
            <li key={nome} className="flex items-center gap-2">
              <Avatar name={nome} size={32} decorative />
              <span className="text-xs text-fg-muted">{nome}</span>
            </li>
          ))}
        </ul>
      </Celula>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoStatus() {
  return (
    <Secao
      id="status"
      numero={4}
      titulo="Status e badges"
      descricao={
        <>
          Cor de status só existe via <Cod>StatusBadge</Cod> e <Cod>StatusDot</Cod>: fundo sólido a partir do token, nunca hex direto.
        </>
      }
    >
      <Subsecao
        titulo="StatusBadge e StatusDot"
        descricao="Os cinco status padrão. O cliente vê nomes próprios (Pendente vira “Aguardando resposta”). Em Novo o texto é escuro para manter o contraste AA."
      >
        <StatusBadges />
      </Subsecao>

      <Subsecao titulo="Presença do agente">
        <Presencas />
      </Subsecao>

      <Subsecao titulo="Badge">
        <Badges />
      </Subsecao>

      <Subsecao titulo="Pill" descricao="Raio total, 12px. O botão de remover tem 24 × 24 e nome específico.">
        <Pills />
      </Subsecao>

      <Subsecao
        titulo="SlaPill"
        descricao="Verde, depois âmbar (60 min ou menos), depois vermelho. Texto 49m, 1h 20m ou “Estourado há 12m”. Os tempos abaixo são fixos (relógio de referência 10/03/2026, 15:00 UTC)."
      >
        <SlaPills />
      </Subsecao>

      <Subsecao titulo="Avatar">
        <Avatares />
      </Subsecao>
    </Secao>
  );
}
