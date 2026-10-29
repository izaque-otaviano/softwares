from django.db import migrations

# (categoria, cor antiga de fábrica, cor nova). O front desenha o selo com fundo
# claro e texto nesta cor; a cor guardada é o tom forte.
CORES = [
    ("new", "#6C4E9C", "#855800"),
    ("open", "#5A87B8", "#A12620"),
    ("pending_customer", "#E9A23B", "#465365"),
    ("closed", "#8A8A85", "#216338"),
]


def trocar(apps, antiga_para_nova):
    """Só troca o status de fábrica que ainda tem a cor original: quem o admin
    já personalizou não é tocado."""
    TicketStage = apps.get_model("tickets", "TicketStage")
    for slug, antiga, nova in CORES:
        de, para = (antiga, nova) if antiga_para_nova else (nova, antiga)
        TicketStage.objects.filter(slug=slug, is_system=True, color__iexact=de).update(color=para)


def avancar(apps, schema_editor):
    trocar(apps, True)


def voltar(apps, schema_editor):
    trocar(apps, False)


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0035_formulario_padrao"),
    ]

    operations = [
        migrations.RunPython(avancar, voltar),
    ]
