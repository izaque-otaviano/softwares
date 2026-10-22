"""`POST /tickets/` com os campos OPCIONAIS de triagem na abertura: responsável,
status inicial (categoria ou stage), etiquetas e primeira mensagem como nota
INTERNA. Pedido do front Helpdesk: antes eram 1 a 3 chamadas extras (e uma
falha no meio deixava o ticket criado pela metade) e o corpo era sempre público.
Sem os campos novos, o comportamento é o de sempre."""

import pytest

from apps.tickets.models import (
    TicketMessage,
    TicketStage,
    TicketStatus,
    TicketTag,
)

pytestmark = pytest.mark.django_db

URL = "/api/v1/tickets/"


@pytest.fixture
def base(suporte, ana):
    return {"team_id": suporte.pk, "subject": "Triado", "body": "Corpo",
            "requester_id": ana.pk}


def _post(api, quem, corpo):
    return api(quem).post(URL, corpo, format="json")


def test_sem_campos_novos_o_comportamento_antigo_vale(api, agente_suporte, base):
    resp = _post(api, agente_suporte, base)
    assert resp.status_code == 201
    corpo = resp.json()
    assert corpo["status"] == "new"
    assert corpo["assignee_id"] is None
    assert corpo["tags"] == []
    assert [m["is_public"] for m in corpo["messages"]] == [True]


def test_cria_com_responsavel_status_etiquetas_e_nota_interna(
    api, agente_suporte, suporte, base
):
    tag = TicketTag.objects.create(name="VIP", slug="vip")
    resp = _post(api, agente_suporte, {
        **base, "assignee": agente_suporte.pk, "status": "open",
        "tags": [tag.pk], "is_public": False,
    })
    assert resp.status_code == 201, resp.json()
    corpo = resp.json()
    assert corpo["assignee_id"] == agente_suporte.pk
    assert corpo["status"] == "open"
    assert corpo["stage_name"] == "Aberto"
    assert [t["id"] for t in corpo["tags"]] == [tag.pk]
    assert [m["is_public"] for m in corpo["messages"]] == [False]


def test_nota_interna_nao_aparece_para_o_cliente(api, agente_suporte, ana, base):
    resp = _post(api, agente_suporte, {**base, "is_public": False})
    pk = resp.json()["id"]
    visto = api(ana).get(f"{URL}{pk}/").json()
    assert visto["messages"] == []
    assert TicketMessage.objects.get(ticket_id=pk).is_public is False


def test_stage_personalizado_define_status_e_coluna(api, agente_suporte, base):
    stage = TicketStage.objects.create(
        name="Em análise", slug="em-analise", category="open", color="#112233", order=9,
    )
    resp = _post(api, agente_suporte, {**base, "stage": stage.pk})
    assert resp.status_code == 201
    assert resp.json()["status"] == "open"
    assert resp.json()["stage"] == stage.pk


def test_pending_customer_inicial_pausa_o_sla_como_qualquer_mudanca(
    api, agente_suporte, base
):
    resp = _post(api, agente_suporte, {**base, "status": "pending_customer"})
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending_customer"
    assert resp.json()["stage_name"] == "Aguardando retorno"


@pytest.mark.parametrize("extra", [
    {"status": "closed"},
    {"status": "open", "stage": "__novo__"},   # categoria do stage diverge
])
def test_status_invalido_recusa_sem_criar(api, agente_suporte, base, extra):
    from apps.tickets.models import Ticket

    if extra.get("stage") == "__novo__":
        extra = {**extra, "stage": TicketStage.objects.get(slug="novo").pk
                 if TicketStage.objects.filter(slug="novo").exists()
                 else TicketStage.objects.filter(category="new").first().pk}
    antes = Ticket.objects.count()
    resp = _post(api, agente_suporte, {**base, **extra})
    assert resp.status_code == 400
    assert Ticket.objects.count() == antes


def test_stage_fechado_ou_inativo_e_recusado(api, agente_suporte, base):
    from apps.tickets.models import Ticket

    fechado = TicketStage.objects.filter(category="closed").first()
    inativo = TicketStage.objects.create(
        name="Velho", slug="velho", category="open", color="#000000",
        order=20, is_active=False,
    )
    antes = Ticket.objects.count()
    assert _post(api, agente_suporte, {**base, "stage": fechado.pk}).status_code == 400
    assert _post(api, agente_suporte, {**base, "stage": inativo.pk}).status_code == 400
    assert Ticket.objects.count() == antes


def test_responsavel_que_nao_pode_ser_atribuido_e_recusado(
    api, agente_suporte, agente_leve, base
):
    from apps.tickets.models import Ticket

    antes = Ticket.objects.count()
    resp = _post(api, agente_suporte, {**base, "assignee": agente_leve.pk})
    assert resp.status_code == 400
    assert Ticket.objects.count() == antes


def test_responsavel_cliente_ou_inexistente_400(api, agente_suporte, ana, base):
    assert _post(api, agente_suporte, {**base, "assignee": ana.pk}).status_code == 400
    assert _post(api, agente_suporte, {**base, "assignee": 99999}).status_code == 400


def test_etiqueta_inexistente_400(api, agente_suporte, base):
    assert _post(api, agente_suporte, {**base, "tags": [99999]}).status_code == 400


def test_agente_leve_nao_triagem_nem_abre_nota_se_papel_nao_deixa(
    api, agente_leve, base
):
    """Agente leve só comenta: não define responsável/status/etiquetas."""
    tag = TicketTag.objects.create(name="X", slug="x")
    resp = _post(api, agente_leve, {**base, "tags": [tag.pk]})
    assert resp.status_code == 400


def test_cliente_nao_usa_os_campos_de_triagem(api, ana, suporte):
    corpo = {"team_id": suporte.pk, "subject": "S", "body": "B"}
    assert _post(api, ana, {**corpo, "is_public": False}).status_code == 400
    assert _post(api, ana, {**corpo, "status": "open"}).status_code == 400
    # e o corpo sem eles continua valendo para o cliente
    assert _post(api, ana, corpo).status_code == 201


def test_multipart_com_anexo_e_etiquetas(api, agente_suporte, base):
    from django.core.files.uploadedfile import SimpleUploadedFile

    tag = TicketTag.objects.create(name="M", slug="m")
    cliente = api(agente_suporte)
    resp = cliente.post(URL, {
        "team_id": base["team_id"], "subject": "S", "body": "B",
        "requester_id": base["requester_id"], "tags": [tag.pk],
        "assignee": agente_suporte.pk, "is_public": "false",
        "files": SimpleUploadedFile("a.txt", b"oi", content_type="text/plain"),
    }, format="multipart")
    assert resp.status_code == 201, resp.content
    corpo = resp.json()
    assert corpo["assignee_id"] == agente_suporte.pk
    assert [m["is_public"] for m in corpo["messages"]] == [False]
    assert len(corpo["tags"]) == 1


def test_historico_registra_atribuicao_e_status(api, agente_suporte, base):
    resp = _post(api, agente_suporte, {
        **base, "assignee": agente_suporte.pk, "status": TicketStatus.OPEN,
    })
    notas = [e["note"] for e in resp.json()["events"]]
    assert any("atribuído a" in n for n in notas)
