/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config';

// Lido do disco: o Vitest esvazia imports de CSS (inclusive ?raw) quando `css` não está habilitado.
const css = readFileSync('src/index.css', 'utf8');
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

function cssVar(name: string): string | undefined {
  const m = rootBlock.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? norm(m[1]!) : undefined;
}

type Tree = { [k: string]: string | Tree };
const colors = (config.theme!.extend!.colors as Tree);

function flatten(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const name = k === 'DEFAULT' ? prefix : prefix ? `${prefix}-${k}` : k;
    return typeof v === 'string' ? [[name, v] as [string, string]] : flatten(v, name);
  });
}

// Nomes de variável que não seguem o caminho do Tailwind 1:1.
const camelToKebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

describe('tokens: tailwind.config.ts ⇄ :root', () => {
  for (const [name, value] of flatten(colors)) {
    const variable = camelToKebab(name).replace(/^status-/, 'status-');
    it(`--${variable} = ${value}`, () => {
      expect(cssVar(variable)).toBe(norm(value));
    });
  }

  it('espaçamentos nomeados', () => {
    const spacing = config.theme!.extend!.spacing as Record<string, string>;
    for (const [k, v] of Object.entries(spacing)) expect(cssVar(k)).toBe(norm(v));
  });

  it('sombras nomeadas', () => {
    const shadows = config.theme!.extend!.boxShadow as Record<string, string>;
    for (const [k, v] of Object.entries(shadows)) expect(cssVar(`shadow-${k}`)).toBe(norm(v));
  });

  it('raios nomeados (DEFAULT vira --radius)', () => {
    const radii = config.theme!.extend!.borderRadius as Record<string, string>;
    expect(Object.keys(radii).sort()).toEqual(['DEFAULT', 'lg', 'pill', 'xs']);
    for (const [k, v] of Object.entries(radii)) expect(cssVar(k === 'DEFAULT' ? 'radius' : `radius-${k}`)).toBe(norm(v));
  });

  it('toda variável de :root tem um token correspondente no Tailwind (sem valores órfãos)', () => {
    const extend = config.theme!.extend!;
    const known = new Set<string>([
      ...flatten(colors).map(([name]) => camelToKebab(name)),
      ...Object.keys(extend.spacing as Record<string, string>),
      ...Object.keys(extend.boxShadow as Record<string, string>).map((k) => `shadow-${k}`),
      ...Object.keys(extend.borderRadius as Record<string, string>).map((k) => (k === 'DEFAULT' ? 'radius' : `radius-${k}`)),
    ]);
    const declared = Array.from(rootBlock.matchAll(/--([a-z0-9-]+):/g), (m) => m[1]!);
    expect(declared.length).toBeGreaterThan(30);
    expect(declared.filter((name) => !known.has(name))).toEqual([]);
  });
});
