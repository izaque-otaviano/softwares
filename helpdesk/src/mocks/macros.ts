import type { Macro } from '@/types/domain';

export const macros: Macro[] = [
  {
    id: 'm1',
    name: 'Cliente não responde',
    description: 'Muda para Pendente e pede retorno ao cliente.',
    availableTo: 'all',
    active: true,
    usage7d: 18,
    actions: {
      status: 'pending',
      publicReply:
        '<p>Olá, tudo bem?</p><p>Estamos aguardando o seu retorno para continuar o atendimento. Se ainda precisar de ajuda, é só responder a este e-mail.</p><p>Um abraço,<br/>Equipe de Suporte</p>',
    },
  },
  {
    id: 'm2',
    name: 'Fazer downgrade e informar',
    description: 'Reabre o ticket e registra a nota interna do downgrade.',
    availableTo: 'group',
    active: true,
    usage7d: 6,
    actions: {
      status: 'open',
      addTags: ['downgrade'],
      internalNote: '<p>Downgrade de plano realizado no painel de cobrança. Avisar o financeiro para ajustar a próxima fatura.</p>',
    },
  },
];
