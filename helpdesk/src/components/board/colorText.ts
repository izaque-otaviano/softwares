import { statusColorKey } from '@/lib/status';
import { AA_NORMAL, contrastWithWhite } from '@/components/ui/colorContrast';

/**
 * Classe do texto sobre o fundo sólido de uma coluna de status. Mesma regra do StatusBadge: branco, exceto `new`
 * (laranja claro) e cores personalizadas em que o branco ficaria abaixo de 4,5:1, que usam o texto escuro `note.badgeText`.
 */
export function onStatusColorClass(color: string): string {
  if (statusColorKey(color)) return 'text-fg-inverse';
  const ratio = contrastWithWhite(color);
  return Number.isNaN(ratio) || ratio >= AA_NORMAL ? 'text-fg-inverse' : 'text-note-badgeText';
}
