import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AVATAR_PALETTE, Avatar, avatarColorIndex, initialsOf } from './Avatar';
import { AA_NORMAL, contrastRatio } from './colorContrast';
import { tokenHex } from './testTokens';

describe('initialsOf', () => {
  it.each([
    ['Ana Silva', 'AS'],
    ['  maria   da silva souza ', 'MS'],
    ['maria', 'M'],
    ['Álvaro Éder', 'ÁÉ'],
    ['joão', 'J'],
    ['Ana-Lúcia Prado', 'AP'],
    ['"Beto" (Fin)', 'BF'],
  ])('%s -> %s', (name, expected) => expect(initialsOf(name)).toBe(expected));

  it.each([undefined, '', '   ', '123', '😀', '---'])('sem letras (%j) -> vazio', (name) => {
    expect(initialsOf(name)).toBe('');
  });
});

describe('Avatar: iniciais e silhueta', () => {
  it('com nome mostra as iniciais (até 2 letras)', () => {
    render(<Avatar name="Ana Silva" />);
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ana Silva' })).toBeInTheDocument();
  });

  it('sem nome nem foto: círculo cinza surface-2 com silhueta e sem cor de hash', () => {
    const { container } = render(<Avatar />);
    const circle = container.querySelector('.rounded-pill')!;
    expect(circle).toHaveClass('bg-surface-2');
    expect(circle.querySelector('[data-avatar-silhouette]')).not.toBeNull();
    expect(container.querySelector('[data-avatar-color]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Usuário sem nome' })).toBeInTheDocument();
  });

  it('nome sem letras também cai para a silhueta cinza', () => {
    const { container } = render(<Avatar name="123" />);
    expect(container.querySelector('.rounded-pill')).toHaveClass('bg-surface-2');
    expect(container.querySelector('[data-avatar-silhouette]')).not.toBeNull();
  });

  it('o texto das iniciais é branco sobre cor da paleta', () => {
    const { container } = render(<Avatar name="Ana Silva" />);
    const circle = container.querySelector('.rounded-pill')!;
    expect(circle).toHaveClass('text-fg-inverse');
    expect(AVATAR_PALETTE.some((c) => circle.classList.contains(c.className))).toBe(true);
  });

  it('tamanho padrão 32 e customizado', () => {
    const { container, rerender } = render(<Avatar name="Ana Silva" />);
    expect(container.firstElementChild).toHaveStyle({ width: '32px', height: '32px' });
    rerender(<Avatar name="Ana Silva" size={40} />);
    expect(container.firstElementChild).toHaveStyle({ width: '40px', height: '40px' });
  });

  it('mescla className', () => {
    const { container } = render(<Avatar name="Ana Silva" className="ml-2" />);
    expect(container.firstElementChild).toHaveClass('ml-2');
  });
});

describe('Avatar: hash estável e paleta fechada', () => {
  it('mesmo nome, mesma cor (em renders diferentes e ignorando caixa/espaços)', () => {
    const colorOf = (name: string) => {
      const { container, unmount } = render(<Avatar name={name} />);
      const token = container.querySelector('[data-avatar-color]')!.getAttribute('data-avatar-color');
      unmount();
      return token;
    };
    expect(colorOf('Ana Silva')).toBe(colorOf('Ana Silva'));
    expect(colorOf('Ana Silva')).toBe(colorOf('  ana silva '));
  });

  it('o algoritmo é fixo: valores conhecidos não mudam entre versões', () => {
    expect(avatarColorIndex('Ana Silva')).toBe(6);
    expect(avatarColorIndex('Maria')).toBe(3);
    expect(avatarColorIndex('Carla Dias')).toBe(0);
  });

  it('o índice sempre cai dentro da paleta e distribui por todas as cores', () => {
    const used = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const idx = avatarColorIndex(`Pessoa ${i} Sobrenome${i * 7}`);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(AVATAR_PALETTE.length);
      used.add(idx);
    }
    expect(used.size).toBe(AVATAR_PALETTE.length);
  });

  it('paleta fechada em tokens: classe bate com o token e não há duplicatas', () => {
    expect(new Set(AVATAR_PALETTE.map((c) => c.token)).size).toBe(AVATAR_PALETTE.length);
    for (const { token, className } of AVATAR_PALETTE) {
      expect(className).toBe(`bg-${token.replace('.', '-')}`);
    }
  });

  it.each(AVATAR_PALETTE.map((c) => [c.token]))('%s: texto branco com contraste >= 4,5:1', (token) => {
    expect(contrastRatio(tokenHex('fg.inverse'), tokenHex(token))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('o roxo ai (4,46:1) ficou fora da paleta por reprovar AA com texto branco', () => {
    expect(contrastRatio(tokenHex('fg.inverse'), tokenHex('ai'))).toBeLessThan(AA_NORMAL);
    expect(AVATAR_PALETTE.map((c) => c.token)).not.toContain('ai');
  });
});

describe('Avatar: foto', () => {
  it('mostra a foto', () => {
    const { container } = render(<Avatar name="Ana Silva" src="https://exemplo.test/a.png" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', 'https://exemplo.test/a.png');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.queryByText('AS')).toBeNull();
  });

  it('se a foto quebra, cai para as iniciais', () => {
    const { container } = render(<Avatar name="Ana Silva" src="https://exemplo.test/quebrada.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('se a foto quebra e não há nome, cai para a silhueta', () => {
    const { container } = render(<Avatar src="https://exemplo.test/quebrada.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('[data-avatar-silhouette]')).not.toBeNull();
  });

  it('trocar o src tenta de novo a nova foto', () => {
    const { container, rerender } = render(<Avatar name="Ana Silva" src="https://exemplo.test/x.png" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<Avatar name="Ana Silva" src="https://exemplo.test/y.png" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://exemplo.test/y.png');
  });
});

describe('Avatar: presença', () => {
  it('sem presence não mostra ponto', () => {
    const { container } = render(<Avatar name="Ana Silva" />);
    expect(container.querySelector('[data-presence]')).toBeNull();
  });

  it.each([
    ['available', 'Disponível', 'bg-presence-available'],
    ['away', 'Ausente', 'bg-presence-away'],
    ['dnd', 'Não perturbe', 'bg-presence-dnd'],
    ['offline', 'Offline', 'bg-presence-offline'],
  ] as const)('presença %s: nome acessível inclui "%s" e o ponto usa %s', (presence, label, cls) => {
    const { container } = render(<Avatar name="Ana Silva" presence={presence} />);
    expect(screen.getByRole('img', { name: `Ana Silva, ${label}` })).toBeInTheDocument();
    const dot = container.querySelector('[data-presence]')!;
    expect(dot).toHaveClass(cls);
    // anel surface em volta, no canto inferior direito
    expect(dot.parentElement).toHaveClass('border-surface', 'absolute', '-bottom-0.5', '-right-0.5');
  });

  it('decorative esconde o avatar dos leitores de tela', () => {
    const { container } = render(<Avatar name="Ana Silva" presence="available" decorative />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});
