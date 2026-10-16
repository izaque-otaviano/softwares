#!/usr/bin/env python3
"""Candidato C: mão em V (vista 3/4) com dois lápis no lugar do indicador e do médio.
Punho de camisa embaixo ancora a mão; polegar em primeiro plano, dobrado por cima dos dedos
anelar e mínimo, que aparecem um atrás do outro em perspectiva.

    python3 icones/candidatos/paz-C.py
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
    """Lápis de largura 120, base em (x, y), girado `angle` graus em torno da base.
    tip=True: ponta para cima; False: borracha para cima. A base fica escondida pelo punho."""
    w, hw = 120, 60
    top = y - length
    body_top = top + 150
    g = [f'<g transform="rotate({angle} {x} {y})">']
    g.append(f'<rect x="{x-hw}" y="{body_top}" width="{w}" height="{y-body_top+60}" fill="{LEAD}"/>')
    for dx in (-20, 20):
        g.append(f'<line x1="{x+dx}" y1="{body_top+12}" x2="{x+dx}" y2="{y+50}" stroke="{INK}" stroke-width="12"/>')
    if tip:
        g.append(f'<path d="M{x-hw},{body_top} L{x},{top} L{x+hw},{body_top} Z" fill="{WOOD}"/>')
        g.append(f'<path d="M{x-hw},{body_top} L{x},{top} L{x+hw},{body_top}" fill="none" {O}/>')
        g.append(f'<path d="M{x-27},{top+76} L{x},{top+6} L{x+27},{top+76} Z" fill="{INK}"/>')
    else:
        g.append(f'<rect x="{x-hw}" y="{top}" width="{w}" height="84" rx="26" fill="{ERASER}"/>')
        g.append(f'<rect x="{x-hw}" y="{top+62}" width="{w}" height="88" fill="{PAPER}"/>')
        g.append(f'<line x1="{x-hw}" y1="{top+62}" x2="{x+hw}" y2="{top+62}" {O}/>')
        g.append(f'<line x1="{x-hw}" y1="{top+106}" x2="{x+hw}" y2="{top+106}" {O}/>')
        g.append(f'<rect x="{x-hw}" y="{top}" width="{w}" height="150" rx="26" fill="none" {O}/>')
    g.append(f'<line x1="{x-hw}" y1="{body_top}" x2="{x+hw}" y2="{body_top}" {O}/>')
    g.append(f'<line x1="{x-hw}" y1="{body_top}" x2="{x-hw}" y2="{y+60}" {O}/>')
    g.append(f'<line x1="{x+hw}" y1="{body_top}" x2="{x+hw}" y2="{y+60}" {O}/>')
    g.append("</g>")
    return "".join(g)


def hand():
    # Palma: bloco arredondado, largo em cima (nos) e estreito embaixo (pulso). O lado esquerdo
    # coincide com o dedo minimo; o no do indicador fica no canto superior direito e, logo abaixo
    # dele, o polegar nasce da lateral direita (juncao em Y em (722,512)).
    palm = ("M402,812 C352,770 326,700 330,620 C332,560 350,500 420,470 "
            "C470,456 580,452 650,466 C690,474 712,490 722,512 "
            "C745,545 752,600 745,660 C738,730 710,790 680,812 "
            "Q540,826 402,812 Z")
    # Polegar a partir de uma linha central: base (730,585) -> no (596,607) -> ponta (499,694).
    # Proximal quase horizontal, distal a ~42 graus: a almofada mergulha sobre o anelar e o dorso
    # ganha uma saliencia convexa suave no no.
    thumb_edge = ("M722,512 C676,520 628,526 598,543 "      # dorso proximal, levemente convexo
                  "C568,556 548,568 536,580 "                 # curva do no
                  "C510,604 484,628 459,649 "                 # dorso distal
                  "A60,60 0 0 0 539,739 "                     # almofada da ponta
                  "C580,712 612,682 636,660 "                 # lado de baixo distal
                  "C652,664 695,670 744,662")                 # dobra (concava, suave) e base ate a palma
    thumb_fill = thumb_edge + " L700,620 L700,540 Z"
    return f"""
<rect x="412" y="786" width="250" height="116" rx="34" fill="{PAPER}" {O}/>
{pencil(500, 560, -20, 440, False)}
{pencil(610, 560, 20, 440, True)}
<path d="{palm}" fill="{PAPER}" {O}/>
<g transform="rotate(-7 377 600)"><rect x="330" y="512" width="94" height="178" rx="47" fill="{PAPER}" {O}/></g>
<g transform="rotate(-3 456 584)"><rect x="392" y="468" width="128" height="232" rx="64" fill="{PAPER}" {O}/></g>
<path d="{thumb_fill}" fill="{PAPER}"/>
<path d="{thumb_edge}" fill="none" {O}/>
<path d="M566,604 Q578,622 574,640" fill="none" {O}/>
<path d="M580,782 Q650,762 712,768" fill="none" {O}/>
"""


def main():
    body = f'<path d="{SQ}" fill="{BG}"/>\n<g transform="translate(-8 0)">{hand()}</g>'
    svg = icon("", BG, body, glass=False)
    base = os.path.join(HERE, "paz-C")
    with open(base + ".svg", "w") as f:
        f.write(svg)
    subprocess.run(["resvg", "-w", "1024", base + ".svg", base + ".png"], check=True)
    subprocess.run(["resvg", "-w", "64", base + ".svg", base + "-64.png"], check=True)
    print(base + ".png")


if __name__ == "__main__":
    main()
