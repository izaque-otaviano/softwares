import type { AuditEvent, Comment, Priority, SlaState, Ticket, TicketType } from '@/types/domain';
import { ME_ID, minutesAgo } from './clock';
import { endUsers } from './users';
import { orgs } from './orgs';

interface Spec {
  s: string;
  r: string;
  st: string;
  p?: Priority;
  ty?: TicketType;
  ch: 'email' | 'web_form';
  /** Atribuído; ausente = sem atribuído. */
  a?: string;
  g?: string;
  /** Minutos desde a criação. */
  age: number;
  /** Minutos desde a última atualização. */
  upd: number;
  sla?: { state: SlaState; due: number; target: 'first_reply' | 'resolution' };
  msg: string;
  reply?: string;
  note?: string;
  topic: string;
  sent: 'Positivo' | 'Neutro' | 'Negativo';
  tags?: string[];
  files?: { name: string; size: number }[];
}

const H = 60;
const D = 1440;

const SPECS: Spec[] = [
  // 1-6: sem atribuído
  { s: 'Não consigo emitir a nota fiscal do pedido 48213', r: 'u1', st: 'new', p: 'high', ty: 'incident', ch: 'email', age: 14, upd: 14, sla: { state: 'warning', due: 35, target: 'first_reply' }, msg: 'Bom dia! Ao tentar emitir a nota fiscal do pedido 48213 o sistema retorna erro de certificado. Preciso emitir ainda hoje para liberar a entrega.', topic: 'Integração', sent: 'Negativo', tags: ['nota_fiscal'] },
  { s: 'Dúvida sobre o plano anual', r: 'u9', st: 'new', p: 'normal', ty: 'question', ch: 'web_form', age: 52, upd: 52, msg: 'Olá, estamos no trial e gostaria de entender o que muda no plano anual em relação ao mensal. Há desconto?', topic: 'Cobrança', sent: 'Neutro', tags: ['trial'] },
  { s: 'Sistema fora do ar para toda a equipe', r: 'u7', st: 'new', p: 'urgent', ty: 'incident', ch: 'email', age: 95, upd: 95, sla: { state: 'breached', due: -25, target: 'first_reply' }, msg: 'Desde as 8h ninguém da operação consegue acessar o painel de rotas. Aparece "erro 503". Os motoristas estão parados!', topic: 'Acesso', sent: 'Negativo', tags: ['indisponibilidade'] },
  { s: 'Como adicionar um novo usuário recepcionista?', r: 'u6', st: 'open', p: 'low', ty: 'question', ch: 'web_form', age: 3 * H, upd: 3 * H, msg: 'Contratamos uma nova recepcionista e preciso criar o acesso dela com permissão apenas de agendamento. Onde configuro isso?', topic: 'Dúvida de uso', sent: 'Neutro' },
  { s: 'Cobrança duplicada na fatura de setembro', r: 'u2', st: 'open', p: 'high', ty: 'problem', ch: 'email', age: 6 * H, upd: 5 * H, sla: { state: 'warning', due: 50, target: 'resolution' }, msg: 'Fui cobrada duas vezes na fatura de setembro (R$ 389,00 em 05/09 e 06/09). Podem estornar a cobrança extra?', topic: 'Cobrança', sent: 'Negativo', tags: ['reembolso'], files: [{ name: 'fatura-setembro.pdf', size: 184320 }] },
  { s: 'Solicitação de integração com o marketplace', r: 'u10', st: 'open', p: 'normal', ty: 'task', ch: 'web_form', age: 1 * D + 2 * H, upd: 1 * D + 2 * H, msg: 'Gostaríamos de conectar o catálogo ao marketplace Mercado Central. Vocês têm conector pronto ou precisamos usar a API?', topic: 'Integração', sent: 'Positivo' },
  // 7-14: atribuídos a mim, abertos / em andamento / novo
  { s: 'Relatório de vendas não exporta em CSV', r: 'u3', st: 'open', p: 'normal', ty: 'incident', ch: 'email', a: ME_ID, age: 2 * D, upd: 40, msg: 'O botão "Exportar CSV" do relatório de vendas baixa um arquivo vazio. Já tentei em dois navegadores.', reply: 'Oi, Ricardo! Reproduzimos o problema aqui. Pode me confirmar o período selecionado no filtro?', note: 'Bug conhecido quando o período passa de 90 dias. Ver com o time de dados.', topic: 'Dúvida de uso', sent: 'Neutro', tags: ['exportacao'] },
  { s: 'Erro ao importar planilha de produtos', r: 'u1', st: 'in_progress', p: 'high', ty: 'incident', ch: 'email', a: ME_ID, age: 1 * D + 5 * H, upd: 25, sla: { state: 'warning', due: 15, target: 'resolution' }, msg: 'A importação de 1.200 produtos trava em 37% e depois mostra "Falha ao processar linha 442".', reply: 'Carlos, identifiquei caracteres inválidos na coluna de descrição. Estou ajustando o arquivo e já retorno.', note: 'Linha 442 tem aspas não escapadas. Corrigir e reprocessar.', topic: 'Integração', sent: 'Negativo', tags: ['importacao'], files: [{ name: 'produtos.xlsx', size: 523000 }] },
  { s: 'Atualizar e-mail de cobrança da clínica', r: 'u4', st: 'new', p: 'low', ty: 'task', ch: 'web_form', a: ME_ID, age: 4 * H, upd: 4 * H, msg: 'Preciso trocar o e-mail que recebe as faturas para financeiro@vidaplena.med.br.', topic: 'Cobrança', sent: 'Neutro' },
  { s: 'Agenda não sincroniza com o Google Calendar', r: 'u5', st: 'in_progress', p: 'normal', ty: 'problem', ch: 'email', a: ME_ID, age: 3 * D, upd: 3 * H, msg: 'Desde a atualização de ontem os agendamentos não aparecem mais no meu Google Calendar.', reply: 'Dr. Paulo, estamos reconectando a integração. Poderia reautorizar a conta Google pelo menu Configurações > Integrações?', topic: 'Integração', sent: 'Negativo', tags: ['calendario'] },
  { s: 'Treinamento para nova equipe de atendimento', r: 'u8', st: 'open', p: 'low', ty: 'task', ch: 'web_form', a: ME_ID, age: 4 * D, upd: 1 * D, msg: 'Vamos contratar 4 atendentes em novembro. Vocês oferecem treinamento ao vivo para a equipe nova?', reply: 'Patrícia, temos sessões quinzenais de onboarding. Vou verificar a próxima data com o time de sucesso.', topic: 'Dúvida de uso', sent: 'Positivo' },
  { s: 'Rastreamento mostrando status errado', r: 'u11', st: 'open', p: 'high', ty: 'incident', ch: 'email', a: ME_ID, g: 'g1', age: 7 * H, upd: 6 * H, sla: { state: 'breached', due: -140, target: 'resolution' }, msg: 'Os pedidos entregues continuam como "Em trânsito" no painel há dois dias. Clientes estão ligando.', reply: 'Renato, já abri um chamado com a equipe de integração de transportadoras e te aviso assim que tivermos retorno.', topic: 'Entrega', sent: 'Negativo' },
  { s: 'Pedido de acesso somente leitura ao financeiro', r: 'u2', st: 'in_progress', p: 'normal', ty: 'task', ch: 'web_form', a: ME_ID, age: 2 * D + 3 * H, upd: 9 * H, msg: 'Precisamos de um perfil que veja as faturas mas não altere dados de pagamento.', reply: 'Fernanda, o perfil "Financeiro (leitura)" já está disponível. Estou liberando para o seu usuário.', note: 'Aprovação do gestor registrada por e-mail em anexo.', topic: 'Acesso', sent: 'Neutro' },
  { s: 'Mudança de CNPJ no cadastro', r: 'u7', st: 'open', p: 'normal', ty: 'task', ch: 'email', a: ME_ID, age: 5 * D, upd: 2 * D, msg: 'Nossa empresa mudou de razão social e CNPJ. Qual o procedimento para atualizar o cadastro e as notas?', reply: 'Marcelo, preciso do contrato social atualizado para concluir. Pode enviar em PDF?', topic: 'Cobrança', sent: 'Neutro', files: [{ name: 'alteracao-contratual.pdf', size: 902144 }] },
  // 15-20: outros agentes
  { s: 'Lentidão ao abrir o painel de pedidos', r: 'u3', st: 'in_progress', p: 'high', ty: 'problem', ch: 'email', a: 'a2', age: 1 * D + 1 * H, upd: 2 * H, msg: 'O painel de pedidos demora mais de 40 segundos para carregar desde segunda-feira.', reply: 'Ricardo, nosso time de infraestrutura já está analisando. Obrigado pela paciência.', note: 'Query de listagem sem índice na tabela de pedidos. Escalar para N2.', topic: 'Acesso', sent: 'Negativo' },
  { s: 'Quero cancelar o plano mensal', r: 'u12', st: 'open', p: 'normal', ty: 'question', ch: 'web_form', a: 'a3', age: 2 * D + 6 * H, upd: 1 * D, msg: 'Hi, we decided to pause the project. How can I cancel the monthly plan without penalty?', reply: 'Hello Larissa! You can cancel anytime under Settings > Billing. I can also do it for you, just confirm.', topic: 'Cancelamento', sent: 'Neutro' },
  { s: 'Configurar domínio próprio na loja', r: 'u9', st: 'in_progress', p: 'normal', ty: 'task', ch: 'web_form', a: 'a4', g: 'g2', age: 3 * D, upd: 5 * H, msg: 'Comprei o domínio studiopixel.shop. Como aponto para a loja?', reply: 'Thiago, siga os registros DNS que enviei por e-mail. A propagação pode levar até 24h.', topic: 'Integração', sent: 'Positivo' },
  { s: 'Certificado digital vencido', r: 'u8', st: 'open', p: 'urgent', ty: 'incident', ch: 'email', a: 'a5', g: 'g2', age: 8 * H, upd: 3 * H, msg: 'O certificado A1 venceu hoje e não conseguimos emitir CT-e. Preciso de ajuda para subir o novo.', reply: 'Patrícia, envie o novo arquivo .pfx pelo link seguro que enviei. Subimos em minutos.', topic: 'Integração', sent: 'Negativo', tags: ['cte'] },
  { s: 'Erro 500 ao salvar prontuário', r: 'u5', st: 'open', p: 'urgent', ty: 'incident', ch: 'email', a: 'a2', age: 5 * H, upd: 1 * H, msg: 'Ao salvar o prontuário de um paciente aparece erro 500. Já aconteceu com 3 pacientes hoje.', reply: 'Dr. Paulo, estamos investigando com prioridade. Seus dados não foram perdidos.', note: 'Stack trace anexado ao incidente INC-2291.', topic: 'Acesso', sent: 'Negativo' },
  { s: 'Alterar horário de envio dos lembretes', r: 'u6', st: 'in_progress', p: 'low', ty: 'question', ch: 'web_form', a: 'a3', age: 2 * D, upd: 20 * H, msg: 'Os lembretes de consulta estão saindo às 6h. Dá para mudar para as 9h?', reply: 'Beatriz, a alteração é feita em Configurações > Lembretes. Posso fazer por você, se preferir.', topic: 'Dúvida de uso', sent: 'Neutro' },
  // 21-25: pendentes
  { s: 'Divergência no valor do frete', r: 'u1', st: 'pending', p: 'normal', ty: 'problem', ch: 'email', a: ME_ID, age: 3 * D, upd: 1 * D + 3 * H, msg: 'O frete calculado no checkout é R$ 12 maior que o da tabela dos Correios para o mesmo CEP.', reply: 'Carlos, pode enviar o CEP e o peso de um pedido de exemplo para eu reproduzir?', topic: 'Entrega', sent: 'Neutro' },
  { s: 'Dúvida sobre emissão de boleto', r: 'u10', st: 'pending', p: 'low', ty: 'question', ch: 'web_form', a: 'a2', age: 4 * D, upd: 2 * D, msg: 'Onde consigo gerar a segunda via do boleto de outubro?', reply: 'Camila, a segunda via fica em Faturas > Pagamentos pendentes. Funcionou por aí?', topic: 'Cobrança', sent: 'Neutro' },
  { s: 'Webhook de pedidos sem retorno', r: 'u3', st: 'pending', p: 'high', ty: 'incident', ch: 'email', a: 'a4', g: 'g2', age: 2 * D, upd: 14 * H, msg: 'O webhook de pedido criado não está chegando ao nosso ERP desde ontem à noite.', reply: 'Ricardo, reenviamos os eventos pendentes. Pode confirmar se chegaram ao ERP?', topic: 'Integração', sent: 'Negativo' },
  { s: 'Nova senha não chega por e-mail', r: 'u11', st: 'pending', p: 'normal', ty: 'incident', ch: 'email', a: ME_ID, age: 1 * D + 2 * H, upd: 8 * H, msg: 'Peço redefinição de senha e o e-mail nunca chega, nem no spam.', reply: 'Renato, verifique se rapidosul.com.br não está bloqueando o remetente. Pode testar com outro e-mail?', topic: 'Acesso', sent: 'Negativo' },
  { s: 'Pedido de fatura detalhada por filial', r: 'u2', st: 'pending', p: 'low', ty: 'task', ch: 'web_form', a: 'a3', age: 5 * D, upd: 3 * D, msg: 'O financeiro precisa de uma fatura separada para cada uma das 6 filiais.', reply: 'Fernanda, preciso da lista de filiais com CNPJ para configurar. Pode enviar?', topic: 'Cobrança', sent: 'Neutro' },
  // 26-30: resolvidos
  { s: 'Logo não aparece nos e-mails de pedido', r: 'u9', st: 'solved', p: 'low', ty: 'question', ch: 'web_form', a: ME_ID, age: 2 * D, upd: 6 * H, sla: { state: 'met', due: -60, target: 'first_reply' }, msg: 'O logo da loja sumiu dos e-mails de confirmação de pedido.', reply: 'Thiago, o arquivo estava em formato WebP. Converti para PNG e o logo voltou a aparecer. Pode confirmar?', topic: 'Dúvida de uso', sent: 'Neutro' },
  { s: 'Reembolso do pedido 47100', r: 'u4', st: 'solved', p: 'normal', ty: 'task', ch: 'email', a: 'a3', age: 3 * D, upd: 1 * D, sla: { state: 'met', due: -2 * D, target: 'resolution' }, msg: 'Preciso do estorno do pedido 47100, o cliente desistiu da compra.', reply: 'Juliana, estorno realizado. O valor aparece na fatura em até 2 dias úteis.', topic: 'Cobrança', sent: 'Neutro', tags: ['reembolso'] },
  { s: 'Impossível anexar imagens ao ticket', r: 'u12', st: 'solved', p: 'normal', ty: 'incident', ch: 'web_form', a: 'a2', age: 4 * D, upd: 2 * D, msg: 'I cannot attach screenshots to my requests, the upload keeps failing.', reply: 'Larissa, corrigimos a falha no upload de imagens. Pode tentar novamente?', topic: 'Dúvida de uso', sent: 'Neutro' },
  { s: 'Ajuste de permissões do gerente', r: 'u1', st: 'solved', p: 'low', ty: 'task', ch: 'email', a: ME_ID, age: 6 * D, upd: 4 * D, msg: 'O gerente de loja novo precisa ver relatórios, mas não vê o menu "Relatórios".', reply: 'Carlos, perfil ajustado. Peça para ele sair e entrar novamente.', topic: 'Acesso', sent: 'Positivo' },
  { s: 'Obrigado pelo atendimento rápido', r: 'u6', st: 'solved', p: 'low', ty: 'question', ch: 'email', a: 'a4', g: 'g1', age: 9 * D, upd: 8 * D, msg: 'Só passando para agradecer a ajuda com a configuração da agenda. Ficou perfeito!', reply: 'Que bom, Beatriz! Estamos à disposição.', topic: 'Dúvida de uso', sent: 'Positivo' },
];

