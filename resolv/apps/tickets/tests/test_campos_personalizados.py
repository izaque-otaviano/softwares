"""Campos personalizados: definição (admin), valores no ticket, obrigatoriedade,
filtro, auditoria e, principalmente, o que o CLIENTE nunca vê.

Rotas: `/settings/ticket-fields/` (admin escreve, equipe lê) e `custom_fields`
em `POST /tickets/`, `PATCH /tickets/{id}/` e no detalhe.
"""

import datetime as dt

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.tickets.models import (
    MAX_CAMPOS_ATIVOS,
    Ticket,
    TicketCustomFieldValue,
    TicketField,
    TicketForm,
    TicketFormField,
    TicketStatus,
)
from apps.tickets.services import ticket_service

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _formulario_padrao(db):
    """O padrão vem de migração de dados; testes transacionais de outros
    arquivos fazem FLUSH e o levam junto — recria como o app faria."""
    TicketForm.default()

FIELDS = "/api/v1/settings/ticket-fields/"
TICKETS = "/api/v1/tickets/"


def novo_campo(title="Plataforma", type="text", **extra):
    from apps.tickets.services import custom_fields

    return TicketField.objects.create(
        slug=custom_fields.slug_do_titulo(title), title=title, type=type,
        order=TicketField.objects.count(), **extra,
    )


def dropdown(title="Severidade", **extra):
    return novo_campo(title, "dropdown", options=[
        {"value": "baixa", "label": "Baixa"}, {"value": "alta", "label": "Alta"},
    ], **extra)


def formulario_com(*campos, obrigatorios=()):
    """Põe os campos no formulário padrão."""
    form = TicketForm.default()
    for i, c in enumerate(campos):
        TicketFormField.objects.create(
            form=form, field=c, order=i, is_required=c in obrigatorios
        )
    return form


@pytest.fixture
def ticket(ana, suporte, make_ticket):
    return make_ticket(requester=ana, team=suporte, subject="Com campos")


def janela(ticket):
    return {
        "resolution_started_at": ticket.created_at.replace(second=0, microsecond=0).isoformat(),
        "resolution_ended_at": timezone.now().isoformat(),
    }


# --------------------------------------------------------------------------- #
# Definição do campo
# --------------------------------------------------------------------------- #

