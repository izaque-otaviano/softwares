"""Lote: janela de resolução POR TICKET no `bulk-close` e ids ausentes em
`failed[]` (opt-in com `report_missing`). O formato e o silêncio antigos
continuam o padrão — `test_bulk_actions.py` segue valendo sem mudança."""

import datetime as dt

import pytest
from django.utils import timezone

pytestmark = pytest.mark.django_db

CLOSE = "/api/v1/tickets/bulk-close/"


def _iso(d):
    return d.isoformat()


class TestBulkCloseItens:
    def test_cada_ticket_fecha_com_a_sua_janela(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t1 = make_ticket(requester=ana, team=suporte)
        t2 = make_ticket(requester=ana, team=suporte)
        fim = timezone.now()
        resp = api(agente_suporte).post(CLOSE, {"items": [
            {"id": t1.pk, "resolution_started_at": _iso(t1.created_at),
             "resolution_ended_at": _iso(fim)},
            {"id": t2.pk, "resolution_started_at": _iso(t2.created_at),
             "resolution_ended_at": _iso(fim),
             "note": "feito"},
        ]}, format="json")
        assert resp.status_code == 200, resp.json()
        assert set(resp.json()["updated"]) == {t1.pk, t2.pk}
        assert resp.json()["failed"] == []
        t1.refresh_from_db()
        t2.refresh_from_db()
        assert t1.resolution_started_at == t1.created_at
        assert t2.resolution_started_at == t2.created_at
        assert t1.resolution_started_at != t2.resolution_started_at

    def test_ticket_invalido_vai_para_failed_e_o_resto_fecha(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        """Janela de um ticket começando ANTES da criação dele: só ele falha."""
        velho = make_ticket(requester=ana, team=suporte)
        novo = make_ticket(requester=ana, team=suporte)
        fim = timezone.now()
        resp = api(agente_suporte).post(CLOSE, {"items": [
            {"id": velho.pk, "resolution_started_at": _iso(velho.created_at),
             "resolution_ended_at": _iso(fim)},
            {"id": novo.pk,
             "resolution_started_at": _iso(novo.created_at - dt.timedelta(days=1)),
             "resolution_ended_at": _iso(fim)},
        ]}, format="json")
        assert resp.status_code == 200
        corpo = resp.json()
        assert corpo["updated"] == [velho.pk]
        assert [f["id"] for f in corpo["failed"]] == [novo.pk]
        assert "anterior à criação" in corpo["failed"][0]["detail"]

    def test_item_mal_formado_ou_sem_janela_nao_derruba_o_lote(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        bom = make_ticket(requester=ana, team=suporte)
        sem_janela = make_ticket(requester=ana, team=suporte)
        fim = timezone.now()
        resp = api(agente_suporte).post(CLOSE, {"items": [
            {"id": bom.pk, "resolution_started_at": _iso(bom.created_at),
             "resolution_ended_at": _iso(fim)},
            {"id": sem_janela.pk},
            {"id": 999999, "resolution_started_at": "não é data",
             "resolution_ended_at": _iso(fim)},
        ]}, format="json")
        assert resp.status_code == 200
        corpo = resp.json()
        assert corpo["updated"] == [bom.pk]
        por_id = {f["id"]: f["detail"] for f in corpo["failed"]}
        assert "Fechar exige" in por_id[sem_janela.pk]
        assert "Item inválido" in por_id[999999]

    def test_janela_de_cima_e_o_padrao_dos_itens(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t1 = make_ticket(requester=ana, team=suporte)
        fim = timezone.now()
        resp = api(agente_suporte).post(CLOSE, {
            "resolution_started_at": _iso(t1.created_at),
            "resolution_ended_at": _iso(fim),
            "items": [{"id": t1.pk}],
        }, format="json")
        assert resp.json()["updated"] == [t1.pk]

    def test_items_e_ticket_ids_juntos_sao_400(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t1 = make_ticket(requester=ana, team=suporte)
        resp = api(agente_suporte).post(CLOSE, {
            "ticket_ids": [t1.pk], "items": [{"id": t1.pk}],
        }, format="json")
        assert resp.status_code == 400

    def test_formato_antigo_sem_janela_continua_400(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t1 = make_ticket(requester=ana, team=suporte)
        assert api(agente_suporte).post(
            CLOSE, {"ticket_ids": [t1.pk]}, format="json"
        ).status_code == 400
        assert api(agente_suporte).post(CLOSE, {}, format="json").status_code == 400

    def test_formato_antigo_com_um_ticket_invalido_nao_recusa_o_lote(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        """Janela única começando antes da criação de UM dos tickets: só esse
        falha — o outro (criado antes do início) fecha."""
        from apps.tickets.models import Ticket

        velho = make_ticket(requester=ana, team=suporte)
        novo = make_ticket(requester=ana, team=suporte)
        Ticket.objects.filter(pk=velho.pk).update(
            created_at=timezone.now() - dt.timedelta(hours=2)
        )
        resp = api(agente_suporte).post(CLOSE, {
            "ticket_ids": [velho.pk, novo.pk],
            "resolution_started_at": _iso(timezone.now() - dt.timedelta(hours=1)),
            "resolution_ended_at": _iso(timezone.now()),
        }, format="json")
        assert resp.status_code == 200
        assert resp.json()["updated"] == [velho.pk]
        assert [f["id"] for f in resp.json()["failed"]] == [novo.pk]


class TestIdsAusentesEmFailed:
    def test_padrao_continua_silencioso(
        self, api, agente_suporte, ana, suporte, financeiro, make_ticket
    ):
        meu = make_ticket(requester=ana, team=suporte)
        fora = make_ticket(requester=ana, team=financeiro)
        resp = api(agente_suporte).post("/api/v1/tickets/bulk-priority/", {
            "ticket_ids": [meu.pk, fora.pk, 999999], "priority": "urgent",
        }, format="json")
        assert resp.json() == {"updated": [meu.pk], "failed": []}

    @pytest.mark.parametrize("url,extra", [
        ("bulk-priority", {"priority": "urgent"}),
        ("bulk-assign", {"assignee_id": None}),
        ("bulk-status", {"stage_id": "__open__"}),
    ])
    def test_com_report_missing_inexistente_e_inacessivel_aparecem_igual(
        self, api, agente_suporte, ana, suporte, financeiro, make_ticket, url, extra
    ):
        from apps.tickets.models import TicketStage

        if extra.get("stage_id") == "__open__":
            extra = {"stage_id": TicketStage.objects.get(
                category="open", is_system=True).pk}
        meu = make_ticket(requester=ana, team=suporte)
        fora = make_ticket(requester=ana, team=financeiro)
        resp = api(agente_suporte).post(f"/api/v1/tickets/{url}/", {
            "ticket_ids": [meu.pk, fora.pk, 999999, 999999],
            "report_missing": True, **extra,
        }, format="json")
        assert resp.status_code == 200
        corpo = resp.json()
        assert corpo["updated"] == [meu.pk]
        # mesmo motivo para o que não existe e para o que não se vê (não vaza
        # existência), cada id uma só vez
        assert sorted(corpo["failed"], key=lambda f: f["id"]) == sorted(
            [{"id": fora.pk, "detail": "Ticket não encontrado."},
             {"id": 999999, "detail": "Ticket não encontrado."}],
            key=lambda f: f["id"],
        )

    def test_bulk_close_report_missing_nos_dois_formatos(
        self, api, agente_suporte, ana, suporte, make_ticket
    ):
        t1 = make_ticket(requester=ana, team=suporte)
        fim = timezone.now()
        resp = api(agente_suporte).post(CLOSE, {
            "items": [{"id": t1.pk, "resolution_started_at": _iso(t1.created_at),
                       "resolution_ended_at": _iso(fim)},
                      {"id": 999999, "resolution_started_at": _iso(t1.created_at),
                       "resolution_ended_at": _iso(fim)}],
            "report_missing": True,
        }, format="json")
        assert resp.json()["updated"] == [t1.pk]
        assert resp.json()["failed"] == [{"id": 999999, "detail": "Ticket não encontrado."}]
