import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SpinnerProps {
  /** Diâmetro em px. Padrão 16. */
  size?: number;
  /** Texto para leitor de tela. Padrão "Carregando...". Passe '' quando o contexto já anuncia o carregamento (fica decorativo). */
  label?: string;
  className?: string;
}

/** Indicador de carregamento. Herda a cor do texto ao redor (`currentColor`). */
export function Spinner({ size = 16, label = 'Carregando...', className }: SpinnerProps) {
  const icon = <Loader2 aria-hidden size={size} className="animate-spin" />;
  if (!label) {
    return (
      <span aria-hidden className={cn('inline-flex shrink-0', className)}>
        {icon}
      </span>
    );
  }
  return (
    <span role="status" className={cn('inline-flex shrink-0', className)}>
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
}