class TestDefinicao:
    def test_admin_cria_e_o_slug_nasce_do_titulo(self, api, admin):
        resp = api(admin).post(
            FIELDS, {"title": "Número do Contrato", "type": "text"}, format="json"
        )
        assert resp.status_code == 201, resp.json()
        corpo = resp.json()
        assert corpo["slug"] == "numero_do_contrato"
        assert corpo["is_system"] is False
        assert corpo["is_active"] is True and corpo["is_required"] is False
        assert corpo["options"] == []

    def test_slug_repetido_ganha_sufixo_e_nunca_e_numerico(self, api, admin):
        a = api(admin).post(FIELDS, {"title": "Região", "type": "text"}, format="json").json()
        b = api(admin).post(FIELDS, {"title": "Regiao", "type": "text"}, format="json").json()
        c = api(admin).post(FIELDS, {"title": "123", "type": "text"}, format="json").json()
        assert a["slug"] == "regiao" and b["slug"] == "regiao_2"
        assert not c["slug"].isdigit()

    def test_renomear_nao_muda_o_slug(self, api, admin):
        campo = api(admin).post(FIELDS, {"title": "Antigo", "type": "text"}, format="json").json()
        resp = api(admin).patch(f"{FIELDS}{campo['id']}/", {"title": "Novo"}, format="json")
        assert resp.status_code == 200
        assert resp.json()["slug"] == "antigo" and resp.json()["title"] == "Novo"

    @pytest.mark.parametrize("tipo", ["text", "textarea", "number", "date", "checkbox"])
    def test_tipos_simples(self, api, admin, tipo):
        resp = api(admin).post(FIELDS, {"title": f"T {tipo}", "type": tipo}, format="json")
        assert resp.status_code == 201

    def test_tipo_invalido_400(self, api, admin):
        resp = api(admin).post(FIELDS, {"title": "x", "type": "multiselect"}, format="json")
        assert resp.status_code == 400 and "type" in resp.json()

    def test_dropdown_aceita_lista_de_strings_e_objetos(self, api, admin):
        resp = api(admin).post(FIELDS, {
            "title": "Tópico", "type": "dropdown",
            "options": ["Cobrança", {"value": "acesso", "label": "Acesso"}],
        }, format="json")
        assert resp.status_code == 201, resp.json()
        assert resp.json()["options"] == [
            {"value": "Cobrança", "label": "Cobrança"},
            {"value": "acesso", "label": "Acesso"},
        ]

    def test_dropdown_exige_opcoes(self, api, admin):
        resp = api(admin).post(FIELDS, {"title": "x", "type": "dropdown"}, format="json")
        assert resp.status_code == 400 and "options" in resp.json()
        resp = api(admin).post(
            FIELDS, {"title": "x", "type": "dropdown", "options": []}, format="json"
        )
        assert resp.status_code == 400

    def test_opcoes_unicas(self, api, admin):
        resp = api(admin).post(FIELDS, {
            "title": "x", "type": "dropdown",
            "options": [{"value": "a", "label": "A"}, {"value": "A", "label": "Outra"}],
        }, format="json")
        assert resp.status_code == 400
        resp = api(admin).post(FIELDS, {
            "title": "x", "type": "dropdown", "options": ["Igual", "igual"],
        }, format="json")
        assert resp.status_code == 400

    def test_maximo_de_200_opcoes(self, api, admin):
        ok = api(admin).post(FIELDS, {
            "title": "x", "type": "dropdown", "options": [f"o{i}" for i in range(200)],
        }, format="json")
        assert ok.status_code == 201
        mais = api(admin).post(FIELDS, {
            "title": "y", "type": "dropdown", "options": [f"o{i}" for i in range(201)],
        }, format="json")
        assert mais.status_code == 400

    def test_titulo_de_1_a_80(self, api, admin):
        assert api(admin).post(FIELDS, {"title": "  ", "type": "text"}, format="json").status_code == 400
        assert api(admin).post(FIELDS, {"title": "a" * 81, "type": "text"}, format="json").status_code == 400
        assert api(admin).post(FIELDS, {"title": "a" * 80, "type": "text"}, format="json").status_code == 201

    def test_limite_de_60_campos_ativos(self, api, admin):
        for i in range(MAX_CAMPOS_ATIVOS):
            novo_campo(f"Campo {i}")
        resp = api(admin).post(FIELDS, {"title": "A mais", "type": "text"}, format="json")
        assert resp.status_code == 400
        # desativar um libera; reativar além do limite é recusado
        primeiro = TicketField.objects.first()
        assert api(admin).patch(
            f"{FIELDS}{primeiro.pk}/", {"is_active": False}, format="json"
        ).status_code == 200
        assert api(admin).post(
            FIELDS, {"title": "Cabe agora", "type": "text"}, format="json"
        ).status_code == 201
        assert api(admin).patch(
            f"{FIELDS}{primeiro.pk}/", {"is_active": True}, format="json"
        ).status_code == 400

    def test_lista_e_detalhe_para_qualquer_agente(self, api, agente_suporte, agente_leve):
        campo = novo_campo()
        for quem in (agente_suporte, agente_leve):
            lista = api(quem).get(FIELDS)
            assert lista.status_code == 200
            assert [c["id"] for c in lista.json()["results"]] == [campo.pk]
            assert api(quem).get(f"{FIELDS}{campo.pk}/").status_code == 200

    def test_agente_nao_escreve_403(self, api, agente_suporte, supervisor):
        campo = novo_campo()
        for quem in (agente_suporte, supervisor):
            c = api(quem)
            assert c.post(FIELDS, {"title": "x", "type": "text"}, format="json").status_code == 403
            assert c.patch(f"{FIELDS}{campo.pk}/", {"title": "y"}, format="json").status_code == 403
            assert c.delete(f"{FIELDS}{campo.pk}/").status_code == 403
            assert c.post(f"{FIELDS}reorder/", {"ids": [campo.pk]}, format="json").status_code == 403

    def test_cliente_e_anonimo_nao_acessam(self, api, ana, admin):
        from rest_framework.test import APIClient

        novo_campo()
        assert api(ana).get(FIELDS).status_code == 403
        assert api(ana).post(FIELDS, {"title": "x", "type": "text"}, format="json").status_code == 403
        assert APIClient().get(FIELDS).status_code in (401, 403)

    def test_inexistente_404(self, api, admin):
        assert api(admin).get(f"{FIELDS}9999/").status_code == 404
        assert api(admin).patch(f"{FIELDS}9999/", {"title": "x"}, format="json").status_code == 404
        assert api(admin).delete(f"{FIELDS}9999/").status_code == 404

    def test_reordenar_por_patch_e_por_rota(self, api, admin):
        a, b, c = novo_campo("A"), novo_campo("B"), novo_campo("C")
        assert api(admin).patch(f"{FIELDS}{c.pk}/", {"order": 0}, format="json").status_code == 200
        resp = api(admin).post(f"{FIELDS}reorder/", {"ids": [c.pk, a.pk]}, format="json")
        assert resp.status_code == 200
        assert [x["id"] for x in resp.json()] == [c.pk, a.pk, b.pk]
        assert api(admin).get(FIELDS).json()["results"][0]["id"] == c.pk

    def test_reordenar_id_inexistente_400(self, api, admin):
        a = novo_campo()
        resp = api(admin).post(f"{FIELDS}reorder/", {"ids": [a.pk, 9999]}, format="json")
        assert resp.status_code == 400
        resp = api(admin).post(f"{FIELDS}reorder/", {"ids": [a.pk, a.pk]}, format="json")
        assert resp.status_code == 400

    def test_tipo_nao_muda_com_valores(self, api, admin, ticket):
        campo = novo_campo()
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="x")
        resp = api(admin).patch(f"{FIELDS}{campo.pk}/", {"type": "number"}, format="json")
        assert resp.status_code == 400 and "type" in resp.json()
        campo.refresh_from_db()
        assert campo.type == "text"

    def test_tipo_muda_sem_valores(self, api, admin):
        campo = novo_campo()
        resp = api(admin).patch(f"{FIELDS}{campo.pk}/", {"type": "number"}, format="json")
        assert resp.status_code == 200 and resp.json()["type"] == "number"

    def test_delete_de_campo_nunca_usado(self, api, admin):
        campo = novo_campo()
        assert api(admin).delete(f"{FIELDS}{campo.pk}/").status_code == 204
        assert not TicketField.objects.filter(pk=campo.pk).exists()

    def test_delete_de_campo_em_uso_409_e_desativar_funciona(self, api, admin, ticket):
        campo = novo_campo()
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="x")
        resp = api(admin).delete(f"{FIELDS}{campo.pk}/")
        assert resp.status_code == 409
        assert resp.json()["code"] == "field_in_use"
        assert TicketField.objects.filter(pk=campo.pk).exists()
        resp = api(admin).patch(f"{FIELDS}{campo.pk}/", {"is_active": False}, format="json")
        assert resp.status_code == 200 and resp.json()["is_active"] is False

    def test_mudancas_de_definicao_sao_auditadas(self, api, admin):
        campo = api(admin).post(FIELDS, {"title": "Aud", "type": "text"}, format="json").json()
        api(admin).patch(f"{FIELDS}{campo['id']}/", {"is_required": True}, format="json")
        api(admin).delete(f"{FIELDS}{campo['id']}/")
        resumos = list(AuditLog.objects.filter(action="config_change")
                       .values_list("summary", flat=True))
        assert any("criado" in r for r in resumos)
        assert any("alterado" in r for r in resumos)
        assert any("apagado" in r for r in resumos)


