"""Ids e carimbos que o front Helpdesk precisava e a API só dava por nome:
`requester_id`/`company_id` na lista, `author_id` nas mensagens, `created_at`/
`updated_at` do usuário e a paginação OPCIONAL de `/ticket-views/`."""

import pytest

from apps.tickets.models import SavedTicketView

pytestmark = pytest.mark.django_db


class TestListaDeTickets:
    def test_traz_requester_id_e_company_id(
        self, api, agente_suporte, ana, acme, suporte, make_ticket
    ):
        make_ticket(ana, suporte)
        item = api(agente_suporte).get("/api/v1/tickets/").json()["results"][0]
        assert item["requester_id"] == ana.pk
        assert item["company_id"] == acme.pk
        assert item["requester_display"] == ana.full_name  # campos antigos intactos

    def test_requester_id_segue_a_mascara_do_solicitante(
        self, api, ana, beto, financeiro, make_ticket, admin
    ):
        """Ticket restrito do Financeiro: a colega da mesma empresa vê o
        solicitante mascarado e, portanto, sem id; quem abriu e o agente veem."""
        make_ticket(ana, financeiro)
        da_colega = api(beto).get("/api/v1/tickets/").json()["results"]
        assert da_colega == [] or da_colega[0]["requester_id"] is None
        dela = api(ana).get("/api/v1/tickets/").json()["results"][0]
        assert dela["requester_id"] == ana.pk
        assert api(admin).get("/api/v1/tickets/").json()["results"][0]["requester_id"] == ana.pk

    def test_detalhe_herda_os_campos(self, api, agente_suporte, ana, acme, suporte, make_ticket):
        t = make_ticket(ana, suporte)
        corpo = api(agente_suporte).get(f"/api/v1/tickets/{t.pk}/").json()
        assert corpo["requester_id"] == ana.pk and corpo["company_id"] == acme.pk


class TestAuthorIdDasMensagens:
    def test_agente_recebe_o_id_de_todo_autor(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t = make_ticket(ana, suporte)
        api(agente_suporte).post(
            f"/api/v1/tickets/{t.pk}/reply/", {"body": "oi", "new_status": "open"},
            format="json",
        )
        msgs = api(agente_suporte).get(f"/api/v1/tickets/{t.pk}/").json()["messages"]
        assert [m["author_id"] for m in msgs] == [ana.pk, agente_suporte.pk]
        assert msgs[0]["author_name"] == ana.full_name  # nome continua saindo

    def test_cliente_ve_o_proprio_id_e_nao_o_de_agente(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t = make_ticket(ana, suporte)
        api(agente_suporte).post(
            f"/api/v1/tickets/{t.pk}/reply/", {"body": "oi", "new_status": "open"},
            format="json",
        )
        msgs = api(ana).get(f"/api/v1/tickets/{t.pk}/").json()["messages"]
        assert [m["author_id"] for m in msgs] == [ana.pk, None]
        assert msgs[1]["author_name"] == agente_suporte.full_name
        assert msgs[1]["author_is_internal"] is True

    def test_colega_cliente_aparece_com_id_para_o_cliente(
        self, api, ana, olga, suporte, make_ticket
    ):
        t = make_ticket(ana, suporte)
        from apps.tickets.services import ticket_service

        ticket_service.add_reply(ticket=t, author=olga, body="também aqui")
        msgs = api(ana).get(f"/api/v1/tickets/{t.pk}/").json()["messages"]
        assert msgs[-1]["author_id"] == olga.pk

    def test_mensagem_do_sistema_tem_author_id_nulo(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        from apps.tickets.models import TicketMessage

        t = make_ticket(ana, suporte)
        TicketMessage.objects.create(ticket=t, author=None, body="aviso", is_public=True)
        msgs = api(agente_suporte).get(f"/api/v1/tickets/{t.pk}/").json()["messages"]
        assert msgs[-1]["author_id"] is None and msgs[-1]["author_name"] == "Sistema"


class TestCarimbosDoUsuario:
    def test_settings_users_expoe_created_at_e_updated_at(self, api, admin, agente_suporte):
        corpo = api(admin).get(f"/api/v1/settings/users/{agente_suporte.pk}/").json()
        assert corpo["created_at"] and corpo["updated_at"]
        assert corpo["created_at"] <= corpo["updated_at"]

    def test_updated_at_muda_ao_editar_e_nao_e_gravavel(self, api, admin, agente_suporte):
        antes = api(admin).get(f"/api/v1/settings/users/{agente_suporte.pk}/").json()
        resp = api(admin).patch(
            f"/api/v1/settings/users/{agente_suporte.pk}/",
            {"job_title": "Líder", "created_at": "2000-01-01T00:00:00Z"}, format="json",
        )
        assert resp.status_code == 200
        depois = resp.json()
        assert depois["created_at"] == antes["created_at"]       # read-only
        assert depois["updated_at"] >= antes["updated_at"]

    def test_me_expoe_os_carimbos(self, api, agente_suporte):
        corpo = api(agente_suporte).get("/api/v1/auth/me/").json()
        assert corpo["created_at"] and corpo["updated_at"]


class TestPaginacaoOpcionalDasVisoes:
    URL = "/api/v1/ticket-views/"

    def _visoes(self, dono, n):
        for i in range(n):
            SavedTicketView.objects.create(
                owner=dono, name=f"V{i}", filters={"priority": "urgent"}, position=i,
            )

    def test_padrao_continua_array_puro(self, api, agente_suporte):
        self._visoes(agente_suporte, 3)
        corpo = api(agente_suporte).get(self.URL).json()
        assert isinstance(corpo, list) and len(corpo) == 3

    def test_limit_devolve_envelope(self, api, agente_suporte):
        self._visoes(agente_suporte, 5)
        corpo = api(agente_suporte).get(self.URL, {"limit": 2}).json()
        assert set(corpo) == {"count", "next", "previous", "results"}
        assert corpo["count"] == 5
        assert [v["name"] for v in corpo["results"]] == ["V0", "V1"]
        assert corpo["previous"] is None
        assert "offset=2" in corpo["next"]
        assert all("count" in v for v in corpo["results"])  # contagem de tickets segue

    def test_page_navega_e_os_links_usam_page(self, api, agente_suporte):
        self._visoes(agente_suporte, 5)
        c = api(agente_suporte)
        p2 = c.get(self.URL, {"page": 2, "limit": 2}).json()
        assert [v["name"] for v in p2["results"]] == ["V2", "V3"]
        assert "page=3" in p2["next"] and "page=1" in p2["previous"]
        p3 = c.get(self.URL, {"page": 3, "limit": 2}).json()
        assert [v["name"] for v in p3["results"]] == ["V4"]
        assert p3["next"] is None

    def test_page_sozinho_usa_tamanho_padrao_e_pagina_invalida_vira_a_primeira(
        self, api, agente_suporte
    ):
        self._visoes(agente_suporte, 2)
        corpo = api(agente_suporte).get(self.URL, {"page": "abc"}).json()
        assert corpo["count"] == 2 and len(corpo["results"]) == 2

    def test_isolamento_continua(self, api, agente_suporte, agente_financeiro):
        self._visoes(agente_financeiro, 3)
        corpo = api(agente_suporte).get(self.URL, {"limit": 10}).json()
        assert corpo["count"] == 0
