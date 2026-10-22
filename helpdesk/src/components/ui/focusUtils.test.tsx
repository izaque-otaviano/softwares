import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { captureFocusRescue, closestFocusFallback, isFocusAdrift, removeKeepingFocus, tabbableElements, triggerOfRadixContent } from './focusUtils';

describe('isFocusAdrift', () => {
  it('é verdadeiro no <body> e em contêineres que só recebem foco por script', () => {
    render(
      <div>
        <div role="dialog" tabIndex={-1} data-testid="dialogo">
          Texto
        </div>
        <button type="button">Botão</button>
        <input aria-label="Campo" />
        <button type="button" tabIndex={-1}>
          Fora da ordem de Tab
        </button>
      </div>,
    );
    expect(isFocusAdrift()).toBe(true);
    screen.getByTestId('dialogo').focus();
    expect(isFocusAdrift()).toBe(true);
    screen.getByRole('button', { name: 'Botão' }).focus();
    expect(isFocusAdrift()).toBe(false);
    screen.getByRole('textbox', { name: 'Campo' }).focus();
    expect(isFocusAdrift()).toBe(false);
    // Um botão com tabindex -1 (ex.: "Remover tag") clicado de propósito não é "foco solto".
    screen.getByRole('button', { name: 'Fora da ordem de Tab' }).focus();
    expect(isFocusAdrift()).toBe(false);
  });
});

describe('tabbableElements e closestFocusFallback', () => {
  it('lista só o que Tab alcança, em ordem, ignorando tabindex -1, desabilitados e áreas ocultas', () => {
    render(
      <div>
        <button type="button">A</button>
        <button type="button" tabIndex={-1}>
          B
        </button>
        <button type="button" disabled>
          C
        </button>
        <div aria-hidden="true">
          <button type="button">D</button>
        </div>
        <a href="#x">E</a>
        <input aria-label="F" />
      </div>,
    );
    expect(tabbableElements().map((el) => el.textContent || el.getAttribute('aria-label'))).toEqual(['A', 'E', 'F']);
  });

  it('closestFocusFallback acha o contêiner marcado mais próximo', () => {
    render(
      <div data-focus-fallback="" data-testid="regiao">
        <div>
          <button type="button">Dentro</button>
        </div>
      </div>,
    );
    expect(closestFocusFallback(screen.getByRole('button', { name: 'Dentro' }))).toBe(screen.getByTestId('regiao'));
    expect(closestFocusFallback(document.body)).toBeNull();
    expect(closestFocusFallback(null)).toBeNull();
  });
});

describe('captureFocusRescue / removeKeepingFocus', () => {
  function setup() {
    render(
      <div data-focus-fallback="" data-testid="regiao" tabIndex={-1}>
        <button type="button">Antes</button>
        <div data-testid="alvo">
          <button type="button">Remover</button>
        </div>
        <button type="button">Depois</button>
      </div>,
    );
    return { alvo: screen.getByTestId('alvo'), remover: screen.getByRole('button', { name: 'Remover' }) };
  }

  it('sem foco dentro do elemento não há o que resgatar', () => {
    const { alvo } = setup();
    screen.getByRole('button', { name: 'Antes' }).focus();
    expect(captureFocusRescue(alvo)).toBeNull();
    expect(captureFocusRescue(null)).toBeNull();
  });

  it('depois da remoção leva o foco ao próximo tabulável; sem próximo, ao anterior; sem nenhum, ao contêiner', () => {
    const { alvo, remover } = setup();
    remover.focus();
    const restore = captureFocusRescue(alvo)!;
    alvo.remove();
    expect(document.body).toHaveFocus();
    restore();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
  });

  it('usa o anterior quando não há próximo e o contêiner quando não há nenhum', () => {
    const { alvo, remover } = setup();
    screen.getByRole('button', { name: 'Depois' }).remove();
    remover.focus();
    const restore = captureFocusRescue(alvo)!;
    alvo.remove();
    restore();
    expect(screen.getByRole('button', { name: 'Antes' })).toHaveFocus();

    screen.getByRole('button', { name: 'Antes' }).remove();
    const sozinho = screen.getByTestId('regiao');
    const botao = document.createElement('button');
    sozinho.appendChild(botao);
    botao.focus();
    const restoreRegion = captureFocusRescue(botao)!;
    botao.remove();
    restoreRegion();
    expect(sozinho).toHaveFocus();
  });

  it('`prefer` vem antes dos vizinhos', () => {
    const { alvo, remover } = setup();
    remover.focus();
    const antes = screen.getByRole('button', { name: 'Antes' });
    const restore = captureFocusRescue(alvo, { prefer: [() => antes] })!;
    alvo.remove();
    restore();
    expect(antes).toHaveFocus();
  });

  it('não mexe no foco se o consumidor já o levou a outro lugar', () => {
    const { alvo, remover } = setup();
    remover.focus();
    const restore = captureFocusRescue(alvo)!;
    alvo.remove();
    screen.getByRole('button', { name: 'Antes' }).focus();
    restore();
    expect(screen.getByRole('button', { name: 'Antes' })).toHaveFocus();
  });

  it('removeKeepingFocus executa a remoção e resgata o foco no próximo tick', async () => {
    const { alvo, remover } = setup();
    remover.focus();
    removeKeepingFocus(alvo, () => alvo.remove());
    expect(alvo.isConnected).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
  });
});

describe('triggerOfRadixContent', () => {
  it('acha o gatilho pelo aria-labelledby do conteúdo', () => {
    render(
      <div>
        <button id="gatilho" type="button">
          Abrir
        </button>
        <div role="menu" aria-labelledby="gatilho" data-testid="menu" />
      </div>,
    );
    expect(triggerOfRadixContent(screen.getByTestId('menu'))).toBe(screen.getByRole('button', { name: 'Abrir' }));
    expect(triggerOfRadixContent(null)).toBeNull();
    expect(triggerOfRadixContent(document.body)).toBeNull();
  });
});
