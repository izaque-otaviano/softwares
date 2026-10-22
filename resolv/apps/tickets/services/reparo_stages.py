"""Conserta chamado cuja COLUNA (`stage`) contradiz o `status`.

O invariante do modelo é "status e stage andam juntos SEMPRE": o `status` é a
categoria que SLA, filtro e relatório leem; o `stage` é a coluna que a tela
mostra. Um chamado `open` com coluna "Fechado" (o caso TD-00005) aparece como
resolvido na tela e como aberto no contador. O código de produção sempre
moveu os dois juntos (`_change_status`/`_reopen`); o descompasso veio de dado
criado ou alterado por fora do serviço (o seed antigo, scripts, importações).

Esta função leva cada chamado incoerente para o status de FÁBRICA ATIVO da
categoria que o `status` dele diz. Idempotente: rodar de novo não acha nada.
"""

from apps.tickets.models import Ticket, TicketStage, TicketStatus


def reparar_stages_incoerentes(*, dry_run: bool = False) -> dict[str, int]:
    """Devolve `{categoria: quantos}` dos chamados corrigidos (ou que seriam,
    com `dry_run`). Chamado sem coluna (nulo) não entra: é o estado de antes da
    migração 0016 e a leitura já cai no status de fábrica da categoria."""
    corrigidos: dict[str, int] = {}
    for categoria, _ in TicketStatus.choices:
        destino = (
            TicketStage.objects.filter(category=categoria, is_system=True)
            .order_by("-is_active", "order", "id")
            .first()
        )
        if destino is None:
            continue
        incoerentes = (
            Ticket.objects.filter(status=categoria, stage__isnull=False)
            .exclude(stage__category=categoria)
        )
        total = incoerentes.count()
        if total:
            corrigidos[categoria] = total
            if not dry_run:
                incoerentes.update(stage=destino)
    return corrigidos
