import { useState } from 'react';
import {
  Button,
  ConfirmModal,
  Drawer,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TagInput,
  Textarea,
  Tooltip,
  type ModalSize,
  type SelectOption,
} from '@/components/ui';
import { toast } from '@/store/useUi';
import { Celula, Cod, Grade, Secao, Subsecao } from './Blocos';
import { TAGS_SUGERIDAS, esperar } from './dados';

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

function AbasDemo() {
  return (
    <Tabs defaultValue="todos" className="rounded border border-line">
      <TabsList aria-label="Tickets por situação" className="px-2">
        <TabsTrigger value="todos" count={12}>
          Todos
        </TabsTrigger>
        <TabsTrigger value="abertos" count={5}>
          Abertos
        </TabsTrigger>
        <TabsTrigger value="pendentes" count={0}>
          Pendentes
        </TabsTrigger>
        <TabsTrigger value="resolvidos" count="99+">
          Resolvidos
        </TabsTrigger>
        <TabsTrigger value="arquivados" disabled>
          Arquivados
        </TabsTrigger>
      </TabsList>
      <TabsContent value="todos" className="p-4 text-sm">
        Todos os tickets da equipe. Use as setas, Home e End para navegar entre as abas.
      </TabsContent>
      <TabsContent value="abertos" className="p-4 text-sm">
        Tickets abertos e em andamento.
      </TabsContent>
      <TabsContent value="pendentes" className="p-4 text-sm">
        Nenhum ticket pendente: o contador mostra 0.
      </TabsContent>
      <TabsContent value="resolvidos" className="p-4 text-sm">
        Tickets resolvidos recentemente. O contador aceita texto, como 99+.
      </TabsContent>
      {/* Aba desabilitada também precisa do painel: o gatilho aponta para ele com aria-controls. */}
      <TabsContent value="arquivados" className="p-4 text-sm">
        Tickets arquivados (aba desabilitada neste exemplo).
      </TabsContent>
    </Tabs>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                      */
/* -------------------------------------------------------------------------- */

const OPCOES_PERIODO: SelectOption[] = [
  { value: 'qualquer', label: 'Qualquer um' },
  { value: 'hoje', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
];

function DrawerDemo() {
  const [aberto, setAberto] = useState(false);
  const [tags, setTags] = useState<string[]>(['vip']);
  const [periodo, setPeriodo] = useState<string | undefined>('qualquer');
  const [incluirResolvidos, setIncluirResolvidos] = useState(true);

  const aplicar = () => {
    setAberto(false);
    toast.success('Filtros aplicados');
  };

  return (
    <>
      <div>
        <Button onClick={() => setAberto(true)}>Abrir Drawer com conteúdo longo</Button>
      </div>
      <Drawer
        open={aberto}
        onOpenChange={setAberto}
        title="Filtrar tickets"
        description="Entra pela direita, com scrim. Esc, clique fora ou Fechar encerram e o foco volta ao botão."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={aplicar}>
              Aplicar filtros
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Tags">
            <TagInput value={tags} onChange={setTags} suggestions={TAGS_SUGERIDAS} placeholder="Adicionar tag" />
          </Field>
          <Field label="Assunto contém">
            <Input placeholder="Palavra ou trecho" />
          </Field>
          <Field label="Data da solicitação">
            <Select value={periodo} onValueChange={setPeriodo} options={OPCOES_PERIODO} />
          </Field>
          {Array.from({ length: 10 }, (_, indice) => (
            <Field key={indice} label={`Campo personalizado ${indice + 1}`} hint="Conteúdo longo para exercitar a rolagem do corpo.">
              <Input placeholder="Valor" />
            </Field>
          ))}
          <Switch checked={incluirResolvidos} label="Incluir tickets resolvidos" onCheckedChange={setIncluirResolvidos} />
        </div>
      </Drawer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal e ConfirmModal                                                        */
/* -------------------------------------------------------------------------- */

const TAMANHOS_MODAL: { id: ModalSize; rotulo: string; largura: string }[] = [
  { id: 'sm', rotulo: 'Modal pequeno', largura: '384px' },
  { id: 'md', rotulo: 'Modal médio', largura: '576px' },
  { id: 'lg', rotulo: 'Modal grande', largura: '768px' },
];

function ModalDemo() {
  const [aberto, setAberto] = useState(false);
  const [tamanho, setTamanho] = useState<ModalSize>('md');

  const abrir = (t: ModalSize) => {
    setTamanho(t);
    setAberto(true);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {TAMANHOS_MODAL.map((t) => (
          <Button key={t.id} onClick={() => abrir(t.id)}>
            {t.rotulo} ({t.largura})
          </Button>
        ))}
      </div>
      <Modal
        open={aberto}
        onOpenChange={setAberto}
        size={tamanho}
        title="Adicionar cliente"
        description={`Tamanho ${tamanho}. Esc fecha e o foco volta ao botão que abriu.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setAberto(false);
                toast.success('Cliente adicionado');
              }}
            >
              Adicionar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nome" required>
            <Input placeholder="Nome completo" />
          </Field>
          <Field label="E-mail" required hint="Usado para enviar as respostas.">
            <Input type="email" placeholder="nome@empresa.com" />
          </Field>
          <Field label="Observações">
            <Textarea minRows={3} />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function ConfirmacoesDemo() {
  const [destrutivo, setDestrutivo] = useState(false);
  const [primario, setPrimario] = useState(false);
  const [falha, setFalha] = useState(false);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDestrutivo(true)}>ConfirmModal destrutivo</Button>
        <Button onClick={() => setPrimario(true)}>ConfirmModal primário</Button>
        <Button onClick={() => setFalha(true)}>ConfirmModal com falha</Button>
      </div>

      <ConfirmModal
        open={destrutivo}
        onOpenChange={setDestrutivo}
        title="Apagar 3 tickets?"
        description="Esta ação não pode ser desfeita. O foco inicial fica em Cancelar. A confirmação leva 1 s para mostrar o estado ocupado."
        confirmLabel="Apagar tickets"
        onConfirm={async () => {
          await esperar(1000);
          toast.success('3 tickets apagados (demonstração)');
        }}
      />
      <ConfirmModal
        open={primario}
        onOpenChange={setPrimario}
        tone="primary"
        title="Descartar alterações?"
        description="Você tem alterações não salvas neste ticket."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        onConfirm={() => {
          toast.info('Alterações descartadas');
        }}
      />
      <ConfirmModal
        open={falha}
        onOpenChange={setFalha}
        title="Enviar relatório?"
        description="A confirmação falha de propósito: o modal continua aberto para uma nova tentativa."
        confirmLabel="Enviar"
        tone="primary"
        onConfirm={async () => {
          await esperar(600);
          toast.error('Não foi possível enviar', { description: 'Tente novamente em instantes.' });
          throw new Error('Falha simulada');
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                      */
/* -------------------------------------------------------------------------- */

function ToastsDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => toast.success('Ticket #1041 foi atualizado')}>Sucesso</Button>
      <Button onClick={() => toast.error('Não foi possível salvar', { description: 'Verifique a conexão e tente novamente.' })}>Erro</Button>
      <Button onClick={() => toast.info('Nova resposta do cliente no ticket #1042')}>Informação</Button>
      <Button
        onClick={() =>
          toast.success('Ticket #1043 foi apagado', {
            action: { label: 'Desfazer', onClick: () => toast.info('Ticket restaurado') },
          })
        }
      >
        Com ação
      </Button>
      <Button onClick={() => toast.info('Fica até você fechar', { duration: 0, description: 'duration: 0 desliga o fechamento automático.' })}>
        Persistente
      </Button>
      <Button
        onClick={() => {
          for (let i = 1; i <= 6; i += 1) toast.info(`Notificação ${i} de 6`);
        }}
      >
        Disparar 6 (máx. 4 visíveis)
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                     */
/* -------------------------------------------------------------------------- */

function TooltipsDemo() {
  return (
    <Grade colunas={4}>
      <Celula rotulo="Acima">
        <div>
          <Tooltip content="Salvar alterações" side="top">
            <Button>Topo</Button>
          </Tooltip>
        </div>
      </Celula>
      <Celula rotulo="À direita">
        <div>
          <Tooltip content="Abrir em nova aba" side="right">
            <Button>Direita</Button>
          </Tooltip>
        </div>
      </Celula>
      <Celula rotulo="Abaixo (padrão)">
        <div>
          <Tooltip content="Ver detalhes do ticket">
            <Button>Abaixo</Button>
          </Tooltip>
        </div>
      </Celula>
      <Celula rotulo="Com atalho" nota={<Cod>shortcut="g h"</Cod>}>
        <div>
          <Tooltip content="Ir para o início" shortcut="g h" side="bottom">
            <Button>Início</Button>
          </Tooltip>
        </div>
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoSobreposicoes() {
  return (
    <Secao
      id="sobreposicoes"
      numero={5}
      titulo="Abas, painéis e avisos"
      descricao="Menus, popovers, drawers e modais fecham com Esc e clique fora, devolvem o foco ao gatilho e prendem o foco quando são diálogos."
    >
      <Subsecao titulo="Tabs" descricao="Linha de 2px em action na aba ativa e contador entre parênteses.">
        <AbasDemo />
      </Subsecao>

      <Subsecao titulo="Drawer" descricao="Largura padrão w-right (380px).">
        <DrawerDemo />
      </Subsecao>

      <Subsecao titulo="Modal" descricao="Três tamanhos, raio 8.">
        <ModalDemo />
      </Subsecao>

      <Subsecao titulo="ConfirmModal" descricao="Para toda ação destrutiva. Aceita confirmação assíncrona e permanece aberto se ela falhar.">
        <ConfirmacoesDemo />
      </Subsecao>

      <Subsecao titulo="Toasts" descricao="Canto superior direito, abaixo da topbar. Fecham em 4 s (pausam com mouse ou foco); erros ficam até serem fechados e usam role=alert. No máximo 4 visíveis. Teclado: F8 leva o foco às notificações e Esc fecha a focada, devolvendo o foco para onde estava.">
        <ToastsDemo />
      </Subsecao>

      <Subsecao titulo="Tooltip" descricao="Pílula escura. Aparece com mouse ou foco e fecha com Esc.">
        <TooltipsDemo />
      </Subsecao>
    </Secao>
  );
}
