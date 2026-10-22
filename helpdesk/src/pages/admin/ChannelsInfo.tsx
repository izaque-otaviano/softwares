import { Link, useParams } from 'react-router-dom';
import { AdminBody } from '@/components/admin/AdminPage';
import { PageHeader } from '@/components/admin/PageHeader';

const CONTENT: Record<
  string,
  { title: string; lead: string; bullets: string[]; links: { label: string; to: string }[] }
> = {
  email: {
    title: 'E-mail',
    lead: 'Tickets abertos por e-mail aparecem no Helpdesk com canal “e-mail”. A caixa de entrada e o roteamento ficam no Resolv.',
    bullets: [
      'Respostas públicas do agente saem pelo fluxo de e-mail do backend (quando configurado).',
      'Os anexos ficam no servidor; o front só lista e solicita o download autenticado.',
      'Não há tela neste app para alterar domínio, SPF ou caixa compartilhada.',
    ],
    links: [
      { label: 'Fila de tickets', to: '/agent/views' },
      { label: 'Início do agente', to: '/agent/home' },
    ],
  },
  'formulario-web': {
    title: 'Formulário web',
    lead: 'O canal “formulário web” cobre tickets criados pelo formulário embutido ou pelo portal do cliente no Resolv.',
    bullets: [
      'No Helpdesk, agentes também abrem tickets pelo atalho Novo ticket.',
      'Campos do formulário público e branding do portal não são editáveis aqui.',
      'Campos personalizados do ticket, se usados, ficam locais até o backend expô-los.',
    ],
    links: [
      { label: 'Novo ticket', to: '/agent/tickets/new' },
      { label: 'Campos (admin)', to: '/admin/fields' },
    ],
  },
  api: {
    title: 'API',
    lead: 'A API REST do Resolv (`/api/v1/`) é a fonte de verdade. Este front consome a mesma API no modo real.',
    bullets: [
      'Contrato publicado em resolv-openapi.yaml no repositório do backend.',
      'Autenticação por sessão + CSRF (cookie); não há JWT neste produto.',
      'WebSocket pessoal em /ws/me/ para notificações e eventos de ticket.',
    ],
    links: [{ label: 'Início da administração', to: '/admin' }],
  },
  webhooks: {
    title: 'Webhooks',
    lead: 'Webhooks de saída ainda não fazem parte desta versão do Helpdesk.',
    bullets: [
      'Automações de ticket usam macros e (localmente) gatilhos.',
      'Integrações externas devem usar a API REST do Resolv enquanto webhooks não existirem na UI.',
    ],
    links: [
      { label: 'Macros', to: '/admin/macros' },
      { label: 'Gatilhos', to: '/admin/triggers' },
    ],
  },
};

/** Canais: páginas informativas (e-mail, formulário, API, webhooks). */
export default function ChannelsInfo() {
  const { slug = 'email' } = useParams();
  const page = CONTENT[slug] ?? {
    title: 'Canal',
    lead: 'Este canal ainda não tem configuração nesta versão.',
    bullets: ['Use a fila de tickets e a API do Resolv para o dia a dia.'],
    links: [{ label: 'Fila de tickets', to: '/agent/views' }],
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Canais' }, { label: page.title }]}
        title={page.title}
        description={page.lead}
      />
      <AdminBody className="flex max-w-2xl flex-col gap-4">
        <ul className="list-inside list-disc space-y-2 text-sm text-fg">
          {page.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        {page.links.length ? (
          <p className="flex flex-wrap gap-3 text-sm">
            {page.links.map((l) => (
              <Link key={l.to} to={l.to} className="text-action hover:text-action-hover hover:underline">
                {l.label}
              </Link>
            ))}
          </p>
        ) : null}
      </AdminBody>
    </>
  );
}
