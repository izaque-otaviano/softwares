"""Apagar ticket (exclusão LÓGICA) e restaurar.

`DELETE /tickets/{id}/` e `POST /tickets/{id}/restore/` só para quem tem
`settings.manage`. O ticket some de listas, buscas, contadores, quadros,
relatórios, tarefas de fundo, avisos e e-mails; nada é removido do banco.
"""

import datetime as dt

import pytest
from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.chat.services import chat_service
from apps.kanban.models import Board
from apps.kanban.services import board_view
from apps.notifications.models import Notification, NotificationKind
from apps.tickets.models import (
    ScheduledReply,
    ScheduledReplyStatus,
    Ticket,
)
from apps.tickets.services import ticket_service

pytestmark = pytest.mark.django_db

URL = "/api/v1/tickets/"


@pytest.fixture
def ticket(ana, suporte, make_ticket):
    return make_ticket(requester=ana, team=suporte, subject="Pra apagar")


def _apagar(api, quem, ticket):
    return api(quem).delete(f"{URL}{ticket.pk}/")


class TestPermissao:
    def test_admin_apaga_204(self, api, admin, ticket):
        resp = _apagar(api, admin, ticket)
        assert resp.status_code == 204
        ticket = Ticket.all_objects.get(pk=ticket.pk)
        assert ticket.deleted_at is not None
        assert ticket.deleted_by_id == admin.pk

    @pytest.mark.parametrize("quem", ["agente_suporte", "supervisor", "agente_leve"])
    def test_interno_sem_settings_manage_403(self, request, api, ticket, quem):
        usuario = request.getfixturevalue(quem)
        assert _apagar(api, usuario, ticket).status_code == 403
        assert Ticket.objects.filter(pk=ticket.pk).exists()

    def test_cliente_403(self, api, ana, ticket):
        assert _apagar(api, ana, ticket).status_code == 403

    def test_anonimo_nao_apaga(self, ticket):
        from rest_framework.test import APIClient

        assert APIClient().delete(f"{URL}{ticket.pk}/").status_code in (401, 403)

    def test_inexistente_404(self, api, admin):
        assert api(admin).delete(f"{URL}999999/").status_code == 404

    def test_apagar_duas_vezes_404(self, api, admin, ticket):
        assert _apagar(api, admin, ticket).status_code == 204
        assert _apagar(api, admin, ticket).status_code == 404


class TestConflito:
    def test_horas_de_manutencao_lancadas_409(self, api, admin, ticket):
        agora = timezone.now()
        Ticket.objects.filter(pk=ticket.pk).update(
            resolution_started_at=agora - dt.timedelta(hours=2),
            resolution_ended_at=agora - dt.timedelta(hours=1),
        )
        resp = _apagar(api, admin, ticket)
        assert resp.status_code == 409
        assert resp.json()["code"] == "ticket_conflict"
        assert Ticket.objects.filter(pk=ticket.pk).exists()


