"""Conserta chamados com a coluna contradizendo o status (ex.: aberto com a
coluna "Fechado"). Ver `apps/tickets/services/reparo_stages.py`.

    python manage.py reparar_stages --dry-run   # só conta
    python manage.py reparar_stages             # corrige
"""

from django.core.management.base import BaseCommand

from apps.tickets.services.reparo_stages import reparar_stages_incoerentes


class Command(BaseCommand):
    help = "Leva chamados com coluna incoerente ao status de fábrica da categoria deles."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run", action="store_true", help="Só mostra quantos seriam corrigidos.",
        )

    def handle(self, *args, **options):
        achados = reparar_stages_incoerentes(dry_run=options["dry_run"])
        verbo = "seriam corrigidos" if options["dry_run"] else "corrigidos"
        if not achados:
            self.stdout.write("Nenhum chamado com coluna incoerente.")
            return
        for categoria, total in achados.items():
            self.stdout.write(f"{categoria}: {total} {verbo}")
