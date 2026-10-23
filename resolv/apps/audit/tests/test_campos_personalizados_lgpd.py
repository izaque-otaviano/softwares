"""Campos personalizados do ticket dentro da LGPD: export do titular,
redação assistida e expurgo por retenção."""

import pytest

from apps.audit.services import anonymization, export, retention
from apps.tickets.models import Ticket, TicketCustomFieldValue, TicketField

from .test_portability import payload_of, read_zip

pytestmark = pytest.mark.django_db


def campo(title, type="text", **extra):
    return TicketField.objects.create(slug=title.lower(), title=title, type=type, **extra)


def valor(ticket, c, **kw):
    return TicketCustomFieldValue.objects.create(ticket=ticket, field=c, **kw)


class TestExport:
    def test_valores_do_ticket_do_titular_saem_no_json_e_no_html(self, dsr, ana, suporte,
                                                                make_ticket):
        t = make_ticket(ana, suporte, subject="Meu")
        valor(t, campo("Contrato"), text_value="C-123")
        valor(t, campo("Aceite", "checkbox"), bool_value=True)
        valor(t, campo("Sev", "dropdown", options=[{"value": "a", "label": "Alta"}]),
              option_value="a")
        request = dsr("export", user=ana)
        export.build_export(request)

        data = payload_of(request)
        cps = {c["campo"]: c["valor"] for c in data["tickets"][0]["campos_personalizados"]}
        assert cps == {"Contrato": "C-123", "Aceite": "sim", "Sev": "Alta"}
        _, files = read_zip(request)
        assert b"C-123" in files["dados.html"]

    def test_html_escapa_o_valor(self, dsr, ana, suporte, make_ticket):
        t = make_ticket(ana, suporte)
        valor(t, campo("Obs"), text_value="<script>alert(1)</script>")
        request = dsr("export", user=ana)
        export.build_export(request)
        _, files = read_zip(request)
        assert b"<script>alert" not in files["dados.html"]

    def test_ticket_apagado_continua_no_export(self, dsr, ana, suporte, make_ticket, admin):
        from apps.tickets.services import ticket_service

        t = make_ticket(ana, suporte)
        valor(t, campo("Contrato"), text_value="C-9")
        ticket_service.delete_ticket(ticket=t, actor=admin)
        request = dsr("export", user=ana)
        export.build_export(request)
        assert payload_of(request)["tickets"][0]["campos_personalizados"][0]["valor"] == "C-9"

    def test_ticket_de_colega_nao_entra(self, dsr, ana, beto, suporte, make_ticket):
        t = make_ticket(beto, suporte)
        valor(t, campo("Contrato"), text_value="do-beto")
        request = dsr("export", user=ana)
        export.build_export(request)
        _, files = read_zip(request)
        assert b"do-beto" not in files["dados.json"]


class TestRedacao:
    def test_texto_com_pii_vira_candidato_e_pode_ser_redigido(self, dsr, ana, suporte,
                                                             make_ticket, admin):
        t = make_ticket(ana, suporte)
        v = valor(t, campo("Documento"), text_value="CPF 123.456.789-09")
        valor(t, campo("Qtd", "number"), number_value=12345678909)
        candidatos = anonymization.find_free_text_pii([ana])
        achados = [c for c in candidatos if c["model"] == "custom_field_value"]
        assert [(c["pk"], c["pattern"], c["custom_field"]) for c in achados] == [
            (v.pk, "cpf", "Documento")
        ]
        assert anonymization.redact_free_text(
            model="custom_field_value", pk=v.pk, actor=admin
        ) is True
        v.refresh_from_db()
        assert v.text_value == anonymization.REDACTED
        # nada mais a sugerir
        assert not [c for c in anonymization.find_free_text_pii([ana])
                    if c["model"] == "custom_field_value"]

    def test_redacao_vai_para_a_auditoria_com_o_original(self, ana, suporte, make_ticket, admin):
        from apps.audit.models import AuditLog

        t = make_ticket(ana, suporte)
        v = valor(t, campo("Documento"), text_value="CPF 123.456.789-09")
        anonymization.redact_free_text(model="custom_field_value", pk=v.pk, actor=admin)
        log = AuditLog.objects.filter(action="anonymize", object_id=str(v.pk)).get()
        assert log.changes["text_value"][0] == "CPF 123.456.789-09"

    def test_nao_redige_campo_que_nao_e_texto(self, ana, suporte, make_ticket, admin):
        t = make_ticket(ana, suporte)
        v = valor(t, campo("Qtd", "number"), number_value=5)
        assert anonymization.redact_free_text(
            model="custom_field_value", pk=v.pk, actor=admin
        ) is False

    def test_endpoint_aceita_o_novo_alvo(self, api, admin, dsr, ana, suporte, make_ticket):
        t = make_ticket(ana, suporte)
        v = valor(t, campo("Documento"), text_value="CPF 123.456.789-09")
        pedido = dsr(user=ana)
        resp = api(admin).post(
            f"/api/v1/audit/lgpd/{pedido.pk}/redact/",
            {"model": "custom_field_value", "pk": v.pk}, format="json",
        )
        assert resp.status_code == 200 and resp.json() == {"redacted": True}

    def test_ticket_de_outro_titular_nao_e_candidato(self, ana, beto, suporte, make_ticket):
        t = make_ticket(beto, suporte)
        valor(t, campo("Documento"), text_value="CPF 123.456.789-09")
        assert not [c for c in anonymization.find_free_text_pii([ana])
                    if c["model"] == "custom_field_value"]


class TestRetencao:
    def test_expurgo_limpa_texto_e_mantem_o_estatistico(self, closed_long_ago, purge_authorized):
        t = closed_long_ago()
        txt = valor(t, campo("Contrato"), text_value="C-1")
        par = valor(t, campo("Obs", "textarea"), text_value="longo")
        num = valor(t, campo("Qtd", "number"), number_value=3)
        flag = valor(t, campo("Aceite", "checkbox"), bool_value=True)
        retention.purge_ticket_content(dry_run=False)
        for v in (txt, par):
            v.refresh_from_db()
            assert v.text_value == retention.PURGED_MARKER
        num.refresh_from_db()
        flag.refresh_from_db()
        assert num.number_value == 3 and flag.bool_value is True
        t.refresh_from_db()
        assert t.retention_purged_at is not None

    def test_ticket_recente_ou_aberto_nao_e_tocado(self, make_ticket, ana, suporte,
                                                  purge_authorized):
        t = make_ticket(ana, suporte)
        v = valor(t, campo("Contrato"), text_value="C-1")
        retention.purge_ticket_content(dry_run=False)
        v.refresh_from_db()
        assert v.text_value == "C-1"
        assert Ticket.objects.get(pk=t.pk).retention_purged_at is None
