"""Formulários de ticket: CRUD admin, padrão único, clonar, reordenar e o
efeito na criação do ticket (equipe/tipo padrão)."""

import pytest

from apps.audit.models import AuditLog
from apps.tickets.models import Ticket, TicketField, TicketForm, TicketFormField

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _formulario_padrao(db):
    """O padrão vem de migração de dados; testes transacionais de outros
    arquivos fazem FLUSH e o levam junto — recria como o app faria."""
    TicketForm.default()

FORMS = "/api/v1/settings/ticket-forms/"
TICKETS = "/api/v1/tickets/"


def campo(title, **extra):
    return TicketField.objects.create(
        slug=title.lower(), title=title, type="text", **extra
    )


def ids(resp):
    return [f["id"] for f in resp.json()["results"]]


class TestPadrao:
    def test_sempre_existe_um_padrao_vazio(self, api, agente_suporte):
        resp = api(agente_suporte).get(FORMS)
        assert resp.status_code == 200
        padroes = [f for f in resp.json()["results"] if f["is_default"]]
        assert len(padroes) == 1
        assert padroes[0]["name"] == "Formulário padrão"
        assert padroes[0]["form_fields"] == [] and padroes[0]["is_active"] is True

    def test_padrao_e_recriado_se_o_banco_for_esvaziado(self, api, agente_suporte):
        TicketForm.objects.all().delete()
        resp = api(agente_suporte).get(FORMS)
        assert [f["is_default"] for f in resp.json()["results"]] == [True]

    def test_o_primeiro_criado_vira_padrao_quando_nao_ha_nenhum(self, api, admin):
        TicketForm.objects.all().delete()
        resp = api(admin).post(FORMS, {"name": "Primeiro"}, format="json")
        assert resp.status_code == 201
        assert resp.json()["is_default"] is True

    def test_criar_outro_nao_toma_o_padrao(self, api, admin):
        resp = api(admin).post(FORMS, {"name": "Segundo"}, format="json")
        assert resp.status_code == 201 and resp.json()["is_default"] is False
        assert TicketForm.objects.filter(is_default=True).count() == 1

    def test_trocar_o_padrao_por_patch(self, api, admin):
        antigo = TicketForm.default()
        novo = api(admin).post(FORMS, {"name": "Novo"}, format="json").json()
        resp = api(admin).patch(f"{FORMS}{novo['id']}/", {"is_default": True}, format="json")
        assert resp.status_code == 200 and resp.json()["is_default"] is True
        antigo.refresh_from_db()
        assert antigo.is_default is False
        assert TicketForm.objects.filter(is_default=True).count() == 1

    def test_nao_desativa_nem_despadroniza_nem_apaga_o_padrao(self, api, admin):
        padrao = TicketForm.default()
        for corpo in ({"is_active": False}, {"is_default": False}):
            resp = api(admin).patch(f"{FORMS}{padrao.pk}/", corpo, format="json")
            assert resp.status_code == 409, corpo
            assert "padrão" in resp.json()["detail"]
            assert resp.json()["code"] == "default_form_required"
        assert api(admin).delete(f"{FORMS}{padrao.pk}/").status_code == 409
        padrao.refresh_from_db()
        assert padrao.is_default and padrao.is_active

    def test_depois_de_indicar_outro_o_antigo_pode_sair(self, api, admin):
        antigo = TicketForm.default()
        novo = api(admin).post(FORMS, {"name": "Novo"}, format="json").json()
        api(admin).patch(f"{FORMS}{novo['id']}/", {"is_default": True}, format="json")
        assert api(admin).patch(
            f"{FORMS}{antigo.pk}/", {"is_active": False}, format="json"
        ).status_code == 200
        assert api(admin).delete(f"{FORMS}{antigo.pk}/").status_code == 204

    def test_padrao_inativo_400(self, api, admin):
        resp = api(admin).post(
            FORMS, {"name": "X", "is_default": True, "is_active": False}, format="json"
        )
        assert resp.status_code == 400