const TOPIC_CONF = ['92', '87', '95', '78', '90'];

function build(spec: Spec, index: number): Ticket {
  const id = index + 1;
  const user = endUsers.find((u) => u.id === spec.r);
  if (!user) throw new Error(`Usuário ${spec.r} não existe`);
  const org = orgs.find((o) => o.id === user.orgId);
  const groupId = spec.g ?? org?.groupId ?? 'g1';
  const createdAt = minutesAgo(spec.age);
  const updatedAt = minutesAgo(spec.upd);

  const comments: Comment[] = [
    { id: `c${id}-1`, authorId: spec.r, public: true, bodyHtml: `<p>${spec.msg}</p>`, channel: spec.ch, attachments: spec.files ?? [], createdAt },
  ];
  if (spec.reply && spec.a) {
    comments.push({ id: `c${id}-2`, authorId: spec.a, public: true, bodyHtml: `<p>${spec.reply}</p>`, channel: spec.ch, attachments: [], createdAt: updatedAt });
  }
  if (spec.note && spec.a) {
    comments.push({ id: `c${id}-3`, authorId: spec.a, public: false, bodyHtml: `<p>${spec.note}</p>`, channel: 'web_form', attachments: [], createdAt: minutesAgo(spec.upd + 3) });
  }
  comments.sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  const events: AuditEvent[] = [
    { id: `e${id}-1`, authorId: 'system', kind: 'client_meta', text: spec.ch === 'email' ? 'Ticket criado por e-mail' : 'Ticket criado pelo formulário web', meta: { IP: `187.10.${20 + id}.${40 + id}`, Navegador: 'Chrome 129 / Windows' }, createdAt },
    { id: `e${id}-2`, authorId: 'system', kind: 'ai_triage', text: `Triagem automática: tópico ${spec.topic}, sentimento ${spec.sent}.`, createdAt },
    { id: `e${id}-3`, authorId: 'system', kind: 'notification', text: `Confirmação enviada para ${user.email}`, createdAt },
  ];
  if (spec.a) {
    events.push({ id: `e${id}-4`, authorId: 'system', kind: 'field_change', text: 'Atribuído alterado', meta: { De: '-', Para: spec.a }, createdAt: minutesAgo(Math.max(spec.upd, spec.age - 5)) });
  }
  if (spec.sla) {
    const label = spec.sla.target === 'first_reply' ? 'Primeira resposta' : 'Resolução';
    events.push({ id: `e${id}-5`, authorId: 'system', kind: 'sla', text: `SLA de ${label.toLowerCase()} aplicado`, createdAt });
  }

  return {
    id,
    subject: spec.s,
    requesterId: spec.r,
    assigneeGroupId: groupId,
    assigneeId: spec.a,
    followerIds: [],
    ccIds: [],
    tags: spec.tags ?? [],
    type: spec.ty,
    priority: spec.p,
    statusId: spec.st,
    channel: spec.ch,
    formId: 'default',
    customFields: {
      resumo: spec.msg.slice(0, 120),
      topico: spec.topic,
      topico_confianca: TOPIC_CONF[index % TOPIC_CONF.length],
      sentimento: spec.sent,
      sentimento_confianca: String(80 + ((index * 7) % 18)),
      idioma: spec.r === 'u12' ? 'Inglês' : 'Português',
      idioma_confianca: '99',
    },
    sla: spec.sla
      ? {
          name: spec.sla.target === 'first_reply' ? 'Primeira resposta' : 'Resolução',
          target: spec.sla.target,
          dueAt: minutesAgo(-spec.sla.due),
          state: spec.sla.state,
        }
      : undefined,
    comments,
    events,
    createdAt,
    updatedAt,
  };
}

export const tickets: Ticket[] = SPECS.map(build);
