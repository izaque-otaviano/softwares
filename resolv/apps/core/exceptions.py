"""Tratamento de erro da API — o que chega no `detail` chega no usuário.

O front mostra `detail` direto (`errorMessage`, frontend/src/api/client.ts),
porque as mensagens do DRF já vêm em português por `LANGUAGE_CODE=pt-br`.
Uma exceção furava isso: `Http404`.

`get_object_or_404` levanta `Http404("No Ticket matches the given query.")` —
uma f-string do próprio Django, sem tradução por design (é texto de
depuração, para a página de erro do DEBUG). O handler padrão do DRF repassa
`exc.args` para `NotFound`, e essa frase em inglês, com o nome da classe do
model dentro, ia parar na tela de quem abre um ticket apagado.
"""

from django.http import Http404
from rest_framework import exceptions
from rest_framework.views import exception_handler as drf_exception_handler


def exception_handler(exc, context):
    if isinstance(exc, Http404) and _e_do_django(exc):
        # Sem `*exc.args`, o texto padrão de `NotFound` é traduzido:
        # "Não encontrado.". `Http404` levantado à mão com mensagem própria
        # (existem dois, "Arquivo indisponível.") passa intacto — quem
        # escreveu escolheu aquele texto para ser lido.
        exc = exceptions.NotFound()
    resposta = drf_exception_handler(exc, context)
    if resposta is not None and isinstance(exc, exceptions.Throttled):
        _explicar_espera(resposta, exc)
    return resposta


def _espera_por_extenso(segundos: int) -> str:
    """"1 minuto", "37 minutos", "2 horas" — arredondado para CIMA: dizer
    "30 segundos" para quem terá de esperar 30,4 faria a pessoa tentar cedo
    demais e bater de novo no limite."""
    if segundos < 60:
        return f"{segundos} segundo{'s' if segundos != 1 else ''}"
    minutos = -(-segundos // 60)
    if minutos < 60:
        return f"{minutos} minuto{'s' if minutos != 1 else ''}"
    horas = -(-minutos // 60)
    return f"{horas} hora{'s' if horas != 1 else ''}"


def _explicar_espera(resposta, exc: exceptions.Throttled) -> None:
    """429 do throttle do DRF (ex.: 20 logins/hora por IP): diz QUANTO esperar.

    O texto padrão do DRF ("Pedido foi limitado... Disponível em 3598
    segundos") é meio traduzido e fala em segundos crus; a tela mostra
    `detail` direto, então ele precisa ser a frase pronta. O cabeçalho
    `Retry-After` (segundos, RFC 9110) é para quem automatiza — o DRF só o
    põe quando sabe a espera, aqui ele é sempre garantido. O LIMITE não muda;
    só a resposta de quem o atinge.
    """
    espera = int(exc.wait) if exc.wait is not None else 60
    espera = max(espera, 1)
    resposta.data = {
        "detail": (
            "Muitas tentativas em pouco tempo. "
            f"Aguarde {_espera_por_extenso(espera)} e tente de novo."
        ),
        "code": "throttled",
        "retry_after": espera,
    }
    resposta["Retry-After"] = str(espera)


def _e_do_django(exc: Http404) -> bool:
    """A frase que o `get_object_or_404` monta, e só ela."""
    texto = str(exc)
    return texto.startswith("No ") and texto.endswith("matches the given query.")
