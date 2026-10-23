"""Resumo de ticket por IA: mascaramento, truncamento, 503, permissão, auditoria.

O provedor é sempre simulado — nenhum teste faz chamada de rede."""

import pytest

from apps.audit.models import AuditLog
from apps.tickets import ai_summary
from apps.tickets.models import TicketMessage

pytestmark = pytest.mark.django_db


class FakeProvider:
    name = "fake"
    model = "fake-1"

    def __init__(self, resposta="Resumo pronto.", erro=None):
        self.recebido = None
        self._resposta = resposta
        self._erro = erro

    def summarize(self, transcript):
        self.recebido = transcript
        if self._erro:
            raise self._erro
        return self._resposta


@pytest.fixture
def provedor(monkeypatch):
    p = FakeProvider()
    monkeypatch.setattr(ai_summary, "get_provider", lambda: p)
    return p


@pytest.fixture
def ticket(make_ticket, ana, suporte):
    return make_ticket(ana, suporte, subject="Erro ao emitir nota", body="Olá, falha na NF.")


def url(t):
    return f"/api/v1/tickets/{t.pk}/ai-summary/"


class TestMascaramento:
    @pytest.mark.parametrize("texto,marcador", [
        ("fale com joao.silva+x@empresa.com.br hoje", "[e-mail]"),
        ("CPF 123.456.789-09 ok", "[CPF]"),
        ("cpf 12345678909 ok", "[CPF]"),
        ("CNPJ 12.345.678/0001-95 ok", "[CNPJ]"),
        ("cnpj 12345678000195 ok", "[CNPJ]"),
        ("tel (11) 98765-4321 ok", "[telefone]"),
        ("tel +55 11 98765-4321 ok", "[telefone]"),
        # 11 dígitos colados: indistinguível de CPF; mascarar como CPF é o lado seguro
        ("tel 11987654321 ok", "[CPF]"),
        ("fixo 3333-4444 ok", "[telefone]"),
    ])
    def test_mascara(self, texto, marcador):
        saida = ai_summary.mask_pii(texto)
        assert marcador in saida
        assert not any(c.isdigit() for c in saida)
        assert "@" not in saida

    def test_cnpj_nao_vira_telefone_nem_cpf(self):
        assert ai_summary.mask_pii("12.345.678/0001-95") == "[CNPJ]"

    def test_texto_comum_fica_intacto(self):
        txt = "Erro 500 ao clicar em salvar no pedido #42 às 10h"
        assert ai_summary.mask_pii(txt) == txt

    def test_nada_pessoal_chega_ao_provedor(self, api, agente_suporte, ticket, ana, provedor):
        TicketMessage.objects.create(
            ticket=ticket, author=ana, is_public=True,
            body="Meu e-mail ana@acme.test, CPF 123.456.789-09, tel (11) 98765-4321",
        )
        TicketMessage.objects.create(
            ticket=ticket, author=agente_suporte, is_public=False,
            body="Nota: CNPJ 12.345.678/0001-95 da cliente",
        )
        r = api(agente_suporte).post(url(ticket))
        assert r.status_code == 200
        enviado = provedor.recebido
        for vazado in ["ana@acme.test", "123.456.789-09", "98765-4321", "12.345.678/0001-95"]:
            assert vazado not in enviado
        assert "Erro ao emitir nota" in enviado  # assunto vai
        assert "nota interna" in enviado and "público" in enviado
        assert "[e-mail]" in enviado
        # nomes não vão: só o papel
        assert "ana@acme.test" not in enviado and "agente.sup" not in enviado
        assert "Cliente" in enviado and "Agente" in enviado

    def test_mensagem_apagada_nao_vai(self, api, agente_suporte, ticket, ana, provedor):
        from django.utils import timezone

        TicketMessage.objects.create(
            ticket=ticket, author=ana, body="segredo apagado", deleted_at=timezone.now()
        )
        api(agente_suporte).post(url(ticket))
        assert "segredo apagado" not in provedor.recebido