class TestCrud:
    def test_cria_com_campos_ordem_e_obrigatoriedade(self, api, admin, suporte):
        a, b = campo("A"), campo("B")
        resp = api(admin).post(FORMS, {
            "name": "Incidentes", "description": "Para incidentes", "type": "incident",
            "default_team": suporte.pk,
            "form_fields": [{"field": b.pk, "is_required": True}, {"field": "a"}],
        }, format="json")
        assert resp.status_code == 201, resp.json()
        corpo = resp.json()
        assert corpo["type"] == "incident" and corpo["default_team"] == suporte.pk
        assert corpo["default_team_name"] == "Suporte"
        assert [(f["slug"], f["is_required"], f["order"]) for f in corpo["form_fields"]] == [
            ("b", True, 0), ("a", False, 1),
        ]

    def test_patch_substitui_a_lista_de_campos(self, api, admin):
        a, b = campo("A"), campo("B")
        form = api(admin).post(
            FORMS, {"name": "F", "form_fields": [{"field": a.pk}]}, format="json"
        ).json()
        resp = api(admin).patch(
            f"{FORMS}{form['id']}/", {"form_fields": [{"field": b.pk, "is_required": True}]},
            format="json",
        )
        assert [f["slug"] for f in resp.json()["form_fields"]] == ["b"]
        # sem form_fields no corpo, a lista não muda
        resp = api(admin).patch(f"{FORMS}{form['id']}/", {"name": "F2"}, format="json")
        assert [f["slug"] for f in resp.json()["form_fields"]] == ["b"]
        assert TicketFormField.objects.filter(form_id=form["id"]).count() == 1

    def test_validacoes(self, api, admin):
        a = campo("A")
        inativo = campo("Inativo", is_active=False)
        c = api(admin)
        assert c.post(FORMS, {"name": ""}, format="json").status_code == 400
        assert c.post(FORMS, {"name": "x" * 81}, format="json").status_code == 400
        assert c.post(FORMS, {"name": "Formulário padrão"}, format="json").status_code == 400
        assert c.post(FORMS, {"name": "formulário PADRÃO".replace("Ã", "ã")},
                      format="json").status_code == 400
        assert c.post(FORMS, {"name": "T", "type": "bug"}, format="json").status_code == 400
        assert c.post(FORMS, {"name": "T", "default_team": 9999}, format="json").status_code == 400
        assert c.post(FORMS, {"name": "T", "form_fields": [{"field": 9999}]},
                      format="json").status_code == 400
        assert c.post(FORMS, {"name": "T", "form_fields": [{"field": a.pk}, {"field": "a"}]},
                      format="json").status_code == 400
        assert c.post(FORMS, {"name": "T", "form_fields": [{"field": inativo.pk}]},
                      format="json").status_code == 400
        assert c.post(FORMS, {"name": "T", "form_fields": "a"}, format="json").status_code == 400

    def test_leitura_para_agentes_e_escrita_so_admin(self, api, agente_suporte, agente_leve,
                                                    supervisor):
        form = TicketForm.default()
        for quem in (agente_suporte, agente_leve, supervisor):
            assert api(quem).get(FORMS).status_code == 200
            assert api(quem).get(f"{FORMS}{form.pk}/").status_code == 200
        for quem in (agente_suporte, supervisor):
            c = api(quem)
            assert c.post(FORMS, {"name": "x"}, format="json").status_code == 403
            assert c.patch(f"{FORMS}{form.pk}/", {"name": "x"}, format="json").status_code == 403
            assert c.delete(f"{FORMS}{form.pk}/").status_code == 403
            assert c.post(f"{FORMS}{form.pk}/clone/", {}, format="json").status_code == 403
            assert c.post(f"{FORMS}reorder/", {"ids": [form.pk]}, format="json").status_code == 403

    def test_cliente_nao_acessa(self, api, ana):
        assert api(ana).get(FORMS).status_code == 403
        assert api(ana).post(FORMS, {"name": "x"}, format="json").status_code == 403

    def test_404(self, api, admin):
        c = api(admin)
        assert c.get(f"{FORMS}9999/").status_code == 404
        assert c.patch(f"{FORMS}9999/", {"name": "x"}, format="json").status_code == 404
        assert c.delete(f"{FORMS}9999/").status_code == 404
        assert c.post(f"{FORMS}9999/clone/", {}, format="json").status_code == 404

    def test_apagar_em_uso_409_e_desativar_ok(self, api, admin, ana, suporte, make_ticket):
        usado = api(admin).post(FORMS, {"name": "Usado"}, format="json").json()
        ticket = make_ticket(ana, suporte)
        ticket.form_id = usado["id"]
        ticket.save()
        resp = api(admin).delete(f"{FORMS}{usado['id']}/")
        assert resp.status_code == 409 and resp.json()["code"] == "form_in_use"
        assert api(admin).patch(
            f"{FORMS}{usado['id']}/", {"is_active": False}, format="json"
        ).status_code == 200

    def test_apagar_sem_uso_204(self, api, admin):
        f = api(admin).post(FORMS, {"name": "Sobrando"}, format="json").json()
        assert api(admin).delete(f"{FORMS}{f['id']}/").status_code == 204

    def test_ticket_count_na_lista(self, api, admin, ana, suporte, make_ticket):
        f = api(admin).post(FORMS, {"name": "Usado"}, format="json").json()
        t = make_ticket(ana, suporte)
        t.form_id = f["id"]
        t.save()
        achado = next(x for x in api(admin).get(FORMS).json()["results"] if x["id"] == f["id"])
        assert achado["ticket_count"] == 1

    def test_reordenar(self, api, admin):
        padrao = TicketForm.default()
        b = api(admin).post(FORMS, {"name": "B"}, format="json").json()
        c = api(admin).post(FORMS, {"name": "C"}, format="json").json()
        resp = api(admin).post(f"{FORMS}reorder/", {"ids": [c["id"], b["id"]]}, format="json")
        assert resp.status_code == 200
        assert [f["id"] for f in resp.json()] == [c["id"], b["id"], padrao.pk]
        assert api(admin).post(f"{FORMS}reorder/", {"ids": [9999]}, format="json").status_code == 400
        assert api(admin).post(f"{FORMS}reorder/", {"ids": []}, format="json").status_code == 400

    def test_auditoria_das_mudancas(self, api, admin):
        f = api(admin).post(FORMS, {"name": "Aud"}, format="json").json()
        api(admin).patch(f"{FORMS}{f['id']}/", {"description": "d"}, format="json")
        api(admin).post(f"{FORMS}{f['id']}/clone/", {}, format="json")
        api(admin).delete(f"{FORMS}{f['id']}/")
        resumos = " | ".join(AuditLog.objects.filter(action="config_change")
                             .values_list("summary", flat=True))
        for palavra in ("criado", "alterado", "clonado", "apagado"):
            assert palavra in resumos