class TestSomeDeTudo:
    def test_lista_busca_e_filtros(self, api, admin, agente_suporte, ana, ticket):
        _apagar(api, admin, ticket)
        for quem in (admin, agente_suporte, ana):
            ids = {r["id"] for r in api(quem).get(URL).json()["results"]}
            assert ticket.pk not in ids
            achou = api(quem).get(f"{URL}?q=Pra+apagar").json()["results"]
            assert achou == []
        assert api(admin).get(f"{URL}?requester={ana.pk}").json()["count"] == 0

    def test_get_por_id_404_para_nao_admin(self, api, admin, agente_suporte, ana, ticket):
        _apagar(api, admin, ticket)
        assert api(agente_suporte).get(f"{URL}{ticket.pk}/").status_code == 404
        assert api(ana).get(f"{URL}{ticket.pk}/").status_code == 404

    def test_get_por_id_admin_ve_apagado(self, api, admin, ticket):
        _apagar(api, admin, ticket)
        resp = api(admin).get(f"{URL}{ticket.pk}/")
        assert resp.status_code == 200
        corpo = resp.json()
        assert corpo["deleted_at"] is not None
        assert corpo["deleted_by_name"] == admin.full_name

    def test_ticket_vivo_tem_deleted_at_nulo(self, api, admin, ticket):
        corpo = api(admin).get(f"{URL}{ticket.pk}/").json()
        assert corpo["deleted_at"] is None
        assert corpo["deleted_by_name"] is None

    def test_acoes_do_ticket_apagado_404(self, api, admin, agente_suporte, ticket):
        _apagar(api, admin, ticket)
        url = f"{URL}{ticket.pk}/"
        assert api(agente_suporte).post(
            f"{url}reply/", {"body": "oi", "new_status": "open"}, format="json"
        ).status_code == 404
        assert api(agente_suporte).patch(url, {"priority": "high"}, format="json"
                                         ).status_code == 404
        assert api(agente_suporte).post(f"{url}follow/").status_code == 404

    def test_contadores_facets_e_resumo(self, api, admin, ticket):
        antes = api(admin).get(f"{URL}facets/").json()
        _apagar(api, admin, ticket)
        depois = api(admin).get(f"{URL}facets/").json()
        assert antes != depois
        assert api(admin).get(f"{URL}resumo/").status_code == 200
        total = sum(i["count"] for i in depois["status"])
        assert total == 0

    def test_feed_de_atividade(self, api, admin, ticket):
        _apagar(api, admin, ticket)
        itens = api(admin).get(f"{URL}atividade/").json()
        texto = str(itens)
        assert "Pra apagar" not in texto

    def test_relatorio(self, api, admin, ticket):
        base = "/api/v1/reports/tickets/"
        assert api(admin).get(base).json()["summary"]["total"] == 1
        _apagar(api, admin, ticket)
        assert api(admin).get(base).json()["summary"]["total"] == 0

    def test_quadro_kanban(self, admin, ticket, suporte):
        quadro = Board.objects.create(name="Q", slug="q", team=suporte)
        assert len(board_view.entries(quadro, admin)["entries"]) == 1
        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        assert board_view.entries(quadro, admin)["entries"] == []

    def test_manager_padrao_e_all_objects(self, admin, ticket, ana):
        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        assert not Ticket.objects.filter(pk=ticket.pk).exists()
        assert Ticket.all_objects.filter(pk=ticket.pk).exists()
        assert ana.requested_tickets.count() == 0
        assert ana.company.tickets.count() == 0

    def test_mensagens_e_historico_ficam(self, admin, ticket):
        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        t = Ticket.all_objects.get(pk=ticket.pk)
        assert t.messages.count() == 1
        assert t.status_events.filter(note="ticket apagado").exists()


