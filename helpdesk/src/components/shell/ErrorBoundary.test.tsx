import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error('falhou');
  return <p>tudo certo</p>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('ErrorBoundary', () => {
  it('mostra mensagem e botão Recarregar em vez de tela branca', () => {
    render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado nesta tela');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
  });

  it('volta a renderizar quando resetKey muda (navegação)', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/a">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      <ErrorBoundary resetKey="/b">
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('tudo certo')).toBeInTheDocument();
  });
});
