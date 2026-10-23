"""Tipo do ticket (`type`): pergunta, incidente, problema, tarefa.

Opcional e nulo por padrão; aceito na criação e no PATCH, devolvido na lista e
no detalhe, filtrável por `?type=`, auditado como as outras propriedades e
sujeito à permissão de editar propriedades.
"""

import pytest

pytestmark = pytest.mark.django_db

URL = "/api/v1/tickets/"


@pytest.fixture
def base(suporte, ana):
    return {"team_id": suporte.pk, "subject": "Com tipo", "body": "Corpo",
            "requester_id": ana.pk}


class TestCriacao:
    def test_sem_tipo_fica_nulo(self, api, agente_suporte, base):
        resp = api(agente_suporte).post(URL, base, format="json")
        assert resp.status_code == 201
        assert resp.json()["type"] is None

    def test_cria_com_tipo(self, api, agente_suporte, base):
        resp = api(agente_suporte).post(URL, {**base, "type": "incident"}, format="json")
        assert resp.status_code == 201, resp.json()
        assert resp.json()["type"] == "incident"

    def test_tipo_invalido_400(self, api, agente_suporte, base):
        resp = api(agente_suporte).post(URL, {**base, "type": "bug"}, format="json")
        assert resp.status_code == 400
        assert "type" in resp.json()

    def test_cliente_nao_define_tipo(self, api, ana, suporte):
        resp = api(ana).post(
            URL, {"team_id": suporte.pk, "subject": "x", "body": "y", "type": "task"},
            format="json",
        )
        assert resp.status_code == 400

    def test_agente_leve_nao_define_tipo(self, api, agente_leve, base):
        resp = api(agente_leve).post(URL, {**base, "type": "task"}, format="json")
        assert resp.status_code == 400


class TestEdicao:
    def test_patch_define_e_limpa(self, api, agente_suporte, ana, suporte, make_ticket):
        ticket = make_ticket(requester=ana, team=suporte)
        url = f"{URL}{ticket.pk}/"
        resp = api(agente_suporte).patch(url, {"type": "problem"}, format="json")
        assert resp.status_code == 200
        assert resp.json()["type"] == "problem"
        ticket.refresh_from_db()
        assert ticket.type == "problem"
        resp = api(agente_suporte).patch(url, {"type": None}, format="json")
        assert resp.status_code == 200
        assert resp.json()["type"] is None

    def test_patch_sem_type_nao_mexe(self, api, agente_suporte, ana, suporte, make_ticket):
        ticket = make_ticket(requester=ana, team=suporte)
        api(agente_suporte).patch(f"{URL}{ticket.pk}/", {"type": "task"}, format="json")
        resp = api(agente_suporte).patch(
            f"{URL}{ticket.pk}/", {"priority": "high"}, format="json"
        )
        assert resp.status_code == 200
        assert resp.json()["type"] == "task"

    def test_patch_tipo_invalido_400(self, api, agente_suporte, ana, suporte, make_ticket):
        ticket = make_ticket(requester=ana, team=suporte)
        resp = api(agente_suporte).patch(f"{URL}{ticket.pk}/", {"type": "x"}, format="json")
        assert resp.status_code == 400

    def test_agente_leve_sem_permissao_400(self, api, agente_leve, ana, suporte, make_ticket):
        ticket = make_ticket(requester=ana, team=suporte)
        resp = api(agente_leve).patch(f"{URL}{ticket.pk}/", {"type": "task"}, format="json")
        assert resp.status_code == 400
        ticket.refresh_from_db()
        assert ticket.type is None

    def test_cliente_nao_edita_403(self, api, ana, suporte, make_ticket):
        ticket = make_ticket(requester=ana, team=suporte)
        resp = api(ana).patch(f"{URL}{ticket.pk}/", {"type": "task"}, format="json")
        assert resp.status_code == 403

    def test_ticket_inexistente_404(self, api, agente_suporte):
        resp = api(agente_suporte).patch(f"{URL}999999/", {"type": "task"}, format="json")
        assert resp.status_code == 404

    def test_mudanca_e_auditada(self, api, agente_suporte, ana, suporte, make_ticket):
        ticket = make_ticket(requester=ana, team=suporte)
        api(agente_suporte).patch(f"{URL}{ticket.pk}/", {"type": "incident"}, format="json")
        evento = ticket.status_events.latest("created_at")
        assert evento.note == "tipo → Incidente"
        assert evento.changed_by_id == agente_suporte.pk
        # repetir o mesmo valor não gera evento novo
        total = ticket.status_events.count()
        api(agente_suporte).patch(f"{URL}{ticket.pk}/", {"type": "incident"}, format="json")
        assert ticket.status_events.count() == total


class TestLeituraEFiltro:
    def _tres(self, api, agente_suporte, ana, suporte, make_ticket):
        a = make_ticket(requester=ana, team=suporte, subject="A")
        b = make_ticket(requester=ana, team=suporte, subject="B")
        c = make_ticket(requester=ana, team=suporte, subject="C")
        for t, tipo in ((a, "question"), (b, "incident")):
            api(agente_suporte).patch(f"{URL}{t.pk}/", {"type": tipo}, format="json")
        return a, b, c

    def test_lista_e_detalhe_trazem_type(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        a, _b, _c = self._tres(api, agente_suporte, ana, suporte, make_ticket)
        lista = api(agente_suporte).get(URL).json()["results"]
        assert {r["id"]: r["type"] for r in lista}[a.pk] == "question"
        assert api(agente_suporte).get(f"{URL}{a.pk}/").json()["type"] == "question"

    def test_cliente_ve_o_tipo(self, api, agente_suporte, ana, suporte, make_ticket):
        a, _b, _c = self._tres(api, agente_suporte, ana, suporte, make_ticket)
        assert api(ana).get(f"{URL}{a.pk}/").json()["type"] == "question"

    def test_filtro_por_tipo(self, api, agente_suporte, ana, suporte, make_ticket):
        a, b, c = self._tres(api, agente_suporte, ana, suporte, make_ticket)

        def ids(qs):
            res = api(agente_suporte).get(f"{URL}?type={qs}")
            assert res.status_code == 200
            return {r["id"] for r in res.json()["results"]}

        assert ids("question") == {a.pk}
        assert ids("question,incident") == {a.pk, b.pk}
        assert ids("none") == {c.pk}
        assert ids("incident,none") == {b.pk, c.pk}
        # valor desconhecido não filtra
        assert ids("lixo") == {a.pk, b.pk, c.pk}
