"""`/settings/statuses/`: o PATCH respeita o que o DELETE já protegia (status de
fábrica), nome repetido é recusado e a categoria de um status em uso não troca."""

import pytest

from apps.tickets.models import TicketStage, TicketStatus

pytestmark = pytest.mark.django_db

URL = "/api/v1/settings/statuses/"


def _fabrica(categoria):
    return TicketStage.objects.get(category=categoria, is_system=True)


def _novo(nome="Em análise", categoria="open", **extra):
    return TicketStage.objects.create(
        name=nome, slug=nome.lower().replace(" ", "-").replace("á", "a"),
        category=categoria, color="#112233", order=10, **extra,
    )


class TestStatusDeFabrica:
    @pytest.mark.parametrize("categoria", [c for c, _ in TicketStatus.choices])
    def test_patch_nao_desativa(self, api, admin, categoria):
        stage = _fabrica(categoria)
        resp = api(admin).patch(f"{URL}{stage.pk}/", {"is_active": False}, format="json")
        assert resp.status_code == 400
        assert "fábrica" in str(resp.json())
        stage.refresh_from_db()
        assert stage.is_active

    def test_patch_nao_muda_categoria(self, api, admin):
        stage = _fabrica("new")
        resp = api(admin).patch(f"{URL}{stage.pk}/", {"category": "closed"}, format="json")
        assert resp.status_code == 400
        stage.refresh_from_db()
        assert stage.category == "new"

    def test_renomear_e_recolorir_continuam_permitidos(self, api, admin):
        stage = _fabrica("new")
        resp = api(admin).patch(
            f"{URL}{stage.pk}/", {"name": "Recebido", "color": "#010203"}, format="json"
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Recebido"

    def test_manter_ativo_com_is_active_true_passa(self, api, admin):
        stage = _fabrica("open")
        resp = api(admin).patch(f"{URL}{stage.pk}/", {"is_active": True}, format="json")
        assert resp.status_code == 200


class TestNomeRepetido:
    def test_criar_com_nome_repetido_sem_caixa_nem_acento_e_recusado(self, api, admin):
        _novo("Em análise")
        for nome in ("em analise", "EM ANÁLISE", "  Em   Análise "):
            resp = api(admin).post(URL, {"name": nome, "category": "open"}, format="json")
            assert resp.status_code == 400, nome
            assert "Já existe" in resp.json()["name"][0]

    def test_repetir_nome_de_status_de_fabrica_tambem(self, api, admin):
        resp = api(admin).post(URL, {"name": "aberto", "category": "open"}, format="json")
        assert resp.status_code == 400

    def test_renomear_para_nome_de_outro_e_recusado(self, api, admin):
        _novo("Em análise")
        outro = _novo("Triagem")
        resp = api(admin).patch(f"{URL}{outro.pk}/", {"name": "EM ANALISE"}, format="json")
        assert resp.status_code == 400

    def test_manter_o_proprio_nome_ou_mudar_so_a_caixa_passa(self, api, admin):
        stage = _novo("Em análise")
        assert api(admin).patch(
            f"{URL}{stage.pk}/", {"name": "Em análise", "color": "#445566"}, format="json"
        ).status_code == 200
        assert api(admin).patch(
            f"{URL}{stage.pk}/", {"name": "em análise"}, format="json"
        ).status_code == 200

    def test_nome_de_status_inativo_pode_ser_reaproveitado(self, api, admin):
        _novo("Antigo", is_active=False)
        resp = api(admin).post(URL, {"name": "Antigo", "category": "open"}, format="json")
        assert resp.status_code == 201

    def test_reativar_com_nome_ja_em_uso_e_recusado(self, api, admin):
        velho = _novo("Antigo", is_active=False)
        api(admin).post(URL, {"name": "Antigo", "category": "open"}, format="json")
        resp = api(admin).patch(f"{URL}{velho.pk}/", {"is_active": True}, format="json")
        assert resp.status_code == 400

    def test_dado_antigo_repetido_nao_trava_edicao_de_cor(self, api, admin):
        a = _novo("Dup")
        TicketStage.objects.create(
            name="dup", slug="dup-2", category="open", color="#000000", order=11,
        )
        resp = api(admin).patch(f"{URL}{a.pk}/", {"color": "#778899"}, format="json")
        assert resp.status_code == 200


class TestCategoriaDeStatusPersonalizado:
    def test_sem_chamados_pode_trocar(self, api, admin):
        stage = _novo("Em análise")
        resp = api(admin).patch(f"{URL}{stage.pk}/", {"category": "pending_customer"},
                                format="json")
        assert resp.status_code == 200
        assert resp.json()["category"] == "pending_customer"

    def test_com_chamados_e_recusado_com_a_contagem(
        self, api, admin, ana, suporte, make_ticket
    ):
        stage = _novo("Em análise")
        ticket = make_ticket(requester=ana, team=suporte)
        ticket.stage = stage
        ticket.status = "open"
        ticket.save(update_fields=["stage", "status"])
        resp = api(admin).patch(f"{URL}{stage.pk}/", {"category": "closed"}, format="json")
        assert resp.status_code == 400
        assert "1 chamado" in str(resp.json())
        stage.refresh_from_db()
        assert stage.category == "open"

    def test_mesma_categoria_com_chamados_nao_e_bloqueada(
        self, api, admin, ana, suporte, make_ticket
    ):
        stage = _novo("Em análise")
        ticket = make_ticket(requester=ana, team=suporte)
        ticket.stage = stage
        ticket.save(update_fields=["stage"])
        resp = api(admin).patch(
            f"{URL}{stage.pk}/", {"category": "open", "name": "Análise"}, format="json"
        )
        assert resp.status_code == 200
