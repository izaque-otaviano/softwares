#!/usr/bin/env python3
"""Candidato A: mão em "V" com dois lápis no lugar do indicador e do médio.
Flat/cartoon, traço preto grosso, fundo amarelo. Anatomia primeiro: punho com nós,
dois dedos dobrados (anelar e mínimo) e polegar afunilado cruzando por cima deles.

    python3 icones/candidatos/paz-A.py
"""

import math
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
LIM = (84, 940)


def rot(px, py, cx, cy, deg):
    a = math.radians(deg)
    dx, dy = px - cx, py - cy
    return cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)


def pencil(x, y, angle, length, tip):
    """Lápis de largura 120 com a base (escondida no punho) em (x, y), girado `angle` graus em
    torno da base. tip=True: ponta para cima; False: borracha para cima.
    Devolve (svg, extremos) — extremos são os cantos superiores já girados, para conferir margem."""
    w, hw = 120, 60
    top = y - length
    body_top = top + 150
    g = [f'<g transform="rotate({angle} {x} {y})">']
    g.append(f'<rect x="{x-hw}" y="{body_top}" width="{w}" height="{y-body_top+40}" fill="{LEAD}"/>')
    for dx in (-20, 20):
        g.append(f'<line x1="{x+dx}" y1="{body_top+12}" x2="{x+dx}" y2="{y+30}" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>')
    if tip:
        g.append(f'<path d="M{x-hw},{body_top} L{x},{top} L{x+hw},{body_top} Z" fill="{WOOD}"/>')
        g.append(f'<path d="M{x-hw},{body_top} L{x},{top} L{x+hw},{body_top}" fill="none" {O}/>')
        g.append(f'<path d="M{x-27},{top+76} L{x},{top+8} L{x+27},{top+76} Z" fill="{INK}"/>')
        g.append(f'<line x1="{x-hw}" y1="{body_top}" x2="{x+hw}" y2="{body_top}" {O}/>')
        corners = [(x, top - 18), (x - hw, body_top), (x + hw, body_top)]
    else:
        g.append(f'<rect x="{x-hw}" y="{top}" width="{w}" height="84" rx="28" fill="{ERASER}"/>')
        g.append(f'<rect x="{x-hw}" y="{top+62}" width="{w}" height="88" fill="{PAPER}"/>')
        g.append(f'<line x1="{x-hw}" y1="{top+62}" x2="{x+hw}" y2="{top+62}" {O}/>')
        g.append(f'<line x1="{x-hw}" y1="{top+106}" x2="{x+hw}" y2="{top+106}" {O}/>')
        g.append(f'<line x1="{x-hw}" y1="{body_top}" x2="{x+hw}" y2="{body_top}" {O}/>')
        g.append(f'<rect x="{x-hw}" y="{top}" width="{w}" height="150" rx="28" fill="none" {O}/>')
        corners = [(x - hw - 15, top - 15), (x + hw + 15, top - 15)]
    for sx in (-hw, hw):
        g.append(f'<line x1="{x+sx}" y1="{body_top}" x2="{x+sx}" y2="{y+40}" {O}/>')
    g.append("</g>")
    ext = [rot(px, py, x, y, angle) for px, py in corners]
    return "".join(g), ext


def capsule(ax, ay, ra, bx, by, rb):
    """Cápsula afunilada: círculo de raio ra em A, raio rb em B, ligados por tangentes."""
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    p1 = (ax + nx * ra, ay + ny * ra)
    p2 = (bx + nx * rb, by + ny * rb)
    p3 = (bx - nx * rb, by - ny * rb)
    p4 = (ax - nx * ra, ay - ny * ra)
    return (f"M{p1[0]:.1f},{p1[1]:.1f} L{p2[0]:.1f},{p2[1]:.1f} "
            f"A{rb},{rb} 0 0 1 {p3[0]:.1f},{p3[1]:.1f} L{p4[0]:.1f},{p4[1]:.1f} "
            f"A{ra},{ra} 0 0 1 {p1[0]:.1f},{p1[1]:.1f} Z")


def finger(x, top, w, bottom, crease):
    """Dedo dobrado visto de costas: cápsula vertical com linha de dobra (segunda falange)."""
    r = w / 2
    s = f'<rect x="{x}" y="{top}" width="{w}" height="{bottom-top}" rx="{r}" fill="{PAPER}" {O}/>'
    # dobra: arco suave curvado para baixo, de borda a borda
    s += f'<path d="M{x},{crease} Q{x+r},{crease+28} {x+w},{crease}" fill="none" {O}/>'
    return s


