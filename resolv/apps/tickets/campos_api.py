"""Campos personalizados e formulários de ticket pela API (`/settings/…`).

Interno LÊ (a tela do ticket precisa das definições para renderizar), só quem
tem `settings.manage` ESCREVE. Os campos são informação da equipe: nada daqui
chega ao cliente (as rotas exigem papel interno).
"""

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Count, Max
from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import serializers, viewsets
from rest_framework import status as http
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Team
from apps.audit.models import AuditAction, AuditLog
from apps.core.permissions import IsInternalReadAdminWrite
from apps.tickets.models import (
    TicketField,
    TicketFieldType,
    TicketForm,
    TicketFormField,
    TicketType,
)
from apps.tickets.services import custom_fields


def _auditar(request, instancia, *, resumo: str, mudancas: dict | None = None) -> None:
    AuditLog.objects.create(
        actor=request.user,
        action=AuditAction.CONFIG_CHANGE,
        content_type=ContentType.objects.get_for_model(type(instancia)),
        object_id=str(instancia.pk),
        changes=mudancas or {},
        summary=resumo[:250],
    )


def _conflito(detail: str, code: str) -> Response:
    return Response({"detail": detail, "code": code}, status=http.HTTP_409_CONFLICT)


class _ReordenarSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False)

    def validate_ids(self, ids):
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError("Há ids repetidos.")
        return ids


class _ClonarSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80, required=False)


def _reordenar(model, ids: list[int]) -> None:
    """Os `ids` ganham as primeiras posições, na ordem enviada; os demais vêm
    depois, na ordem em que já estavam."""
    existentes = {o.pk: o for o in model.objects.all()}
    desconhecidos = [i for i in ids if i not in existentes]
    if desconhecidos:
        raise serializers.ValidationError(
            {"ids": f"Não encontrado(s): {', '.join(map(str, desconhecidos))}."}
        )
    resto = [o.pk for o in sorted(existentes.values(), key=lambda o: (o.order, o.pk))
             if o.pk not in set(ids)]
    with transaction.atomic():
        for posicao, pk in enumerate(ids + resto):
            if existentes[pk].order != posicao:
                model.objects.filter(pk=pk).update(order=posicao)


# --------------------------------------------------------------------------- #
# Campos
# --------------------------------------------------------------------------- #

