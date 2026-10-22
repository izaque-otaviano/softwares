import { useTickets } from '@/store/useTickets';

const APP = 'Helpdesk';

const ADMIN_TITLES: Record<string, string> = {
  '': 'Administração',
  members: 'Membros da equipe',
  roles: 'Funções',
  groups: 'Grupos',
  fields: 'Campos de ticket',
  statuses: 'Status de ticket',
  triggers: 'Gatilhos',
  macros: 'Macros',
};

/** Parte descritiva do título da rota (sem o sufixo "· Helpdesk"). */
export function routeLabel(pathname: string, search = ''): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  const seg = p.split('/').filter(Boolean);
  if (seg[0] === 'kit') return 'Kit de componentes';
  if (seg[0] === 'agent') {
    const area = seg[1] ?? 'home';
    const id = seg[2];
    switch (area) {
      case 'home':
        return 'Início';
      case 'views':
        return 'Visualizações';
      case 'tickets': {
        if (id === 'new') return 'Novo ticket';
        const t = id ? useTickets.getState().tickets.find((x) => String(x.id) === id) : undefined;
        return t ? `#${t.id} ${t.subject}` : `Ticket #${id ?? ''}`.trim();
      }
      case 'customers':
        return id ? 'Cliente' : 'Clientes';
      case 'orgs':
        return id ? 'Organização' : 'Organizações';
      case 'search': {
        const q = new URLSearchParams(search).get('q');
        return q ? `Pesquisar ${q}` : 'Pesquisar';
      }
      default:
        return 'Página não encontrada';
    }
  }
  if (seg[0] === 'admin') {
    const area = seg[1] ?? '';
    if (area === 'fora-desta-versao') return 'Fora desta versão · Administração';
    const base = ADMIN_TITLES[area];
    if (!base) return 'Página não encontrada · Administração';
    if (seg[2] === 'new') return `Criar ${area === 'macros' ? 'macro' : 'gatilho'} · Administração`;
    if (seg[2]) return `${area === 'macros' ? 'Editar macro' : 'Editar gatilho'} · Administração`;
    return area ? `${base} · Administração` : base;
  }
  return 'Página não encontrada';
}

export function routeTitle(pathname: string, search = ''): string {
  return `${routeLabel(pathname, search)} · ${APP}`;
}
