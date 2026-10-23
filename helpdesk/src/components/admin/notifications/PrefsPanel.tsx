import { useEffect, useMemo, useState } from 'react';
import { getPreferences, savePreferences } from '@/api/notifications';
import { useAsync } from '@/components/admin/useAsync';
import { Banner, Button, Skeleton, Switch } from '@/components/ui';
import { errMessage } from '@/lib/apiError';
import { toast } from '@/store/useUi';
import type { NotificationPrefs } from '@/types/admin-b';

type Draft = Pick<NotificationPrefs, 'inApp' | 'email'>;

const same = (a: Record<string, boolean>, b: Record<string, boolean>, keys: string[]) => keys.every((k) => Boolean(a[k]) === Boolean(b[k]));

/** Preferências por tipo de notificação e canal (no app e por e-mail). Só grava ao clicar em Salvar. */
export function PrefsPanel() {
  const { data, loading, error, reload } = useAsync(getPreferences);
  const [saved, setSaved] = useState<NotificationPrefs | undefined>();
  const [draft, setDraft] = useState<Draft | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  useEffect(() => {
    if (data) {
      setSaved(data);
      setDraft({ inApp: { ...data.inApp }, email: { ...data.email } });
    }
  }, [data]);

  const keys = useMemo(() => saved?.kinds.map((k) => k.value) ?? [], [saved]);
  const dirty = Boolean(saved && draft && (!same(saved.inApp, draft.inApp, keys) || !same(saved.email, draft.email, keys)));

  if (loading && !saved) return <Skeleton height={240} />;
  if (error && !saved) {
    return (
      <Banner tone="error" onRetry={reload}>
        {error}
      </Banner>
    );
  }
  if (!saved || !draft) return null;

  const set = (channel: 'inApp' | 'email', kind: string, value: boolean) => setDraft({ ...draft, [channel]: { ...draft[channel], [kind]: value } });

  const save = async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const next = await savePreferences(draft);
      setSaved(next);
      setDraft({ inApp: { ...next.inApp }, email: { ...next.email } });
      toast.success('Preferências salvas');
    } catch (e) {
      setSaveError(errMessage(e, 'Não foi possível salvar as preferências.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-sm text-fg-muted">Escolha o que avisar e por onde. As mudanças só valem depois de salvar.</p>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Preferências de notificação por tipo e canal</caption>
        <thead>
          <tr className="text-left text-xs font-semibold text-fg-muted">
            <th scope="col" className="h-8 border-b border-line px-3">
              Tipo de aviso
            </th>
            <th scope="col" className="h-8 w-32 border-b border-line px-3">
              No aplicativo
            </th>
            <th scope="col" className="h-8 w-32 border-b border-line px-3">
              Por e-mail
            </th>
          </tr>
        </thead>
        <tbody>
          {saved.kinds.map((k) => (
            <tr key={k.value}>
              <th scope="row" className="h-10 border-b border-line px-3 text-left font-normal text-fg">
                {k.label}
              </th>
              <td className="border-b border-line px-3">
                <Switch checked={Boolean(draft.inApp[k.value])} onCheckedChange={(v) => set('inApp', k.value, v)} aria-label={`${k.label}, no aplicativo`} />
              </td>
              <td className="border-b border-line px-3">
                <Switch checked={Boolean(draft.email[k.value])} onCheckedChange={(v) => set('email', k.value, v)} aria-label={`${k.label}, por e-mail`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {saveError ? (
        <div className="mt-3">
          <Banner tone="error">{saveError}</Banner>
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2">
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
          Salvar preferências
        </Button>
        <Button
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => {
            setDraft({ inApp: { ...saved.inApp }, email: { ...saved.email } });
            setSaveError(undefined);
          }}
        >
          Descartar alterações
        </Button>
        {dirty ? <span className="text-sm text-fg-muted">Alterações não salvas</span> : null}
      </div>
    </div>
  );
}