# --------------------------------------------------------------------------- #
# Valores no ticket
# --------------------------------------------------------------------------- #

class TestValores:
    def test_patch_grava_devolve_e_audita(self, api, agente_suporte, ticket):
        campo = novo_campo("Contrato")
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "ABC-1"}}, format="json"
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["custom_fields"] == {"contrato": "ABC-1"}
        detalhe = api(agente_suporte).get(f"{TICKETS}{ticket.pk}/").json()
        assert detalhe["custom_fields"] == {"contrato": "ABC-1"}
        evento = ticket.status_events.order_by("-id").first()
        assert evento.note == "campo: Contrato: — → ABC-1"
        assert evento.changed_by == agente_suporte
        # trocar registra antes e depois; repetir o mesmo valor não gera evento
        api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "ZZ-9"}}, format="json"
        )
        assert ticket.status_events.order_by("-id").first().note == "campo: Contrato: ABC-1 → ZZ-9"
        antes = ticket.status_events.count()
        api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "ZZ-9"}}, format="json"
        )
        assert ticket.status_events.count() == antes
        assert campo.values.count() == 1

    def test_aceita_id_como_chave(self, api, agente_suporte, ticket):
        campo = novo_campo("Contrato")
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {str(campo.pk): "viaid"}}, format="json"
        )
        assert resp.status_code == 200
        assert resp.json()["custom_fields"] == {"contrato": "viaid"}

    def test_null_limpa_e_ausente_nao_mexe(self, api, agente_suporte, ticket):
        novo_campo("A")
        novo_campo("B")
        c = api(agente_suporte)
        c.patch(f"{TICKETS}{ticket.pk}/", {"custom_fields": {"a": "1", "b": "2"}}, format="json")
        resp = c.patch(f"{TICKETS}{ticket.pk}/", {"custom_fields": {"a": None}}, format="json")
        assert resp.json()["custom_fields"] == {"b": "2"}
        assert ticket.status_events.order_by("-id").first().note == "campo: A: 1 → —"
        resp = c.patch(f"{TICKETS}{ticket.pk}/", {"priority": "high"}, format="json")
        assert resp.json()["custom_fields"] == {"b": "2"}

    def test_todos_os_tipos_ida_e_volta(self, api, agente_suporte, ticket):
        novo_campo("Txt")
        novo_campo("Par", "textarea")
        novo_campo("Num", "number")
        novo_campo("Dia", "date")
        novo_campo("Sim", "checkbox")
        dropdown("Sev")
        resp = api(agente_suporte).patch(f"{TICKETS}{ticket.pk}/", {"custom_fields": {
            "txt": "curto", "par": "linha 1\nlinha 2", "num": 12.5, "dia": "2026-03-04",
            "sim": False, "sev": "alta",
        }}, format="json")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["custom_fields"] == {
            "txt": "curto", "par": "linha 1\nlinha 2", "num": 12.5, "dia": "2026-03-04",
            "sim": False, "sev": "alta",
        }
        # inteiro sai como inteiro
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"num": 7}}, format="json"
        )
        assert resp.json()["custom_fields"]["num"] == 7

    @pytest.mark.parametrize("tipo,valor", [
        ("number", "abc"), ("number", True), ("number", 1e12), ("number", 0.1234567),
        ("date", "04/03/2026"), ("date", "2026-13-40"), ("date", 20260304),
        ("checkbox", "talvez"), ("checkbox", 1),
        ("text", 5), ("text", "x" * 2001), ("textarea", "x" * 10001),
        ("dropdown", "nao-existe"), ("dropdown", 3),
    ])
    def test_valor_invalido_400_com_a_chave(self, api, agente_suporte, ticket, tipo, valor):
        novo_campo("Campo", tipo, **(
            {"options": [{"value": "a", "label": "A"}]} if tipo == "dropdown" else {}
        ))
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"campo": valor}}, format="json"
        )
        assert resp.status_code == 400, resp.json()
        assert "campo" in resp.json()["custom_fields"]
        assert not TicketCustomFieldValue.objects.exists()

    def test_limites_exatos_passam(self, api, agente_suporte, ticket):
        novo_campo("Curto")
        novo_campo("Longo", "textarea")
        resp = api(agente_suporte).patch(f"{TICKETS}{ticket.pk}/", {"custom_fields": {
            "curto": "x" * 2000, "longo": "y" * 10000,
        }}, format="json")
        assert resp.status_code == 200

    def test_chave_inexistente_e_campo_inativo(self, api, agente_suporte, ticket):
        novo_campo("Velho", is_active=False)
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"fantasma": "x"}}, format="json"
        )
        assert resp.status_code == 400 and "fantasma" in resp.json()["custom_fields"]
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"velho": "x"}}, format="json"
        )
        assert resp.status_code == 400 and "velho" in resp.json()["custom_fields"]

    def test_erro_de_uma_chave_nao_grava_as_outras(self, api, agente_suporte, ticket):
        novo_campo("Ok")
        novo_campo("Num", "number")
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"ok": "x", "num": "zzz"}}, format="json"
        )
        assert resp.status_code == 400
        assert not TicketCustomFieldValue.objects.exists()

    def test_corpo_que_nao_e_objeto_400(self, api, agente_suporte, ticket):
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": ["a"]}, format="json"
        )
        assert resp.status_code == 400

    def test_campo_inativo_continua_saindo_e_pode_ser_limpo(self, api, agente_suporte, ticket):
        campo = novo_campo("Velho")
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="dado")
        campo.is_active = False
        campo.save()
        assert api(agente_suporte).get(f"{TICKETS}{ticket.pk}/").json()["custom_fields"] == {
            "velho": "dado"
        }
        resp = api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"velho": None}}, format="json"
        )
        assert resp.status_code == 200 and resp.json()["custom_fields"] == {}

    def test_criacao_com_valores(self, api, agente_suporte, suporte, ana):
        novo_campo("Contrato")
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
            "custom_fields": {"contrato": "C-1"},
        }, format="json")
        assert resp.status_code == 201, resp.json()
        assert resp.json()["custom_fields"] == {"contrato": "C-1"}
        ticket = Ticket.objects.get(pk=resp.json()["id"])
        assert ticket.status_events.filter(note="campo: Contrato: — → C-1").exists()

    def test_criacao_multipart_aceita_json_em_texto(self, api, agente_suporte, suporte, ana):
        novo_campo("Contrato")
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
            "custom_fields": '{"contrato": "multi"}',
        }, format="multipart")
        assert resp.status_code == 201, resp.json()
        assert resp.json()["custom_fields"] == {"contrato": "multi"}

    def test_criacao_com_valor_invalido_nao_cria_ticket(self, api, agente_suporte, suporte, ana):
        novo_campo("Num", "number")
        antes = Ticket.objects.count()
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
            "custom_fields": {"num": "x"},
        }, format="json")
        assert resp.status_code == 400
        assert Ticket.objects.count() == antes

    def test_sem_custom_fields_o_comportamento_e_o_de_sempre(self, api, agente_suporte, ticket):
        detalhe = api(agente_suporte).get(f"{TICKETS}{ticket.pk}/").json()
        assert detalhe["custom_fields"] == {}

    def test_ticket_fora_do_escopo_404(self, api, agente_financeiro, ticket):
        novo_campo("Contrato")
        resp = api(agente_financeiro).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "x"}}, format="json"
        )
        assert resp.status_code == 404