class TestClonar:
    def test_copia_campos_equipe_e_tipo_e_nunca_e_padrao(self, api, admin, suporte):
        a, b = campo("A"), campo("B")
        origem = api(admin).post(FORMS, {
            "name": "Origem", "type": "task", "default_team": suporte.pk, "description": "d",
            "form_fields": [{"field": a.pk, "is_required": True}, {"field": b.pk}],
        }, format="json").json()
        resp = api(admin).post(f"{FORMS}{origem['id']}/clone/", {}, format="json")
        assert resp.status_code == 201, resp.json()
        c = resp.json()
        assert c["name"] == "Cópia de Origem" and c["is_default"] is False
        assert c["type"] == "task" and c["default_team"] == suporte.pk
        assert [(f["slug"], f["is_required"]) for f in c["form_fields"]] == [
            ("a", True), ("b", False),
        ]
        # segundo clone não colide no nome
        outro = api(admin).post(f"{FORMS}{origem['id']}/clone/", {}, format="json").json()
        assert outro["name"] == "Cópia de Origem (2)"

    def test_clonar_o_padrao_nao_gera_segundo_padrao(self, api, admin):
        padrao = TicketForm.default()
        resp = api(admin).post(f"{FORMS}{padrao.pk}/clone/", {"name": "Meu clone"}, format="json")
        assert resp.status_code == 201 and resp.json()["name"] == "Meu clone"
        assert TicketForm.objects.filter(is_default=True).count() == 1

    def test_nome_repetido_400(self, api, admin):
        padrao = TicketForm.default()
        resp = api(admin).post(
            f"{FORMS}{padrao.pk}/clone/", {"name": "Formulário padrão"}, format="json"
        )
        assert resp.status_code == 400


