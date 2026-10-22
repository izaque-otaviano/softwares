export interface ApiErrorInit {
  /** Status HTTP; 0 = sem resposta (rede, tempo esgotado). Ausente nos erros do modo mock. */
  status?: number;
  /** Código de máquina do backend (`code`), ex.: `quota_exceeded`. */
  code?: string;
  /** Erros de validação por campo ({campo:[msg]}); string crua vira lista. */
  fieldErrors?: Record<string, string[]>;
  /** Corpo da resposta já decodificado (JSON ou texto). */
  body?: unknown;
}

/** Erro único da camada de API (mock e real). `message` já vem em pt-BR e pode ser mostrado ao usuário. */
export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly body?: unknown;

  constructor(message = 'Não foi possível concluir a operação. Tente novamente.', init: ApiErrorInit = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors;
    this.body = init.body;
  }
}

/**
 * Escrita em VÁRIAS chamadas (sem transação no backend) que parou no meio. Diz exatamente o que foi e o que não foi
 * aplicado; `ticket` é o último estado conhecido do servidor e `appliedKeys` o que já vale lá (para o formulário não
 * reenviar nem duplicar nada ao "Tentar novamente").
 */
export class PartialUpdateError extends ApiError {
  readonly appliedKeys: string[];
  readonly pendingKeys: string[];
  readonly appliedLabels: string[];
  readonly pendingLabels: string[];
  /** Último estado do ticket no servidor (ausente se nada chegou a ser aplicado). */
  readonly ticket?: unknown;
  /** O ticket NÃO existia e foi criado antes da falha. */
  readonly created: boolean;
  /** A mensagem digitada já foi gravada (não pode ser reenviada). */
  readonly commentSent: boolean;
  readonly reason: string;

  constructor(
    reason: string,
    init: { appliedKeys: string[]; pendingKeys: string[]; appliedLabels: string[]; pendingLabels: string[]; ticket?: unknown; created?: boolean; commentSent?: boolean; cause?: ApiError },
  ) {
    const list = (l: string[]) => l.join(', ');
    const applied = init.appliedLabels.length ? `Aplicado: ${list(init.appliedLabels)}.` : 'Nada foi aplicado.';
    const pending = init.pendingLabels.length ? ` Não aplicado: ${list(init.pendingLabels)}.` : '';
    super(`${applied}${pending} Motivo: ${reason.trim().replace(/[.!?]*$/, '.')}`, { status: init.cause?.status, code: init.cause?.code, fieldErrors: init.cause?.fieldErrors, body: init.cause?.body });
    this.name = 'PartialUpdateError';
    this.reason = reason;
    this.appliedKeys = init.appliedKeys;
    this.pendingKeys = init.pendingKeys;
    this.appliedLabels = init.appliedLabels;
    this.pendingLabels = init.pendingLabels;
    this.ticket = init.ticket;
    this.created = init.created ?? false;
    this.commentSent = init.commentSent ?? false;
  }
}
