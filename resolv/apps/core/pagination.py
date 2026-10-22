"""Paginação padrão da API.

`LimitOffsetPagination` sem `max_limit` aceita qualquer inteiro em `?limit=` —
inclusive um que não cabe no bigint do PostgreSQL, que devolve 500 em todo
endpoint paginado do projeto. Achado na auditoria das notas; o teto fecha
isso para todos.

1000 é folga, não meta: a maior página que o frontend pede é 500. Acima do
teto o DRF apara em silêncio (`?limit=5000` vira 1000), que é o comportamento
certo para um número digitado na URL — recusar com 400 derrubaria a listagem
inteira por causa de um parâmetro.
"""

from rest_framework.pagination import LimitOffsetPagination
from rest_framework.utils.urls import remove_query_param, replace_query_param


class LimitOffsetComTeto(LimitOffsetPagination):
    max_limit = 1000


class LimitOffsetOuPagina(LimitOffsetComTeto):
    """Igual à padrão, mas também entende `?page=N` (1 = primeira página) junto
    com `?limit=` (tamanho da página; padrão `default_limit`).

    Existe para as listas que são ARRAY PURO por contrato e só viram envelope
    `{count, next, previous, results}` quando o chamador PEDE (`page`, `limit`
    ou `offset` presentes) — ver `/ticket-views/`. Quem pagina por `page`
    recebe `next`/`previous` também em `page`; quem usa `offset`, em `offset`.
    """

    default_limit = 25

    def pediu_pagina(self, request) -> bool:
        params = request.query_params
        return any(k in params for k in ("page", "limit", "offset"))

    def _usa_page(self) -> bool:
        return "page" in self.request.query_params

    def get_offset(self, request):
        if "page" in request.query_params:
            try:
                pagina = max(int(request.query_params["page"]), 1)
            except (TypeError, ValueError):
                pagina = 1
            return (pagina - 1) * self.get_limit(request)
        return super().get_offset(request)

    def _link(self, offset):
        url = self.request.build_absolute_uri()
        if self._usa_page():
            url = remove_query_param(url, self.offset_query_param)
            return replace_query_param(url, "page", offset // self.limit + 1)
        return replace_query_param(url, self.offset_query_param, offset)

    def get_next_link(self):
        if self.offset + self.limit >= self.count:
            return None
        url = self._link(self.offset + self.limit)
        return replace_query_param(url, self.limit_query_param, self.limit)

    def get_previous_link(self):
        if self.offset <= 0:
            return None
        url = self._link(max(self.offset - self.limit, 0))
        return replace_query_param(url, self.limit_query_param, self.limit)
