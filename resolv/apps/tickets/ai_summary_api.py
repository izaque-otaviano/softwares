"""POST /tickets/{id}/ai-summary/ — resumo de IA (ver `ai_summary.py`)."""

import logging

from django.contrib.contenttypes.models import ContentType
from drf_spectacular.utils import OpenApiTypes, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.accounts.rbac import Perm
from apps.audit.models import AuditAction, AuditLog
from apps.audit.services import record_ticket_access
from apps.core.permissions import HasPerm
from apps.tickets import ai_summary, selectors
from apps.tickets.models import Ticket

logger = logging.getLogger(__name__)


class AISummaryThrottle(UserRateThrottle):
    """Por usuário; o teto custa dinheiro e manda texto do cliente para fora."""

    scope = "ai_summary"

    def get_rate(self):
        from rest_framework.settings import api_settings

        return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope) or "20/hour"


class TicketAISummaryView(APIView):
    permission_classes = [HasPerm.of(Perm.TICKET_VIEW)]
    throttle_classes = [AISummaryThrottle]

    @extend_schema(
        description=(
            "Gera (sem gravar) um resumo do ticket por IA. Só agentes que enxergam o "
            "ticket. Envia ao provedor apenas assunto e mensagens (públicas e notas "
            "internas) com e-mail, telefone, CPF e CNPJ mascarados, limitadas às mais "
            "recentes (`truncated`). 503 `ai_not_configured`: IA desligada ou sem chave "
            "(variáveis de ambiente). 502 `ai_provider_error`: o provedor falhou. "
            "429: teto de 20 resumos/hora por usuário."
        ),
        request=None,
        responses={
            200: inline_serializer("TicketAISummary", {
                "summary": serializers.CharField(),
                "generated_at": serializers.DateTimeField(),
                "provider": serializers.CharField(),
                "truncated": serializers.BooleanField(),
            }),
            502: OpenApiTypes.OBJECT,
            503: OpenApiTypes.OBJECT,
        },
    )
    def post(self, request, pk):
        if not request.user.is_internal:
            raise PermissionDenied("O resumo de IA é um recurso da equipe de atendimento.")
        # 404 fora do escopo, sem revelar a existência (igual ao resto de /tickets/)
        try:
            ticket = selectors.visible_tickets(request.user).get(pk=pk)
        except Ticket.DoesNotExist:
            raise NotFound() from None
        if not ticket.is_content_visible_to(request.user):
            raise PermissionDenied("Este ticket é restrito ao solicitante.")

        try:
            resultado = ai_summary.summarize_ticket(ticket)
        except ai_summary.AINotConfigured:
            return Response(
                {
                    "detail": "O resumo por IA não está configurado neste ambiente.",
                    "code": "ai_not_configured",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ai_summary.AIProviderError:
            return Response(
                {
                    "detail": (
                        "Não foi possível gerar o resumo agora. "
                        "Tente novamente em instantes."
                    ),
                    "code": "ai_provider_error",
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if ticket.is_restricted():
            record_ticket_access(
                ticket=ticket, user=request.user, context="ai_summary",
                granted=True, request=request,
            )
        # SEM conteúdo: só quem, qual ticket, qual provedor e o tamanho do envio
        AuditLog.objects.create(
            actor=request.user,
            action=AuditAction.EXPORT,  # o texto do ticket sai para um terceiro
            content_type=ContentType.objects.get_for_model(Ticket),
            object_id=str(ticket.pk),
            summary=f"Resumo de IA solicitado (provedor: {resultado['provider']})",
            changes={
                "provider": resultado["provider"],
                "model": resultado["_model"],
                "messages_sent": resultado["_messages"],
                "truncated": resultado["truncated"],
            },
            ip_address=request.META.get("REMOTE_ADDR") or None,
        )
        return Response({
            "summary": resultado["summary"],
            "generated_at": resultado["generated_at"],
            "provider": resultado["provider"],
            "truncated": resultado["truncated"],
        })
