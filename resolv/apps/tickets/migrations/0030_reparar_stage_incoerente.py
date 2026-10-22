"""Repara chamados cuja coluna (`stage`) contradiz o `status`.

Caso real: TD-00005 reaberto (`status=open`) e ainda na coluna "Fechado", que
a tela mostrava como resolvido. O código de produção já move status e coluna
juntos; o descompasso vinha de dado criado fora do serviço (seed antigo).
Cada chamado incoerente vai para o status de FÁBRICA ativo da categoria do
`status` dele — o que o `status` diz é o que SLA e relatório já usavam, então
nenhum número muda; só a coluna passa a concordar.

Só toca em `stage`; idempotente. A volta (`reverse`) não faz nada: o stage
antigo era um erro, não um estado a restaurar. Equivalente em linha de
comando: `python manage.py reparar_stages [--dry-run]`.
"""

from django.db import migrations

CATEGORIAS = ["new", "open", "pending_customer", "closed"]


def reparar(apps, schema_editor):
    Ticket = apps.get_model("tickets", "Ticket")
    TicketStage = apps.get_model("tickets", "TicketStage")
    for categoria in CATEGORIAS:
        destino = (
            TicketStage.objects.filter(category=categoria, is_system=True)
            .order_by("-is_active", "order", "id")
            .first()
        )
        if destino is None:
            continue
        (
            Ticket.objects.filter(status=categoria, stage__isnull=False)
            .exclude(stage__category=categoria)
            .update(stage=destino)
        )


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0029_textos_ticket"),
    ]

    operations = [
        migrations.RunPython(reparar, migrations.RunPython.noop),
    ]
