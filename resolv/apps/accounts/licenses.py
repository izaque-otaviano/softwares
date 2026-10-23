"""Licenças de agente (assentos).

**O que ocupa um assento:** usuário INTERNO, ATIVO, com papel `admin`,
`supervisor` ou `agent`. Cliente, agente leve (só comenta por dentro), conta
inativa/suspensa e visitante de chat não contam. Convite pendente conta: a
pessoa já tem a vaga reservada.

**De onde vem o total:** `SeatLicense.agent_seat_limit` (editável pelo admin);
vazio cai em `settings.AGENT_SEAT_LIMIT`; vazio de novo = ilimitado.

**Corrida:** toda operação que pode ocupar um assento passa por
`reservar_assento()` dentro de uma transação — ela trava a linha singleton
(`SELECT ... FOR UPDATE`), conta e só então deixa gravar. Duas criações
simultâneas se serializam nessa linha e a segunda enxerga a primeira.
"""

from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.exceptions import APIException

from apps.accounts.models import InternalRole, SeatLicense, User, UserKind

SEAT_ROLES = (InternalRole.ADMIN, InternalRole.SUPERVISOR, InternalRole.AGENT)

MENSAGEM_LIMITE = (
    "O limite de licenças de agente foi atingido ({used} de {total}). "
    "Desative um agente ou aumente o total em Configurações > Licenças."
)


class SeatLimitReached(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "seat_limit_reached"
    default_detail = "O limite de licenças de agente foi atingido."

    def __init__(self, used: int, total: int):
        super().__init__(MENSAGEM_LIMITE.format(used=used, total=total))
        # o handler do DRF só expõe `detail`; o `code` vai junto para o front
        self.detail = {
            "detail": self.detail,
            "code": "seat_limit_reached",
        }


class SeatTotalBelowUsed(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "seat_total_below_used"

    def __init__(self, used: int):
        super().__init__()
        self.detail = {
            "detail": (
                f"O total não pode ser menor que as licenças em uso ({used}). "
                "Desative agentes antes de reduzir."
            ),
            "code": "seat_total_below_used",
        }


def ocupa_assento(*, kind, internal_role, is_active) -> bool:
    return bool(
        is_active and kind == UserKind.INTERNAL and internal_role in SEAT_ROLES
    )


def user_ocupa_assento(user) -> bool:
    return ocupa_assento(
        kind=user.kind, internal_role=user.internal_role, is_active=user.is_active
    )


def seats_used() -> int:
    return User.objects.filter(
        kind=UserKind.INTERNAL, is_active=True, internal_role__in=SEAT_ROLES
    ).count()


def seat_total() -> int | None:
    """None = ilimitado."""
    config = SeatLicense.objects.filter(pk=1).first()
    if config is not None and config.agent_seat_limit is not None:
        return config.agent_seat_limit
    return getattr(settings, "AGENT_SEAT_LIMIT", None)


def licenses_payload() -> dict:
    total = seat_total()
    used = seats_used()
    return {
        "total": total,
        "used": used,
        "available": None if total is None else max(total - used, 0),
        "unlimited": total is None,
    }


def _lock_config() -> SeatLicense:
    SeatLicense.objects.get_or_create(pk=1)
    return SeatLicense.objects.select_for_update().get(pk=1)


def reservar_assento(quantidade: int = 1) -> None:
    """Trava e confere. Chamar DENTRO de `transaction.atomic()`, antes de gravar;
    levanta `SeatLimitReached` (409) se não couber. Sem transação aberta o lock
    não vale nada, então ela é exigida."""
    if not transaction.get_connection().in_atomic_block:
        raise RuntimeError("reservar_assento exige transaction.atomic().")
    config = _lock_config()
    total = (
        config.agent_seat_limit
        if config.agent_seat_limit is not None
        else getattr(settings, "AGENT_SEAT_LIMIT", None)
    )
    if total is None:
        return
    used = seats_used()
    if used + quantidade > total:
        raise SeatLimitReached(used, total)


def pode_entrar_agente_novo() -> bool:
    """Para o login social (não levanta; devolve se ainda cabe um agente)."""
    total = seat_total()
    return total is None or seats_used() < total
