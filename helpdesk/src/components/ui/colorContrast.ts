/**
 * Utilitários de contraste (WCAG 2.x) usados pelo StatusBadge para escolher texto legível sobre cores de status
 * personalizadas e pelos testes que garantem AA nas combinações de tokens.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Lê `#rgb` ou `#rrggbb`. Qualquer outra coisa (var(), nomes, rgb()) devolve `null`. */
export function parseHex(value: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const hex = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!;
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste entre duas cores hex (1 a 21). Devolve `NaN` se alguma não for hex. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return Number.NaN;
  const [hi, lo] = [relativeLuminance(ca), relativeLuminance(cb)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Mínimo AA para texto normal. */
export const AA_NORMAL = 4.5;

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** Contraste de uma cor hex com texto branco. `NaN` se a cor não for hex. */
export function contrastWithWhite(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return Number.NaN;
  return (relativeLuminance(WHITE) + 0.05) / (relativeLuminance(rgb) + 0.05);
}
