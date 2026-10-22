import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { Providers } from './providers';

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </Providers>
  );
}