def vc_paz():
    parts = [f'<path d="{SQ}" fill="{BG}"/>']
    ext = []

    # ---- lápis (atrás do punho). Bases escondidas dentro do punho.
    p1, e1 = pencil(588, 650, -19, 530, False)  # indicador: borracha para cima
    p2, e2 = pencil(668, 650, 19, 545, True)    # médio: ponta para cima
    parts += [p1, p2]
    ext += e1 + e2

    # ---- polegar: cunha afunilada (base larga, ponta estreita) com tangentes verdadeiras
    # entre o círculo da base e o da ponta; sai da lateral direita e termina SOBRE o anelar.
    ax, ay, ra = 735, 690, 108     # base (dentro da palma, lateral direita)
    bx, by, rb = 511, 605, 58      # ponta arredondada, cobrindo o anelar
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L        # eixo base -> ponta
    nx, ny = -uy, ux               # normal "para cima"
    cth = (ra - rb) / L
    sth = math.sqrt(1 - cth * cth)
    dp = (cth * ux + sth * nx, cth * uy + sth * ny)   # direção do ponto de tangência de cima
    dm = (cth * ux - sth * nx, cth * uy - sth * ny)   # ... de baixo
    f = lambda q: f"{q[0]:.1f},{q[1]:.1f}"
    t1 = (ax + ra * dp[0], ay + ra * dp[1])
    t2 = (bx + rb * dp[0], by + rb * dp[1])
    t3 = (bx + rb * dm[0], by + rb * dm[1])
    t4 = (ax + ra * dm[0], ay + ra * dm[1])
    # arco da ponta, amostrado de t2 a t3 passando pela frente (direção u)
    th = math.acos(cth)
    arc = []
    for i in range(1, 24):
        a = th - 2 * th * i / 24
        ca, sa = math.cos(a), math.sin(a)
        arc.append((bx + rb * (ca * ux + sa * nx), by + rb * (ca * uy + sa * ny)))
    arc_s = " ".join("L" + f(q) for q in arc)
    # a borda de cima continua reta até o contorno direito da palma; a de baixo vira dobra na palma
    e1 = (806, t1[1] + (806 - t1[0]) * (t1[1] - t2[1]) / (t1[0] - t2[0]))
    c4 = (t4[0] - ux * 30, t4[1] - uy * 30)
    e4 = (t4[0] + 12, t4[1] + 44)
    thumb_fill = f"M{f(t1)} L{f(t2)} {arc_s} L{f(t3)} L{f(t4)} Z"
    thumb_line = f"M{f(e1)} L{f(t1)} L{f(t2)} {arc_s} L{f(t3)} L{f(t4)} Q{f(c4)} {f(e4)}"

    # ---- punho/palma: bloco arredondado, nós em cima, pulso mais estreito embaixo.
    palm = (
        "M400,560 "
        "C400,520 440,505 480,505 "          # subida para o primeiro nó
        "C505,470 575,470 600,505 "          # nó do indicador (sob o lápis esquerdo)
        "C625,490 660,490 680,505 "          # vale entre nós
        "C705,470 775,470 790,520 "          # nó do médio
        f"C800,560 806,600 {f(e1)} "         # lateral direita (a linha do polegar morre aqui)
        "C806,730 790,805 745,858 "
        "C710,895 650,900 590,900 "          # canto inferior direito
        "L470,900 "
        "C395,900 340,860 340,790 "          # pulso (mais estreito)
        "L340,700 Z"
    )
    parts.append(f'<path d="{palm}" fill="{PAPER}" {O}/>')

    # ---- dedos dobrados (anelar e mínimo), nascendo do topo do punho e descendo.
    parts.append(finger(438, 500, 118, 818, 728))   # anelar
    parts.append(finger(330, 535, 96, 808, 740))    # mínimo (mais fino, mais baixo)

    # ---- polegar por cima dos dedos
    parts.append(f'<path d="{thumb_fill}" fill="{PAPER}" stroke="none"/>')
    parts.append(f'<path d="{thumb_line}" fill="none" {O}/>')
    # dobra do polegar: tracinho perpendicular à borda de cima, no meio do polegar
    t = 0.74
    q1 = (t1[0] + (t2[0] - t1[0]) * t, t1[1] + (t2[1] - t1[1]) * t)
    q4 = (t4[0] + (t3[0] - t4[0]) * t, t4[1] + (t3[1] - t4[1]) * t)
    q2 = (q1[0] + (q4[0] - q1[0]) * 0.36, q1[1] + (q4[1] - q1[1]) * 0.36)
    parts.append(f'<line x1="{q1[0]:.1f}" y1="{q1[1]:.1f}" x2="{q2[0]:.1f}" y2="{q2[1]:.1f}" {O}/>')

    # ---- dobra da palma, abaixo do polegar
    parts.append(f'<path d="M565,864 C600,850 636,850 666,862" fill="none" {O}/>')

    for x, y in ext:
        if not (LIM[0] <= x <= LIM[1] and LIM[0] <= y <= LIM[1]):
            print(f"AVISO: ponto ({x:.0f},{y:.0f}) fora da margem {LIM}", file=sys.stderr)

    return icon("", BG, "\n".join(parts), glass=False)


if __name__ == "__main__":
    base = os.path.join(HERE, "paz-A")
    with open(base + ".svg", "w") as f:
        f.write(vc_paz())
    subprocess.run(["resvg", "-w", "1024", base + ".svg", base + ".png"], check=True)
    subprocess.run(["resvg", "-w", "64", base + ".svg", base + "-64.png"], check=True)
    print(base + ".png")