class TicketFieldSerializer(serializers.ModelSerializer):
    values_count = serializers.IntegerField(read_only=True, default=0)
    title = serializers.CharField(max_length=80)
    options = serializers.JSONField(required=False)

    class Meta:
        model = TicketField
        fields = [
            "id", "slug", "title", "description", "type", "options",
            "is_required", "is_active", "order", "is_system", "values_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["slug", "is_system", "created_at", "updated_at"]

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Informe o título.")
        return value

    def validate_options(self, value):
        return custom_fields.normalizar_opcoes(value)

    def validate(self, data):
        inst = self.instance
        tipo = data.get("type", inst.type if inst else None)
        if inst and "type" in data and data["type"] != inst.type:
            if inst.values.exists():
                raise serializers.ValidationError({
                    "type": "Este campo já tem valores em tickets: o tipo não pode mudar. "
                            "Crie um campo novo e desative este.",
                })
        if tipo == TicketFieldType.DROPDOWN:
            opcoes = data.get("options", inst.options if inst else [])
            if not opcoes:
                raise serializers.ValidationError(
                    {"options": "Informe ao menos uma opção para a lista."}
                )
        else:
            # só dropdown tem opções
            data["options"] = []
        ativo = data.get("is_active", inst.is_active if inst else True)
        reativando = inst is not None and ativo and not inst.is_active
        if ativo and (inst is None or reativando):
            custom_fields.checar_limite_de_ativos()
        return data


class TicketFieldViewSet(viewsets.ModelViewSet):
    """Campos personalizados — definição (`/settings/ticket-fields/`).

    Interno lê; admin escreve. `DELETE` só apaga campo que nunca teve valor
    (senão 409: desative). O `type` não muda depois de existirem valores.
    """

    queryset = TicketField.objects.annotate(values_count=Count("values")).order_by(
        "order", "id"
    )
    serializer_class = TicketFieldSerializer
    permission_classes = [IsInternalReadAdminWrite]

    def perform_create(self, serializer):
        d = serializer.validated_data
        ultimo = TicketField.objects.aggregate(m=Max("order"))["m"]
        campo = serializer.save(
            slug=custom_fields.slug_do_titulo(d["title"]),
            order=d.get("order", 0 if ultimo is None else ultimo + 1),
        )
        _auditar(self.request, campo, resumo=f"Campo personalizado criado: {campo.title}",
                 mudancas={"slug": campo.slug, "type": campo.type})

    def perform_update(self, serializer):
        antes = {
            k: getattr(serializer.instance, k)
            for k in ("title", "description", "type", "options", "is_required",
                      "is_active", "order")
        }
        campo = serializer.save()
        mudou = {
            k: [antes[k], getattr(campo, k)] for k in antes if antes[k] != getattr(campo, k)
        }
        if mudou:
            _auditar(self.request, campo,
                     resumo=f"Campo personalizado alterado: {campo.title}", mudancas=mudou)

    def destroy(self, request, *args, **kwargs):
        campo = self.get_object()
        if campo.is_system:
            return _conflito("Campo de sistema não pode ser apagado.", "field_system")
        if campo.values.exists():
            return _conflito(
                "Este campo já foi usado em tickets e não pode ser apagado. "
                "Desative-o para escondê-lo.",
                "field_in_use",
            )
        _auditar(request, campo, resumo=f"Campo personalizado apagado: {campo.title}",
                 mudancas={"slug": campo.slug})
        campo.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @extend_schema(request=_ReordenarSerializer, responses=TicketFieldSerializer(many=True))
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request):
        """`{"ids": [3, 1, 2]}` — define a ordem; ids omitidos vão para o fim.
        Devolve a lista inteira já ordenada."""
        ser = _ReordenarSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        _reordenar(TicketField, ser.validated_data["ids"])
        ids = list(TicketField.objects.order_by("order", "id").values_list("pk", flat=True))
        primeiro = TicketField.objects.order_by("order", "id").first()
        if primeiro:
            _auditar(request, primeiro, resumo="Campos personalizados reordenados",
                     mudancas={"ids": ids})
        dados = self.get_serializer(self.get_queryset(), many=True).data
        return Response(dados)


# --------------------------------------------------------------------------- #
# Formulários
# --------------------------------------------------------------------------- #

class _ItemDoFormularioInput(serializers.Serializer):
    field = serializers.CharField(help_text="id ou slug do campo")
    is_required = serializers.BooleanField(default=False)


class _ItemDoFormularioOutput(serializers.Serializer):
    field = serializers.IntegerField(source="field_id")
    slug = serializers.CharField(source="field.slug")
    title = serializers.CharField(source="field.title")
    type = serializers.CharField(source="field.type")
    field_is_active = serializers.BooleanField(source="field.is_active")
    is_required = serializers.BooleanField()
    order = serializers.IntegerField()


