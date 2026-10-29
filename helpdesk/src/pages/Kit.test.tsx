import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useUi } from '@/store/useUi';
import Kit from './Kit';
import { SECOES } from './kit/dados';

/** IntersectionObserver controlável: o jsdom não tem. */
class ObservadorFalso {
  static instancias: ObservadorFalso[] = [];
  alvos: Element[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {
    ObservadorFalso.instancias.push(this);
  }
  observe(alvo: Element) {
    this.alvos.push(alvo);
  }
  unobserve() {}
  disconnect() {
    this.alvos = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Simula as seções `ids` cruzando a faixa superior da janela. */
  interseccao(ids: string[]) {
    const entradas = this.alvos.map((alvo) => ({ target: alvo, isIntersecting: ids.includes(alvo.id) }) as IntersectionObserverEntry);
    this.callback(entradas, this as unknown as IntersectionObserver);
  }
}

function renderizar() {
  return render(
    <Providers>
      <Kit />
    </Providers>,
  );
}

describe('Kit (/kit)', () => {
  beforeEach(() => {
    ObservadorFalso.instancias = [];
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    useUi.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('style');
  });

  it('mostra a barra superior, o título e uma seção para cada item da navegação', () => {
    renderizar();
    expect(screen.getByText('Helpdesk · Kit de componentes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Kit de componentes' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Seções do kit' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(SECOES.length);
    for (const secao of SECOES) {
      expect(document.getElementById(secao.id)).not.toBeNull();
      expect(within(nav).getByRole('link', { name: new RegExp(secao.titulo) })).toHaveAttribute('href', `#${secao.id}`);
      expect(screen.getByRole('region', { name: new RegExp(secao.titulo) })).toBeInTheDocument();
    }
  });

  it('destaca na navegação a seção visível (IntersectionObserver)', () => {
    renderizar();
    const nav = screen.getByRole('navigation', { name: 'Seções do kit' });
    expect(within(nav).getByRole('link', { name: /Tokens/ })).toHaveAttribute('aria-current', 'location');

    const observador = ObservadorFalso.instancias.at(-1);
    expect(observador?.alvos).toHaveLength(SECOES.length);
    act(() => observador?.interseccao(['botoes', 'campos']));

    expect(within(nav).getByRole('link', { name: /Campos/ })).toHaveAttribute('aria-current', 'location');
    expect(within(nav).getByRole('link', { name: /Tokens/ })).not.toHaveAttribute('aria-current');
  });

  it('clicar em um item da navegação o destaca na hora', async () => {
    renderizar();
    const nav = screen.getByRole('navigation', { name: 'Seções do kit' });
    await userEvent.click(within(nav).getByRole('link', { name: /Tabela/ }));
    expect(within(nav).getByRole('link', { name: /Tabela/ })).toHaveAttribute('aria-current', 'location');
  });

  it('lê os valores das cores das variáveis CSS de :root em tempo de execução', () => {
    document.documentElement.style.setProperty('--action', '#1f73b7');
    renderizar();
    const tokens = document.getElementById('tokens');
    expect(tokens).not.toBeNull();
    expect(within(tokens as HTMLElement).getByText('#1F73B7')).toBeInTheDocument();
  });

  it('lista os 45 tokens de cor', () => {
    renderizar();
    const tokens = document.getElementById('tokens') as HTMLElement;
    const nomes = within(tokens).getAllByText(/^--[a-z0-9-]+$/);
    expect(nomes).toHaveLength(45);
  });

  it('dispara toasts a partir dos botões da seção de avisos', async () => {
    renderizar();
    await userEvent.click(screen.getByRole('button', { name: 'Sucesso' }));
    expect(await screen.findByText('Ticket #1041 foi atualizado')).toBeInTheDocument();
  });

  it('mostra a tabela de tickets com 12 linhas (grupo Resolvido recolhido) e os três estados', () => {
    renderizar();
    const tabela = screen.getByRole('table', { name: 'Tickets de exemplo' });
    // 12 tickets, menos os 2 do grupo recolhido
    expect(within(tabela).getAllByRole('checkbox', { name: /^Selecionar ticket/ })).toHaveLength(10);
    expect(within(tabela).getByRole('button', { name: /Categoria do status: Resolvido/ })).toHaveAttribute('aria-expanded', 'false');

    expect(screen.getByRole('table', { name: 'Tabela carregando' })).toHaveAttribute('aria-busy', 'true');
    expect(within(screen.getByRole('table', { name: 'Tabela vazia' })).getByText('Nenhum ticket encontrado')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Tabela com erro' })).getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
