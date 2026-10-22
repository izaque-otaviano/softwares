/**
 * Apenas para testes: resolve o hex de um token (`'sla.warnText'`, `'fg.inverse'`) a partir do tailwind.config.ts,
 * a fonte de verdade dos tokens. Não importe em código de produção.
 */
import config from '../../../tailwind.config';

type Tree = { [key: string]: string | Tree };

export function tokenHex(path: string): string {
  const colors = config.theme!.extend!.colors as Tree;
  let node: string | Tree | undefined = colors;
  for (const key of path.split('.')) {
    if (typeof node === 'string' || node === undefined) throw new Error(`Token inexistente: ${path}`);
    node = node[key];
  }
  if (typeof node === 'object') node = node.DEFAULT;
  if (typeof node !== 'string') throw new Error(`Token inexistente: ${path}`);
  return node;
}

function tryTokenHex(path: string): string | undefined {
  try {
    return tokenHex(path);
  } catch {
    return undefined;
  }
}

function hexOf(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mistura `top` com opacidade `alpha` sobre `bottom` (ambos hex). */
export function blend(top: string, alpha: number, bottom: string): string {
  const t = toRgb(top);
  const b = toRgb(bottom);
  return hexOf([t[0] * alpha + b[0] * (1 - alpha), t[1] * alpha + b[1] * (1 - alpha), t[2] * alpha + b[2] * (1 - alpha)]);
}

/** `'bg-sla-breach'` -> hex de `sla.breach`; `'text-ai/10'` mistura sobre `surface`. Classes que não são cor de token -> undefined. */
export function colorOfClass(prefix: 'bg' | 'text', cls: string): string | undefined {
  if (!cls.startsWith(`${prefix}-`)) return undefined;
  const [name, alpha] = cls.slice(prefix.length + 1).split('/') as [string, string | undefined];
  const hex = tryTokenHex(name.replace('-', '.'));
  if (!hex) return undefined;
  return alpha ? blend(hex, Number(alpha) / 100, tokenHex('surface')) : hex;
}

/** Cores de fundo e de texto (hex) declaradas por classes de token em `el`. Alfa é composto sobre `surface`. */
export function classColors(el: Element): { bg?: string; text?: string } {
  const classes = Array.from(el.classList);
  return {
    bg: classes.map((c) => colorOfClass('bg', c)).find(Boolean),
    text: classes.map((c) => colorOfClass('text', c)).find(Boolean),
  };
}