class TicketFormSerializer(serializers.ModelSerializer):
    ticket_count = serializers.IntegerField(read_only=True, default=0)
    default_team_name = serializers.CharField(
        source="default_team.name", read_only=True, default=None
    )
    default_team = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.filter(is_active=True), required=False, allow_null=True,
    )
    type = serializers.ChoiceField(
        choices=TicketType.choices, required=False, allow_null=True,
    )
    name = serializers.CharField(max_length=80)
    form_fields = serializers.SerializerMethodField()
    # explícito: o validador de unicidade automático barraria TROCAR o padrão
    is_default = serializers.BooleanField(required=False)

    class Meta:
        model = TicketForm
        fields = [
            "id", "name", "description", "is_active", "is_default", "order",
            "default_team", "default_team_name", "type", "form_fields",
            "ticket_count", "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
        # a unicidade do padrão é regra de negócio da view (trocar o padrão é
        # permitido), não um erro 400 do validador automático da restrição
        validators = []

    @extend_schema_field(_ItemDoFormularioOutput(many=True))
    def get_form_fields(self, obj):
        itens = sorted(obj.form_fields.all(), key=lambda i: (i.order, i.pk))
        return _ItemDoFormularioOutput(itens, many=True).data

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Informe o nome.")
        repetido = TicketForm.objects.filter(name__iexact=value)
        if self.instance:
            repetido = repetido.exclude(pk=self.instance.pk)
        if repetido.exists():
            raise serializers.ValidationError("Já existe um formulário com este nome.")
        return value

    def _itens(self):
        """Lista de campos do corpo (`form_fields`), validada; `None` = ausente."""
        bruto = self.initial_data.get("form_fields") if hasattr(self.initial_data, "get") else None
        if bruto is None:
            return None
        if not isinstance(bruto, list):
            raise serializers.ValidationError({"form_fields": "Envie uma lista."})
        itens, vistos, erros = [], set(), []
        atuais = set()
        if self.instance:
            atuais = set(self.instance.form_fields.values_list("field_id", flat=True))
        for i, item in enumerate(bruto, start=1):
            ser = _ItemDoFormularioInput(data=item if isinstance(item, dict) else {})
            if not ser.is_valid():
                erros.append(f"Item {i}: formato inválido.")
                continue
            ref = str(ser.validated_data["field"])
            campo = (
                TicketField.objects.filter(pk=int(ref)).first() if ref.isdigit()
                else TicketField.objects.filter(slug=ref).first()
            )
            if campo is None:
                erros.append(f"Item {i}: campo \"{ref}\" não existe.")
                continue
            if campo.pk in vistos:
                erros.append(f"Item {i}: campo \"{campo.title}\" repetido.")
                continue
            if not campo.is_active and campo.pk not in atuais:
                erros.append(f"Item {i}: campo \"{campo.title}\" está desativado.")
                continue
            vistos.add(campo.pk)
            itens.append((campo, ser.validated_data["is_required"]))
        if erros:
            raise serializers.ValidationError({"form_fields": erros})
        return itens

    def validate(self, data):
        inst = self.instance
        ativo = data.get("is_active", inst.is_active if inst else True)
        if data.get("is_default") and not ativo:
            raise serializers.ValidationError(
                {"is_default": "O formulário padrão precisa estar ativo."}
            )
        data["_itens"] = self._itens()
        return data


class TicketFormViewSet(viewsets.ModelViewSet):
    """Formulários de ticket (`/settings/ticket-forms/`). Interno lê; admin
    escreve. Sempre há exatamente UM formulário padrão ativo."""

    queryset = TicketForm.objects.select_related("default_team").prefetch_related(
        "form_fields__field"
    ).annotate(ticket_count=Count("tickets", distinct=True)).order_by("order", "id")
    serializer_class = TicketFormSerializer
    permission_classes = [IsInternalReadAdminWrite]

    def get_queryset(self):
        # garante a existência do padrão para quem lista (banco novo/esvaziado)
        TicketForm.default()
        return super().get_queryset()

    @staticmethod
    def _gravar_itens(form, itens) -> None:
        form.form_fields.all().delete()
        TicketFormField.objects.bulk_create([
            TicketFormField(form=form, field=campo, order=i, is_required=obrig)
            for i, (campo, obrig) in enumerate(itens)
        ])

    @staticmethod
    def _tornar_padrao(form) -> None:
        TicketForm.objects.filter(is_default=True).exclude(pk=form.pk).update(
            is_default=False
        )

    def _resposta(self, form, status=http.HTTP_200_OK):
        form = self.get_queryset().get(pk=form.pk)
        return Response(self.get_serializer(form).data, status=status)

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        itens = d.pop("_itens", None)
        with transaction.atomic():
            ultimo = TicketForm.objects.aggregate(m=Max("order"))["m"]
            existe_padrao = TicketForm.objects.filter(is_default=True).exists()
            padrao = d.get("is_default", False) or not existe_padrao
            if padrao and not d.get("is_active", True):
                return Response(
                    {"is_default": ["O formulário padrão precisa estar ativo."]},
                    status=http.HTTP_400_BAD_REQUEST,
                )
            if padrao:
                TicketForm.objects.filter(is_default=True).update(is_default=False)
            form = ser.save(
                is_default=padrao,
                order=d.get("order", 0 if ultimo is None else ultimo + 1),
            )
            if itens:
                self._gravar_itens(form, itens)
            _auditar(request, form, resumo=f"Formulário criado: {form.name}",
                     mudancas={"is_default": form.is_default})
        return self._resposta(form, http.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        form = self.get_object()
        parcial = kwargs.pop("partial", False)
        ser = self.get_serializer(form, data=request.data, partial=parcial)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        itens = d.pop("_itens", None)
        eh_padrao = form.is_default
        if eh_padrao and d.get("is_default") is False:
            return _conflito(
                "Este é o formulário padrão. Escolha outro formulário como padrão "
                "antes de tirar este.", "default_form_required",
            )
        if eh_padrao and d.get("is_active") is False:
            return _conflito(
                "Este é o formulário padrão e não pode ser desativado. Escolha outro "
                "formulário como padrão antes.", "default_form_required",
            )
        antes = {k: getattr(form, k) for k in
                 ("name", "description", "is_active", "is_default", "order", "type",
                  "default_team_id")}
        with transaction.atomic():
            if d.get("is_default") and not eh_padrao:
                self._tornar_padrao(form)
            form = ser.save()
            if itens is not None:
                self._gravar_itens(form, itens)
            mudou = {k: [v, getattr(form, k)] for k, v in antes.items()
                     if v != getattr(form, k)}
            if itens is not None:
                mudou["form_fields"] = [c.slug for c, _ in itens]
            if mudou:
                _auditar(request, form, resumo=f"Formulário alterado: {form.name}",
                         mudancas=mudou)
        return self._resposta(form)

    def destroy(self, request, *args, **kwargs):
        form = self.get_object()
        if form.is_default:
            return _conflito(
                "Este é o formulário padrão e não pode ser apagado. Escolha outro "
                "formulário como padrão antes.", "default_form_required",
            )
        if form.tickets.exists():
            return _conflito(
                "Há tickets usando este formulário. Desative-o em vez de apagar.",
                "form_in_use",
            )
        _auditar(request, form, resumo=f"Formulário apagado: {form.name}")
        form.delete()
        return Response(status=http.HTTP_204_NO_CONTENT)

    @extend_schema(request=_ReordenarSerializer, responses=TicketFormSerializer(many=True))
    @action(detail=False, methods=["post"], url_path="reorder")
    def reorder(self, request):
        """`{"ids": [2, 1]}` — define a ordem; omitidos vão para o fim."""
        ser = _ReordenarSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        TicketForm.default()
        _reordenar(TicketForm, ser.validated_data["ids"])
        primeiro = TicketForm.objects.order_by("order", "id").first()
        _auditar(request, primeiro, resumo="Formulários reordenados",
                 mudancas={"ids": list(
                     TicketForm.objects.order_by("order", "id").values_list("pk", flat=True)
                 )})
        return Response(self.get_serializer(self.get_queryset(), many=True).data)

    @extend_schema(request=_ClonarSerializer, responses={201: TicketFormSerializer})
    @action(detail=True, methods=["post"], url_path="clone")
    def clone(self, request, pk=None):
        """Copia o formulário (campos, obrigatoriedade, equipe e tipo padrão).
        Corpo opcional: `{"name": "..."}`; sem nome vira "Cópia de X". A cópia
        nunca é o padrão."""
        origem = self.get_object()
        nome = request.data.get("name") if hasattr(request.data, "get") else None
        if nome is not None:
            if not isinstance(nome, str) or not nome.strip() or len(nome.strip()) > 80:
                raise serializers.ValidationError({"name": "Nome inválido (1 a 80 caracteres)."})
            nome = nome.strip()
            if TicketForm.objects.filter(name__iexact=nome).exists():
                raise serializers.ValidationError(
                    {"name": "Já existe um formulário com este nome."}
                )
        else:
            base = f"Cópia de {origem.name}"[:70]
            nome, n = base, 2
            while TicketForm.objects.filter(name__iexact=nome).exists():
                nome, n = f"{base} ({n})", n + 1
        with transaction.atomic():
            ultimo = TicketForm.objects.aggregate(m=Max("order"))["m"] or 0
            copia = TicketForm.objects.create(
                name=nome, description=origem.description, is_active=True,
                is_default=False, order=ultimo + 1, default_team=origem.default_team,
                type=origem.type,
            )
            TicketFormField.objects.bulk_create([
                TicketFormField(form=copia, field_id=i.field_id, order=i.order,
                                is_required=i.is_required)
                for i in origem.form_fields.all()
            ])
            _auditar(request, copia, resumo=f"Formulário clonado: {origem.name} → {copia.name}",
                     mudancas={"origem": origem.pk})
        return self._resposta(copia, http.HTTP_201_CREATED)
