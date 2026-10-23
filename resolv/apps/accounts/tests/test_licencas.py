"""Licenças de agente: contagem, rota, bloqueio e corrida."""

import pytest

from apps.accounts import licenses
from apps.accounts.models import InternalRole, SeatLicense, User, UserKind
from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db

URL = "/api/v1/settings/licenses/"
USERS = "/api/v1/settings/users/"


def _limite(n):
    SeatLicense.objects.update_or_create(pk=1, defaults={"agent_seat_limit": n})


def _novo_agente(api, admin, email="novo@x.test", **extra):
    return api(admin).post(USERS, {
        "email": email, "full_name": "Novo", "kind": "internal",
        "internal_role": "agent", **extra,
    }, format="json")


class TestContagem:
    def test_sem_limite_e_ilimitado(self, api, admin, agente_suporte):
        r = api(admin).get(URL)
        assert r.status_code == 200
        assert r.json() == {"total": None, "used": 2, "available": None, "unlimited": True}

    def test_so_admin_supervisor_e_agente_ativos_contam(
        self, api, admin, supervisor, agente_suporte, agente_leve, ana
    ):
        inativo = User.objects.create_user(
            email="off@x.test", full_name="Off", kind=UserKind.INTERNAL,
            internal_role=InternalRole.AGENT, is_active=False,
        )
        assert inativo.is_active is False
        _limite(10)
        r = api(admin).get(URL).json()
        # admin + supervisor + agente; leve, cliente e inativo ficam de fora
        assert r == {"total": 10, "used": 3, "available": 7, "unlimited": False}

    def test_padrao_do_ambiente_quando_banco_vazio(self, api, admin, settings):
        settings.AGENT_SEAT_LIMIT = 4
        assert api(admin).get(URL).json()["total"] == 4
        _limite(9)  # o banco tem precedência
        assert api(admin).get(URL).json()["total"] == 9


class TestPermissao:
    def test_agente_le_mas_nao_altera(self, api, agente_suporte):
        assert api(agente_suporte).get(URL).status_code == 200
        assert api(agente_suporte).patch(URL, {"total": 5}, format="json").status_code == 403

    def test_cliente_nao_acessa(self, api, ana):
        assert api(ana).get(URL).status_code == 403

    def test_anonimo_recusado(self):
        from rest_framework.test import APIClient

        assert APIClient().get(URL).status_code in (401, 403)


class TestAlterarTotal:
    def test_admin_define_e_audita(self, api, admin):
        r = api(admin).patch(URL, {"total": 5}, format="json")
        assert r.status_code == 200
        assert r.json()["total"] == 5
        assert SeatLicense.objects.get(pk=1).agent_seat_limit == 5
        log = AuditLog.objects.get(summary__contains="licenças")
        assert log.changes == {"agent_seat_limit": [None, 5]}

    def test_put_funciona_e_null_remove_limite(self, api, admin):
        api(admin).put(URL, {"total": 5}, format="json")
        r = api(admin).put(URL, {"total": None}, format="json")
        assert r.json()["unlimited"] is True

    def test_nao_pode_ficar_abaixo_do_usado(self, api, admin, agente_suporte):
        r = api(admin).patch(URL, {"total": 1}, format="json")
        assert r.status_code == 400
        assert r.json()["code"] == "seat_total_below_used"
        assert "2" in r.json()["detail"]
        assert api(admin).patch(URL, {"total": 2}, format="json").status_code == 200

    @pytest.mark.parametrize("corpo", [{}, {"total": -1}, {"total": "abc"}, {"total": 1.5}])
    def test_validacao(self, api, admin, corpo):
        assert api(admin).patch(URL, corpo, format="json").status_code == 400


