import { IS_REAL } from '@/api/mode';
import { capabilities, localHint, type CapabilityKey } from '@/api/capabilities';

/**
 * Faixa fina do modo real. Sem `feature`: só aparece se as escritas voltarem a ser locais (`capabilities.writes`),
 * o que hoje não acontece. Com `feature` (ex.: `triggers`, `customFields`): aviso FIXO de que aquele recurso ainda
 * não existe no backend e roda só neste navegador. Nada de ressalva para o que vai ao servidor.
 */
export function RealModeNotice({ feature, children }: { feature?: CapabilityKey; children?: string }) {
  if (!IS_REAL) return null;
  if (!feature) {
    if (capabilities.writes !== 'local') return null;
    return (
      <div role="note" data-testid="real-mode-notice" className="shrink-0 border-b border-note-badge bg-note-bg px-4 py-1 text-center text-xs text-fg">
        Conectado ao backend: os dados são lidos do servidor. As alterações ainda NÃO são salvas lá: valem só neste navegador e somem ao recarregar.
      </div>
    );
  }
  const text = localHint(feature, children);
  if (!text) return null;
  return (
    <div role="note" data-testid={`local-feature-notice-${feature}`} className="shrink-0 border-b border-note-badge bg-note-bg px-4 py-1 text-xs text-fg">
      {text}
    </div>
  );
}
