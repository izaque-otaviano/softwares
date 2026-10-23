"""Campos personalizados do ticket: validação, gravação, auditoria e obrigatoriedade.

Tudo aqui é INTERNO (equipe). O cliente nunca lê nem escreve estes valores;
quem garante isso são os pontos de entrada (views/serializers), que só chamam
este módulo para `is_internal`. Os valores moram em `TicketCustomFieldValue`
(uma coluna tipada por tipo de campo, para filtrar com índice).
"""

from __future__ import annotations

import datetime as dt
import json
import math
import re
import unicodedata
from decimal import Decimal, InvalidOperation

from django.db import transaction
from rest_framework import serializers

from apps.accounts.rbac import Perm
from apps.tickets.models import (
    MAX_CAMPOS_ATIVOS,
    MAX_OPCOES_DROPDOWN,
    Ticket,
    TicketCustomFieldValue,
    TicketField,
    TicketFieldType,
    TicketForm,
    TicketStatusEvent,
)
from apps.tickets.services.ticket_service import TicketRuleViolation

MAX_TEXT = 2000
MAX_TEXTAREA = 10000
#: Número: até 9 dígitos inteiros e 6 decimais (cabe exato num float/JSON).
_MAX_NUMBER = Decimal(10) ** 9
_CASAS_NUMBER = Decimal("0.000001")

_COLUNA = {
    TicketFieldType.TEXT: "text_value",
    TicketFieldType.TEXTAREA: "text_value",
    TicketFieldType.NUMBER: "number_value",
    TicketFieldType.DATE: "date_value",
    TicketFieldType.CHECKBOX: "bool_value",
    TicketFieldType.DROPDOWN: "option_value",
}


def coluna_do_tipo(tipo: str) -> str:
    return _COLUNA[tipo]


class RequiredCustomFields(TicketRuleViolation):
    """Campo(s) obrigatório(s) sem valor — a view devolve 400 com
    `code=required_custom_fields` e a lista em `fields`. O texto da exceção já
    é a frase em português (é o motivo que o lote mostra em `failed[]`)."""

    def __init__(self, pending: list[TicketField], *, ao: str):
        self.pending = [{"id": f.pk, "slug": f.slug, "title": f.title} for f in pending]
        nomes = ", ".join(f.title for f in pending)
        super().__init__(f"Preencha os campos obrigatórios antes de {ao}: {nomes}.")


def payload_de_obrigatorios(exc: RequiredCustomFields) -> dict:
    return {
        "detail": str(exc),
        "code": "required_custom_fields",
        "fields": exc.pending,
        "custom_fields": {p["slug"]: "Campo obrigatório." for p in exc.pending},
    }


# --------------------------------------------------------------------------- #
# Slug e opções (definição do campo)
# --------------------------------------------------------------------------- #

def slug_do_titulo(titulo: str) -> str:
    """Slug estável, único e nunca numérico puro (assim `id` e `slug` não se
    confundem como chave de `custom_fields`). Só `[a-z0-9_]`."""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFKD", titulo or "")
        if not unicodedata.combining(c)
    )
    base = re.sub(r"[^a-z0-9]+", "_", sem_acento.lower()).strip("_")[:50]
    if not base or not base[0].isalpha():
        base = f"campo_{base}".strip("_")[:50]
    slug, n = base, 2
    while TicketField.objects.filter(slug=slug).exists():
        slug, n = f"{base}_{n}", n + 1
    return slug


