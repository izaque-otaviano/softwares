"""Coluna (stage) ao fechar e ao reabrir.

- `close/` e `reply` com `new_status:closed` aceitam um `stage` PERSONALIZADO da
  categoria fechada (antes: sempre o "Fechado" de fábrica, inalcançável o resto);
- reabrir leva a coluna para a da categoria nova (a de fábrica ativa ou a
  escolhida) — nunca deixa `open` com a coluna "Fechado" (caso TD-00005);
- `reparar_stages_incoerentes` conserta dado antigo incoerente.
"""


import pytest
from django.utils import timezone

from apps.tickets.models import Ticket, TicketStage, TicketStatus
from apps.tickets.services import ticket_service
from apps.tickets.services.reparo_stages import reparar_stages_incoerentes

pytestmark = pytest.mark.django_db


def _stage(nome, categoria, **extra):
    return TicketStage.objects.create(
        name=nome, slug=nome.lower().replace(" ", "-"), category=categoria,
        color="#123456", order=30, **extra,
    )


def _fabrica(categoria):
    return TicketStage.objects.get(category=categoria, is_system=True)


def _janela(ticket):
    return {
        "resolution_started_at": ticket.created_at.isoformat(),
        "resolution_ended_at": timezone.now().isoformat(),
    }


def _fechar_direto(ticket, agente, stage=None):
    return ticket_service.close_ticket(
        ticket=ticket, actor=agente, resolution_started_at=ticket.created_at,
        resolution_ended_at=timezone.now(), stage=stage,
    )


class TestFecharComStagePersonalizado:
    def test_close_usa_o_stage_escolhido(self, api, make_ticket, ana, suporte, agente_suporte):
        resolvido = _stage("Resolvido", "closed")
        ticket = make_ticket(ana, suporte)
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/close/",
            {**_janela(ticket), "stage": resolvido.pk}, format="json",
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["status"] == "closed"
        assert resp.json()["stage"] == resolvido.pk
        assert resp.json()["stage_name"] == "Resolvido"

    def test_close_sem_stage_continua_no_fechado_de_fabrica(
        self, api, make_ticket, ana, suporte, agente_suporte
    ):
        _stage("Resolvido", "closed")
        ticket = make_ticket(ana, suporte)
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/close/", _janela(ticket), format="json",
        )
        assert resp.status_code == 200
        assert resp.json()["stage"] == _fabrica("closed").pk

    def test_reply_closed_usa_o_stage_escolhido(
        self, api, make_ticket, ana, suporte, agente_suporte
    ):
        cancelado = _stage("Cancelado", "closed")
        ticket = make_ticket(ana, suporte)
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "Cancelado a pedido.", "new_status": "closed",
             "stage": cancelado.pk, **_janela(ticket)}, format="json",
        )
        assert resp.status_code == 201, resp.json()
        assert resp.json()["stage_name"] == "Cancelado"
        assert resp.json()["status"] == "closed"

    @pytest.mark.parametrize("como", ["inativo", "outra_categoria"])
    def test_stage_invalido_e_400_e_nada_muda(
        self, api, make_ticket, ana, suporte, agente_suporte, como
    ):
        stage = (_stage("Velho", "closed", is_active=False) if como == "inativo"
                 else _stage("Em análise", "open"))
        ticket = make_ticket(ana, suporte)
        for url, extra in (
            ("close", {}),
            ("reply", {"body": "x", "new_status": "closed"}),
        ):
            resp = api(agente_suporte).post(
                f"/api/v1/tickets/{ticket.pk}/{url}/",
                {**_janela(ticket), **extra, "stage": stage.pk}, format="json",
            )
            assert resp.status_code == 400, (url, resp.json())
        ticket.refresh_from_db()
        assert ticket.status == "new"
        assert ticket.messages.count() == 1  # a resposta recusada não deixou rastro

    def test_stage_em_nota_interna_ou_sem_new_status_e_recusado(
        self, api, make_ticket, ana, suporte, agente_suporte
    ):
        resolvido = _stage("Resolvido", "closed")
        ticket = make_ticket(ana, suporte)
        r1 = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "x", "is_public": False, "stage": resolvido.pk}, format="json")
        r2 = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "x", "stage": resolvido.pk}, format="json")
        assert r1.status_code == 400 and r2.status_code == 400