class TestPermissaoEVazamento:
    def test_cliente_nao_edita_via_patch(self, api, ana, ticket):
        novo_campo("Contrato")
        resp = api(ana).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "x"}}, format="json"
        )
        assert resp.status_code == 403
        assert not TicketCustomFieldValue.objects.exists()

    def test_cliente_nao_define_na_criacao(self, api, ana, suporte):
        novo_campo("Contrato")
        antes = Ticket.objects.count()
        resp = api(ana).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B",
            "custom_fields": {"contrato": "x"},
        }, format="json")
        assert resp.status_code == 403
        assert Ticket.objects.count() == antes

    def test_cliente_nao_escolhe_formulario(self, api, ana, suporte):
        form = TicketForm.objects.create(name="Outro")
        resp = api(ana).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "form_id": form.pk,
        }, format="json")
        assert resp.status_code == 403

    def test_cliente_cria_normalmente_sem_campos(self, api, ana, suporte):
        resp = api(ana).post(TICKETS, {"team_id": suporte.pk, "subject": "S", "body": "B"},
                             format="json")
        assert resp.status_code == 201

    def test_detalhe_do_cliente_nao_traz_valores_nem_formulario(self, api, ana, agente_suporte,
                                                                ticket):
        campo = novo_campo("Segredo")
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="interno!")
        corpo = api(ana).get(f"{TICKETS}{ticket.pk}/")
        assert corpo.status_code == 200
        assert corpo.json()["custom_fields"] == {}
        assert corpo.json()["form_id"] is None
        assert "interno!" not in corpo.content.decode()
        assert "Segredo" not in corpo.content.decode()
        # a equipe vê
        assert api(agente_suporte).get(f"{TICKETS}{ticket.pk}/").json()["custom_fields"] == {
            "segredo": "interno!"
        }

    def test_lista_do_cliente_nao_vaza(self, api, ana, ticket):
        campo = novo_campo("Segredo")
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="interno!")
        resp = api(ana).get(TICKETS)
        assert "interno!" not in resp.content.decode()
        assert "custom_fields" not in resp.json()["results"][0]

    def test_historico_so_para_equipe(self, api, ana, agente_suporte, ticket):
        novo_campo("Segredo")
        api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"segredo": "interno!"}}, format="json"
        )
        assert "interno!" not in api(ana).get(f"{TICKETS}{ticket.pk}/").content.decode()

    def test_cliente_nao_filtra_por_campo(self, api, ana, ticket):
        campo = novo_campo("Segredo")
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="interno!")
        todos = api(ana).get(TICKETS).json()["count"]
        # filtro ignorado: não vira oráculo do valor
        assert api(ana).get(f"{TICKETS}?cf_segredo=nada").json()["count"] == todos
        assert api(ana).get(f"{TICKETS}?cf_segredo=interno!").json()["count"] == todos

    def test_email_ao_cliente_nao_leva_campos(self, api, agente_suporte, ana, ticket):
        from apps.notifications.models import OutboundEmail

        campo = novo_campo("Segredo")
        TicketCustomFieldValue.objects.create(ticket=ticket, field=campo, text_value="interno!")
        api(agente_suporte).post(f"{TICKETS}{ticket.pk}/reply/", {
            "body": "Olá", "is_public": True, "new_status": "open",
        }, format="json")
        emails = list(OutboundEmail.objects.all())
        assert emails  # a resposta pública gerou e-mail ao solicitante
        for email in emails:
            assert "interno!" not in f"{email.subject} {email.context}"

    def test_agente_leve_nao_edita_propriedades(self, api, agente_leve, ticket):
        novo_campo("Contrato")
        resp = api(agente_leve).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "x"}}, format="json"
        )
        assert resp.status_code in (400, 403)
        assert not TicketCustomFieldValue.objects.exists()
        # mas lê
        assert api(agente_leve).get(f"{TICKETS}{ticket.pk}/").status_code == 200


