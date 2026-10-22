import { Mail, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Checkbox,
  Combobox,
  Field,
  IconButton,
  Input,
  Select,
  StatusDot,
  Switch,
  TagInput,
  Textarea,
  type ComboOption,
  type SelectOption,
} from '@/components/ui';
import { DEFAULT_STATUSES, PRIORITY_LABEL } from '@/lib/status';
import { Celula, Cod, Grade, Secao, Subsecao, TabelaVariantes } from './Blocos';
import { PESSOAS, TAGS_SUGERIDAS, atrasoSimulado, buscarPessoas, normalizar } from './dados';

/* Classes de demonstração do foco forçado: borda action + shadow-focus no elemento. */
const FOCO_FORCADO = '!border-action shadow-focus';

/* -------------------------------------------------------------------------- */
/* Input e Textarea                                                            */
/* -------------------------------------------------------------------------- */

function Inputs() {
  const [busca, setBusca] = useState('Marina');
  const campoBusca = useRef<HTMLInputElement>(null);
  return (
    <Grade colunas={3}>
      <Celula rotulo="Normal">
        <Input aria-label="Normal" placeholder="Digite aqui" />
      </Celula>
      <Celula rotulo="Com valor">
        <Input aria-label="Com valor" defaultValue="Marina Duarte" />
      </Celula>
      <Celula rotulo="Foco forçado" nota={<><Cod>border-action</Cod> + <Cod>shadow-focus</Cod></>}>
        <Input aria-label="Foco forçado" defaultValue="Campo em foco" className={FOCO_FORCADO} />
      </Celula>
      <Celula rotulo="Inválido">
        <Input aria-label="Inválido" defaultValue="marina@" invalid />
      </Celula>
      <Celula rotulo="Desabilitado">
        <Input aria-label="Desabilitado" defaultValue="Não editável" disabled />
      </Celula>
      <Celula rotulo="Com ícone à esquerda">
        <Input aria-label="Com ícone" placeholder="Pesquisar tickets" leadingIcon={<Search />} />
      </Celula>
      <Celula rotulo="Com botão à direita" nota="trailingSlot: limpar o campo">
        <Input
          ref={campoBusca}
          aria-label="Pesquisar clientes"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          leadingIcon={<Search />}
          trailingSlot={
            busca ? (
              <IconButton
                label="Limpar pesquisa"
                icon={<X />}
                size="sm"
                // O botão some junto com o texto: devolve o foco ao campo para ele não cair no <body>.
                onClick={() => {
                  setBusca('');
                  campoBusca.current?.focus();
                }}
              />
            ) : null
          }
        />
      </Celula>
      <Celula rotulo="Com unidade à direita">
        <Input aria-label="Tempo de resposta" defaultValue="60" inputMode="numeric" trailingSlot={<span className="pr-1 text-xs text-fg-muted">min</span>} />
      </Celula>
      <Celula rotulo="Somente leitura">
        <Input aria-label="Somente leitura" defaultValue="ID 1041" readOnly />
      </Celula>
    </Grade>
  );
}

