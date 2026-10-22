"""`me.permissions` não pode prometer o que a API nega: o agente listava
`macro.manage` mas levava 403 ao criar macro (admin escreve — GAPS.md)."""

import pytest

from apps.accounts.models import CustomRole, InternalRole

pytestmark = pytest.mark.django_db

URL = "/api/v1/settings/ticket-macros/"
CORPO = {"name": "Boas-vindas", "body": "Olá!"}


def test_agente_nao_anuncia_macro_manage_e_o_403_continua(api, agente_suporte):
    perms = api(agente_suporte).get("/api/v1/auth/me/").json()["permissions"]
    assert "macro.manage" not in perms
    assert "macro.use" in perms
    assert api(agente_suporte).post(URL, CORPO, format="json").status_code == 403


def test_supervisor_idem_e_admin_anuncia_e_cria(api, supervisor, admin):
    assert "macro.manage" not in api(supervisor).get("/api/v1/auth/me/").json()["permissions"]
    assert "macro.manage" in api(admin).get("/api/v1/auth/me/").json()["permissions"]
    assert api(admin).post(URL, CORPO, format="json").status_code == 201


def test_papel_personalizado_com_macro_manage_cria(api, agente_suporte):
    """A permissão passa a valer de verdade: quem a recebe por papel
    personalizado escreve, sem precisar de `settings.manage`."""
    papel = CustomRole.objects.create(
        name="Gestor de macros", slug="gestor-de-macros", base_role=InternalRole.AGENT,
        permissions=["panel.access", "ticket.view", "macro.use", "macro.manage"],
    )
    agente_suporte.custom_role = papel
    agente_suporte.save()
    resp = api(agente_suporte).post(URL, CORPO, format="json")
    assert resp.status_code == 201, resp.json()
    assert api(agente_suporte).patch(
        f"{URL}{resp.json()['id']}/", {"name": "Novo"}, format="json"
    ).status_code == 200
    # mas não vira administrador das outras configurações
    assert api(agente_suporte).post(
        "/api/v1/settings/tags/", {"name": "x"}, format="json"
    ).status_code == 403


def test_leitura_continua_para_todo_interno(api, agente_suporte, agente_leve, ana):
    assert api(agente_suporte).get(URL).status_code == 200
    assert api(agente_leve).get(URL).status_code == 200
    assert api(ana).get(URL).status_code == 403