class TestReabrir:
    def test_reabrir_por_resposta_vai_para_a_coluna_aberto(
        self, api, make_ticket, ana, suporte, agente_suporte
    ):
        ticket = make_ticket(ana, suporte)
        _fechar_direto(ticket, agente_suporte, _stage("Resolvido", "closed"))
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "Voltou.", "new_status": "open"}, format="json",
        )
        assert resp.status_code == 201, resp.json()
        corpo = resp.json()
        assert corpo["status"] == "open"
        assert corpo["stage"] == _fabrica("open").pk
        assert corpo["stage_name"] == "Aberto"

    def test_reabrir_com_stage_escolhido(self, api, make_ticket, ana, suporte, agente_suporte):
        analise = _stage("Em análise", "open")
        ticket = make_ticket(ana, suporte)
        _fechar_direto(ticket, agente_suporte)
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "Voltou.", "new_status": "open", "stage": analise.pk}, format="json",
        )
        assert resp.status_code == 201
        assert resp.json()["stage_name"] == "Em análise"

    def test_reabrir_para_pendente_usa_a_coluna_pendente(
        self, api, make_ticket, ana, suporte, agente_suporte
    ):
        ticket = make_ticket(ana, suporte)
        _fechar_direto(ticket, agente_suporte)
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "Aguardo.", "new_status": "pending_customer"}, format="json",
        )
        assert resp.json()["stage"] == _fabrica("pending_customer").pk

    def test_stage_de_outra_categoria_ao_reabrir_e_400(
        self, api, make_ticket, ana, suporte, agente_suporte
    ):
        ticket = make_ticket(ana, suporte)
        _fechar_direto(ticket, agente_suporte)
        resp = api(agente_suporte).post(
            f"/api/v1/tickets/{ticket.pk}/reply/",
            {"body": "x", "new_status": "open", "stage": _fabrica("closed").pk},
            format="json",
        )
        assert resp.status_code == 400
        ticket.refresh_from_db()
        assert ticket.status == "closed"

    def test_cliente_reabrindo_tambem_sai_da_coluna_fechado(
        self, make_ticket, ana, suporte, agente_suporte
    ):
        ticket = make_ticket(ana, suporte)
        _fechar_direto(ticket, agente_suporte, _stage("Resolvido", "closed"))
        ticket_service.add_reply(ticket=ticket, author=ana, body="Ainda falha.")
        ticket.refresh_from_db()
        assert ticket.status == "open"
        assert ticket.stage.category == "open"

    def test_coluna_padrao_prefere_o_status_de_fabrica_ativo(self):
        fab = _fabrica("open")
        TicketStage.objects.filter(pk=fab.pk).update(is_active=False)
        extra = TicketStage.objects.create(
            name="Aberto 2", slug="aberto-2", category="open", color="#000000",
            order=40, is_system=True, is_active=True,
        )
        assert ticket_service.stage_padrao("open").pk == extra.pk

    def test_invariante_status_e_coluna_em_todo_o_ciclo(
        self, make_ticket, ana, suporte, agente_suporte
    ):
        ticket = make_ticket(ana, suporte)
        passos = [
            lambda t: ticket_service.add_reply(
                ticket=t, author=agente_suporte, body="a", new_status="open"),
            lambda t: ticket_service.add_reply(
                ticket=t, author=agente_suporte, body="b", new_status="pending_customer"),
            lambda t: ticket_service.add_reply(
                ticket=t, author=ana, body="c"),
            lambda t: _fechar_direto(t, agente_suporte),
            lambda t: ticket_service.add_reply(
                ticket=t, author=ana, body="d"),
            lambda t: _fechar_direto(t, agente_suporte),
            lambda t: ticket_service.add_reply(
                ticket=t, author=agente_suporte, body="e", new_status="open"),
        ]
        for passo in passos:
            passo(ticket)
            ticket.refresh_from_db()
            assert ticket.stage.category == ticket.status


class TestReparo:
    def test_conserta_aberto_com_coluna_fechado_e_e_idempotente(
        self, make_ticket, ana, suporte
    ):
        ticket = make_ticket(ana, suporte)
        Ticket.objects.filter(pk=ticket.pk).update(
            status=TicketStatus.OPEN, stage=_fabrica("closed"),
        )
        bom = make_ticket(ana, suporte)  # novo/novo: não pode ser tocado

        assert reparar_stages_incoerentes(dry_run=True) == {"open": 1}
        ticket.refresh_from_db()
        assert ticket.stage.category == "closed"  # dry-run não grava

        assert reparar_stages_incoerentes() == {"open": 1}
        ticket.refresh_from_db()
        bom.refresh_from_db()
        assert ticket.stage_id == _fabrica("open").pk
        assert bom.stage_id == _fabrica("new").pk
        assert reparar_stages_incoerentes() == {}

    def test_comando_de_manutencao(self, make_ticket, ana, suporte, capsys):
        from django.core.management import call_command

        ticket = make_ticket(ana, suporte)
        Ticket.objects.filter(pk=ticket.pk).update(
            status=TicketStatus.PENDING_CUSTOMER, stage=_fabrica("closed"),
        )
        call_command("reparar_stages", "--dry-run")
        assert "pending_customer: 1 seriam corrigidos" in capsys.readouterr().out
        call_command("reparar_stages")
        ticket.refresh_from_db()
        assert ticket.stage_id == _fabrica("pending_customer").pk
        call_command("reparar_stages")
        assert "Nenhum" in capsys.readouterr().out

    def test_migracao_de_dados_repara_e_volta_sem_erro(self, make_ticket, ana, suporte):
        import importlib

        from django.apps import apps as django_apps

        mod = importlib.import_module("apps.tickets.migrations.0030_reparar_stage_incoerente")
        ticket = make_ticket(ana, suporte)
        Ticket.objects.filter(pk=ticket.pk).update(
            status=TicketStatus.OPEN, stage=_fabrica("closed"),
        )
        mod.reparar(django_apps, None)
        ticket.refresh_from_db()
        assert ticket.stage_id == _fabrica("open").pk
