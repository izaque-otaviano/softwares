#!/usr/bin/env python3
"""Candidato B: mao em "V" com dois lapis, construida so com circulos e capsulas (rounded rects)
sobrepostos, estilo icone vetorial de linha grossa.

    python3 icones/candidatos/paz-B.py
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
    """Lapis de largura 120 com base em (x, y), girado `angle` graus em torno da base."""
    w, hw = 120, 60
    top = y - length
    body_top = top + 150
    g = [f'<g transform="rotate({angle} {x} {y})">']
    g.append(f'<rect x="{x-hw}" y="{body_top}" width="{w}" height="{y-body_top+60}" fill="{LEAD}"/>')
    g.append(f'<line x1="{x-20}" y1="{body_top+16}" x2="{x-20}" y2="{y+50}" stroke="{INK}" stroke-width="12"/>')
    g.append(f'<line x1="{x+20}" y1="{body_top+16}" x2="{x+20}" y2="{y+50}" stroke="{INK}" stroke-width="12"/>')
    if tip:
        g.append(f'<path d="M{x-hw},{body_top} L{x},{top} L{x+hw},{body_top} Z" fill="{WOOD}" {O}/>')
        g.append(f'<path d="M{x-28},{top+78} L{x},{top+6} L{x+28},{top+78} Z" fill="{INK}" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>')
    else:
        g.append(f'<rect x="{x-hw}" y="{top}" width="{w}" height="150" rx="28" fill="{PAPER}"/>')
        g.append(f'<path d="M{x-hw},{top+62} L{x-hw},{top+28} Q{x-hw},{top} {x-hw+28},{top} L{x+hw-28},{top} Q{x+hw},{top} {x+hw},{top+28} L{x+hw},{top+62} Z" fill="{ERASER}"/>')
        g.append(f'<line x1="{x-hw}" y1="{top+62}" x2="{x+hw}" y2="{top+62}" {O}/>')
        g.append(f'<line x1="{x-hw}" y1="{top+106}" x2="{x+hw}" y2="{top+106}" {O}/>')
        g.append(f'<rect x="{x-hw}" y="{top}" width="{w}" height="150" rx="28" fill="none" {O}/>')
    g.append(f'<line x1="{x-hw}" y1="{body_top}" x2="{x+hw}" y2="{body_top}" {O}/>')
    g.append(f'<line x1="{x-hw}" y1="{body_top}" x2="{x-hw}" y2="{y+60}" {O}/>')
    g.append(f'<line x1="{x+hw}" y1="{body_top}" x2="{x+hw}" y2="{y+60}" {O}/>')
    g.append("</g>")
    return "".join(g)


def capsule(cx, cy, w, h, angle=0, fill=PAPER, stroke=True):
    s = O if stroke else ""
    return (f'<rect x="{cx-w/2}" y="{cy-h/2}" width="{w}" height="{h}" rx="{min(w,h)/2}" '
            f'fill="{fill}" {s} transform="rotate({angle} {cx} {cy})"/>')


def circle(cx, cy, r, fill=PAPER, stroke=True):
    s = O if stroke else ""
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" {s}/>'


def union(*shapes):
    """Uniao visual de formas: desenha todas com traco e depois todas so com preenchimento,
    para que o contorno fique so na silhueta externa."""
    s = [f(True) for f in shapes] + [f(False) for f in shapes]
    return "".join(s)


def hand():
    FX, FY, FR = 520, 665, 230          # punho: circulo grande
    parts = [f'<path d="{SQ}" fill="{BG}"/>', '<g transform="translate(18 0)">']
    # lapis nascem do topo do punho (base escondida pelo punho)
    parts.append(pencil(478, 640, -20, 500, False))
    parts.append(pencil(562, 640, 20, 520, True))
    # punho
    parts.append(circle(FX, FY, FR))
    # dedos dobrados: capsula vertical + circulo de no em cima (minimo mais fino)
    parts.append(union(lambda st: capsule(368, 686, 90, 262, stroke=st),
                       lambda st: circle(368, 556, 56, stroke=st)))
    parts.append(union(lambda st: capsule(470, 672, 106, 306, stroke=st),
                       lambda st: circle(470, 518, 64, stroke=st)))
    # linhas de dobra (segunda falange)
    parts.append(f'<line x1="350" y1="712" x2="386" y2="712" {O}/>')
    parts.append(f'<line x1="449" y1="700" x2="491" y2="700" {O}/>')
    # polegar: capsula inclinada (ponta sobre os dedos) + cadeia de circulos na base
    # (afunila da base, larga, ate a ponta redonda)
    bx, by, tx, ty = 655, 585, 462, 692
    L = ((tx - bx) ** 2 + (ty - by) ** 2) ** 0.5
    ux, uy = (tx - bx) / L, (ty - by) / L
    ang = __import__("math").degrees(__import__("math").atan2(ty - by, tx - bx))
    shapes = [lambda st: capsule((bx + tx) / 2, (by + ty) / 2, L + 112, 112, ang, stroke=st)]
    for i in range(9):
        t, r = i * 18, 80 - i * 3
        shapes.append(lambda st, cx=bx + ux * t, cy=by + uy * t, r=r: circle(cx, cy, r, stroke=st))
    parts.append(union(*shapes))
    # dobra da palma abaixo do polegar
    parts.append(f'<path d="M604,768 Q650,772 684,812" fill="none" {O}/>')
    parts.append('</g>')
    return "\n".join(parts)


def main():
    svg = icon("", BG, hand(), glass=False)
    out = os.path.join(HERE, "paz-B.svg")
    with open(out, "w") as f:
        f.write(svg)
    subprocess.run(["resvg", "-w", "1024", out, os.path.join(HERE, "paz-B.png")], check=True)
    subprocess.run(["resvg", "-w", "64", out, os.path.join(HERE, "paz-B-64.png")], check=True)
    print(out)


if __name__ == "__main__":
    main()
