import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AgentLayout } from '@/components/shell';

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

const lazyEl = (node: ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/agent/home" replace /> },
  { path: '/kit', element: lazyEl(<Kit />) },
  {
    path: '/agent',
    element: <AgentLayout />,
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
  { path: '*', element: lazyEl(<NotFound />) },
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