def normalizar_opcoes(bruto) -> list[dict]:
    """Aceita `[{"value","label"}]` (ou só `{"label"}`) e também `["Texto"]`.
    Devolve a lista ordenada e validada: valores e rótulos únicos, até 200."""
    if not isinstance(bruto, list):
        raise serializers.ValidationError("Envie uma lista de opções.")
    if len(bruto) > MAX_OPCOES_DROPDOWN:
        raise serializers.ValidationError(
            f"No máximo {MAX_OPCOES_DROPDOWN} opções por campo."
        )
    saida, valores, rotulos = [], set(), set()
    for i, item in enumerate(bruto, start=1):
        if isinstance(item, str):
            item = {"label": item}
        if not isinstance(item, dict):
            raise serializers.ValidationError(f"Opção {i}: formato inválido.")
        rotulo = item.get("label")
        valor = item.get("value")
        if rotulo is None and isinstance(valor, str):
            rotulo = valor
        if not isinstance(rotulo, str) or not rotulo.strip():
            raise serializers.ValidationError(f"Opção {i}: informe o rótulo.")
        rotulo = rotulo.strip()
        if len(rotulo) > 100:
            raise serializers.ValidationError(f"Opção {i}: rótulo com mais de 100 caracteres.")
        if valor is None or (isinstance(valor, str) and not valor.strip()):
            valor = rotulo
        if not isinstance(valor, str):
            raise serializers.ValidationError(f"Opção {i}: o valor deve ser texto.")
        valor = valor.strip()
        if len(valor) > 100:
            raise serializers.ValidationError(f"Opção {i}: valor com mais de 100 caracteres.")
        if valor.casefold() in valores:
            raise serializers.ValidationError(f"Opção repetida: \"{valor}\".")
        if rotulo.casefold() in rotulos:
            raise serializers.ValidationError(f"Rótulo repetido: \"{rotulo}\".")
        valores.add(valor.casefold())
        rotulos.add(rotulo.casefold())
        saida.append({"value": valor, "label": rotulo})
    return saida


def checar_limite_de_ativos(*, excluir_pk=None) -> None:
    ativos = TicketField.objects.filter(is_active=True)
    if excluir_pk:
        ativos = ativos.exclude(pk=excluir_pk)
    if ativos.count() >= MAX_CAMPOS_ATIVOS:
        raise serializers.ValidationError(
            f"Limite de {MAX_CAMPOS_ATIVOS} campos ativos atingido. "
            "Desative um campo antes de criar ou reativar outro."
        )


# --------------------------------------------------------------------------- #
# Entrada: `custom_fields` do corpo da requisição
# --------------------------------------------------------------------------- #

def _numero(valor) -> Decimal:
    if isinstance(valor, bool):
        raise ValueError
    if isinstance(valor, float):
        if not math.isfinite(valor):
            raise ValueError
        valor = repr(valor)
    if isinstance(valor, str):
        valor = valor.strip()
        if not re.fullmatch(r"-?\d+(\.\d+)?", valor):
            raise ValueError
    elif not isinstance(valor, (int, Decimal)):
        raise ValueError
    try:
        d = Decimal(valor)
    except InvalidOperation as exc:
        raise ValueError from exc
    if not d.is_finite() or abs(d) >= _MAX_NUMBER:
        raise ValueError
    if d != d.quantize(_CASAS_NUMBER):
        raise ValueError
    return d.quantize(_CASAS_NUMBER)


def coagir(campo: TicketField, valor):
    """Valida/normaliza `valor` para o tipo do campo. `None` limpa o valor.
    Levanta `ValueError` com a mensagem em português."""
    if valor is None:
        return None
    t = campo.type
    if t in (TicketFieldType.TEXT, TicketFieldType.TEXTAREA):
        if not isinstance(valor, str):
            raise ValueError("Envie um texto.")
        valor = valor.strip()
        if not valor:
            return None
        limite = MAX_TEXT if t == TicketFieldType.TEXT else MAX_TEXTAREA
        if len(valor) > limite:
            raise ValueError(f"No máximo {limite} caracteres.")
        return valor
    if t == TicketFieldType.NUMBER:
        if isinstance(valor, str) and not valor.strip():
            return None
        try:
            return _numero(valor)
        except ValueError:
            raise ValueError(
                "Informe um número (até 9 dígitos inteiros e 6 decimais, com ponto)."
            ) from None
    if t == TicketFieldType.DATE:
        if isinstance(valor, str) and not valor.strip():
            return None
        if not isinstance(valor, str):
            raise ValueError("Informe a data no formato AAAA-MM-DD.")
        try:
            return dt.date.fromisoformat(valor.strip())
        except ValueError:
            raise ValueError("Data inválida. Use o formato AAAA-MM-DD.") from None
    if t == TicketFieldType.CHECKBOX:
        if isinstance(valor, str):
            baixo = valor.strip().lower()
            if baixo == "":
                return None
            if baixo in ("true", "false"):
                return baixo == "true"
        if not isinstance(valor, bool):
            raise ValueError("Informe verdadeiro ou falso.")
        return valor
    if t == TicketFieldType.DROPDOWN:
        if isinstance(valor, str) and not valor.strip():
            return None
        validos = {o["value"] for o in (campo.options or [])}
        if not isinstance(valor, str) or valor not in validos:
            raise ValueError("Escolha uma das opções do campo.")
        return valor
    raise ValueError("Tipo de campo desconhecido.")