function Textareas() {
  return (
    <Grade colunas={3}>
      <Celula rotulo="Normal (3 linhas)">
        <Textarea aria-label="Normal" placeholder="Escreva uma observação" />
      </Celula>
      <Celula rotulo="Cresce com o conteúdo" nota={<><Cod>autoGrow</Cod> · digite várias linhas</>}>
        <Textarea aria-label="Cresce com o conteúdo" autoGrow minRows={2} defaultValue={'Primeira linha\nSegunda linha'} />
      </Celula>
      <Celula rotulo="Foco forçado">
        <Textarea aria-label="Foco forçado" defaultValue="Campo em foco" className={FOCO_FORCADO} minRows={2} />
      </Celula>
      <Celula rotulo="Inválido">
        <Textarea aria-label="Inválido" invalid defaultValue="Texto curto demais" minRows={2} />
      </Celula>
      <Celula rotulo="Desabilitado">
        <Textarea aria-label="Desabilitado" disabled defaultValue="Não editável" minRows={2} />
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

function CampoValidado() {
  const [valor, setValor] = useState('');
  const [tocado, setTocado] = useState(false);
  const invalido = tocado && !/^\S+@\S+\.\S+$/.test(valor);
  return (
    <Field
      label="E-mail do solicitante"
      required
      hint="Usado para enviar as respostas."
      error={invalido ? 'Informe um e-mail válido, como nome@empresa.com.' : undefined}
    >
      <Input
        type="email"
        placeholder="nome@empresa.com"
        leadingIcon={<Mail />}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => setTocado(true)}
      />
    </Field>
  );
}

const PRIORIDADES: SelectOption[] = [
  { value: '', label: '—' },
  ...(['low', 'normal', 'high', 'urgent'] as const).map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
];

function Fields() {
  const [prioridade, setPrioridade] = useState<string | undefined>('normal');
  return (
    <Grade colunas={3}>
      <Celula rotulo="Com dica">
        <Field label="Assunto" hint="Resuma o problema em uma frase.">
          <Input placeholder="Ex.: Erro ao exportar relatório" />
        </Field>
      </Celula>
      <Celula rotulo="Com erro">
        <Field label="E-mail" error="Informe um e-mail válido.">
          <Input defaultValue="marina@" />
        </Field>
      </Celula>
      <Celula rotulo="Obrigatório, com ação no rótulo">
        <Field
          label="Atribuído"
          required
          labelAction={
            <button
              type="button"
              className="-my-1 inline-flex h-6 items-center rounded px-2 text-xs text-action outline-none transition-colors duration-100 hover:bg-hover hover:text-action-hover focus-visible:shadow-focus"
            >
              aceitar
            </button>
          }
        >
          <Input placeholder="Nome do agente" />
        </Field>
      </Celula>
      <Celula rotulo="Com Textarea">
        <Field label="Observações" hint="Visíveis só para a equipe.">
          <Textarea minRows={2} />
        </Field>
      </Celula>
      <Celula rotulo="Com Select">
        <Field label="Prioridade" required>
          <Select value={prioridade} onValueChange={setPrioridade} options={PRIORIDADES} placeholder="Selecione" />
        </Field>
      </Celula>
      <Celula rotulo="Validação ao sair do campo" nota="Digite algo inválido e tire o foco.">
        <CampoValidado />
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Select                                                                      */
/* -------------------------------------------------------------------------- */

const OPCOES_STATUS: SelectOption[] = DEFAULT_STATUSES.map((s) => ({
  value: s.id,
  label: s.agentName,
  icon: <StatusDot color={s.color} />,
}));

function Selects() {
  const [normal, setNormal] = useState<string | undefined>('normal');
  const [vazio, setVazio] = useState<string | undefined>(undefined);
  const [invalido, setInvalido] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>('open');
  return (
    <Grade colunas={3}>
      <Celula rotulo="Com valor" nota="Opção “—” representa vazio.">
        <Select aria-label="Prioridade" value={normal} onValueChange={setNormal} options={PRIORIDADES} />
      </Celula>
      <Celula rotulo="Com placeholder">
        <Select aria-label="Prioridade com placeholder" value={vazio} onValueChange={setVazio} options={PRIORIDADES} placeholder="Selecione a prioridade" />
      </Celula>
      <Celula rotulo="Inválido">
        <Select aria-label="Prioridade inválida" value={invalido} onValueChange={setInvalido} options={PRIORIDADES} placeholder="Obrigatório" invalid />
      </Celula>
      <Celula rotulo="Desabilitado">
        <Select aria-label="Prioridade desabilitada" value="high" onValueChange={() => undefined} options={PRIORIDADES} disabled />
      </Celula>
      <Celula rotulo="Com ícones (StatusDot)">
        <Select aria-label="Status" value={status} onValueChange={setStatus} options={OPCOES_STATUS} />
      </Celula>
      <Celula rotulo="Opção desabilitada">
        <Select
          aria-label="Status com opção desabilitada"
          value={status}
          onValueChange={setStatus}
          options={OPCOES_STATUS.map((o) => (o.value === 'solved' ? { ...o, disabled: true } : o))}
        />
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Combobox                                                                    */
/* -------------------------------------------------------------------------- */

function renderPessoa(opcao: ComboOption) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={opcao.label} size={24} decorative />
      <span className="min-w-0">
        <span className="block truncate">{opcao.label}</span>
        <span className="block truncate text-xs text-fg-muted">{opcao.description}</span>
      </span>
    </span>
  );
}

function Comboboxes() {
  const [estatico, setEstatico] = useState<string | null>(null);
  const [rico, setRico] = useState<string | null>('pessoa-3');
  const [assincrono, setAssincrono] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [invalido, setInvalido] = useState<string | null>(null);
  const tentativas = useRef(0);

  // Falha na 1ª tentativa e funciona nas seguintes; "Falhar de novo" zera o contador.
  const buscarComFalha = async (consulta: string): Promise<ComboOption[]> => {
    tentativas.current += 1;
    if (tentativas.current === 1) {
      await atrasoSimulado();
      throw new Error('Falha simulada');
    }
    return buscarPessoas(consulta);
  };

  const prioridades: ComboOption[] = (['low', 'normal', 'high', 'urgent'] as const).map((p) => ({
    value: p,
    label: PRIORITY_LABEL[p],
  }));

  return (
    <Grade colunas={3}>
      <Celula rotulo="Estático, pesquisável" nota="A busca filtra sem acentos.">
        <Combobox
          aria-label="Prioridade (estático)"
          value={estatico}
          onValueChange={setEstatico}
          options={prioridades}
          placeholder="Selecione a prioridade"
          searchPlaceholder="Buscar prioridade"
          clearable
        />
      </Celula>
      <Celula rotulo="Estático com descrição e renderOption" nota="Avatar, nome e e-mail.">
        <Combobox
          aria-label="Solicitante (estático)"
          value={rico}
          onValueChange={setRico}
          options={PESSOAS}
          placeholder="Selecione o solicitante"
          searchPlaceholder="Buscar por nome ou e-mail"
          emptyText="Nenhum solicitante encontrado."
          renderOption={renderPessoa}
          clearable
        />
      </Celula>
      <Celula rotulo="Assíncrono" nota="loadOptions com 300 a 700 ms: Skeleton enquanto carrega.">
        <Combobox
          aria-label="Solicitante (assíncrono)"
          value={assincrono}
          onValueChange={setAssincrono}
          loadOptions={buscarPessoas}
          placeholder="Buscar solicitante"
          searchPlaceholder="Buscar por nome ou e-mail"
          clearable
        />
      </Celula>
      <Celula
        rotulo="Assíncrono, falha na 1ª tentativa"
        nota="Abra: erro com “Tentar novamente”; na 2ª tentativa carrega."
      >
        <div className="flex flex-col gap-2">
          <Combobox
            aria-label="Solicitante (falha na primeira tentativa)"
            value={falha}
            onValueChange={setFalha}
            loadOptions={buscarComFalha}
            placeholder="Abrir e falhar"
            searchPlaceholder="Buscar por nome ou e-mail"
            clearable
          />
          <div>
            <Button
              variant="outline"
              onClick={() => {
                tentativas.current = 0;
                setFalha(null);
              }}
            >
              Falhar de novo
            </Button>
          </div>
        </div>
      </Celula>
      <Celula rotulo="Inválido">
        <Combobox
          aria-label="Solicitante inválido"
          value={invalido}
          onValueChange={setInvalido}
          options={PESSOAS}
          placeholder="Obrigatório"
          invalid
        />
      </Celula>
      <Celula rotulo="Desabilitado">
        <Combobox aria-label="Solicitante desabilitado" value="pessoa-1" onValueChange={() => undefined} options={PESSOAS} disabled />
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* TagInput                                                                    */
/* -------------------------------------------------------------------------- */

function validarTag(tag: string): string | null {
  if (normalizar(tag) === 'spam') return 'A tag “spam” é reservada.';
  if (tag.length < 2) return 'A tag precisa de pelo menos 2 caracteres.';
  return null;
}

function TagInputs() {
  const [comSugestoes, setComSugestoes] = useState<string[]>(['vip', 'api']);
  const [validada, setValidada] = useState<string[]>([]);
  const [limitada, setLimitada] = useState<string[]>(['bug', 'urgente', 'api']);
  const [invalida, setInvalida] = useState<string[]>([]);
  return (
    <Grade colunas={3}>
      <Celula rotulo="Com sugestões" nota="Enter, vírgula ou Tab adicionam. Backspace remove a última.">
        <TagInput
          aria-label="Tags com sugestões"
          value={comSugestoes}
          onChange={setComSugestoes}
          suggestions={TAGS_SUGERIDAS}
          placeholder="Adicionar tag"
        />
      </Celula>
      <Celula rotulo="Com validação" nota="Tente “spam” ou uma letra só.">
        <TagInput aria-label="Tags validadas" value={validada} onChange={setValidada} validate={validarTag} placeholder="Adicionar tag" />
      </Celula>
      <Celula rotulo="Limite de 3 tags" nota={<Cod>maxTags=3</Cod>}>
        <TagInput aria-label="Tags limitadas" value={limitada} onChange={setLimitada} maxTags={3} placeholder="Adicionar tag" />
      </Celula>
      <Celula rotulo="Inválido">
        <TagInput aria-label="Tags inválidas" value={invalida} onChange={setInvalida} invalid placeholder="Pelo menos uma tag" />
      </Celula>
      <Celula rotulo="Desabilitado">
        <TagInput aria-label="Tags desabilitadas" value={['somente', 'leitura']} onChange={() => undefined} disabled />
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox e Switch                                                           */
/* -------------------------------------------------------------------------- */

type Marcacao = boolean | 'indeterminate';

function CheckboxDemo({ inicial, rotulo, desabilitado }: { inicial: Marcacao; rotulo?: string; desabilitado?: boolean }) {
  const [valor, setValor] = useState<Marcacao>(inicial);
  return (
    <Checkbox
      checked={valor}
      onCheckedChange={setValor}
      disabled={desabilitado}
      label={rotulo}
      aria-label={rotulo ? undefined : 'Selecionar item'}
    />
  );
}

function SwitchDemo({ inicial, rotulo, desabilitado }: { inicial: boolean; rotulo?: string; desabilitado?: boolean }) {
  const [valor, setValor] = useState(inicial);
  return (
    <Switch checked={valor} onCheckedChange={setValor} disabled={desabilitado} label={rotulo} aria-label={rotulo ? undefined : 'Ativar recurso'} />
  );
}

const COLUNAS_MARCAR = ['Com rótulo', 'Sem rótulo (aria-label)', 'Desabilitado'];

function Marcadores() {
  const checkbox: { id: string; rotulo: string; inicial: Marcacao }[] = [
    { id: 'off', rotulo: 'Desmarcado', inicial: false },
    { id: 'on', rotulo: 'Marcado', inicial: true },
    { id: 'mid', rotulo: 'Indeterminado', inicial: 'indeterminate' },
  ];
  return (
    <div className="flex flex-col gap-6">
      <TabelaVariantes
        legenda="Checkbox em todos os estados"
        rotuloLinha="Checkbox"
        colunas={COLUNAS_MARCAR}
        linhas={checkbox.map((c) => ({
          id: c.id,
          rotulo: c.rotulo,
          celulas: [
            <CheckboxDemo key="r" inicial={c.inicial} rotulo="Notificar o solicitante" />,
            <CheckboxDemo key="s" inicial={c.inicial} />,
            <CheckboxDemo key="d" inicial={c.inicial} rotulo="Notificar" desabilitado />,
          ],
        }))}
      />
      <TabelaVariantes
        legenda="Switch em todos os estados"
        rotuloLinha="Switch"
        colunas={COLUNAS_MARCAR}
        linhas={[
          {
            id: 'off',
            rotulo: 'Desligado',
            celulas: [
              <SwitchDemo key="r" inicial={false} rotulo="Gatilho ativo" />,
              <SwitchDemo key="s" inicial={false} />,
              <SwitchDemo key="d" inicial={false} rotulo="Gatilho ativo" desabilitado />,
            ],
          },
          {
            id: 'on',
            rotulo: 'Ligado',
            celulas: [
              <SwitchDemo key="r" inicial rotulo="Gatilho ativo" />,
              <SwitchDemo key="s" inicial />,
              <SwitchDemo key="d" inicial rotulo="Gatilho ativo" desabilitado />,
            ],
          },
        ]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoCampos() {
  return (
    <Secao
      id="campos"
      numero={3}
      titulo="Campos"
      descricao="Altura de 32px, borda line-strong, raio 4. Foco é borda action mais shadow-focus. Rótulos em 12px com peso 600."
    >
      <Subsecao titulo="Input">
        <Inputs />
      </Subsecao>
      <Subsecao titulo="Textarea">
        <Textareas />
      </Subsecao>
      <Subsecao titulo="Field" descricao="Gera os ids e liga rótulo, dica e erro ao controle (aria-describedby, aria-invalid, aria-required).">
        <Fields />
      </Subsecao>
      <Subsecao titulo="Select" descricao="Radix Select com lista em popper: abre para cima quando falta espaço embaixo.">
        <Selects />
      </Subsecao>
      <Subsecao titulo="Combobox" descricao="Gatilho role=combobox e lista cmdk. No modo assíncrono a busca tem debounce de 200 ms.">
        <Comboboxes />
      </Subsecao>
      <Subsecao titulo="TagInput" descricao="Colar um texto como “a, b c” separa as tags por vírgula, espaço e quebra de linha. Sem duplicatas.">
        <TagInputs />
      </Subsecao>
      <Subsecao titulo="Checkbox e Switch" descricao="Os dois são clicáveis (cada célula tem estado próprio). A área de clique mínima é 24 × 24.">
        <Marcadores />
      </Subsecao>
    </Secao>
  );
}
