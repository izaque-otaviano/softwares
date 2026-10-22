import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Cod, Grade, Secao, Subsecao } from './Blocos';

/* -------------------------------------------------------------------------- */
/* Cores                                                                       */
/* -------------------------------------------------------------------------- */

interface Amostra {
  /** Nome do token no Tailwind (`bg-<nome>`). */
  nome: string;
  /** Classe literal, para o Tailwind enxergá-la. */
  classe: string;
  /** Variável CSS espelhada em `src/index.css`; de lá vem o valor exibido. */
  variavel: string;
}

interface GrupoCores {
  titulo: string;
  amostras: Amostra[];
}

const GRUPOS_CORES: GrupoCores[] = [
  {
    titulo: 'Texto (fg)',
    amostras: [
      { nome: 'fg', classe: 'bg-fg', variavel: '--fg' },
      { nome: 'fg-muted', classe: 'bg-fg-muted', variavel: '--fg-muted' },
      { nome: 'fg-subtle', classe: 'bg-fg-subtle', variavel: '--fg-subtle' },
      { nome: 'fg-inverse', classe: 'bg-fg-inverse', variavel: '--fg-inverse' },
    ],
  },
  {
    titulo: 'Linhas (line)',
    amostras: [
      { nome: 'line', classe: 'bg-line', variavel: '--line' },
      { nome: 'line-strong', classe: 'bg-line-strong', variavel: '--line-strong' },
    ],
  },
  {
    titulo: 'Superfícies (surface) e hover',
    amostras: [
      { nome: 'surface', classe: 'bg-surface', variavel: '--surface' },
      { nome: 'surface-1', classe: 'bg-surface-1', variavel: '--surface-1' },
      { nome: 'surface-2', classe: 'bg-surface-2', variavel: '--surface-2' },
      { nome: 'hover', classe: 'bg-hover', variavel: '--hover' },
    ],
  },
  {
    titulo: 'Ação (action) e tinta (ink)',
    amostras: [
      { nome: 'action', classe: 'bg-action', variavel: '--action' },
      { nome: 'action-hover', classe: 'bg-action-hover', variavel: '--action-hover' },
      { nome: 'action-soft', classe: 'bg-action-soft', variavel: '--action-soft' },
      { nome: 'ink', classe: 'bg-ink', variavel: '--ink' },
      { nome: 'ink-active', classe: 'bg-ink-active', variavel: '--ink-active' },
    ],
  },
  {
    titulo: 'Nota interna (note) e balão do cliente (bubble)',
    amostras: [
      { nome: 'note-bg', classe: 'bg-note-bg', variavel: '--note-bg' },
      { nome: 'note-badge', classe: 'bg-note-badge', variavel: '--note-badge' },
      { nome: 'note-badgeText', classe: 'bg-note-badgeText', variavel: '--note-badge-text' },
      { nome: 'bubble-customer', classe: 'bg-bubble-customer', variavel: '--bubble-customer' },
    ],
  },
  {
    titulo: 'SLA (sla)',
    amostras: [
      { nome: 'sla-bg', classe: 'bg-sla-bg', variavel: '--sla-bg' },
      { nome: 'sla-text', classe: 'bg-sla-text', variavel: '--sla-text' },
      { nome: 'sla-warn', classe: 'bg-sla-warn', variavel: '--sla-warn' },
      { nome: 'sla-warnText', classe: 'bg-sla-warnText', variavel: '--sla-warn-text' },
      { nome: 'sla-breach', classe: 'bg-sla-breach', variavel: '--sla-breach' },
      { nome: 'sla-breachText', classe: 'bg-sla-breachText', variavel: '--sla-breach-text' },
    ],
  },
  {
    titulo: 'Alerta e IA',
    amostras: [
      { nome: 'danger', classe: 'bg-danger', variavel: '--danger' },
      { nome: 'ai', classe: 'bg-ai', variavel: '--ai' },
    ],
  },
  {
    titulo: 'Status do ticket (status)',
    amostras: [
      { nome: 'status-new', classe: 'bg-status-new', variavel: '--status-new' },
      { nome: 'status-open', classe: 'bg-status-open', variavel: '--status-open' },
      { nome: 'status-hold', classe: 'bg-status-hold', variavel: '--status-hold' },
      { nome: 'status-pending', classe: 'bg-status-pending', variavel: '--status-pending' },
      { nome: 'status-solved', classe: 'bg-status-solved', variavel: '--status-solved' },
    ],
  },
];

/** Valor de uma variável CSS de `:root`, lido em tempo de execução. Hex em maiúsculas. */
function lerVariavel(nome: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  if (!valor) return '—';
  return valor.startsWith('#') ? valor.toUpperCase() : valor;
}

