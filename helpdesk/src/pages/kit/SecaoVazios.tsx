import { useState } from 'react';
import {
  Banner,
  Button,
  EmptyState,
  Skeleton,
  SkeletonRows,
  SkeletonText,
  Spinner,
  type BannerTone,
  type EmptyIllustrationName,
} from '@/components/ui';
import { Celula, Cod, Grade, Secao, Subsecao } from './Blocos';

/* -------------------------------------------------------------------------- */
/* EmptyState                                                                  */
/* -------------------------------------------------------------------------- */

const ILUSTRACOES: { id: EmptyIllustrationName; titulo: string; descricao: string; acao: string }[] = [
  { id: 'box', titulo: 'Nenhum ticket aqui', descricao: 'Quando houver tickets nesta visualização, eles aparecerão aqui.', acao: 'Criar ticket' },
  { id: 'search', titulo: 'Nada encontrado', descricao: 'Não achamos resultados para “reembolso”. Tente outro termo.', acao: 'Limpar pesquisa' },
  { id: 'binoculars', titulo: 'Sem conteúdo sugerido', descricao: 'Não conseguimos achar conteúdo sugerido para esta conversa.', acao: 'Pesquisar por conteúdo' },
];

function EstadosVazios() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {ILUSTRACOES.map((item) => (
          <div key={item.id} className="rounded border border-line">
            <EmptyState
              illustration={item.id}
              title={item.titulo}
              description={item.descricao}
              action={<Button variant="primary">{item.acao}</Button>}
            />
            <p className="border-t border-line bg-surface-1 px-3 py-1.5 text-center text-xs text-fg-muted">
              <Cod>{`illustration="${item.id}"`}</Cod>
            </p>
          </div>
        ))}
      </div>

      <Celula rotulo="Compacto" nota={<><Cod>compact</Cod>: para painéis laterais e células de tabela.</>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {ILUSTRACOES.map((item) => (
            <div key={item.id} className="rounded border border-line">
              <EmptyState compact illustration={item.id} title={item.titulo} description={item.descricao} />
            </div>
          ))}
        </div>
      </Celula>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner                                                                      */
/* -------------------------------------------------------------------------- */

interface AvisoDemo {
  tom: BannerTone;
  titulo: string;
  texto: string;
  tentar?: boolean;
  dispensar?: boolean;
}

const AVISOS: AvisoDemo[] = [
  { tom: 'error', titulo: 'Não foi possível carregar os tickets', texto: 'Verifique a conexão e tente novamente. O que você digitou foi mantido.', tentar: true },
  { tom: 'warning', titulo: 'Seu SLA está em risco', texto: '3 tickets vencem nos próximos 30 minutos.', dispensar: true },
  { tom: 'info', titulo: 'Atalhos de teclado', texto: 'Pressione / para pesquisar e g depois h para ir ao início.', dispensar: true },
  { tom: 'success', titulo: 'Alterações salvas', texto: 'O ticket #1041 foi atualizado.' },
];

function Banners() {
  const [dispensados, setDispensados] = useState<ReadonlySet<BannerTone>>(() => new Set());
  const [tentativas, setTentativas] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      {AVISOS.filter((a) => !dispensados.has(a.tom)).map((aviso) => (
        <Banner
          key={aviso.tom}
          tone={aviso.tom}
          title={aviso.titulo}
          onRetry={aviso.tentar ? () => setTentativas((n) => n + 1) : undefined}
          onDismiss={aviso.dispensar ? () => setDispensados((atuais) => new Set(atuais).add(aviso.tom)) : undefined}
        >
          {aviso.texto}
          {aviso.tentar && tentativas > 0 ? ` (tentativa ${tentativas})` : ''}
        </Banner>
      ))}
      {dispensados.size > 0 ? (
        <div>
          <Button variant="ghost" onClick={() => setDispensados(new Set())}>
            Mostrar avisos dispensados
          </Button>
        </div>
      ) : null}
      <Banner tone="info">Banner só com texto, sem título nem ações.</Banner>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton e Spinner                                                          */
/* -------------------------------------------------------------------------- */

function Carregamento() {
  return (
    <Grade colunas={3}>
      <Celula rotulo="Skeleton" nota="Blocos decorativos (aria-hidden).">
        <div className="flex items-center gap-3">
          <Skeleton circle />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton width="70%" />
            <Skeleton width="45%" height={10} />
          </div>
        </div>
      </Celula>
      <Celula rotulo="SkeletonText" nota="role=status com “Carregando...” para leitor de tela.">
        <SkeletonText lines={4} />
      </Celula>
      <Celula rotulo="Spinner" nota="Tamanhos 16, 24 e 32. Herda a cor do texto.">
        <div className="flex items-center gap-4 text-fg-muted">
          <Spinner />
          <Spinner size={24} />
          <Spinner size={32} />
          <span className="flex items-center gap-2 text-action">
            <Spinner size={16} label="Salvando..." />
            Salvando...
          </span>
        </div>
      </Celula>
      <Celula rotulo="SkeletonRows" nota="Linhas de 40px, as mesmas da Table." className="lg:col-span-2 xl:col-span-3">
        <div className="rounded border border-line">
          <SkeletonRows rows={3} columns={5} />
        </div>
      </Celula>
    </Grade>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção                                                                       */
/* -------------------------------------------------------------------------- */

export function SecaoVazios() {
  return (
    <Secao
      id="vazios"
      numero={7}
      titulo="Estados vazios e erros"
      descricao="Ilustrações de traço fino em cinza, desenhadas no próprio kit. Avisos usam tokens de nota, ação e SLA, sem gradiente."
    >
      <Subsecao titulo="EmptyState" descricao="Ilustração, título, frase e uma ação opcional.">
        <EstadosVazios />
      </Subsecao>

      <Subsecao titulo="Banner" descricao="Erro usa role=alert; os demais, role=status. “Tentar novamente” e “Dispensar” são opcionais.">
        <Banners />
      </Subsecao>

      <Subsecao titulo="Carregamento" descricao="Skeleton para áreas de conteúdo e Spinner para ações em andamento.">
        <Carregamento />
      </Subsecao>
    </Secao>
  );
}