class TestTruncamento:
    def test_mantem_as_mais_recentes(self, ticket, ana, settings):
        settings.AI_SUMMARY_MAX_CHARS = 600
        for i in range(30):
            TicketMessage.objects.create(
                ticket=ticket, author=ana, body=f"mensagem numero {i:02d} " + "x" * 40
            )
        t = ai_summary.build_transcript(ticket)
        assert t.truncated is True
        assert len(t.text) <= 600
        assert "numero 29" in t.text
        assert "numero 00" not in t.text

    def test_nao_trunca_quando_cabe(self, ticket):
        t = ai_summary.build_transcript(ticket)
        assert t.truncated is False

    def test_mensagem_gigante_e_cortada(self, ticket, ana, settings):
        settings.AI_SUMMARY_MAX_CHARS = 500
        TicketMessage.objects.create(ticket=ticket, author=ana, body="y" * 5000)
        t = ai_summary.build_transcript(ticket)
        assert t.truncated and len(t.text) <= 500

    def test_resposta_traz_truncated(self, api, agente_suporte, ticket, ana, provedor, settings):
        settings.AI_SUMMARY_MAX_CHARS = 300
        TicketMessage.objects.create(ticket=ticket, author=ana, body="z" * 2000)
        assert api(agente_suporte).post(url(ticket)).json()["truncated"] is True


class TestEndpoint:
    def test_sucesso(self, api, agente_suporte, ticket, provedor):
        r = api(agente_suporte).post(url(ticket))
        assert r.status_code == 200
        corpo = r.json()
        assert corpo["summary"] == "Resumo pronto."
        assert corpo["provider"] == "fake"
        assert corpo["truncated"] is False
        assert corpo["generated_at"]
        assert set(corpo) == {"summary", "generated_at", "provider", "truncated"}

    def test_nao_persiste_nada(self, api, agente_suporte, ticket, provedor):
        antes = TicketMessage.objects.count()
        api(agente_suporte).post(url(ticket))
        assert TicketMessage.objects.count() == antes

    def test_503_sem_configuracao(self, api, agente_suporte, ticket, settings):
        settings.AI_SUMMARY_ENABLED = False
        settings.ANTHROPIC_API_KEY = ""
        r = api(agente_suporte).post(url(ticket))
        assert r.status_code == 503
        assert r.json()["code"] == "ai_not_configured"
        assert "configurado" in r.json()["detail"]

    def test_503_ligado_mas_sem_chave(self, api, agente_suporte, ticket, settings):
        settings.AI_SUMMARY_ENABLED = True
        settings.ANTHROPIC_API_KEY = ""
        assert api(agente_suporte).post(url(ticket)).status_code == 503

    def test_503_com_chave_mas_desligado(self, api, agente_suporte, ticket, settings):
        settings.AI_SUMMARY_ENABLED = False
        settings.ANTHROPIC_API_KEY = "sk-teste"
        assert api(agente_suporte).post(url(ticket)).status_code == 503

    def test_falha_do_provedor_vira_502_sem_vazar(self, api, agente_suporte, ticket, monkeypatch):
        p = FakeProvider(erro=ai_summary.AIProviderError("http 500 segredo"))
        monkeypatch.setattr(ai_summary, "get_provider", lambda: p)
        r = api(agente_suporte).post(url(ticket))
        assert r.status_code == 502
        assert r.json()["code"] == "ai_provider_error"
        assert "segredo" not in r.content.decode()

    def test_404_ticket_inexistente(self, api, agente_suporte, provedor):
        assert api(agente_suporte).post("/api/v1/tickets/999999/ai-summary/").status_code == 404

    def test_404_fora_do_escopo_do_agente(self, api, agente_financeiro, ticket, provedor):
        assert api(agente_financeiro).post(url(ticket)).status_code == 404
        assert provedor.recebido is None

    def test_cliente_nao_pode(self, api, ana, ticket, provedor):
        assert api(ana).post(url(ticket)).status_code == 403
        assert provedor.recebido is None

    def test_anonimo_recusado(self, ticket):
        from rest_framework.test import APIClient

        assert APIClient().post(url(ticket)).status_code in (401, 403)

    def test_agente_leve_pode_ver(self, api, agente_leve, ticket, provedor):
        assert api(agente_leve).post(url(ticket)).status_code == 200

    def test_get_nao_permitido(self, api, agente_suporte, ticket):
        assert api(agente_suporte).get(url(ticket)).status_code == 405

    def test_throttle_por_usuario(
        self, api, agente_suporte, supervisor, ticket, provedor, monkeypatch
    ):
        from apps.tickets.ai_summary_api import AISummaryThrottle

        monkeypatch.setattr(AISummaryThrottle, "get_rate", lambda self: "2/hour")
        c = api(agente_suporte)
        assert c.post(url(ticket)).status_code == 200
        assert c.post(url(ticket)).status_code == 200
        assert c.post(url(ticket)).status_code == 429
        assert api(supervisor).post(url(ticket)).status_code == 200  # outro usuário


