import type { PageOf, PageQuery, RetentionRun } from '@/types/admin-b';
import { http } from './http';
import { mapPage, mapRetentionRun, type PaginatedDto, type RetentionRunDto } from './mappers/adminB';

/**
 * RETENÇÃO: `/audit/retention/` (ciclos), `.../simulate/` (SIMULAÇÃO sob demanda: conta e amostra, não apaga nada)
 * e `.../{id}/review/` (registra a revisão, que é o que destrava o expurgo efetivo agendado no servidor).
 * Não existe rota para executar o expurgo: ele só roda no agendamento do servidor.
 */
export async function listRetentionRuns(f: PageQuery = {}): Promise<PageOf<RetentionRun>> {
  const q = { limit: f.limit ?? 25, offset: f.offset ?? 0 };
  return mapPage(await http.get<PaginatedDto<RetentionRunDto>>('/audit/retention/', q), mapRetentionRun, q);
}

export async function getRetentionRun(id: string): Promise<RetentionRun> {
  return mapRetentionRun(await http.get<RetentionRunDto>(`/audit/retention/${encodeURIComponent(id)}/`));
}

export async function simulateRetention(): Promise<RetentionRun> {
  return mapRetentionRun(await http.post<RetentionRunDto>('/audit/retention/simulate/'));
}

export async function reviewRetentionRun(id: string, note: string): Promise<RetentionRun> {
  return mapRetentionRun(await http.post<RetentionRunDto>(`/audit/retention/${encodeURIComponent(id)}/review/`, { review_note: note }));
}