class TestBloqueio:
    def test_criar_agente_no_limite_da_409(self, api, admin):
        _limite(1)  # só o admin já ocupa
        r = _novo_agente(api, admin)
        assert r.status_code == 409
        assert r.json()["code"] == "seat_limit_reached"
        assert "limite de licenças" in r.json()["detail"]
        assert not User.objects.filter(email="novo@x.test").exists()

    def test_criar_com_vaga_funciona(self, api, admin):
        _limite(2)
        assert _novo_agente(api, admin).status_code == 201
        assert _novo_agente(api, admin, email="outro@x.test").status_code == 409

    def test_agente_leve_e_cliente_nao_consomem(self, api, admin, acme):
        _limite(1)
        leve = api(admin).post(USERS, {
            "email": "l@x.test", "full_name": "L", "kind": "internal",
            "internal_role": "light_agent",
        }, format="json")
        assert leve.status_code == 201
        cli = api(admin).post(USERS, {
            "email": "c@x.test", "full_name": "C", "kind": "client",
            "company": acme.pk, "client_role": "member", "phone": "11999990000",
        }, format="json")
        assert cli.status_code == 201

    def test_criar_ja_inativo_nao_consome(self, api, admin):
        _limite(1)
        assert _novo_agente(api, admin, is_active=False).status_code == 201

    def test_reativar_agente(self, api, admin):
        inativo = User.objects.create_user(
            email="off@x.test", full_name="Off", kind=UserKind.INTERNAL,
            internal_role=InternalRole.AGENT, is_active=False,
        )
        _limite(1)
        r = api(admin).patch(f"{USERS}{inativo.pk}/", {"is_active": True}, format="json")
        assert r.status_code == 409 and r.json()["code"] == "seat_limit_reached"
        _limite(2)
        assert api(admin).patch(
            f"{USERS}{inativo.pk}/", {"is_active": True}, format="json"
        ).status_code == 200

    def test_leve_vira_agente_conta(self, api, admin, agente_leve):
        _limite(1)
        r = api(admin).patch(
            f"{USERS}{agente_leve.pk}/", {"internal_role": "agent"}, format="json"
        )
        assert r.status_code == 409

    def test_editar_quem_ja_ocupa_nao_bloqueia(self, api, admin, agente_suporte):
        _limite(2)  # cheio
        r = api(admin).patch(f"{USERS}{agente_suporte.pk}/", {"job_title": "N2"}, format="json")
        assert r.status_code == 200

    def test_trocar_agente_por_supervisor_nao_bloqueia(self, api, admin, agente_suporte):
        _limite(2)
        r = api(admin).patch(
            f"{USERS}{agente_suporte.pk}/", {"internal_role": "supervisor"}, format="json"
        )
        assert r.status_code == 200

    def test_cliente_para_agente_nao_e_possivel_sem_empresa_mas_conta_se_for(
        self, api, admin, ana
    ):
        """Cliente -> interno exige tirar a empresa; se passar, ocupa assento."""
        _limite(1)
        r = api(admin).patch(
            f"{USERS}{ana.pk}/",
            {"kind": "internal", "company": None, "client_role": None,
             "internal_role": "agent"},
            format="json",
        )
        assert r.status_code == 409

    def test_adicionar_agente_pela_equipe(self, api, admin, suporte):
        _limite(1)
        r = api(admin).post(
            f"/api/v1/settings/teams/{suporte.pk}/agents/",
            {"email": "t@x.test", "full_name": "T"}, format="json",
        )
        assert r.status_code == 409
        assert r.json()["code"] == "seat_limit_reached"

    def test_desativar_libera_vaga(self, api, admin, agente_suporte):
        _limite(2)
        assert api(admin).delete(f"{USERS}{agente_suporte.pk}/").status_code == 204
        assert _novo_agente(api, admin).status_code == 201


class TestServico:
    def test_reservar_exige_transacao(self):
        # pytest-django envolve o teste em atomic, então simulamos o caso sem ela
        from unittest import mock

        with mock.patch("apps.accounts.licenses.transaction.get_connection") as gc:
            gc.return_value.in_atomic_block = False
            with pytest.raises(RuntimeError):
                licenses.reservar_assento()

    def test_login_social_novo_sem_vaga(self, admin):
        _limite(1)
        assert licenses.pode_entrar_agente_novo() is False
        _limite(None)
        assert licenses.pode_entrar_agente_novo() is True


@pytest.mark.django_db(transaction=True)
def test_corrida_nao_fura_o_limite(admin):
    """Duas criações simultâneas com UMA vaga: só uma passa."""
    import threading

    from django.db import connection, transaction

    _limite(2)
    resultados = []

    def criar(email):
        try:
            with transaction.atomic():
                licenses.reservar_assento()
                User.objects.create_user(
                    email=email, full_name=email, kind=UserKind.INTERNAL,
                    internal_role=InternalRole.AGENT,
                )
            resultados.append("ok")
        except licenses.SeatLimitReached:
            resultados.append("bloqueado")
        finally:
            connection.close()

    ts = [threading.Thread(target=criar, args=(f"c{i}@x.test",)) for i in range(2)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert sorted(resultados) == ["bloqueado", "ok"]
    assert licenses.seats_used() == 2
