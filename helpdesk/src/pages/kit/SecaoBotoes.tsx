import { ChevronDown, Copy, Link2, Pencil, Plus, Search, Send, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  ConfirmModal,
  IconButton,
  Kebab,
  SplitButton,
  StatusDot,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonSize,
  type IconButtonVariant,
  type MenuItemSpec,
  type SplitItem,
} from '@/components/ui';
import { DEFAULT_STATUSES } from '@/lib/status';
import { toast } from '@/store/useUi';
import { Celula, Cod, Grade, Secao, Subsecao, TabelaVariantes } from './Blocos';
import { esperar } from './dados';

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

const VARIANTES: { id: ButtonVariant; rotulo: string; texto: string }[] = [
  { id: 'primary', rotulo: 'primary (azul)', texto: 'Salvar' },
  { id: 'ink', rotulo: 'ink (escuro)', texto: 'Enviar' },
  { id: 'outline', rotulo: 'outline (padrão)', texto: 'Cancelar' },
  { id: 'ghost', rotulo: 'ghost', texto: 'Ver mais' },
  { id: 'danger', rotulo: 'danger (sólido)', texto: 'Apagar' },
];

const COLUNAS_BOTAO = ['Normal', 'Desabilitado', 'Carregando', 'Ícone à esquerda', 'Ícone à direita'];

