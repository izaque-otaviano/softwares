import { Link, useParams } from 'react-router-dom';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';
import { SHORTCUTS } from '@/components/shell/ShortcutsHelp';

function formatKeys(keys: string[][], sequence?: boolean): string {
  return keys
    .map((alt) => alt.join(sequence ? ' ' : '+'))
    .join(' ou ');
}

/** Espaços de trabalho: layouts (conceitual) e atalhos reais do agente. */
export default function WorkspaceInfo() {
  const { slug = 'layouts' } = useParams();
  const isShortcuts = slug === 'atalhos';

  if (isShortcuts) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: 'Espaços de trabalho' }, { label: 'Atalhos' }]}
          title="Atalhos"
          description="Atalhos de teclado da área do agente. Pressione ? no suporte para abrir a mesma lista."
        />
        <AdminBody className="max-w-xl space-y-6">
          {SHORTCUTS.map((g) => (
            <section key={g.group} aria-labelledby={`sc-${g.group}`}>
              <h2 id={`sc-${g.group}`} className="mb-2 text-sm font-semibold">
                {g.group}
              </h2>
              <ul className="divide-y divide-line rounded border border-line">
                {g.rows.map((r) => (
                  <li key={r.label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span>{r.label}</span>
                    <kbd className="rounded border border-line bg-surface-subtle px-2 py-0.5 font-mono text-xs text-fg-muted">
                      {formatKeys(r.keys, r.sequence)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-sm">
            <Link to="/agent/home" className="text-action hover:text-action-hover hover:underline">
              Ir para a área do agente
            </Link>
          </p>
        </AdminBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Espaços de trabalho' }, { label: 'Layouts de ticket' }]}
        title="Layouts de ticket"
        description="O layout da conversa (painel do ticket, propriedades e trilho) é o padrão do Helpdesk. Não há editor visual de layout nesta versão."
      />
      <AdminBody className="flex max-w-2xl flex-col gap-4 text-sm">
        <ul className="list-inside list-disc space-y-2">
          <li>Conversa, propriedades e contexto do solicitante ficam em colunas fixas na tela do ticket.</li>
          <li>Visões da fila (colunas, filtros, agrupamento) são configuráveis por visão na área do agente.</li>
          <li>Macros e status personalizam o trabalho sem mudar o layout da página.</li>
        </ul>
        <p className="flex flex-wrap gap-3">
          <Link to="/agent/views" className="text-action hover:text-action-hover hover:underline">
            Visões
          </Link>
          <Link to="/admin/macros" className="text-action hover:text-action-hover hover:underline">
            Macros
          </Link>
          <Link to="/admin/statuses" className="text-action hover:text-action-hover hover:underline">
            Status
          </Link>
        </p>
      </AdminBody>
    </>
  );
}
