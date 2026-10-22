import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* Blocos de layout do catálogo: seção, subseção, célula rotulada e tabela de variações. */

export interface SecaoProps {
  id: string;
  numero: number;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
}

/** Seção ancorada da página. O `id` é o destino do link da navegação lateral. */
export function Secao({ id, numero, titulo, descricao, children }: SecaoProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-16 border-b border-line py-10 first:pt-0 last:border-b-0">
      <header className="mb-6">
        <h2 id={`${id}-titulo`} className="text-xl font-normal text-fg">
          {numero}. {titulo}
        </h2>
        {descricao ? <p className="mt-1 max-w-3xl text-sm text-fg-muted">{descricao}</p> : null}
      </header>
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  );
}

export interface SubsecaoProps {
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Subsecao({ titulo, descricao, children, className }: SubsecaoProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div>
        <h3 className="text-md font-semibold text-fg">{titulo}</h3>
        {descricao ? <p className="mt-0.5 max-w-3xl text-sm text-fg-muted">{descricao}</p> : null}
      </div>
      {children}
    </div>
  );
}

export interface CelulaProps {
  rotulo: ReactNode;
  /** Texto de apoio sob o controle (ex.: a prop que gera o estado). */
  nota?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Componente em um estado: nome do estado acima e, se houver, uma nota curta abaixo (os controles ficam alinhados entre células). */
export function Celula({ rotulo, nota, children, className }: CelulaProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <p className="text-xs font-semibold text-fg-muted">{rotulo}</p>
      {children}
      {nota ? <p className="text-xs text-fg-muted">{nota}</p> : null}
    </div>
  );
}

const COLUNAS = {
  2: 'grid-cols-1 lg:grid-cols-2',
  3: 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
} as const;

export interface GradeProps {
  colunas?: keyof typeof COLUNAS;
  children: ReactNode;
  className?: string;
}

/** Grade responsiva de células: 1 a 2 colunas em 1024 px e até 3 ou 4 em 1280 px. */
export function Grade({ colunas = 3, children, className }: GradeProps) {
  return <div className={cn('grid gap-x-6 gap-y-5', COLUNAS[colunas], className)}>{children}</div>;
}

/** Trecho de código ou nome de prop em linha. */
export function Cod({ children }: { children: ReactNode }) {
  return <code className="rounded-xs bg-surface-2 px-1 font-sans text-xs text-fg">{children}</code>;
}

export interface LinhaVariante {
  id: string;
  rotulo: ReactNode;
  celulas: ReactNode[];
}

export interface TabelaVariantesProps {
  /** Nome da tabela para leitores de tela. */
  legenda: string;
  /** Rótulo do cabeçalho da primeira coluna. */
  rotuloLinha?: string;
  colunas: string[];
  linhas: LinhaVariante[];
}

const TH = 'border-b border-line bg-surface-1 px-3 py-2 text-left text-xs font-semibold text-fg-muted whitespace-nowrap';
/** Largura da coluna de rótulos e mínima de cada coluna de estado: tabelas empilhadas alinham as colunas entre si. */
const LARGURA_ROTULO = 176;
const LARGURA_MINIMA_CELULA = 112;

/** Matriz estados x variantes: linhas são as variantes, colunas os estados. Rola dentro do próprio contêiner. */
export function TabelaVariantes({ legenda, rotuloLinha = 'Variante', colunas, linhas }: TabelaVariantesProps) {
  return (
    <div className="overflow-x-auto rounded border border-line">
      <table
        className="w-full table-fixed border-collapse text-sm"
        style={{ minWidth: LARGURA_ROTULO + colunas.length * LARGURA_MINIMA_CELULA }}
      >
        <caption className="sr-only">{legenda}</caption>
        <colgroup>
          <col style={{ width: LARGURA_ROTULO }} />
          {colunas.map((coluna) => (
            <col key={coluna} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              {rotuloLinha}
            </th>
            {colunas.map((coluna) => (
              <th key={coluna} scope="col" className={TH}>
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>*]:border-b-0">
          {linhas.map((linha) => (
            <tr key={linha.id}>
              <th scope="row" className="whitespace-nowrap border-b border-line px-3 py-3 text-left align-middle text-xs font-semibold text-fg">
                {linha.rotulo}
              </th>
              {linha.celulas.map((celula, indice) => (
                <td key={colunas[indice] ?? indice} className="border-b border-line px-3 py-3 align-middle">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
