import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { brDate, brDay } from './periods';
import { fmtInt } from './format';
import type { Slice } from '@/types/reports';

/** Gráficos desenhados à mão em SVG, só com tokens do projeto (sem biblioteca). */

export function useWidth(fallback = 640): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const update = () => setWidth(Math.max(240, Math.floor(el.clientWidth || fallback)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width];
}

/** Marcas "redondas" do eixo: o último é sempre >= `max`, de modo que o eixo só mostra valores que o gráfico alcança. */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const top = Math.ceil(max / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  /** Classe Tailwind `stroke-*`/`fill-*` do token (par). */
  stroke: string;
  fill: string;
  dashed?: boolean;
  /** Formato do marcador, para não depender só da cor. */
  marker: 'circle' | 'square';
}

const M = { top: 12, right: 12, bottom: 26, left: 40 };

export function LineChart({ dates, series, ariaLabel, height = 240 }: { dates: string[]; series: LineSeries[]; ariaLabel: string; height?: number }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = dates.length;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1]!;
  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const x = (i: number) => M.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + ih - (v / top) * ih;
  const labelCount = Math.max(2, Math.min(n, Math.floor(iw / 70)));
  const labelIdx = n <= labelCount ? dates.map((_, i) => i) : Array.from({ length: labelCount }, (_, k) => Math.round((k * (n - 1)) / (labelCount - 1)));
  const markers = n <= 31;

  const onMove = (clientX: number, rect: DOMRect) => {
    if (n === 0) return;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((clientX - rect.left) / iw) * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative w-full">
      <svg role="img" aria-label={ariaLabel} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-line-strong' : 'stroke-line'} strokeWidth={1} />
            <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-fg-muted text-xs">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text key={dates[i]} x={x(i)} y={height - 8} textAnchor={i === 0 && n > 1 ? 'start' : i === n - 1 && n > 1 ? 'end' : 'middle'} className="fill-fg-muted text-xs">
            {brDay(dates[i]!)}
          </text>
        ))}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} className="stroke-fg-subtle" strokeWidth={1} /> : null}
        {series.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              className={s.stroke}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.dashed ? '6 4' : undefined}
            />
            {markers
              ? s.values.map((v, i) =>
                  s.marker === 'circle' ? (
                    <circle key={i} cx={x(i)} cy={y(v)} r={4} className={cn(s.fill, 'stroke-surface')} strokeWidth={2} />
                  ) : (
                    <rect key={i} x={x(i) - 4} y={y(v) - 4} width={8} height={8} className={cn(s.fill, 'stroke-surface')} strokeWidth={2} />
                  ),
                )
              : null}
            {hover !== null && !markers ? <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4} className={cn(s.fill, 'stroke-surface')} strokeWidth={2} /> : null}
          </g>
        ))}
        <rect
          x={M.left}
          y={M.top}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute top-2 z-10 rounded border border-line bg-surface px-2 py-1 text-xs text-fg shadow-pop"
          style={{ left: Math.min(Math.max(x(hover) + 10, 0), width - 150) }}
        >
          <div className="font-semibold">{brDate(dates[hover]!)}</div>
          {series.map((s) => (
            <div key={s.key}>
              {s.label}: {fmtInt(s.values[hover]!)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface BarItem extends Slice {
  /** Classe Tailwind `fill-*` do token. */
  fill: string;
}

const ROW = 30;

function clip(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, Math.max(1, maxChars - 1))}…` : text;
}

/** Barras horizontais, ordem como recebida (o chamador ordena). Valor escrito ao fim de cada barra; eixo com marcas "redondas". */
export function BarList({ items, ariaLabel }: { items: BarItem[]; ariaLabel: string }) {
  const [ref, width] = useWidth();
  const labelW = Math.min(180, Math.max(96, Math.floor(width * 0.34)));
  const valueW = 44;
  const left = labelW + 8;
  const right = valueW;
  const iw = Math.max(40, width - left - right);
  const max = Math.max(0, ...items.map((i) => i.value));
  const ticks = niceTicks(max, Math.max(2, Math.floor(iw / 90)));
  const top = ticks[ticks.length - 1]!;
  const height = items.length * ROW + 28;
  const maxChars = Math.floor(labelW / 6.6);
  return (
    <div ref={ref} className="w-full">
      <svg role="img" aria-label={ariaLabel} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full">
        {ticks.map((t) => {
          const gx = left + (t / top) * iw;
          return (
            <g key={t}>
              <line x1={gx} x2={gx} y1={0} y2={items.length * ROW} className={t === 0 ? 'stroke-line-strong' : 'stroke-line'} strokeWidth={1} />
              <text x={gx} y={items.length * ROW + 16} textAnchor="middle" className="fill-fg-muted text-xs">
                {fmtInt(t)}
              </text>
            </g>
          );
        })}
        {items.map((it, i) => {
          const w = (it.value / top) * iw;
          return (
            <g key={it.key}>
              <title>{`${it.label}: ${fmtInt(it.value)}`}</title>
              <text x={labelW} y={i * ROW + ROW / 2} textAnchor="end" dominantBaseline="middle" className="fill-fg text-xs">
                {clip(it.label, maxChars)}
              </text>
              <rect x={left} y={i * ROW + 6} width={Math.max(it.value > 0 ? 2 : 0, w)} height={ROW - 12} rx={2} className={cn(it.fill, 'stroke-ink')} strokeWidth={0.5} />
              <text x={left + Math.max(2, w) + 6} y={i * ROW + ROW / 2} dominantBaseline="middle" className="fill-fg text-xs font-semibold">
                {fmtInt(it.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LegendItem({ children, swatch }: { children: ReactNode; swatch: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5 text-xs text-fg-muted">
      {swatch}
      {children}
    </li>
  );
}