class TestNaoVaza:
    def test_aviso_do_sino_some(self, api, admin, agente_suporte, ana, ticket):
        Notification.objects.create(
            recipient=agente_suporte, kind=list(NotificationKind.values)[0],
            title="Novo", body="Pra apagar", ticket=ticket,
        )
        antes = api(agente_suporte).get("/api/v1/notifications/").json()
        assert antes["unread_count"] == 1
        _apagar(api, admin, ticket)
        depois = api(agente_suporte).get("/api/v1/notifications/").json()
        assert depois["results"] == []
        assert depois["unread_count"] == 0

    def test_notify_de_ticket_apagado_nao_cria_aviso(self, admin, agente_suporte, ticket):
        from apps.notifications.services import notify

        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        ticket = Ticket.all_objects.get(pk=ticket.pk)
        kind = list(NotificationKind.values)[0]
        assert notify(recipient=agente_suporte, kind=kind, title="x", ticket=ticket) is None
        assert Notification.objects.count() == 0

    def test_email_na_fila_nao_sai(self, admin, ticket):
        from django.core import mail

        from apps.notifications.models import OutboundEmail
        from apps.notifications.tasks import send_outbound_email

        email = OutboundEmail.objects.create(
            to_email="x@y.test", subject="s", template="t", context={}, ticket=ticket
        )
        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        send_outbound_email(email.pk)
        email.refresh_from_db()
        assert email.status == OutboundEmail.Status.SKIPPED
        assert mail.outbox == []

    def test_queue_email_de_ticket_apagado_e_ignorado(self, admin, ticket):
        from apps.notifications.models import OutboundEmail
        from apps.notifications.services import queue_email

        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        ticket = Ticket.all_objects.get(pk=ticket.pk)
        antes = OutboundEmail.objects.count()
        assert queue_email(
            to="x@y.test", subject="s", template="t", context={}, ticket=ticket
        ) is None
        assert OutboundEmail.objects.count() == antes

    def test_websocket_so_avisa_no_ato_de_apagar(
        self, admin, agente_suporte, ana, ticket, monkeypatch
    ):
        from apps.notifications import services as notif

        enviados = []

        class Layer:
            async def group_send(self, grupo, msg):
                enviados.append((grupo, msg))

        monkeypatch.setattr(notif, "get_channel_layer", lambda: Layer())
        ticket_service.assign(ticket=ticket, assignee=agente_suporte, actor=admin)
        enviados.clear()
        # apagar: dica de id + kind, sem conteúdo, para quem acompanhava
        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(transaction, "on_commit", lambda fn: fn())
            ticket_service.delete_ticket(ticket=ticket, actor=admin)
            avisos = list(enviados)
            assert avisos, "quem acompanhava devia revalidar a lista"
            for _grupo, msg in avisos:
                assert set(msg) == {"type", "ticket_id", "kind"}
            enviados.clear()
            # depois de apagado, nada mais é empurrado
            apagado = Ticket.all_objects.get(pk=ticket.pk)
            notif.broadcast_ticket_event(ticket=apagado, kind="reply", actor=admin)
            assert enviados == []

    def test_resposta_agendada_pendente_e_cancelada(self, admin, agente_suporte, ticket):
        agendada = ticket_service.schedule_reply(
            ticket=ticket, actor=agente_suporte, body="depois", new_status="open",
            scheduled_at=timezone.now() + dt.timedelta(hours=1),
        )
        ticket_service.delete_ticket(ticket=ticket, actor=admin)
        agendada.refresh_from_db()
        assert agendada.status == ScheduledReplyStatus.CANCELLED
        assert ScheduledReply.objects.filter(status=ScheduledReplyStatus.PENDING).count() == 0


class TestAuditoria:
    def test_registra_quem_quando_e_assunto(self, api, admin, ticket):
        _apagar(api, admin, ticket)
        log = AuditLog.objects.get(object_id=str(ticket.pk), action="delete")
        assert log.actor_id == admin.pk
        assert log.changes["subject"] == "Pra apagar"
        assert log.changes["reference"] == ticket.reference
        assert log.changes["deleted_at"][0] is None and log.changes["deleted_at"][1]
        assert "Pra apagar" in log.summary

    def test_conflito_nao_audita(self, api, admin, ticket):
        agora = timezone.now()
        Ticket.objects.filter(pk=ticket.pk).update(
            resolution_started_at=agora - dt.timedelta(hours=2),
            resolution_ended_at=agora - dt.timedelta(hours=1),
        )
        _apagar(api, admin, ticket)
        assert not AuditLog.objects.filter(action="delete").exists()


