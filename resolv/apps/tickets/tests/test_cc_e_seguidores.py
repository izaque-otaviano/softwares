"""CC de terceiros (e-mails) e seguidores de outras pessoas.

`/tickets/{id}/cc/` e `/tickets/{id}/followers/`: só equipe com
`ticket.edit_properties`. O CC recebe por e-mail as respostas PÚBLICAS (nunca
nota interna) e não ganha acesso; o seguidor cliente é contato da empresa do
ticket e recebe o aviso da resposta pública.
"""

import pytest
from django.core import mail

from apps.notifications.models import Notification, OutboundEmail
from apps.notifications.tasks import send_outbound_email
from apps.tickets.models import MAX_CC_POR_TICKET, TicketCC, TicketWatcher

pytestmark = pytest.mark.django_db

URL = "/api/v1/tickets/"


@pytest.fixture
def ticket(ana, suporte, make_ticket):
    return make_ticket(requester=ana, team=suporte, subject="Com cópia")


def _cc(api, quem, ticket, **corpo):
    return api(quem).post(f"{URL}{ticket.pk}/cc/", corpo, format="json")


def _seg(api, quem, ticket, user):
    return api(quem).post(f"{URL}{ticket.pk}/followers/", {"user_id": user.pk}, format="json")


class TestCC:
    def test_adiciona_normaliza_e_devolve_no_detalhe(self, api, agente_suporte, ticket):
        resp = _cc(api, agente_suporte, ticket, email="  Fulano@Exemplo.COM ", name="Fulano")
        assert resp.status_code == 201, resp.content
        cc = resp.json()["cc"]
        assert [(c["email"], c["name"]) for c in cc] == [("fulano@exemplo.com", "Fulano")]
        assert isinstance(cc[0]["id"], int)
        assert api(agente_suporte).get(f"{URL}{ticket.pk}/").json()["cc"] == cc

    def test_repetir_nao_duplica_e_devolve_200(self, api, agente_suporte, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        resp = _cc(api, agente_suporte, ticket, email="A@X.test")
        assert resp.status_code == 200
        assert len(resp.json()["cc"]) == 1
        assert TicketCC.objects.filter(ticket=ticket).count() == 1

    @pytest.mark.parametrize("valor", ["nao-e-email", "", "a@", "x" * 300 + "@y.test"])
    def test_email_invalido_400(self, api, agente_suporte, ticket, valor):
        assert _cc(api, agente_suporte, ticket, email=valor).status_code == 400

    def test_sem_email_400(self, api, agente_suporte, ticket):
        assert _cc(api, agente_suporte, ticket).status_code == 400

    def test_email_do_solicitante_400(self, api, agente_suporte, ana, ticket):
        resp = _cc(api, agente_suporte, ticket, email=ana.email.upper())
        assert resp.status_code == 400

    def test_limite_de_20(self, api, agente_suporte, ticket):
        for i in range(MAX_CC_POR_TICKET):
            assert _cc(api, agente_suporte, ticket, email=f"p{i}@x.test").status_code == 201
        resp = _cc(api, agente_suporte, ticket, email="extra@x.test")
        assert resp.status_code == 400
        assert str(MAX_CC_POR_TICKET) in str(resp.json())
        # repetir um que já existe continua valendo, mesmo no limite
        assert _cc(api, agente_suporte, ticket, email="p0@x.test").status_code == 200

    def test_lista_e_remove(self, api, agente_suporte, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        _cc(api, agente_suporte, ticket, email="b@x.test")
        lista = api(agente_suporte).get(f"{URL}{ticket.pk}/cc/").json()
        assert [c["email"] for c in lista] == ["a@x.test", "b@x.test"]
        resp = api(agente_suporte).delete(f"{URL}{ticket.pk}/cc/{lista[0]['id']}/")
        assert resp.status_code == 200
        assert [c["email"] for c in resp.json()["cc"]] == ["b@x.test"]

    def test_remover_inexistente_404(self, api, agente_suporte, ticket):
        assert api(agente_suporte).delete(f"{URL}{ticket.pk}/cc/9999/").status_code == 404

    def test_nao_remove_cc_de_outro_ticket(self, api, agente_suporte, ana, suporte,
                                           make_ticket, ticket):
        outro = make_ticket(requester=ana, team=suporte, subject="Outro")
        _cc(api, agente_suporte, outro, email="a@x.test")
        cc_id = TicketCC.objects.get(ticket=outro).pk
        assert api(agente_suporte).delete(f"{URL}{ticket.pk}/cc/{cc_id}/").status_code == 404
        assert TicketCC.objects.filter(pk=cc_id).exists()

    def test_ticket_inexistente_404(self, api, agente_suporte):
        assert api(agente_suporte).post(
            f"{URL}999999/cc/", {"email": "a@x.test"}, format="json"
        ).status_code == 404

    def test_ticket_fora_do_escopo_404(self, api, agente_suporte, ana, financeiro, make_ticket):
        restrito = make_ticket(requester=ana, team=financeiro)
        assert _cc(api, agente_suporte, restrito, email="a@x.test").status_code == 404

    def test_cliente_403(self, api, ana, ticket):
        assert _cc(api, ana, ticket, email="a@x.test").status_code == 403
        assert api(ana).get(f"{URL}{ticket.pk}/cc/").status_code == 403

    def test_agente_leve_sem_permissao_403(self, api, agente_leve, ticket):
        assert _cc(api, agente_leve, ticket, email="a@x.test").status_code == 403

    def test_cliente_nao_ve_a_lista_no_detalhe(self, api, agente_suporte, ana, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        corpo = api(ana).get(f"{URL}{ticket.pk}/").json()
        assert corpo["cc"] == [] and corpo["followers"] == []

    def test_auditado_no_historico(self, api, agente_suporte, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        cc_id = TicketCC.objects.get().pk
        api(agente_suporte).delete(f"{URL}{ticket.pk}/cc/{cc_id}/")
        notas = list(ticket.status_events.order_by("created_at").values_list("note", flat=True))
        assert "cc + a@x.test" in notas and "cc − a@x.test" in notas
        evento = ticket.status_events.get(note="cc + a@x.test")
        assert evento.changed_by_id == agente_suporte.pk

    def test_cc_nao_cria_usuario_nem_acesso(self, api, agente_suporte, ticket):
        from apps.accounts.models import User

        antes = User.objects.count()
        _cc(api, agente_suporte, ticket, email="externo@x.test")
        assert User.objects.count() == antes
        assert not User.objects.filter(email="externo@x.test").exists()


class TestEnvioDoCC:
    def _resposta(self, api, quem, ticket, publica=True):
        corpo = {"body": "Texto da resposta", "is_public": publica}
        if publica:
            corpo["new_status"] = "open"
        resp = api(quem).post(f"{URL}{ticket.pk}/reply/", corpo, format="json")
        assert resp.status_code in (200, 201), resp.content
        return resp

    def test_resposta_publica_vai_para_o_cc(self, api, agente_suporte, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test", name="Alice")
        _cc(api, agente_suporte, ticket, email="b@x.test")
        self._resposta(api, agente_suporte, ticket)
        fila = OutboundEmail.objects.filter(template="ticket_replied_cc")
        # um e-mail por endereço
        assert sorted(fila.values_list("to_email", flat=True)) == ["a@x.test", "b@x.test"]
        for e in fila:
            send_outbound_email(e.pk)  # o molde renderiza sem marcador faltando
        enviados = {m.to[0]: m for m in mail.outbox if m.to[0] in ("a@x.test", "b@x.test")}
        assert set(enviados) == {"a@x.test", "b@x.test"}
        assert "Texto da resposta" in enviados["a@x.test"].body
        assert "Alice" in enviados["a@x.test"].body
        assert ticket.reference in enviados["a@x.test"].subject

    def test_nota_interna_nunca_vai_para_o_cc(self, api, agente_suporte, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        self._resposta(api, agente_suporte, ticket, publica=False)
        assert not OutboundEmail.objects.filter(template="ticket_replied_cc").exists()
        assert not OutboundEmail.objects.filter(to_email="a@x.test").exists()

    def test_resposta_do_cliente_nao_dispara_cc(self, api, agente_suporte, ana, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        api(ana).post(f"{URL}{ticket.pk}/reply/", {"body": "oi"}, format="json")
        assert not OutboundEmail.objects.filter(template="ticket_replied_cc").exists()

    def test_removido_nao_recebe(self, api, agente_suporte, ticket):
        _cc(api, agente_suporte, ticket, email="a@x.test")
        api(agente_suporte).delete(f"{URL}{ticket.pk}/cc/{TicketCC.objects.get().pk}/")
        self._resposta(api, agente_suporte, ticket)
        assert not OutboundEmail.objects.filter(template="ticket_replied_cc").exists()

    def test_ticket_restrito_nao_manda_o_texto(self, api, supervisor, ana, financeiro,
                                                make_ticket):
        restrito = make_ticket(requester=ana, team=financeiro)
        _cc(api, supervisor, restrito, email="a@x.test")
        self._resposta(api, supervisor, restrito)
        e = OutboundEmail.objects.get(template="ticket_replied_cc", to_email="a@x.test")
        send_outbound_email(e.pk)
        m = next(m for m in mail.outbox if m.to[0] == "a@x.test")
        assert "Texto da resposta" not in m.body


class TestSeguidores:
    def test_cliente_da_mesma_empresa_segue(self, api, agente_suporte, beto, ticket):
        resp = _seg(api, agente_suporte, ticket, beto)
        assert resp.status_code == 201, resp.content
        seg = resp.json()["followers"]
        assert seg == [{"id": beto.pk, "name": beto.full_name, "email": beto.email,
                        "is_internal": False}]
        # o campo antigo continua igual (sem e-mail)
        assert resp.json()["watchers"] == [{"id": beto.pk, "name": beto.full_name}]

    def test_interno_tambem_pode(self, api, agente_suporte, admin, ticket):
        resp = _seg(api, agente_suporte, ticket, admin)
        assert resp.status_code == 201
        assert resp.json()["followers"][0]["is_internal"] is True

    def test_repetir_e_idempotente(self, api, agente_suporte, beto, ticket):
        _seg(api, agente_suporte, ticket, beto)
        resp = _seg(api, agente_suporte, ticket, beto)
        assert resp.status_code == 200
        assert TicketWatcher.objects.filter(ticket=ticket).count() == 1

    def test_cliente_de_outra_empresa_400(self, api, agente_suporte, carla, ticket):
        assert _seg(api, agente_suporte, ticket, carla).status_code == 400
        assert not TicketWatcher.objects.filter(ticket=ticket).exists()

    def test_solicitante_400(self, api, agente_suporte, ana, ticket):
        assert _seg(api, agente_suporte, ticket, ana).status_code == 400

    def test_usuario_inativo_400(self, api, agente_suporte, beto, ticket):
        beto.is_active = False
        beto.save()
        assert _seg(api, agente_suporte, ticket, beto).status_code == 400

    def test_usuario_inexistente_400(self, api, agente_suporte, ticket):
        resp = api(agente_suporte).post(
            f"{URL}{ticket.pk}/followers/", {"user_id": 999999}, format="json"
        )
        assert resp.status_code == 400

    def test_sem_user_id_400(self, api, agente_suporte, ticket):
        assert api(agente_suporte).post(
            f"{URL}{ticket.pk}/followers/", {}, format="json"
        ).status_code == 400

    def test_lista_e_remove(self, api, agente_suporte, beto, olga, ticket):
        _seg(api, agente_suporte, ticket, beto)
        _seg(api, agente_suporte, ticket, olga)
        lista = api(agente_suporte).get(f"{URL}{ticket.pk}/followers/").json()
        assert {s["id"] for s in lista} == {beto.pk, olga.pk}
        resp = api(agente_suporte).delete(f"{URL}{ticket.pk}/followers/{beto.pk}/")
        assert resp.status_code == 200
        assert [s["id"] for s in resp.json()["followers"]] == [olga.pk]

    def test_remover_quem_nao_segue_404(self, api, agente_suporte, beto, ticket):
        assert api(agente_suporte).delete(
            f"{URL}{ticket.pk}/followers/{beto.pk}/"
        ).status_code == 404

    def test_ticket_inexistente_404(self, api, agente_suporte, beto):
        assert api(agente_suporte).post(
            f"{URL}999999/followers/", {"user_id": beto.pk}, format="json"
        ).status_code == 404

    def test_permissoes(self, api, ana, agente_leve, beto, ticket):
        assert _seg(api, ana, ticket, beto).status_code == 403
        assert _seg(api, agente_leve, ticket, beto).status_code == 403
        assert api(ana).get(f"{URL}{ticket.pk}/followers/").status_code == 403

    def test_auditado_no_historico(self, api, agente_suporte, beto, ticket):
        _seg(api, agente_suporte, ticket, beto)
        api(agente_suporte).delete(f"{URL}{ticket.pk}/followers/{beto.pk}/")
        notas = list(ticket.status_events.values_list("note", flat=True))
        assert f"seguidor + {beto.full_name}" in notas
        assert f"seguidor − {beto.full_name}" in notas

    def test_seguir_nao_da_acesso_a_ticket_restrito(self, api, supervisor, ana, beto,
                                                     financeiro, make_ticket):
        restrito = make_ticket(requester=ana, team=financeiro)
        assert _seg(api, supervisor, restrito, beto).status_code == 201
        corpo = api(beto).get(f"{URL}{restrito.pk}/").json()
        assert corpo["content_hidden"] is True and corpo["messages"] == []

    def test_seguidor_cliente_recebe_aviso_da_resposta_publica(
        self, api, agente_suporte, beto, ticket
    ):
        _seg(api, agente_suporte, ticket, beto)
        api(agente_suporte).post(
            f"{URL}{ticket.pk}/reply/", {"body": "Olá", "new_status": "open"}, format="json"
        )
        assert Notification.objects.filter(recipient=beto, ticket=ticket).exists()
        assert OutboundEmail.objects.filter(to_email=beto.email, ticket=ticket).exists()

    def test_seguidor_nao_recebe_nota_interna(self, api, agente_suporte, beto, ticket):
        _seg(api, agente_suporte, ticket, beto)
        api(agente_suporte).post(
            f"{URL}{ticket.pk}/reply/", {"body": "interno", "is_public": False}, format="json"
        )
        assert not Notification.objects.filter(recipient=beto).exists()
        assert not OutboundEmail.objects.filter(to_email=beto.email).exists()