class TestNoTicket:
    base = {"subject": "S", "body": "B"}

    def test_form_id_vem_na_lista_e_no_detalhe_para_a_equipe(self, api, agente_suporte, ana,
                                                           suporte, make_ticket):
        t = make_ticket(ana, suporte)
        padrao = TicketForm.default()
        lista = api(agente_suporte).get(TICKETS).json()["results"][0]
        assert lista["form_id"] == padrao.pk
        assert api(agente_suporte).get(f"{TICKETS}{t.pk}/").json()["form_id"] == padrao.pk

    def test_cria_com_form_aplica_equipe_e_tipo_padrao(self, api, agente_suporte, ana, suporte):
        form = TicketForm.objects.create(name="Inc", default_team=suporte, type="incident")
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "form_id": form.pk,
        }, format="json")
        assert resp.status_code == 201, resp.json()
        corpo = resp.json()
        assert corpo["form_id"] == form.pk
        assert corpo["team"]["id"] == suporte.pk and corpo["type"] == "incident"

    def test_post_vence_o_padrao_do_formulario(self, api, agente_suporte, ana, suporte,
                                              financeiro):
        form = TicketForm.objects.create(name="Inc", default_team=financeiro, type="incident")
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "form_id": form.pk,
            "team_id": suporte.pk, "type": "task",
        }, format="json")
        assert resp.status_code == 201, resp.json()
        assert resp.json()["team"]["id"] == suporte.pk and resp.json()["type"] == "task"
        # type null explícito também é "informado"
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "form_id": form.pk,
            "team_id": suporte.pk, "type": None,
        }, format="json")
        assert resp.json()["type"] is None

    def test_sem_equipe_nem_padrao_400(self, api, agente_suporte, ana):
        form = TicketForm.objects.create(name="Sem equipe")
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "form_id": form.pk,
        }, format="json")
        assert resp.status_code == 400 and "team_id" in resp.json()
        resp = api(agente_suporte).post(TICKETS, {**self.base, "requester_id": ana.pk},
                                        format="json")
        assert resp.status_code == 400 and "team_id" in resp.json()

    def test_form_inativo_ou_inexistente_400(self, api, agente_suporte, ana, suporte):
        inativo = TicketForm.objects.create(name="Off", is_active=False)
        for fid in (inativo.pk, 9999):
            resp = api(agente_suporte).post(TICKETS, {
                **self.base, "requester_id": ana.pk, "team_id": suporte.pk, "form_id": fid,
            }, format="json")
            assert resp.status_code == 400 and "form_id" in resp.json()

    def test_sem_form_o_ticket_segue_o_padrao_vigente(self, api, agente_suporte, ana, suporte,
                                                    admin):
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "team_id": suporte.pk,
        }, format="json")
        ticket = Ticket.objects.get(pk=resp.json()["id"])
        assert ticket.form_id is None
        novo = api(admin).post(FORMS, {"name": "Novo"}, format="json").json()
        api(admin).patch(f"{FORMS}{novo['id']}/", {"is_default": True}, format="json")
        assert api(agente_suporte).get(f"{TICKETS}{ticket.pk}/").json()["form_id"] == novo["id"]

    def test_patch_troca_e_limpa_o_formulario_com_auditoria(self, api, agente_suporte, ana,
                                                           suporte, make_ticket):
        t = make_ticket(ana, suporte)
        form = TicketForm.objects.create(name="Outro")
        resp = api(agente_suporte).patch(f"{TICKETS}{t.pk}/", {"form_id": form.pk}, format="json")
        assert resp.status_code == 200 and resp.json()["form_id"] == form.pk
        assert t.status_events.order_by("-id").first().note == "formulário → Outro"
        resp = api(agente_suporte).patch(f"{TICKETS}{t.pk}/", {"form_id": None}, format="json")
        t.refresh_from_db()
        assert t.form_id is None
        assert resp.json()["form_id"] == TicketForm.default().pk

    def test_cliente_nao_troca_formulario(self, api, ana, suporte, make_ticket):
        t = make_ticket(ana, suporte)
        form = TicketForm.objects.create(name="Outro")
        assert api(ana).patch(f"{TICKETS}{t.pk}/", {"form_id": form.pk},
                              format="json").status_code == 403

    def test_agente_leve_nao_troca_formulario(self, api, agente_leve, ana, suporte, make_ticket):
        t = make_ticket(ana, suporte)
        form = TicketForm.objects.create(name="Outro")
        resp = api(agente_leve).patch(f"{TICKETS}{t.pk}/", {"form_id": form.pk}, format="json")
        assert resp.status_code in (400, 403)
        t.refresh_from_db()
        assert t.form_id is None

    def test_obrigatorio_do_formulario_escolhido_vale_na_criacao(self, api, agente_suporte, ana,
                                                                suporte):
        c = campo("Contrato")
        form = TicketForm.objects.create(name="Com contrato", default_team=suporte)
        TicketFormField.objects.create(form=form, field=c, is_required=True)
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "form_id": form.pk,
        }, format="json")
        assert resp.status_code == 400
        assert resp.json()["code"] == "required_custom_fields"
        resp = api(agente_suporte).post(TICKETS, {
            **self.base, "requester_id": ana.pk, "form_id": form.pk,
            "custom_fields": {"contrato": "ok"},
        }, format="json")
        assert resp.status_code == 201
