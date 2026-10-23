"""Camada de leitura de `tickets`.

Todo acesso de leitura a tickets passa por aqui. `Ticket.objects.all()` fora
deste módulo é proibido e verificado por teste estrutural (docs/04).
"""

from apps.tickets.models import Ticket


def visible_tickets(user):
    """QuerySet base de qualquer listagem/consulta de tickets para `user`."""
    return (
        Ticket.objects.visible_to(user)
        # `category__service` entra aqui porque o TicketListSerializer lê
        # category.name e category.service.name em toda linha: sem isto, uma
        # página de 25 tickets com categoria dispara 25 queries a mais
        # (medido: 4 → 29). Os outros quatro já cobrem os campos que o
        # serializer toca (empresa, solicitante, responsável, equipe).
        .select_related("team", "requester", "assignee", "company", "category__service")
    )


def visible_ticket_or_none(user, ticket_id):
    """Busca um ticket dentro do escopo do usuário; fora do escopo = não existe."""
    return visible_tickets(user).filter(pk=ticket_id).first()


def deleted_ticket_or_none(user, ticket_id):
    """Ticket APAGADO (exclusão lógica) dentro do escopo do usuário.

    Só as rotas de administração (consulta e restauração) usam isto; todo o
    resto do sistema passa por `visible_tickets`, que nunca devolve apagado.
    """
    if not str(ticket_id).isdigit():
        return None
    return (
        Ticket.all_objects.visible_to(user, include_deleted=True)
        .select_related("team", "requester", "assignee", "company", "category__service")
        .filter(pk=ticket_id, deleted_at__isnull=False)
        .first()
    )
