import type { ReactNode } from 'react';
import type { EmptyIllustrationName } from '../EmptyIllustrations';

export type SortDirection = 'asc' | 'desc';

/** Ordenação atual. A Table só informa: quem reordena as linhas é o consumidor. */
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface ColumnDef<T> {
  /** Estável: é a chave de persistência de largura e visibilidade. */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** Largura inicial em px. Padrão: 160. */
  width?: number;
  /** Largura mínima em px ao redimensionar. Padrão: 64 (ou a própria `width`, se menor). */
  minWidth?: number;
  align?: 'left' | 'right' | 'center';
  /** Pode ser ocultada pelo usuário (ColumnsMenu). Sem isto a coluna é sempre visível. */
  hideable?: boolean;
  /** Começa oculta (e, por isso, também é tratada como `hideable`). */
  defaultHidden?: boolean;
  /**
   * Texto puro da coluna, usado em menus e no nome acessível da alça de redimensionar.
   * Extensão do contrato: opcional quando `header` já é uma string.
   */
  label?: string;
}

export interface TableGroup {
  key: string;
  label: ReactNode;
}

export interface TableEmptyConfig {
  illustration?: EmptyIllustrationName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export interface TableErrorConfig {
  message: string;
  onRetry: () => void;
}
