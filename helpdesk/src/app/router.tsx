import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
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
export const router = createBrowserRouter(routes, { future: routerFuture });
