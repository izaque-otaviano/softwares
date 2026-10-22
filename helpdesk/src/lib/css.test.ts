/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lido do disco: o Vitest esvazia imports de CSS quando `css` não está habilitado.
const css = readFileSync('src/index.css', 'utf8');

describe('index.css: regras globais', () => {
  it('não usa gradientes nem animações infinitas de carregamento (brief §10)', () => {
    expect(css).not.toMatch(/gradient\(/);
    expect(css).not.toMatch(/animation:[^;]*infinite/);
    expect(css).not.toContain('skeleton-shimmer');
  });

  it('todo movimento declarado dura no máximo 150ms', () => {
    const durations = Array.from(css.matchAll(/animation:\s*hd-[a-z-]+\s+(\d+)ms/g), (m) => Number(m[1]));
    expect(durations.length).toBeGreaterThan(0);
    expect(Math.max(...durations)).toBeLessThanOrEqual(150);
  });

  it('o foco visível tem dois níveis: halo shadow-focus + contorno de 2px em action (>= 3:1, WCAG 1.4.11)', () => {
    // O halo sozinho (28% de alpha) tem ~1,5:1 contra surface.
    expect(css).toMatch(/:focus-visible\s*\{[^}]*@apply shadow-focus/);
    const rule = css.slice(css.indexOf(':where('), css.indexOf('}', css.indexOf(':where(')));
    expect(rule).toContain('outline: 2px solid var(--action)');
    expect(rule).toMatch(/button/);
    expect(rule).toMatch(/\[role='switch'\]/);
    // Fora: campos de texto, gatilhos combobox, itens de lista e quem declara foco próprio.
    expect(rule).toMatch(/:not\([\s\S]*\[role='combobox'\][\s\S]*\[role='option'\][\s\S]*\[data-focus-ring='custom'\]/);
  });

  it('a regra do contorno vem DEPOIS de @tailwind utilities (precisa vencer o outline-none dos componentes)', () => {
    expect(css.indexOf(':where(')).toBeGreaterThan(css.indexOf('@tailwind utilities'));
    expect(css.indexOf(':where(')).toBeGreaterThan(css.indexOf('@layer utilities'));
  });
});
