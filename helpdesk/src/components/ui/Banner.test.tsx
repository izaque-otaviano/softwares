import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Banner, type BannerTone } from './Banner';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { classColors } from './testTokens';

const TONES: BannerTone[] = ['error', 'warning', 'info', 'success'];

describe('Banner: papéis', () => {
  it('error usa role=alert', () => {
    render(<Banner tone="error">Falha ao carregar</Banner>);
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['warning', 'info', 'success'] as const)('%s usa role=status', (tone) => {
    render(<Banner tone={tone}>Mensagem</Banner>);
    expect(screen.getByRole('status')).toHaveTextContent('Mensagem');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Banner: conteúdo', () => {
  it('título em negrito e corpo', () => {
    render(
      <Banner tone="info" title="Importação concluída">
        42 clientes adicionados.
      </Banner>,
    );
    expect(screen.getByText('Importação concluída')).toHaveClass('font-semibold');
    expect(screen.getByText('42 clientes adicionados.')).toBeInTheDocument();
  });

  it('funciona só com título', () => {
    render(<Banner tone="warning" title="Atenção" />);
    expect(screen.getByRole('status')).toHaveTextContent('Atenção');
  });

  it('o ícone é decorativo', () => {
    const { container } = render(<Banner tone="error">x</Banner>);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('mescla className', () => {
    render(<Banner tone="info" className="mb-4">x</Banner>);
    expect(screen.getByRole('status')).toHaveClass('mb-4', 'rounded');
  });

  it.each(TONES)('%s: contraste AA do texto, sem gradiente nem sombra', (tone) => {
    render(<Banner tone={tone}>x</Banner>);
    const el = screen.getByRole(tone === 'error' ? 'alert' : 'status');
    const { bg, text } = classColors(el);
    expect(contrastRatio(text!, bg!)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(el.className).not.toMatch(/gradient|shadow/);
  });
});

describe('Banner: tentar novamente', () => {
  it('sem onRetry não mostra o botão', () => {
    render(<Banner tone="error">x</Banner>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('mostra "Tentar novamente" e chama onRetry no clique', async () => {
    const onRetry = vi.fn();
    render(
      <Banner tone="error" onRetry={onRetry}>
        Falha
      </Banner>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('funciona pelo teclado (Tab, Enter, Espaço)', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Banner tone="error" onRetry={onRetry}>Falha</Banner>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('retryLabel customizado', () => {
    render(<Banner tone="error" onRetry={() => {}} retryLabel="Recarregar lista">x</Banner>);
    expect(screen.getByRole('button', { name: 'Recarregar lista' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });

  it('é um <button type="button"> (não envia formulário)', () => {
    render(<Banner tone="error" onRetry={() => {}}>x</Banner>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});

describe('Banner: dispensar', () => {
  it('sem onDismiss não mostra o botão', () => {
    render(<Banner tone="info">x</Banner>);
    expect(screen.queryByRole('button', { name: 'Dispensar' })).toBeNull();
  });

  it('botão com aria-label "Dispensar" chama onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<Banner tone="info" onDismiss={onDismiss}>x</Banner>);
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('retry e dispensar convivem e a ordem de tabulação é retry -> dispensar', async () => {
    const user = userEvent.setup();
    render(<Banner tone="error" onRetry={() => {}} onDismiss={() => {}}>x</Banner>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Dispensar' })).toHaveFocus();
  });

  it('o botão dispensar tem alvo de pelo menos 24 x 24', () => {
    render(<Banner tone="info" onDismiss={() => {}}>x</Banner>);
    expect(screen.getByRole('button', { name: 'Dispensar' })).toHaveClass('h-8', 'w-8');
  });
});

describe('Banner: foco ao sumir', () => {
  function Removivel({ retry = false }: { retry?: boolean }) {
    const [visible, setVisible] = useState(true);
    return (
      <div>
        <button type="button">Antes</button>
        {visible ? (
          <Banner tone="error" onDismiss={() => setVisible(false)} onRetry={retry ? () => setVisible(false) : undefined}>
            Falha
          </Banner>
        ) : null}
        <button type="button">Depois</button>
      </div>
    );
  }

  it('dispensar com o teclado leva o foco ao próximo elemento tabulável (não ao <body>)', async () => {
    const user = userEvent.setup();
    render(<Removivel />);
    screen.getByRole('button', { name: 'Dispensar' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus());
  });

  it('"Tentar novamente" que remove o banner também não perde o foco', async () => {
    const user = userEvent.setup();
    render(<Removivel retry />);
    screen.getByRole('button', { name: 'Tentar novamente' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus());
  });

  it('se o consumidor mantém o banner, o foco fica no botão que o recebeu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Banner tone="info" onDismiss={() => {}}>
          x
        </Banner>
        <button type="button">Depois</button>
      </div>,
    );
    const dismiss = screen.getByRole('button', { name: 'Dispensar' });
    dismiss.focus();
    await user.keyboard('{Enter}');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dismiss).toHaveFocus();
  });
});