/** Lê várias variáveis depois da montagem (a folha de estilos já está aplicada). */
function useVariaveis(nomes: string[]): Record<string, string> {
  const [valores, setValores] = useState<Record<string, string>>({});
  const chave = nomes.join('|');
  useEffect(() => {
    const lidos: Record<string, string> = {};
    for (const nome of chave.split('|')) lidos[nome] = lerVariavel(nome);
    setValores(lidos);
  }, [chave]);
  return valores;
}

function CartaoCor({ amostra, valor }: { amostra: Amostra; valor: string | undefined }) {
  return (
    <li className="overflow-hidden rounded border border-line bg-surface">
      <div aria-hidden className={`h-10 ${amostra.classe}`} />
      <div className="border-t border-line px-3 py-2">
        <p className="truncate text-xs font-semibold text-fg">{amostra.nome}</p>
        <p className="text-xs text-fg-muted">{valor ?? '…'}</p>
        <p className="truncate text-2xs text-fg-muted">{amostra.variavel}</p>
      </div>
    </li>
  );
}

function Cores() {
  const variaveis = useVariaveis(GRUPOS_CORES.flatMap((g) => g.amostras.map((a) => a.variavel)));
  return (
    <div className="flex flex-col gap-6">
      {GRUPOS_CORES.map((grupo) => (
        <div key={grupo.titulo}>
          <h4 className="mb-2 text-xs font-semibold text-fg-muted">{grupo.titulo}</h4>
          <ul className="grid grid-cols-3 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            {grupo.amostras.map((amostra) => (
              <CartaoCor key={amostra.nome} amostra={amostra} valor={variaveis[amostra.variavel]} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tipografia                                                                  */
/* -------------------------------------------------------------------------- */

const ESCALA = [
  { token: '2xs', classe: 'text-2xs', medida: '10px / 12px', uso: 'Selos (Interno), cabeçalhos de grupo' },
  { token: 'xs', classe: 'text-xs', medida: '12px / 16px', uso: 'Rótulos de campo, cabeçalhos de tabela, badges' },
  { token: 'sm', classe: 'text-sm', medida: '14px / 18px', uso: 'Texto padrão da interface' },
  { token: 'md', classe: 'text-md', medida: '16px / 22px', uso: 'Título do ticket, títulos de painel' },
  { token: 'xl', classe: 'text-xl', medida: '22px / 28px', uso: 'H1 de listas e administração (peso 400)' },
  { token: '2xl', classe: 'text-2xl', medida: '26px / 32px', uso: 'H1 de destaque (peso 400)' },
] as const;

function Tipografia() {
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Escala tipográfica</caption>
        <thead>
          <tr className="bg-surface-1">
            {/* font-semibold no <th>: o navegador dá negrito (700) aos <th> e ignora o peso herdado da linha. */}
            {['Token', 'Tamanho / linha', 'Amostra (400)', 'Amostra (600)'].map((titulo) => (
              <th key={titulo} scope="col" className="border-b border-line px-3 py-2 text-left text-xs font-semibold text-fg-muted">
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>*]:border-b-0">
          {ESCALA.map((linha) => (
            <tr key={linha.token}>
              <th scope="row" className="whitespace-nowrap border-b border-line px-3 py-2 text-left align-middle text-xs font-semibold">
                <Cod>{linha.classe}</Cod>
              </th>
              <td className="whitespace-nowrap border-b border-line px-3 py-2 align-middle text-xs text-fg-muted">
                {linha.medida}
                <span className="block text-2xs">{linha.uso}</span>
              </td>
              <td className="border-b border-line px-3 py-2 align-middle">
                <span className={`${linha.classe} whitespace-nowrap font-normal`}>Responder ao cliente</span>
              </td>
              <td className="border-b border-line px-3 py-2 align-middle">
                <span className={`${linha.classe} whitespace-nowrap font-semibold`}>Responder ao cliente</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Raios, sombras e espaçamentos                                               */
/* -------------------------------------------------------------------------- */

const RAIOS = [
  { classe: 'rounded-xs', nome: 'rounded-xs', valor: '2px', uso: 'Selos, ponto de status' },
  { classe: 'rounded', nome: 'rounded', valor: '4px', uso: 'Campos, botões, badges' },
  { classe: 'rounded-lg', nome: 'rounded-lg', valor: '8px', uso: 'Modais' },
  { classe: 'rounded-pill', nome: 'rounded-pill', valor: '100px', uso: 'Pílulas, avatares' },
] as const;

const SOMBRAS = [
  { classe: 'shadow-pop', nome: 'shadow-pop', uso: 'Toasts, tooltips, painéis laterais' },
  { classe: 'shadow-menu', nome: 'shadow-menu', uso: 'Menus, popovers e modais' },
  { classe: 'shadow-focus', nome: 'shadow-focus', uso: 'Anel de foco (3px, action a 28%)' },
] as const;

const ESPACOS = [
  { classe: 'w-rail', nome: 'rail', variavel: '--rail', uso: 'Largura do NavRail' },
  { classe: 'w-rail2', nome: 'rail2', variavel: '--rail2', uso: 'Largura do RightRail' },
  { classe: 'w-props', nome: 'props', variavel: '--props', uso: 'Painel de propriedades do ticket' },
  { classe: 'w-right', nome: 'right', variavel: '--right', uso: 'Painel direito e Drawer' },
  { classe: 'w-topbar', nome: 'topbar', variavel: '--topbar', uso: 'Altura da barra superior (h-topbar)' },
  { classe: 'w-bottombar', nome: 'bottombar', variavel: '--bottombar', uso: 'Altura da barra inferior (h-bottombar)' },
] as const;

function Espacamentos() {
  const variaveis = useVariaveis(ESPACOS.map((e) => e.variavel));
  return (
    <ul className="flex flex-col gap-2">
      {ESPACOS.map((espaco) => (
        <li key={espaco.nome} className="flex items-center gap-4">
          <div className="w-64 shrink-0">
            <p className="text-xs font-semibold text-fg">
              {espaco.nome} · {variaveis[espaco.variavel] ?? '…'}
            </p>
            <p className="text-2xs text-fg-muted">{espaco.uso}</p>
          </div>
          <div className="min-w-0 flex-1">
            <div aria-hidden className={`h-3 max-w-full rounded-xs bg-ink ${espaco.classe}`} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Movimento                                                                   */
/* -------------------------------------------------------------------------- */

const MOVIMENTOS = [
  { classe: 'anim-fade-in', duracao: '120 ms' },
  { classe: 'anim-fade-out', duracao: '100 ms' },
  { classe: 'anim-pop-in', duracao: '120 ms' },
  { classe: 'anim-slide-in-right', duracao: '150 ms' },
] as const;

function Movimento() {
  const [rodada, setRodada] = useState(0);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button onClick={() => setRodada((n) => n + 1)}>Reproduzir</Button>
      </div>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MOVIMENTOS.map((m) => (
          <li key={m.classe} className="flex flex-col gap-1.5">
            <div aria-hidden className="h-12 rounded border border-dashed border-line-strong">
              <div key={`${m.classe}-${rodada}`} className={`h-full w-full rounded bg-surface-2 ${m.classe}`} />
            </div>
            <p className="text-xs font-semibold text-fg">{m.classe}</p>
            <p className="text-2xs text-fg-muted">{m.duracao}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoTokens() {
  return (
    <Secao
      id="tokens"
      numero={1}
      titulo="Tokens"
      descricao={
        <>
          Única fonte de verdade visual, definida em <Cod>tailwind.config.ts</Cod> e espelhada em variáveis CSS. Os valores das cores abaixo
          são lidos de <Cod>:root</Cod> em tempo de execução.
        </>
      }
    >
      <Subsecao titulo="Cores" descricao="32 chaves. Nada de cor solta nos componentes: só estas.">
        <Cores />
      </Subsecao>

      <Subsecao titulo="Escala tipográfica" descricao="Texto padrão em 14px. Rótulos, cabeçalhos de tabela e badges em 12px com peso 600.">
        <Tipografia />
      </Subsecao>

      <Subsecao titulo="Raios" descricao="Só estes quatro. Cartões comuns não têm sombra: usam borda de 1px.">
        <Grade colunas={4}>
          {RAIOS.map((raio) => (
            <div key={raio.nome} className="flex flex-col gap-1.5">
              <div aria-hidden className={`h-16 border border-line-strong bg-surface-1 ${raio.classe}`} />
              <p className="text-xs font-semibold text-fg">
                {raio.nome} · {raio.valor}
              </p>
              <p className="text-2xs text-fg-muted">{raio.uso}</p>
            </div>
          ))}
        </Grade>
      </Subsecao>

      <Subsecao titulo="Sombras" descricao="Uso restrito a camadas flutuantes e ao foco.">
        <Grade colunas={3} className="pb-10">
          {SOMBRAS.map((sombra) => (
            <div key={sombra.nome} className="flex flex-col gap-1.5">
              <div
                aria-hidden
                className={`h-16 rounded bg-surface ${sombra.classe} ${sombra.nome === 'shadow-focus' ? 'border border-action' : 'border border-line'}`}
              />
              <p className="text-xs font-semibold text-fg">{sombra.nome}</p>
              <p className="text-2xs text-fg-muted">{sombra.uso}</p>
            </div>
          ))}
        </Grade>
      </Subsecao>

      <Subsecao titulo="Espaçamentos nomeados" descricao="Os valores vêm das variáveis CSS; a barra usa a classe de largura do token.">
        <Espacamentos />
      </Subsecao>

      <Subsecao titulo="Movimento" descricao="No máximo 150 ms, só em hover e ao abrir ou fechar. Reduzido automaticamente com prefers-reduced-motion.">
        <Movimento />
      </Subsecao>
    </Secao>
  );
}
