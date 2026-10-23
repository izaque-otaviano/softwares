import type { ChatReport, CsvFile, ReportFilters, TicketsReport } from '@/types/reports';
import { ApiError } from '../errors';
import { apiBaseUrl, buildQueryString, http } from './http';
import {
  mapChatReport,
  mapTicketsReport,
  panelSupports,
  type ChatMetricsDto,
  type ChatReportRowDto,
  type IndicatorsDto,
  type ReportDto,
} from './mappers/reports';

/**
 * RELATÓRIOS (somente leitura): `/reports/tickets/` (linhas e resumo: período, equipe, responsável, empresa),
 * `/reports/indicators/` (painel: SLA, satisfação, séries; só período e equipe), `/reports/tickets/export/` (CSV),
 * `/chat/chats/metrics/` (período e responsável) e `/chat/reports/?by=company` (histórico completo, sem período).
 */

const ticketQuery = (f: ReportFilters) => ({ from: f.from, to: f.to, team: f.teamId, agent: f.agentId, company: f.companyId });

export async function getTicketsReport(filters: ReportFilters, signal?: AbortSignal): Promise<TicketsReport> {
  const [report, panel] = await Promise.all([
    http.get<ReportDto>('/reports/tickets/', ticketQuery(filters), { signal }),
    panelSupports(filters) ? http.get<IndicatorsDto>('/reports/indicators/', { from: filters.from, to: filters.to, team: filters.teamId }, { signal }) : Promise.resolve(null),
  ]);
  return mapTicketsReport(report, panel, filters);
}

export async function getChatReport(filters: ReportFilters, signal?: AbortSignal): Promise<ChatReport> {
  const [metrics, byCompany] = await Promise.all([
    http.get<ChatMetricsDto>('/chat/chats/metrics/', { desde: filters.from, ate: filters.to, agent: filters.agentId }, { signal }),
    http.get<ChatReportRowDto[]>('/chat/reports/', { by: 'company' }, { signal }),
  ]);
  return mapChatReport(metrics, byCompany, filters);
}

/** Baixa o CSV do backend com o filtro atual (`/reports/tickets/export/`); o nome vem do `Content-Disposition`. */
export async function exportTicketsCsv(filters: ReportFilters): Promise<CsvFile> {
  const url = `${apiBaseUrl()}/reports/tickets/export/${buildQueryString(ticketQuery(filters))}`;
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', headers: { Accept: '*/*' } });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua rede e tente novamente.', { status: 0, code: 'rede' });
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : undefined;
    const message = res.status === 403 ? `Você não tem permissão para exportar.${detail && !/permiss/i.test(detail) ? ` ${detail}` : ''}` : detail ?? 'Não foi possível exportar o CSV.';
    throw new ApiError(message, { status: res.status, body });
  }
  const csv = await res.text();
  const named = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  return { filename: named ?? `resolv-tickets-${filters.to}.csv`, csv };
}

export { panelSupports };