def interpretar(bruto) -> dict[TicketField, object]:
    """Converte `custom_fields` do corpo em `{TicketField: valor tipado | None}`.

    Chaves: slug ou id numérico do campo. Erros de TODAS as chaves saem juntos
    em `ValidationError({"custom_fields": {chave: mensagem}})`. Campo inativo
    só aceita `null` (limpar).
    """
    if isinstance(bruto, str):
        try:
            bruto = json.loads(bruto)
        except ValueError:
            raise serializers.ValidationError(
                {"custom_fields": "JSON inválido."}
            ) from None
    if bruto is None:
        return {}
    if not isinstance(bruto, dict):
        raise serializers.ValidationError(
            {"custom_fields": "Envie um objeto {campo: valor}."}
        )
    chaves = [str(k) for k in bruto]
    ids = [int(k) for k in chaves if k.isdigit()]
    achados = {
        f.slug: f for f in TicketField.objects.filter(slug__in=chaves)
    }
    achados_id = {f.pk: f for f in TicketField.objects.filter(pk__in=ids)} if ids else {}
    erros, saida, visto = {}, {}, {}
    for chave, valor in bruto.items():
        chave = str(chave)
        campo = achados.get(chave) or (
            achados_id.get(int(chave)) if chave.isdigit() else None
        )
        if campo is None:
            erros[chave] = "Campo personalizado inexistente."
            continue
        if campo.pk in visto:
            erros[chave] = f"Campo repetido (já enviado como \"{visto[campo.pk]}\")."
            continue
        visto[campo.pk] = chave
        try:
            novo = coagir(campo, valor)
        except ValueError as exc:
            erros[chave] = str(exc)
            continue
        if novo is not None and not campo.is_active:
            erros[chave] = "Campo desativado: só é possível limpar o valor."
            continue
        saida[campo] = novo
    if erros:
        raise serializers.ValidationError({"custom_fields": erros})
    return saida


# --------------------------------------------------------------------------- #
# Saída
# --------------------------------------------------------------------------- #

def _valor_da_linha(linha: TicketCustomFieldValue):
    """Valor Python/JSON da linha, pelo tipo do campo."""
    t = linha.field.type
    if t in (TicketFieldType.TEXT, TicketFieldType.TEXTAREA):
        return linha.text_value
    if t == TicketFieldType.NUMBER:
        n = linha.number_value
        if n is None:
            return None
        return int(n) if n == n.to_integral_value() else float(n)
    if t == TicketFieldType.DATE:
        return linha.date_value.isoformat() if linha.date_value else None
    if t == TicketFieldType.CHECKBOX:
        return linha.bool_value
    return linha.option_value


def valores_do_ticket(ticket: Ticket) -> dict:
    """`{slug: valor}` só dos campos COM valor (sem valor = ausente). Campos
    desativados continuam saindo (o dado existe), na ordem de definição."""
    linhas = sorted(
        ticket.custom_values.select_related("field"),
        key=lambda ln: (ln.field.order, ln.field_id),
    )
    return {
        ln.field.slug: v for ln in linhas
        if (v := _valor_da_linha(ln)) is not None
    }


def _atribuir(linha: TicketCustomFieldValue, campo: TicketField, valor) -> None:
    for col in ("text_value", "number_value", "date_value", "bool_value", "option_value"):
        setattr(linha, col, None)
    setattr(linha, _COLUNA[campo.type], valor)


def _mostrar(campo: TicketField, valor) -> str:
    if valor is None:
        return "—"
    t = campo.type
    if t == TicketFieldType.CHECKBOX:
        return "sim" if valor else "não"
    if t == TicketFieldType.DATE:
        return valor.strftime("%d/%m/%Y")
    if t == TicketFieldType.NUMBER:
        n = Decimal(valor)
        return str(int(n)) if n == n.to_integral_value() else format(n.normalize(), "f")
    if t == TicketFieldType.DROPDOWN:
        for o in campo.options or []:
            if o["value"] == valor:
                return o["label"]
        return str(valor)
    texto = str(valor).replace("\n", " ")
    return texto if len(texto) <= 50 else texto[:49] + "…"


# --------------------------------------------------------------------------- #
# Gravação (com auditoria no histórico do ticket)
# --------------------------------------------------------------------------- #

