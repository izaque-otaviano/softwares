import type { ReactElement, SVGProps } from 'react';

export type EmptyIllustrationName = 'box' | 'search' | 'binoculars';

export interface EmptyIllustrationProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children'> {
  name: EmptyIllustrationName;
  /** Lado em px. Padrão 96. */
  size?: number;
}

/*
 * Três ilustrações originais de traço fino (viewBox 96 x 96). Só `currentColor`, sem preenchimento:
 * a cor vem de quem usa (o EmptyState aplica `text-fg-subtle`, 3,3:1 sobre branco). Traços: 1.5, pontas e junções arredondadas.
 */

/** Caixa aberta, vazia, com as abas dobradas para os lados e três riscos acima. */
function Box() {
  return (
    <>
      {/* abertura e corpo */}
      <path d="M48 38 L72 50 L48 62 L24 50 Z" />
      <path d="M24 50 V72 L48 84 L72 72 V50" />
      <path d="M48 62 V84" />
      {/* abas */}
      <path d="M24 50 L14 36 L38 24 L48 38" />
      <path d="M48 38 L58 24 L82 36 L72 50" />
      {/* riscos: nada dentro */}
      <path d="M48 8 V14" />
      <path d="M33 12 L36 17" />
      <path d="M63 12 L60 17" />
    </>
  );
}

/** Lupa com um brilho no vidro e um sinal de mais ao lado. */
function Search() {
  return (
    <>
      <circle cx="42" cy="42" r="22" />
      <path d="M30 40 A13 13 0 0 1 40 30" />
      {/* cabo */}
      <path d="M59.5 56 L80 76.5 L76.5 80 L56 59.5" />
      {/* brilho */}
      <path d="M76 18 V28" />
      <path d="M71 23 H81" />
    </>
  );
}

/** Binóculos de frente: dois tubos com lentes, ponte e roda de foco. */
function Binoculars() {
  return (
    <g transform="translate(0 -3)">
      {/* tubos */}
      <path d="M16 62 V34 A8 8 0 0 1 24 26 H36 A8 8 0 0 1 44 34 V62" />
      <path d="M52 62 V34 A8 8 0 0 1 60 26 H72 A8 8 0 0 1 80 34 V62" />
      {/* lentes */}
      <circle cx="30" cy="62" r="14" />
      <circle cx="66" cy="62" r="14" />
      <circle cx="30" cy="62" r="8" />
      <circle cx="66" cy="62" r="8" />
      <path d="M26 58 A5.5 5.5 0 0 1 31 56" />
      <path d="M62 58 A5.5 5.5 0 0 1 67 56" />
      {/* ponte e foco */}
      <path d="M44 40 H52" />
      <path d="M44 52 H52" />
      <path d="M46 46 H50" />
      {/* riscos de visada */}
      <path d="M48 8 V16" />
      <path d="M34 11 L37 17" />
      <path d="M62 11 L59 17" />
    </g>
  );
}

const DRAW: Record<EmptyIllustrationName, () => ReactElement> = { box: Box, search: Search, binoculars: Binoculars };

/** SVG decorativo (aria-hidden). O título e a descrição do EmptyState é que comunicam o estado. */
export function EmptyIllustration({ name, size = 96, ...rest }: EmptyIllustrationProps) {
  const Draw = DRAW[name];
  return (
    <svg
      {...rest}
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-illustration={name}
    >
      <Draw />
    </svg>
  );
}