# --------------------------------------------------------------------------- #
# Filtro
# --------------------------------------------------------------------------- #

class TestFiltro:
    @pytest.fixture
    def tres(self, ana, suporte, make_ticket, api, agente_suporte):
        novo_campo("Txt")
        novo_campo("Num", "number")
        novo_campo("Dia", "date")
        novo_campo("Sim", "checkbox")
        dropdown("Sev")
        ts = [make_ticket(ana, suporte, subject=f"T{i}") for i in range(3)]
        dados = [
            {"txt": "Alpha", "num": 10, "dia": "2026-01-01", "sim": True, "sev": "alta"},
            {"txt": "beta", "num": 10.5, "dia": "2026-01-02", "sim": False, "sev": "baixa"},
            {},
        ]
        for t, d in zip(ts, dados, strict=True):
            if d:
                assert api(agente_suporte).patch(
                    f"{TICKETS}{t.pk}/", {"custom_fields": d}, format="json"
                ).status_code == 200
        return ts

    def ids(self, api, quem, query):
        resp = api(quem).get(f"{TICKETS}?{query}")
        assert resp.status_code == 200
        return {t["id"] for t in resp.json()["results"]}

    def test_dropdown(self, api, agente_suporte, tres):
        assert self.ids(api, agente_suporte, "cf_sev=alta") == {tres[0].pk}

    def test_checkbox_true_e_false(self, api, agente_suporte, tres):
        assert self.ids(api, agente_suporte, "cf_sim=true") == {tres[0].pk}
        assert self.ids(api, agente_suporte, "cf_sim=false") == {tres[1].pk}

    def test_texto_sem_diferenciar_caixa(self, api, agente_suporte, tres):
        assert self.ids(api, agente_suporte, "cf_txt=ALPHA") == {tres[0].pk}
        assert self.ids(api, agente_suporte, "cf_txt=alph") == set()

    def test_numero(self, api, agente_suporte, tres):
        assert self.ids(api, agente_suporte, "cf_num=10") == {tres[0].pk}
        assert self.ids(api, agente_suporte, "cf_num=10.5") == {tres[1].pk}

    def test_data(self, api, agente_suporte, tres):
        assert self.ids(api, agente_suporte, "cf_dia=2026-01-02") == {tres[1].pk}

    def test_filtros_se_somam(self, api, agente_suporte, tres):
        assert self.ids(api, agente_suporte, "cf_sev=alta&cf_sim=true") == {tres[0].pk}
        assert self.ids(api, agente_suporte, "cf_sev=alta&cf_sim=false") == set()

    def test_desconhecido_ou_invalido_e_ignorado(self, api, agente_suporte, tres):
        assert len(self.ids(api, agente_suporte, "cf_naoexiste=1")) == 3
        assert len(self.ids(api, agente_suporte, "cf_num=abc")) == 3

    def test_respeita_o_escopo_de_equipe(self, api, agente_financeiro, tres):
        assert self.ids(api, agente_financeiro, "cf_sev=alta") == set()


