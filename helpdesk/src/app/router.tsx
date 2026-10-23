import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter, createMemoryRouter, type RouteObject } from 'react-router-dom';
import { RequireSession } from '@/components/auth/RequireSession';
import { AgentLayout } from '@/components/shell';
import { AdminLayout } from './AdminLayout';

const Login = lazy(() => import('@/pages/Login'));
const Kit = lazy(() => import('@/pages/Kit'));
const Home = lazy(() => import('@/pages/Home'));
const Views = lazy(() => import('@/pages/Views'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Ticket = lazy(() => import('@/pages/Ticket'));
const Search = lazy(() => import('@/pages/Search'));
const Customers = lazy(() => import('@/pages/Customers'));
const Customer = lazy(() => import('@/pages/Customer'));
const Orgs = lazy(() => import('@/pages/Orgs'));
const Org = lazy(() => import('@/pages/Org'));

const Board = lazy(() => import('@/pages/Board'));
const Chat = lazy(() => import('@/pages/Chat'));
const Reports = lazy(() => import('@/pages/Reports'));
const AdminSla = lazy(() => import('@/pages/admin/Sla'));
const AdminCalendars = lazy(() => import('@/pages/admin/Calendars'));
const AdminPlans = lazy(() => import('@/pages/admin/Plans'));
const AdminBackups = lazy(() => import('@/pages/admin/Backups'));
const AdminAudit = lazy(() => import('@/pages/admin/Audit'));
const AdminRetention = lazy(() => import('@/pages/admin/Retention'));
const AdminLgpd = lazy(() => import('@/pages/admin/Lgpd'));
const AdminAnnouncements = lazy(() => import('@/pages/admin/Announcements'));
const AdminNotificationPrefs = lazy(() => import('@/pages/admin/NotificationPrefs'));
const AdminSecurity = lazy(() => import('@/pages/admin/Security'));

const AdminHome = lazy(() => import('@/pages/admin/Home'));
const AdminMembers = lazy(() => import('@/pages/admin/Members'));
const AdminRoles = lazy(() => import('@/pages/admin/Roles'));
const AdminGroups = lazy(() => import('@/pages/admin/Groups'));
const AdminFields = lazy(() => import('@/pages/admin/Fields'));
const AdminStatuses = lazy(() => import('@/pages/admin/Statuses'));
const AdminTriggers = lazy(() => import('@/pages/admin/Triggers'));
const AdminTriggerEdit = lazy(() => import('@/pages/admin/TriggerEdit'));
const AdminMacros = lazy(() => import('@/pages/admin/Macros'));
const AdminMacroEdit = lazy(() => import('@/pages/admin/MacroEdit'));
const AdminOutOfScope = lazy(() => import('@/pages/admin/OutOfScope'));
const AdminAccountOverview = lazy(() => import('@/pages/admin/AccountOverview'));
const AdminChannelsInfo = lazy(() => import('@/pages/admin/ChannelsInfo'));
const AdminWorkspaceInfo = lazy(() => import('@/pages/admin/WorkspaceInfo'));

const lazyEl = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/agent/home" replace /> },
  { path: '/login', element: lazyEl(<Login />) },
  { path: '/kit', element: lazyEl(<Kit />) },
  {
    path: '/agent',
    element: (
      <RequireSession>
        <AgentLayout />
      </RequireSession>
    ),
    children: [
      { index: true, element: <Navigate to="/agent/home" replace /> },
      { path: 'home', element: <Home /> },
      { path: 'views', element: <Views /> },
      { path: 'views/:id', element: <Views /> },
      { path: 'tickets/new', element: <Ticket /> },
      { path: 'tickets/:id', element: <Ticket /> },
      { path: 'customers', element: <Customers /> },
      { path: 'customers/:id', element: <Customer /> },
      { path: 'orgs', element: <Orgs /> },
      { path: 'orgs/:id', element: <Org /> },
      { path: 'search', element: lazyEl(<Search />) },
      { path: 'board', element: <Board /> },
      { path: 'chat', element: <Chat /> },
      { path: 'chat/:id', element: <Chat /> },
      { path: 'reports', element: <Reports /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    path: '/admin',
    element: (
      <RequireSession>
        <AdminLayout />
      </RequireSession>
    ),
    children: [
      { index: true, element: <AdminHome /> },
      { path: 'members', element: <AdminMembers /> },
      { path: 'roles', element: <AdminRoles /> },
      { path: 'groups', element: <AdminGroups /> },
      { path: 'fields', element: <AdminFields /> },
      { path: 'statuses', element: <AdminStatuses /> },
      { path: 'triggers', element: <AdminTriggers /> },
      { path: 'triggers/new', element: <AdminTriggerEdit /> },
      { path: 'triggers/:id', element: <AdminTriggerEdit /> },
      { path: 'macros', element: <AdminMacros /> },
      { path: 'macros/new', element: <AdminMacroEdit /> },
      { path: 'macros/:id', element: <AdminMacroEdit /> },
      { path: 'sla/*', element: <AdminSla /> },
      { path: 'calendarios/*', element: <AdminCalendars /> },
      { path: 'planos/*', element: <AdminPlans /> },
      { path: 'backups/*', element: <AdminBackups /> },
      { path: 'auditoria/*', element: <AdminAudit /> },
      { path: 'retencao/*', element: <AdminRetention /> },
      { path: 'lgpd/*', element: <AdminLgpd /> },
      { path: 'avisos/*', element: <AdminAnnouncements /> },
      { path: 'notificacoes/*', element: <AdminNotificationPrefs /> },
      { path: 'seguranca/*', element: <AdminSecurity /> },
      { path: 'conta/visao-geral', element: <AdminAccountOverview /> },
      { path: 'canais/:slug', element: <AdminChannelsInfo /> },
      { path: 'espacos/:slug', element: <AdminWorkspaceInfo /> },
      { path: 'fora-desta-versao/:slug', element: <AdminOutOfScope /> },
      { path: '*', element: <AdminOutOfScope /> },
    ],
  },
  { path: '*', element: <main id="conteudo" className="h-screen bg-surface text-fg">{lazyEl(<NotFound />)}</main> },
];

export const routerFuture = {
  v7_relativeSplatPath: true,
  v7_fetcherPersist: true,
  v7_normalizeFormMethod: true,
  v7_partialHydration: true,
  v7_skipActionErrorRevalidation: true,
} as const;

// Adota hoje o comportamento do React Router v7 (e silencia os avisos "Future Flag" no console).
// VITE_ROUTER=memory: para hospedar a demonstração onde a URL da página não muda (ex.: página incorporada).
export const router =
  import.meta.env.VITE_ROUTER === 'memory'
    ? createMemoryRouter(routes, { future: routerFuture, initialEntries: ['/agent/home'] })
    : createBrowserRouter(routes, { future: routerFuture });
