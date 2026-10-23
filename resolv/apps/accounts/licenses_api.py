"""GET/PATCH/PUT /settings/licenses/ — licenças de agente (ver `licenses.py`)."""

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import licenses
from apps.accounts.models import SeatLicense
from apps.audit.models import AuditAction, AuditLog
from apps.core.permissions import IsInternalReadAdminWrite

_Licenses = inline_serializer("Licenses", {
    "total": serializers.IntegerField(allow_null=True),
    "used": serializers.IntegerField(),
    "available": serializers.IntegerField(allow_null=True),
    "unlimited": serializers.BooleanField(),
})


class LicensesView(APIView):
    """Interno lê; só quem administra altera o total (`total: null` = sem limite)."""

    permission_classes = [IsInternalReadAdminWrite]

    @extend_schema(
        description=(
            "Licenças de agente: `used` conta usuários ativos admin/supervisor/agente. "
            "`total: null` = sem limite. Criar, ativar ou promover a agente acima do total "
            "devolve 409 `seat_limit_reached`; reduzir o total abaixo do usado, 400 "
            "`seat_total_below_used`."
        ),
        responses=_Licenses,
    )
    def get(self, request):
        return Response(licenses.licenses_payload())

    @extend_schema(
        request=inline_serializer("LicensesUpdate", {
            "total": serializers.IntegerField(allow_null=True, min_value=0)
        }),
        responses=_Licenses,
    )
    def patch(self, request):
        if "total" not in request.data:
            raise ValidationError(
                {"total": "Informe o total de licenças (ou null para sem limite)."}
            )
        campo = serializers.IntegerField(allow_null=True, min_value=0, max_value=100000)
        try:
            novo = campo.run_validation(request.data.get("total"))
        except ValidationError as exc:
            raise ValidationError({"total": exc.detail}) from exc

        with transaction.atomic():
            # mesma trava de `reservar_assento`: não deixa o total cair abaixo
            # do usado enquanto alguém ocupa o último assento
            config = licenses._lock_config()
            used = licenses.seats_used()
            if novo is not None and novo < used:
                raise licenses.SeatTotalBelowUsed(used)
            antes = config.agent_seat_limit
            config.agent_seat_limit = novo
            config.save(update_fields=["agent_seat_limit", "updated_at"])
            AuditLog.objects.create(
                actor=request.user,
                action=AuditAction.CONFIG_CHANGE,
                content_type=ContentType.objects.get_for_model(SeatLicense),
                object_id=str(config.pk),
                changes={"agent_seat_limit": [antes, novo]},
                summary="Total de licenças de agente alterado",
            )
        return Response(licenses.licenses_payload())

    put = patch