function TabelaBotoes({ tamanho }: { tamanho: ButtonSize }) {
  return (
    <TabelaVariantes
      legenda={`Botões de tamanho ${tamanho}`}
      colunas={COLUNAS_BOTAO}
      linhas={VARIANTES.map((v) => ({
        id: v.id,
        rotulo: v.rotulo,
        celulas: [
          <Button key="n" variant={v.id} size={tamanho}>
            {v.texto}
          </Button>,
          <Button key="d" variant={v.id} size={tamanho} disabled>
            {v.texto}
          </Button>,
          <Button key="c" variant={v.id} size={tamanho} loading>
            {v.texto}
          </Button>,
          <Button key="e" variant={v.id} size={tamanho} leadingIcon={<Plus />}>
            {v.texto}
          </Button>,
          <Button key="r" variant={v.id} size={tamanho} trailingIcon={<ChevronDown />}>
            {v.texto}
          </Button>,
        ],
      }))}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* IconButton                                                                  */
/* -------------------------------------------------------------------------- */

const VARIANTES_ICONE: IconButtonVariant[] = ['ghost', 'outline', 'ink'];
const TAMANHOS_ICONE: { id: IconButtonSize; rotulo: string }[] = [
  { id: 'md', rotulo: 'md (32px)' },
  { id: 'sm', rotulo: 'sm (24px)' },
];

function IconeAlternavel({ variant, size }: { variant: IconButtonVariant; size: IconButtonSize }) {
  const [marcado, setMarcado] = useState(false);
  return (
    <IconButton
      label={marcado ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      icon={<Star />}
      variant={variant}
      size={size}
      pressed={marcado}
      onClick={() => setMarcado((m) => !m)}
    />
  );
}

function TabelaIconButtons() {
  const linhas = VARIANTES_ICONE.flatMap((variant) =>
    TAMANHOS_ICONE.map(({ id: size, rotulo }) => ({
      id: `${variant}-${size}`,
      rotulo: `${variant} · ${rotulo}`,
      celulas: [
        <IconButton key="n" label="Editar" icon={<Pencil />} variant={variant} size={size} />,
        <IconButton key="p" label="Pesquisar" icon={<Search />} variant={variant} size={size} pressed />,
        <IconButton key="d" label="Copiar" icon={<Copy />} variant={variant} size={size} disabled />,
        <IconeAlternavel key="a" variant={variant} size={size} />,
        <IconButton key="s" label="Copiar link" icon={<Link2 />} variant={variant} size={size} shortcut="Ctrl+L" tooltipSide="right" />,
      ],
    })),
  );
  return (
    <TabelaVariantes
      legenda="Botões de ícone"
      colunas={['Normal', 'Pressionado', 'Desabilitado', 'Alternável (clique)', 'Atalho no tooltip']}
      linhas={linhas}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* SplitButton                                                                 */
/* -------------------------------------------------------------------------- */

function itensDeEnvio(incluirNovo: boolean): SplitItem[] {
  return DEFAULT_STATUSES.filter((s) => incluirNovo || s.id !== 'new').map((s) => ({
    id: s.id,
    label: `Enviar como ${s.agentName}`,
    leading: <StatusDot color={s.color} />,
  }));
}

const ITENS_NOVO = itensDeEnvio(true);
const ITENS_EXISTENTE = itensDeEnvio(false);

function enviar(item: SplitItem) {
  toast.success(`Enviado: ${typeof item.label === 'string' ? item.label : item.id}`, {
    description: 'O item do menu envia na hora, sem passo extra.',
  });
}

function SplitButtons() {
  const [enviando, setEnviando] = useState(false);

  const enviarComEspera = async () => {
    setEnviando(true);
    await esperar(1200);
    setEnviando(false);
    toast.success('Ticket enviado como Aberto');
  };

  return (
    <Grade colunas={3}>
      <Celula rotulo="ink, ticket existente" nota="Menu abre para cima (padrão); sem o status Novo.">
        <div>
          <SplitButton
            label="Enviar como Aberto"
            onClick={() => toast.success('Ticket enviado como Aberto')}
            items={ITENS_EXISTENTE}
            onSelectItem={enviar}
          />
        </div>
      </Celula>
      <Celula rotulo="ink, ticket novo" nota="Inclui Novo, com separador antes de Resolvido.">
        <div>
          <SplitButton
            label="Enviar como Novo"
            onClick={() => toast.success('Ticket enviado como Novo')}
            items={ITENS_NOVO.map((item) => ({ ...item, separatorBefore: item.id === 'solved' }))}
            onSelectItem={enviar}
          />
        </div>
      </Celula>
      <Celula rotulo="ink, lg (40 px)" nota={<><Cod>size="lg"</Cod> · botão de envio da BottomBar do ticket.</>}>
        <div>
          <SplitButton
            size="lg"
            label="Enviar como Em andamento"
            onClick={() => toast.success('Ticket enviado como Em andamento')}
            items={ITENS_EXISTENTE}
            onSelectItem={enviar}
          />
        </div>
      </Celula>
      <Celula rotulo="primary, abre para baixo" nota={<><Cod>variant="primary"</Cod> <Cod>side="bottom"</Cod></>}>
        <div>
          <SplitButton
            variant="primary"
            side="bottom"
            label="Salvar como Pendente"
            onClick={() => toast.success('Salvo como Pendente')}
            items={ITENS_EXISTENTE}
            onSelectItem={enviar}
          />
        </div>
      </Celula>
      <Celula rotulo="Desabilitado">
        <div>
          <SplitButton label="Enviar como Aberto" onClick={() => undefined} items={ITENS_EXISTENTE} onSelectItem={enviar} disabled />
        </div>
      </Celula>
      <Celula rotulo="Carregando (estático)">
        <div>
          <SplitButton label="Enviar como Aberto" onClick={() => undefined} items={ITENS_EXISTENTE} onSelectItem={enviar} loading />
        </div>
      </Celula>
      <Celula rotulo="Carregando ao clicar" nota="Simula 1,2 s de envio.">
        <div>
          <SplitButton
            label="Enviar como Aberto"
            onClick={() => void enviarComEspera()}
            items={ITENS_EXISTENTE}
            onSelectItem={enviar}
            loading={enviando}
          />
        </div>
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Kebab                                                                       */
/* -------------------------------------------------------------------------- */

function Kebabs() {
  const [confirmando, setConfirmando] = useState(false);

  const itens: MenuItemSpec[] = [
    { id: 'editar', label: 'Editar', icon: <Pencil />, shortcut: 'E', onSelect: () => toast.info('Editar') },
    { id: 'duplicar', label: 'Duplicar', icon: <Copy />, onSelect: () => toast.info('Duplicar') },
    { id: 'link', label: 'Copiar link', icon: <Link2 />, onSelect: () => toast.info('Link copiado'), separatorBefore: true },
    { id: 'enviar', label: 'Reenviar notificação', icon: <Send />, disabled: true, onSelect: () => undefined },
    { id: 'apagar', label: 'Apagar', icon: <Trash2 />, tone: 'danger', onSelect: () => setConfirmando(true) },
  ];

  return (
    <>
      <Grade colunas={4}>
        <Celula rotulo="Padrão (md)" nota="Ação destrutiva ao final, depois do divisor.">
          <div>
            <Kebab items={itens} />
          </div>
        </Celula>
        <Celula rotulo="Pequeno (sm), alinhado ao início">
          <div>
            <Kebab items={itens} size="sm" align="start" label="Mais ações do ticket" />
          </div>
        </Celula>
        <Celula rotulo="Desabilitado">
          <div>
            <Kebab items={itens} disabled />
          </div>
        </Celula>
        <Celula rotulo="Sem ações" nota="Lista vazia: nada a abrir.">
          <div>
            <Kebab items={[]} />
          </div>
        </Celula>
      </Grade>
      <ConfirmModal
        open={confirmando}
        onOpenChange={setConfirmando}
        title="Apagar este ticket?"
        description="Esta é uma demonstração: nada é apagado de verdade."
        confirmLabel="Apagar ticket"
        onConfirm={() => {
          toast.success('Ticket apagado (demonstração)');
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoBotoes() {
  return (
    <Secao
      id="botoes"
      numero={2}
      titulo="Botões"
      descricao="Primário azul para ações de formulário e página; escuro (ink) só para envio e CTAs de topo. Não misture os dois no mesmo contexto."
    >
      <Subsecao titulo="Button · md (32px)" descricao="Cinco variantes nos estados normal, desabilitado, carregando e com ícone.">
        <TabelaBotoes tamanho="md" />
      </Subsecao>

      <Subsecao titulo="Button · lg (40px)">
        <TabelaBotoes tamanho="lg" />
      </Subsecao>

      <Subsecao
        titulo="IconButton"
        descricao="O rótulo é obrigatório: vira aria-label e conteúdo do Tooltip. Passe o mouse ou use Tab para ver o tooltip."
      >
        <TabelaIconButtons />
      </Subsecao>

      <Subsecao
        titulo="SplitButton"
        descricao="Ação principal e seta justapostas. O menu da seta lista os status com StatusDot e escolher um item envia na hora. Abre para cima e vira para baixo se faltar espaço."
      >
        <SplitButtons />
      </Subsecao>

      <Subsecao titulo="Kebab" descricao="Menu ⋮ com setas, Enter, Esc e foco devolvido ao botão. “Apagar” abre um ConfirmModal.">
        <Kebabs />
      </Subsecao>
    </Secao>
  );
}