class TestChatConvertido:
    def test_chat_continua_e_referencia_fica_nula(self, admin, agente_suporte, ana, suporte):
        chat, _ = chat_service.open_chat(client=ana)
        t = ticket_service.create_from_chat(chat=chat, team=suporte, actor=agente_suporte)
        assert t.origin_chat_id == chat.pk
        ticket_service.delete_ticket(ticket=t, actor=admin)
        chat.refresh_from_db()  # o chat continua existindo
        apagado = Ticket.all_objects.get(pk=t.pk)
        assert apagado.origin_chat_id is None
        assert apagado.deleted_origin_chat_id == chat.pk
        from apps.chat.models import Chat

        assert Chat.objects.filter(pk=chat.pk, generated_ticket__isnull=True).exists()

    def test_restaurar_religa_o_chat(self, admin, agente_suporte, ana, suporte):
        chat, _ = chat_service.open_chat(client=ana)
        t = ticket_service.create_from_chat(chat=chat, team=suporte, actor=agente_suporte)
        ticket_service.delete_ticket(ticket=t, actor=admin)
        restaurado = ticket_service.restore_ticket(
            ticket=Ticket.all_objects.get(pk=t.pk), actor=admin
        )
        restaurado.refresh_from_db()
        assert restaurado.origin_chat_id == chat.pk
        assert restaurado.deleted_origin_chat_id is None

    def test_restaurar_nao_religa_se_chat_foi_convertido_de_novo(
        self, admin, agente_suporte, ana, suporte
    ):
        chat, _ = chat_service.open_chat(client=ana)
        t = ticket_service.create_from_chat(chat=chat, team=suporte, actor=agente_suporte)
        ticket_service.delete_ticket(ticket=t, actor=admin)
        novo = ticket_service.create_from_chat(chat=chat, team=suporte, actor=agente_suporte)
        assert novo.pk != t.pk
        restaurado = ticket_service.restore_ticket(
            ticket=Ticket.all_objects.get(pk=t.pk), actor=admin
        )
        assert Ticket.objects.get(pk=restaurado.pk).origin_chat_id is None


class TestRestaurar:
    def test_restaura_e_volta_a_aparecer(self, api, admin, agente_suporte, ticket):
        _apagar(api, admin, ticket)
        resp = api(admin).post(f"{URL}{ticket.pk}/restore/")
        assert resp.status_code == 200, resp.content
        assert resp.json()["id"] == ticket.pk
        assert resp.json()["deleted_at"] is None
        assert api(agente_suporte).get(f"{URL}{ticket.pk}/").status_code == 200
        t = Ticket.objects.get(pk=ticket.pk)
        assert t.deleted_by_id is None
        log = AuditLog.objects.get(object_id=str(ticket.pk), action="update")
        assert log.actor_id == admin.pk
        assert "restaurado" in log.summary
        assert t.status_events.filter(note="ticket restaurado").exists()

    def test_depois_de_30_dias_409(self, api, admin, ticket):
        _apagar(api, admin, ticket)
        Ticket.all_objects.filter(pk=ticket.pk).update(
            deleted_at=timezone.now() - dt.timedelta(days=31)
        )
        resp = api(admin).post(f"{URL}{ticket.pk}/restore/")
        assert resp.status_code == 409
        assert not Ticket.objects.filter(pk=ticket.pk).exists()

    def test_no_limite_de_30_dias_ainda_restaura(self, api, admin, ticket):
        _apagar(api, admin, ticket)
        Ticket.all_objects.filter(pk=ticket.pk).update(
            deleted_at=timezone.now() - dt.timedelta(days=29, hours=23)
        )
        assert api(admin).post(f"{URL}{ticket.pk}/restore/").status_code == 200

    @pytest.mark.parametrize("quem", ["agente_suporte", "supervisor"])
    def test_sem_permissao_403(self, request, api, admin, ticket, quem):
        _apagar(api, admin, ticket)
        usuario = request.getfixturevalue(quem)
        assert api(usuario).post(f"{URL}{ticket.pk}/restore/").status_code == 403

    def test_cliente_403(self, api, admin, ana, ticket):
        _apagar(api, admin, ticket)
        assert api(ana).post(f"{URL}{ticket.pk}/restore/").status_code == 403

    def test_ticket_nao_apagado_404(self, api, admin, ticket):
        assert api(admin).post(f"{URL}{ticket.pk}/restore/").status_code == 404

    def test_inexistente_404(self, api, admin):
        assert api(admin).post(f"{URL}999999/restore/").status_code == 404
