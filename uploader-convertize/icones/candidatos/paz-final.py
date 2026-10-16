#!/usr/bin/env python3
"""Versao final: mao em V (vista 3/4) com dois lapis no lugar do indicador e do medio.
Derivada do candidato C. Punho de manga embaixo ancora a mao; anelar e minimo dobrados a
esquerda (larguras diferentes, dobra da segunda falange); polegar afunilado em primeiro plano,
cruzando por cima dos dedos e terminando numa ponta redonda sobre o anelar.

    python3 icones/candidatos/paz-final.py
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
    """Lapis de largura 120, base em (x, y), girado `angle` graus em torno da base.
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
    # Palma: bloco arredondado, largo em cima (nos) e estreito embaixo (pulso). A borda esquerda
    # e reta em x=320 e coincide com a borda do minimo (traco unico, sem emenda).
    palm = ("M400,842 C348,830 320,792 320,740 L320,600 "
            "C320,540 368,488 440,470 C520,448 640,446 700,462 "
            "C745,474 764,500 770,560 C780,690 762,790 700,836 "
            "Q560,856 400,842 Z")
    # Punho de manga: levemente trapezoidal, cantos de baixo redondos, bem dentro do squircle.
    cuff = "M440,800 L432,864 Q430,892 458,892 L652,892 Q680,892 678,864 L670,800 Z"
    # Polegar: tubo afunilado (raiz ~100, no ~96, ponta 84) que nasce logo abaixo do canto
    # superior direito do punho (onde o contorno ja e quase vertical, sem cunha), cruza em diagonal POR CIMA do anelar e termina em ponta
    # redonda. A borda de baixo volta e morre dentro da palma, descendo como a prega da base do
    # polegar (sem segunda linha atravessando o punho).
    thumb = ("M765,528 C715,536 650,530 600,552 "       # dorso proximal: sai do contorno a ~80 graus
             "C552,574 486,605 442,628 "                 # dorso distal (desce a ~28 graus)
             "A42,42 0 0 0 425,685 A42,42 0 0 0 482,702 "  # ponta redonda
             "C526,679 566,664 612,662 "                 # lado de baixo distal (raiz mais grossa)
             "C636,661 656,658 672,652")                 # morre na palma, quase paralelo ao dorso
    return f"""
<path d="{cuff}" fill="{PAPER}" {O}/>
{pencil(500, 560, -20, 440, False)}
{pencil(610, 560, 20, 440, True)}
<path d="{palm}" fill="{PAPER}" {O}/>
<rect x="320" y="500" width="85" height="270" rx="42.5" fill="{PAPER}" {O}/>
<rect x="395" y="449" width="115" height="342" rx="57.5" fill="{PAPER}" {O}/>
<line x1="344" y1="690" x2="380" y2="690" {O}/>
<path d="{thumb}" fill="{PAPER}" {O}/>
<path d="M602,588 Q611,606 607,622" fill="none" {O}/>
<path d="M572,800 Q632,784 684,798" fill="none" {O}/>
"""


def main():
    body = f'<path d="{SQ}" fill="{BG}"/>\n{hand()}'
    svg = icon("", BG, body, glass=False)
    base = os.path.join(HERE, "paz-final")
    with open(base + ".svg", "w") as f:
        f.write(svg)
    subprocess.run(["resvg", "-w", "1024", base + ".svg", base + ".png"], check=True)
    subprocess.run(["resvg", "-w", "64", base + ".svg", base + "-64.png"], check=True)
    print(base + ".png")


if __name__ == "__main__":
    main()
