from django.db import migrations


def criar_formulario_padrao(apps, schema_editor):
    """Garante o 'Formulário padrão' (vazio de campos): sempre existe um
    formulário padrão ativo, mesmo antes de o admin criar qualquer coisa."""
    TicketForm = apps.get_model("tickets", "TicketForm")
    if TicketForm.objects.filter(is_default=True).exists():
        return
    TicketForm.objects.get_or_create(
        name="Formulário padrão",
        defaults={"is_default": True, "is_active": True, "order": 0},
    )


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0034_campos_personalizados_e_formularios"),
    ]

    operations = [
        migrations.RunPython(criar_formulario_padrao, migrations.RunPython.noop),
    ]
