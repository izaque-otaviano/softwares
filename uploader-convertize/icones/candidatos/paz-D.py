#!/usr/bin/env python3
"""Candidato D: mão em V com dois lápis. Fidelidade à referência (punho redondo, dois dedos
dobrados à esquerda, polegar cruzando por cima), desenhada do zero.

    python3 icones/candidatos/paz-D.py
"""

import os
import subprocess
import sys

sys.path.insert(0, "/home/user/uploader-convertize/icones")
from gerar_icones import SQ, icon  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
INK, PAPER = "#15151a", "#ffffff"
BG, LEAD, ERASER, WOOD = "#f7b928", "#ffe14d", "#ff6f7d", "#fde9c6"
SW = 30
O = f'stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round" stroke-linecap="round"'


def pencil(x, y, angle, length, tip):
    """Lápis de largura 120, base em (x, y) (dentro do punho), girado `angle` graus em torno da base."""
    hw = 60
    top = y - length
    g = [f'<g transform="rotate({angle} {x} {y})">']
    bt = top + 140  # fim do corpo (início da ponta / da virola)
    # corpo
    g.append(f'<rect x="{x-hw}" y="{bt}" width="{2*hw}" height="{y-bt+60}" fill="{LEAD}"/>')
    for dx in (-20, 20):
        g.append(f'<line x1="{x+dx}" y1="{bt+8}" x2="{x+dx}" y2="{y+40}" stroke="{INK}" stroke-width="12"/>')
    if tip:
        g.append(f'<path d="M{x-hw},{bt} L{x},{top} L{x+hw},{bt} Z" fill="{WOOD}" {O}/>')
        g.append(f'<path d="M{x-24},{top+72} L{x},{top+10} L{x+24},{top+72} Z" fill="{INK}"/>')
    else:
        g.append(f'<rect x="{x-hw}" y="{top}" width="{2*hw}" height="{bt-top}" rx="30" fill="{PAPER}"/>')
        g.append(f'<path d="M{x-hw},{top+70} L{x-hw},{top+30} Q{x-hw},{top} {x-hw+30},{top} L{x+hw-30},{top} '
                 f'Q{x+hw},{top} {x+hw},{top+30} L{x+hw},{top+70} Z" fill="{ERASER}"/>')
        g.append(f'<rect x="{x-hw}" y="{top}" width="{2*hw}" height="{bt-top}" rx="30" fill="none" {O}/>')
        g.append(f'<line x1="{x-hw}" y1="{top+62}" x2="{x+hw}" y2="{top+62}" {O}/>')
        g.append(f'<line x1="{x-hw}" y1="{top+104}" x2="{x+hw}" y2="{top+104}" {O}/>')
    g.append(f'<line x1="{x-hw}" y1="{bt}" x2="{x+hw}" y2="{bt}" {O}/>')
    g.append(f'<line x1="{x-hw}" y1="{bt}" x2="{x-hw}" y2="{y+50}" {O}/>')
    g.append(f'<line x1="{x+hw}" y1="{bt}" x2="{x+hw}" y2="{y+50}" {O}/>')
    g.append("</g>")
    return "".join(g)


def hand():
    # punho: quase um círculo (como na referência), um pouco mais largo nos nós do que no pulso
    fist = ("M318,700 C318,560 410,458 548,458 C700,458 782,560 782,700 "
            "C782,836 690,922 548,922 C420,922 318,838 318,700 Z")
    # dedos dobrados (mínimo e anelar): cápsulas que nascem acima do topo do punho e descem
    pinky = f'<rect x="298" y="490" width="94" height="330" rx="47" fill="{PAPER}" {O}/>'
    ring = f'<rect x="392" y="452" width="108" height="384" rx="54" fill="{PAPER}" {O}/>'
    # polegar: nasce do contorno direito do punho, cruza em diagonal (grosso na raiz, mais fino na
    # ponta) e termina com ponta redonda SOBRE o anelar; a linha de baixo morre dentro da palma
    # (vinco da base do polegar), para não parecer uma faixa.
    thumb = (f'<path d="M774,640 C732,574 628,558 552,580 C504,594 470,610 460,650 '
             f'C450,714 486,762 542,758 C604,754 652,768 690,800" fill="{PAPER}" {O}/>')
    # vinco da palma, abaixo do polegar
    creases = f'<path d="M606,868 Q662,850 716,866" fill="none" {O}/>'
    return fist, pinky + ring, thumb + creases


def build():
    fist, fingers, thumb = hand()
    body = f"""
<path d="{SQ}" fill="{BG}"/>
{pencil(520, 680, -20, 540, False)}
{pencil(612, 680, 20, 560, True)}
<path d="{fist}" fill="{PAPER}" {O}/>
{fingers}
{thumb}
"""
    return icon("", BG, body, glass=False)


if __name__ == "__main__":
    svg = os.path.join(HERE, "paz-D.svg")
    with open(svg, "w") as f:
        f.write(build())
    subprocess.run(["resvg", "-w", "1024", svg, svg[:-4] + ".png"], check=True)
    subprocess.run(["resvg", "-w", "64", svg, svg[:-4] + "-64.png"], check=True)
    print(svg)
