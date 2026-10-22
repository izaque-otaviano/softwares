import { Building2, Home, LayoutGrid, Radio, Shapes, Users, type LucideIcon } from 'lucide-react';

export interface AdminNavItem {
  label: string;
  to: string;
  /** Item sem página nesta versão: leva a "Fora desta versão". */
  external?: boolean;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export interface AdminSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Destino ao clicar no ícone do rail. */
  to: string;
  groups: AdminNavGroup[];
}

export const OUT_OF_SCOPE_BASE = '/admin/fora-desta-versao';

const stub = (label: string, slug: string): AdminNavItem => ({ label, to: `${OUT_OF_SCOPE_BASE}/${slug}`, external: true });

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'home', label: 'Início', icon: Home, to: '/admin', groups: [] },
  {
    id: 'account',
    label: 'Conta',
    icon: Building2,
    to: `${OUT_OF_SCOPE_BASE}/visao-geral`,
    groups: [
      { label: 'Conta', items: [stub('Visão geral', 'visao-geral'), stub('Marca', 'marca')] },
      { label: 'Cobrança', items: [stub('Assinatura', 'assinatura'), stub('Faturas', 'faturas')] },
      { label: 'Segurança', items: [stub('Política de senhas', 'senhas'), stub('Autenticação única', 'sso')] },
    ],
  },
  {
    id: 'people',
    label: 'Pessoas',
    icon: Users,
    to: '/admin/members',
    groups: [
      {
        label: 'Equipe',
        items: [
          { label: 'Membros da equipe', to: '/admin/members' },
          { label: 'Funções', to: '/admin/roles' },
          { label: 'Grupos', to: '/admin/groups' },
        ],
      },
      { label: 'Clientes', items: [stub('Configuração de clientes', 'clientes')] },
    ],
  },
  {
    id: 'channels',
    label: 'Canais',
    icon: Radio,
    to: `${OUT_OF_SCOPE_BASE}/email`,
    groups: [
      { label: 'Mensagens', items: [stub('E-mail', 'email'), stub('Formulário web', 'formulario-web')] },
      { label: 'Integrações', items: [stub('API', 'api'), stub('Webhooks', 'webhooks')] },
    ],
  },
  {
    id: 'workspaces',
    label: 'Espaços de trabalho',
    icon: LayoutGrid,
    to: `${OUT_OF_SCOPE_BASE}/layouts`,
    groups: [{ label: 'Área do agente', items: [stub('Layouts de ticket', 'layouts'), stub('Atalhos', 'atalhos')] }],
  },
  {
    id: 'objects',
    label: 'Objetos e regras',
    icon: Shapes,
    to: '/admin/fields',
    groups: [
      {
        label: 'Tickets',
        items: [
          { label: 'Campos', to: '/admin/fields' },
          { label: 'Status do ticket', to: '/admin/statuses' },
        ],
      },
      {
        label: 'Regras de negócio',
        items: [
          { label: 'Gatilhos', to: '/admin/triggers' },
          { label: 'Macros', to: '/admin/macros' },
        ],
      },
    ],
  },
];

export const ALL_NAV_ITEMS: (AdminNavItem & { section: AdminSection })[] = ADMIN_SECTIONS.flatMap((section) =>
  section.groups.flatMap((g) => g.items.map((item) => ({ ...item, section }))),
);

/** Seção ativa a partir do caminho (editor de gatilho `/admin/triggers/:id` pertence a Objetos e regras). */
export function sectionForPath(pathname: string): AdminSection {
  const hit = ALL_NAV_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  return hit?.section ?? ADMIN_SECTIONS[0]!;
}

export function isItemActive(pathname: string, item: AdminNavItem): boolean {
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
