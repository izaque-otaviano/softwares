import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { Providers } from './providers';
import { RouteA11y } from '@/components/a11y/RouteA11y';

export function App() {
  return (
    <Providers>
      <RouteA11y />
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </Providers>
  );
}
