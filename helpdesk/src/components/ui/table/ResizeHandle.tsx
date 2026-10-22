import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { RESIZE_STEP, RESIZE_STEP_LARGE } from './columns';

export interface ResizeHandleProps {
  /** Nome da coluna (vai no nome acessível). */
  label: string;
  width: number;
  min: number;
  max: number;
  /** Largura provisória durante o arrasto; `null` ao terminar/cancelar. Nada é persistido aqui. */
  onPreview: (width: number | null) => void;
  /** Largura definitiva (soltar o ponteiro ou tecla de seta). */
  onCommit: (width: number) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
  width: number;
}

/**
 * Alça de redimensionar na borda direita do cabeçalho. É um separador vertical focável (padrão "window splitter"):
 * ←/→ ajustam 8 px (Shift = 24 px); o mouse arrasta com captura de ponteiro. Visualmente é uma linha fina (1 px);
 * a área de ponteiro tem 24 px de largura (12 px de cada lado da borda da coluna) e a altura do cabeçalho, o mínimo da WCAG 2.5.8.
 */
export function ResizeHandle({ label, width, min, max, onPreview, onCommit }: ResizeHandleProps) {
  const drag = useRef<DragState | null>(null);
  const clamp = (value: number) => Math.min(max, Math.max(min, Math.round(value)));

  const endDrag = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(state.pointerId)) event.currentTarget.releasePointerCapture(state.pointerId);
    if (commit && state.width !== state.startWidth) onCommit(state.width);
    onPreview(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width, width };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || event.pointerId !== state.pointerId) return;
    state.width = clamp(state.startWidth + event.clientX - state.startX);
    onPreview(state.width);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? RESIZE_STEP_LARGE : RESIZE_STEP;
    let next: number;
    if (event.key === 'ArrowLeft') next = width - step;
    else if (event.key === 'ArrowRight') next = width + step;
    else return;
    event.preventDefault();
    event.stopPropagation();
    const clamped = clamp(next);
    if (clamped !== width) onCommit(clamped);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Redimensionar coluna ${label}`}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
      onLostPointerCapture={(event) => endDrag(event, false)}
      onKeyDown={onKeyDown}
      // O traço de 2px em action (e mais alto) é o indicador de foco da alça.
      data-focus-ring="custom"
      className="group/handle absolute inset-y-0 -right-3 z-[1] w-6 cursor-col-resize touch-none select-none outline-none"
    >
      <span
        aria-hidden
        className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-fg-subtle transition-colors duration-100 group-hover/handle:w-0.5 group-hover/handle:bg-action group-focus-visible/handle:inset-y-1 group-focus-visible/handle:w-0.5 group-focus-visible/handle:bg-action"
      />
    </div>
  );
}