# --------------------------------------------------------------------------- #
# Obrigatoriedade
# --------------------------------------------------------------------------- #

class TestObrigatorio:
    def test_criar_sem_valor_400_com_o_campo(self, api, agente_suporte, suporte, ana):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        antes = Ticket.objects.count()
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
        }, format="json")
        assert resp.status_code == 400
        corpo = resp.json()
        assert corpo["code"] == "required_custom_fields"
        assert corpo["fields"] == [{"id": contrato.pk, "slug": "contrato", "title": "Contrato"}]
        assert "contrato" in corpo["custom_fields"]
        assert "Contrato" in corpo["detail"]
        assert Ticket.objects.count() == antes

    def test_criar_com_valor_passa(self, api, agente_suporte, suporte, ana):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
            "custom_fields": {"contrato": "ok"},
        }, format="json")
        assert resp.status_code == 201

    def test_obrigatorio_vale_pelo_campo_ou_pelo_formulario(self, api, agente_suporte, suporte,
                                                           ana):
        a = novo_campo("A", is_required=True)  # global
        b = novo_campo("B")                    # só no formulário
        formulario_com(a, b, obrigatorios=[b])
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
        }, format="json")
        assert [f["slug"] for f in resp.json()["fields"]] == ["a", "b"]

    def test_campo_inativo_ou_fora_do_formulario_nao_e_exigido(self, api, agente_suporte,
                                                              suporte, ana):
        fora = novo_campo("Fora", is_required=True)  # obrigatório, mas não está no formulário
        inativo = novo_campo("Inativo", is_required=True)
        formulario_com(inativo)
        inativo.is_active = False
        inativo.save()
        resp = api(agente_suporte).post(TICKETS, {
            "team_id": suporte.pk, "subject": "S", "body": "B", "requester_id": ana.pk,
        }, format="json")
        assert resp.status_code == 201, resp.json()
        assert fora.is_required

    def test_criacao_pelo_cliente_nao_e_bloqueada(self, api, ana, suporte):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        resp = api(ana).post(TICKETS, {"team_id": suporte.pk, "subject": "S", "body": "B"},
                             format="json")
        assert resp.status_code == 201

    def test_close_sem_valor_400_e_nao_fecha(self, api, agente_suporte, ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        resp = api(agente_suporte).post(
            f"{TICKETS}{ticket.pk}/close/", janela(ticket), format="json"
        )
        assert resp.status_code == 400
        corpo = resp.json()
        assert corpo["code"] == "required_custom_fields"
        assert corpo["fields"][0]["slug"] == "contrato"
        assert corpo["detail"].startswith("Preencha os campos obrigatórios")
        ticket.refresh_from_db()
        assert ticket.status != TicketStatus.CLOSED and ticket.closed_at is None

    def test_close_com_valor_fecha(self, api, agente_suporte, ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"contrato": "ok"}}, format="json"
        )
        resp = api(agente_suporte).post(
            f"{TICKETS}{ticket.pk}/close/", janela(ticket), format="json"
        )
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == TicketStatus.CLOSED

    def test_reply_resolvido_sem_valor_400_sem_mensagem_e_sem_fechar(self, api, agente_suporte,
                                                                    ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        mensagens = ticket.messages.count()
        resp = api(agente_suporte).post(f"{TICKETS}{ticket.pk}/reply/", {
            "body": "Resolvido!", "is_public": True, "new_status": "closed", **janela(ticket),
        }, format="json")
        assert resp.status_code == 400
        assert resp.json()["code"] == "required_custom_fields"
        ticket.refresh_from_db()
        assert ticket.status != TicketStatus.CLOSED
        assert ticket.messages.count() == mensagens  # nada ficou gravado

    def test_reply_sem_fechar_nao_exige(self, api, agente_suporte, ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        resp = api(agente_suporte).post(f"{TICKETS}{ticket.pk}/reply/", {
            "body": "Olá", "is_public": True, "new_status": "pending_customer",
        }, format="json")
        assert resp.status_code == 201

    def test_bulk_close_separa_pendentes(self, api, agente_suporte, ana, suporte, make_ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        completo = make_ticket(ana, suporte, subject="completo")
        vazio = make_ticket(ana, suporte, subject="vazio")
        api(agente_suporte).patch(
            f"{TICKETS}{completo.pk}/", {"custom_fields": {"contrato": "ok"}}, format="json"
        )
        resp = api(agente_suporte).post(f"{TICKETS}bulk-close/", {
            "ticket_ids": [completo.pk, vazio.pk], **janela(vazio),
        }, format="json")
        assert resp.status_code == 200, resp.json()
        corpo = resp.json()
        assert corpo["updated"] == [completo.pk]
        assert [f["id"] for f in corpo["failed"]] == [vazio.pk]
        assert "Contrato" in corpo["failed"][0]["detail"]
        vazio.refresh_from_db()
        completo.refresh_from_db()
        assert vazio.status != TicketStatus.CLOSED and completo.status == TicketStatus.CLOSED

    def test_obrigatorio_segue_o_formulario_do_ticket(self, api, agente_suporte, ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        outro = TicketForm.objects.create(name="Sem exigência")
        ticket.form = outro
        ticket.save()
        resp = api(agente_suporte).post(
            f"{TICKETS}{ticket.pk}/close/", janela(ticket), format="json"
        )
        assert resp.status_code == 200

    def test_checkbox_false_conta_como_preenchido(self, api, agente_suporte, ticket):
        aceite = novo_campo("Aceite", "checkbox")
        formulario_com(aceite, obrigatorios=[aceite])
        api(agente_suporte).patch(
            f"{TICKETS}{ticket.pk}/", {"custom_fields": {"aceite": False}}, format="json"
        )
        resp = api(agente_suporte).post(
            f"{TICKETS}{ticket.pk}/close/", janela(ticket), format="json"
        )
        assert resp.status_code == 200

    def test_cliente_encerrando_o_proprio_ticket_nao_e_bloqueado(self, api, ana, ticket):
        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        resp = api(ana).post(f"{TICKETS}{ticket.pk}/close/", {}, format="json")
        assert resp.status_code == 200
        ticket.refresh_from_db()
        assert ticket.status == TicketStatus.CLOSED

    def test_servico_direto_levanta_a_excecao_com_a_lista(self, ticket, agente_suporte):
        from apps.tickets.services.custom_fields import RequiredCustomFields

        contrato = novo_campo("Contrato")
        formulario_com(contrato, obrigatorios=[contrato])
        with pytest.raises(RequiredCustomFields) as exc:
            ticket_service.close_ticket(
                ticket=ticket, actor=agente_suporte,
                resolution_started_at=ticket.created_at.replace(second=0, microsecond=0),
                resolution_ended_at=timezone.now() - dt.timedelta(seconds=1),
            )
        assert exc.value.pending[0]["slug"] == "contrato"