class TestAuditoria:
    def test_registra_sem_conteudo(self, api, agente_suporte, ticket, provedor):
        api(agente_suporte).post(url(ticket))
        log = AuditLog.objects.get(object_id=str(ticket.pk), summary__contains="Resumo de IA")
        assert log.actor == agente_suporte
        assert log.changes["provider"] == "fake"
        assert log.changes["messages_sent"] >= 1
        blob = f"{log.summary} {log.changes}"
        assert "Resumo pronto." not in blob
        assert "falha na NF" not in blob and "Erro ao emitir nota" not in blob

    def test_falha_nao_audita_envio(self, api, agente_suporte, ticket, settings):
        settings.AI_SUMMARY_ENABLED = False
        api(agente_suporte).post(url(ticket))
        assert not AuditLog.objects.filter(summary__contains="Resumo de IA").exists()


class TestProvedorAnthropic:
    def _resp(self, status=200, json=None):
        class R:
            status_code = status

            def json(self):  # noqa: A003
                if json is None:
                    raise ValueError
                return json
        return R()

    def test_chamada_http_simulada(self, monkeypatch):
        visto = {}

        def fake_post(u, headers, json, timeout):
            visto.update(url=u, headers=headers, json=json, timeout=timeout)
            return self._resp(json={"content": [{"type": "text", "text": " Ok. "}]})

        monkeypatch.setattr(ai_summary.requests, "post", fake_post)
        p = ai_summary.AnthropicProvider("sk-x", "claude-haiku-5-5", 7)
        assert p.summarize("texto") == "Ok."
        assert visto["headers"]["x-api-key"] == "sk-x"
        assert visto["json"]["model"] == "claude-haiku-5-5"
        assert visto["timeout"] == 7

    @pytest.mark.parametrize("resp", [
        {"status": 500, "json": {}},
        {"status": 200, "json": {"content": []}},
        {"status": 200, "json": None},
        {"status": 200, "json": {"nada": 1}},
    ])
    def test_respostas_ruins(self, monkeypatch, resp):
        monkeypatch.setattr(ai_summary.requests, "post", lambda *a, **k: self._resp(**resp))
        with pytest.raises(ai_summary.AIProviderError):
            ai_summary.AnthropicProvider("k", "m").summarize("t")

    def test_erro_de_rede_nao_vaza_chave(self, monkeypatch, caplog):
        def boom(*a, **k):
            raise ai_summary.requests.ConnectionError("falhou sk-SEGREDO")

        monkeypatch.setattr(ai_summary.requests, "post", boom)
        with pytest.raises(ai_summary.AIProviderError) as ei:
            ai_summary.AnthropicProvider("sk-SEGREDO", "m").summarize("conteudo-privado")
        assert "SEGREDO" not in str(ei.value) and not ei.value.__cause__
        assert "SEGREDO" not in caplog.text and "conteudo-privado" not in caplog.text

    def test_get_provider_le_so_do_ambiente(self, settings):
        settings.AI_SUMMARY_ENABLED = True
        settings.ANTHROPIC_API_KEY = "sk-z"
        settings.AI_SUMMARY_MODEL = "claude-haiku-5-5"
        p = ai_summary.get_provider()
        assert p.name == "anthropic" and p.model == "claude-haiku-5-5"

    def test_modelo_padrao(self, settings):
        assert settings.AI_SUMMARY_MODEL == "claude-haiku-5-5"
