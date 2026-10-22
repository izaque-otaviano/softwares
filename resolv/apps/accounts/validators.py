"""Validadores de senha além dos que o Django traz.

O Django já barra senha curta, parecida com o e-mail, comum ou só numérica.
O que falta é exigir VARIEDADE: `senhasenha12` passa em todos os quatro.
"""

import re
import secrets

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError


class VariedadeDeCaracteresValidator:
    """Exige pelo menos três de quatro classes: minúscula, maiúscula, dígito e
    símbolo. Três, não quatro, de propósito: uma frase longa com espaços e
    números é mais forte que `Abc!1234`, e exigir símbolo empurra a pessoa
    para o `!` no fim — que os dicionários de ataque já contemplam."""

    CLASSES = (
        re.compile(r"[a-z]"),
        re.compile(r"[A-Z]"),
        re.compile(r"\d"),
        re.compile(r"[^\w\s]|_"),
    )

    def __init__(self, minimo=3):
        self.minimo = minimo

    def validate(self, password, user=None):
        presentes = sum(1 for classe in self.CLASSES if classe.search(password))
        if presentes < self.minimo:
            raise ValidationError(
                "A senha precisa misturar pelo menos três tipos de caractere: "
                "letras minúsculas, maiúsculas, números e símbolos.",
                code="password_sem_variedade",
            )

    def get_help_text(self):
        return (
            "Misture pelo menos três tipos de caractere: letras minúsculas, "
            "maiúsculas, números e símbolos."
        )


_MINUSCULAS = "abcdefghijkmnopqrstuvwxyz"   # sem o "l", que confunde com "1"/"I"
_MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"    # sem "I" e "O"
_DIGITOS = "23456789"                        # sem "0"/"1"
_SIMBOLOS = "!@#$%&*-_+=?"                   # sem aspas/espaço: cabe em chat e telefone


def gerar_senha_temporaria(user=None, tamanho=16, tentativas=10):
    """Sorteia uma senha temporária que PASSA em `AUTH_PASSWORD_VALIDATORS`.

    `secrets.token_urlsafe` só tem letras, dígitos, `-` e `_`: em ~1 de cada
    algumas centenas de sorteios sai uma senha sem maiúscula (ou sem dígito)
    e o `VariedadeDeCaracteresValidator` a recusa. Aqui a senha NASCE com
    pelo menos uma minúscula, uma maiúscula, um dígito e um símbolo (as
    quatro classes, mais que as três exigidas) e o resto vem do conjunto
    todo; a ordem é embaralhada com `secrets.SystemRandom`, tudo
    criptográfico. Os caracteres ambíguos (`0/O`, `1/l/I`) ficam de fora
    porque a senha é ditada por telefone/chat.

    O laço é limitado: se, por azar, o sorteio esbarrar nos validadores de
    similaridade/senha comum, tenta de novo até `tentativas` vezes e só
    então levanta `ValidationError` (que a view devolve como 400, nunca 500).
    """
    todos = _MINUSCULAS + _MAIUSCULAS + _DIGITOS + _SIMBOLOS
    sorteador = secrets.SystemRandom()
    ultimo_erro = None
    for _ in range(tentativas):
        caracteres = [
            secrets.choice(_MINUSCULAS),
            secrets.choice(_MAIUSCULAS),
            secrets.choice(_DIGITOS),
            secrets.choice(_SIMBOLOS),
        ]
        caracteres += [secrets.choice(todos) for _ in range(max(tamanho, 12) - 4)]
        sorteador.shuffle(caracteres)
        senha = "".join(caracteres)
        try:
            validate_password(senha, user)
        except ValidationError as exc:
            ultimo_erro = exc
            continue
        return senha
    raise ultimo_erro