def exigir_permissao(actor) -> None:
    if not actor.is_internal:
        raise TicketRuleViolation("Campos personalizados são só da equipe.")
    if not actor.can(Perm.TICKET_EDIT_PROPERTIES):
        raise TicketRuleViolation(
            "Seu papel não permite editar as propriedades do ticket."
        )


def aplicar(*, ticket: Ticket, actor, valores: dict[TicketField, object]) -> list[str]:
    """Grava os valores (`None` apaga) e registra um evento por campo que
    mudou: `campo: Título: antes → depois`. Devolve as notas geradas. Sem
    mudança real = sem evento. Chamar dentro de uma transação."""
    if not valores:
        return []
    exigir_permissao(actor)
    notas = []
    with transaction.atomic():
        atuais = {
            ln.field_id: ln
            for ln in TicketCustomFieldValue.objects.select_for_update().filter(
                ticket=ticket, field__in=list(valores)
            ).select_related("field")
        }
        for campo, novo in valores.items():
            linha = atuais.get(campo.pk)
            guardado = getattr(linha, _COLUNA[campo.type]) if linha else None
            if guardado == novo:
                continue
            if novo is None:
                linha.delete()
            elif linha is None:
                linha = TicketCustomFieldValue(ticket=ticket, field=campo)
                _atribuir(linha, campo, novo)
                linha.save()
            else:
                _atribuir(linha, campo, novo)
                linha.save()
            nota = (
                f"campo: {campo.title}: {_mostrar(campo, guardado)} → {_mostrar(campo, novo)}"
            )[:200]
            TicketStatusEvent.objects.create(
                ticket=ticket, from_status=ticket.status, to_status=ticket.status,
                changed_by=actor, note=nota,
            )
            notas.append(nota)
    return notas


# --------------------------------------------------------------------------- #
# Obrigatoriedade
# --------------------------------------------------------------------------- #

def formulario_efetivo(form: TicketForm | None) -> TicketForm:
    return form or TicketForm.default()


def obrigatorios_do_formulario(form: TicketForm) -> list[TicketField]:
    """Campos ATIVOS do formulário exigidos nele — marcados como obrigatórios
    no campo (global) ou no formulário. Na ordem do formulário."""
    vistos = []
    for ff in form.form_fields.select_related("field").order_by("order", "id"):
        if ff.field.is_active and (ff.is_required or ff.field.is_required):
            vistos.append(ff.field)
    return vistos


def pendentes_do_ticket(ticket: Ticket) -> list[TicketField]:
    obrig = obrigatorios_do_formulario(formulario_efetivo(ticket.form))
    if not obrig:
        return []
    preenchidos = set(
        ticket.custom_values.filter(field__in=obrig).values_list("field_id", flat=True)
    )
    return [f for f in obrig if f.pk not in preenchidos]


def exigir_obrigatorios_ao_fechar(ticket: Ticket) -> None:
    pend = pendentes_do_ticket(ticket)
    if pend:
        raise RequiredCustomFields(pend, ao="resolver ou fechar o ticket")


def exigir_obrigatorios_ao_criar(
    form: TicketForm | None, valores: dict[TicketField, object]
) -> None:
    obrig = obrigatorios_do_formulario(formulario_efetivo(form))
    com_valor = {f.pk for f, v in valores.items() if v is not None}
    pend = [f for f in obrig if f.pk not in com_valor]
    if pend:
        raise RequiredCustomFields(pend, ao="criar o ticket")


def valores_do_titular(ticket: Ticket) -> list[dict]:
    """Para o export LGPD: `[{campo, tipo, valor}]` (rótulo legível)."""
    saida = []
    for ln in sorted(
        ticket.custom_values.select_related("field"),
        key=lambda x: (x.field.order, x.field_id),
    ):
        v = _valor_da_linha(ln)
        if v is not None:
            saida.append({
                "campo": ln.field.title, "tipo": ln.field.get_type_display(),
                "valor": _mostrar_completo(ln.field, v),
            })
    return saida


def _mostrar_completo(campo: TicketField, valor):
    if campo.type == TicketFieldType.CHECKBOX:
        return "sim" if valor else "não"
    if campo.type == TicketFieldType.DROPDOWN:
        for o in campo.options or []:
            if o["value"] == valor:
                return o["label"]
    return valor
