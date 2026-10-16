#!/usr/bin/env python3
"""Desenha as opções de ícone (SVG 1024x1024, grade de ícones do macOS) e a prancha de escolha.

    python3 icones/gerar_icones.py <pasta-de-fontes>
"""

import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "opcoes")
C, R = 512, 412  # centro e meio-lado do squircle (824 pt na grade de 1024 do macOS)


def squircle(cx=C, cy=C, r=R, n=5.0, steps=360):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        ct, st = math.cos(t), math.sin(t)
        x = cx + r * math.copysign(abs(ct) ** (2 / n), ct)
        y = cy + r * math.copysign(abs(st) ** (2 / n), st)
        pts.append(f"{x:.2f},{y:.2f}")
    return "M" + " L".join(pts) + " Z"


SQ = squircle()


def icon(defs, bg, body, glass=True):
    """Moldura comum: sombra, fundo, conteúdo recortado, brilho superior e borda fina."""
    gloss = (
        '<path d="{sq}" fill="url(#gloss)"/>'.format(sq=SQ) if glass else ""
    )
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>
  <clipPath id="sq"><path d="{SQ}"/></clipPath>
  <filter id="drop" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity="0.30"/>
  </filter>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.22"/>
    <stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>
  {defs}
</defs>
<g filter="url(#drop)"><path d="{SQ}" fill="{bg}"/></g>
<g clip-path="url(#sq)">{body}</g>
{gloss}
<path d="{SQ}" fill="none" stroke="#000" stroke-opacity="0.10" stroke-width="2"/>
</svg>"""


# ---------------------------------------------------------------- VectorCraft (calor: coral e âmbar)

def vc_bezier():
    defs = """
  <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="#2a2d38"/><stop offset="1" stop-color="#101219"/>
  </linearGradient>
  <linearGradient id="ink" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#ff5a4e"/><stop offset="0.55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ffd25e"/>
  </linearGradient>
  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter>"""
    # curva em S de (300,700) a (724,324); alças de controle visíveis
    p0, c1, c2, p1 = (292, 708), (292, 430), (732, 594), (732, 316)
    curve = f"M{p0[0]},{p0[1]} C{c1[0]},{c1[1]} {c2[0]},{c2[1]} {p1[0]},{p1[1]}"
    handles = ""
    for a, h in ((p0, c1), (p1, c2)):
        handles += (
            f'<line x1="{a[0]}" y1="{a[1]}" x2="{h[0]}" y2="{h[1]}" stroke="#c9ccd6" stroke-opacity="0.55" stroke-width="5"/>'
            f'<circle cx="{h[0]}" cy="{h[1]}" r="17" fill="#101219" stroke="#e6e8ee" stroke-width="6"/>'
        )
    anchors = "".join(
        f'<rect x="{x-28}" y="{y-28}" width="56" height="56" rx="6" fill="#fff"/>'
        f'<rect x="{x-14}" y="{y-14}" width="28" height="28" rx="3" fill="url(#ink)"/>'
        for x, y in (p0, p1)
    )
    body = f"""
<path d="{SQ}" fill="url(#bg)"/>
<g opacity="0.06" stroke="#fff" stroke-width="2">{''.join(f'<line x1="{x}" y1="0" x2="{x}" y2="1024"/>' for x in range(152, 1024, 72))}{''.join(f'<line x1="0" y1="{y}" x2="1024" y2="{y}"/>' for y in range(152, 1024, 72))}</g>
<path d="{curve}" fill="none" stroke="url(#ink)" stroke-width="64" stroke-linecap="round" filter="url(#glow)" opacity="0.55"/>
{handles}
<path d="{curve}" fill="none" stroke="url(#ink)" stroke-width="44" stroke-linecap="round"/>
{anchors}"""
    return icon(defs, "url(#bg)", body)


def vc_pena():
    defs = """
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ff8a5c"/><stop offset="0.55" stop-color="#f2533f"/><stop offset="1" stop-color="#c2263a"/>
  </linearGradient>
  <linearGradient id="nib" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffe6dc"/>
  </linearGradient>
  <linearGradient id="nibshade" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#7a1022" stop-opacity="0.14"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="22" stdDeviation="26" flood-color="#5a0a18" flood-opacity="0.40"/>
  </filter>"""
    # ponta de caneta-tinteiro geométrica, apontada para baixo, levemente inclinada
    nib = ("M512,226 C618,300 676,410 676,512 L590,742 L512,812 L434,742 L348,512 "
           "C348,410 406,300 512,226 Z")
    body = f"""
<path d="{SQ}" fill="url(#bg)"/>
<circle cx="512" cy="512" r="330" fill="#fff" opacity="0.07"/>
<circle cx="512" cy="512" r="240" fill="#fff" opacity="0.06"/>
<g transform="translate(0 -6) rotate(-38 512 519) translate(512 519) scale(1.08) translate(-512 -519)" filter="url(#soft)">
  <path d="{nib}" fill="url(#nib)"/>
  <path d="{nib}" fill="url(#nibshade)"/>
  <line x1="512" y1="560" x2="512" y2="808" stroke="#d2384a" stroke-width="14" stroke-linecap="round"/>
  <circle cx="512" cy="524" r="40" fill="#d2384a"/>
  <circle cx="512" cy="524" r="17" fill="#fff"/>
</g>"""
    return icon(defs, "url(#bg)", body)


def vc_formas():
    defs = """
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fffaf3"/><stop offset="1" stop-color="#f3e9db"/>
  </linearGradient>
  <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b57"/><stop offset="1" stop-color="#e2384a"/></linearGradient>
  <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc24a"/><stop offset="1" stop-color="#ff9530"/></linearGradient>
  <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5cff"/><stop offset="1" stop-color="#4b2fd6"/></linearGradient>"""
    body = f"""
<path d="{SQ}" fill="url(#bg)"/>
<g transform="translate(512 512) scale(0.9) translate(-540 -532)">
  <circle cx="430" cy="440" r="196" fill="url(#g1)" opacity="0.92"/>
  <path d="M640,268 L846,640 L434,640 Z" fill="url(#g2)" opacity="0.92" style="mix-blend-mode:multiply"/>
  <rect x="300" y="520" width="300" height="300" rx="34" fill="url(#g3)" opacity="0.88" style="mix-blend-mode:multiply"/>
</g>"""
    return icon(defs, "url(#bg)", body)


# ---------------------------------------------------------------- PhotoCraft (frio: azul e violeta)

def pc_camadas():
    defs = """
  <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#1b2a5a"/><stop offset="1" stop-color="#0a0f26"/>
  </linearGradient>
  <linearGradient id="l1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b5cff"/><stop offset="1" stop-color="#b14cf0"/></linearGradient>
  <linearGradient id="l2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f7bff"/><stop offset="1" stop-color="#5a5cff"/></linearGradient>
  <linearGradient id="l3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ff0ff"/><stop offset="1" stop-color="#2fa8ff"/></linearGradient>
  <filter id="lift" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.45"/>
  </filter>"""
    # losangos isométricos (quadrados vistos em perspectiva), empilhados em passos iguais
    def layer(cy, fill, op):
        w, h = 300, 172
        d = f"M512,{cy-h} Q{512+24},{cy-h+12} {512+w-36},{cy-20} Q{512+w},{cy} {512+w-36},{cy+20} " \
            f"L{512+36},{cy+h-12} Q512,{cy+h} {512-36},{cy+h-12} L{512-w+36},{cy+20} " \
            f"Q{512-w},{cy} {512-w+36},{cy-20} L{512-24},{cy-h+12} Q512,{cy-h} 512,{cy-h} Z"
        return (f'<g filter="url(#lift)"><path d="{d}" fill="url(#{fill})" opacity="{op}"/></g>'
                f'<path d="{d}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="3"/>')
    body = f"""
<path d="{SQ}" fill="url(#bg)"/>
<circle cx="512" cy="300" r="380" fill="#5a7bff" opacity="0.10"/>
{layer(652, 'l1', 0.95)}
{layer(522, 'l2', 0.92)}
{layer(392, 'l3', 0.94)}"""
    return icon(defs, "url(#bg)", body)


def pc_diafragma():
    defs = """
  <radialGradient id="bg" cx="0.5" cy="0.42" r="0.75">
    <stop offset="0" stop-color="#1d2142"/><stop offset="1" stop-color="#07081a"/>
  </radialGradient>
  <radialGradient id="lens" cx="0.42" cy="0.38" r="0.6">
    <stop offset="0" stop-color="#9fe8ff"/><stop offset="0.45" stop-color="#3a5bff"/><stop offset="1" stop-color="#140b3a"/>
  </radialGradient>"""
    hues = ["#38c8ff", "#3a8dff", "#5a5cff", "#8a4dff", "#c04cf0", "#ff5fb8"]
    blades = ""
    rr, ri = 300, 118
    for i, col in enumerate(hues):
        a0 = math.radians(i * 60 - 90)
        a1 = math.radians(i * 60 - 30)
        # lâmina: do aro externo até o hexágono interno, girada (efeito de íris)
        o0 = (C + rr * math.cos(a0), C + rr * math.sin(a0))
        o1 = (C + rr * math.cos(a1), C + rr * math.sin(a1))
        i0 = (C + ri * math.cos(a0 + 0.55), C + ri * math.sin(a0 + 0.55))
        i1 = (C + ri * math.cos(a1 + 0.55), C + ri * math.sin(a1 + 0.55))
        blades += (f'<path d="M{o0[0]:.1f},{o0[1]:.1f} A{rr},{rr} 0 0 1 {o1[0]:.1f},{o1[1]:.1f} '
                   f'L{i1[0]:.1f},{i1[1]:.1f} L{i0[0]:.1f},{i0[1]:.1f} Z" fill="{col}"/>'
                   f'<path d="M{o0[0]:.1f},{o0[1]:.1f} L{i0[0]:.1f},{i0[1]:.1f}" stroke="#07081a" stroke-opacity="0.55" stroke-width="7"/>')
    body = f"""
<path d="{SQ}" fill="url(#bg)"/>
<circle cx="{C}" cy="{C}" r="{rr+34}" fill="none" stroke="#fff" stroke-opacity="0.10" stroke-width="22"/>
<circle cx="{C}" cy="{C}" r="{rr+4}" fill="#07081a"/>
<circle cx="{C}" cy="{C}" r="{ri+40}" fill="url(#lens)"/>
{blades}
<circle cx="{C}" cy="{C}" r="{rr}" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="4"/>
<circle cx="{C-34}" cy="{C-40}" r="22" fill="#fff" opacity="0.85"/>"""
    return icon(defs, "url(#bg)", body)


def pc_selecao():
    defs = """
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4f7ff"/><stop offset="1" stop-color="#dfe6f7"/>
  </linearGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3b5bff"/><stop offset="0.6" stop-color="#9a6bff"/><stop offset="1" stop-color="#ff9fb0"/>
  </linearGradient>
  <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset="1" stop-color="#ffb35c"/></linearGradient>
  <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f7a"/><stop offset="1" stop-color="#171a4a"/></linearGradient>
  <linearGradient id="m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3fb0"/><stop offset="1" stop-color="#2b2477"/></linearGradient>
  <clipPath id="photo"><rect x="246" y="266" width="532" height="492" rx="44"/></clipPath>
  <filter id="card" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#1b2a5a" flood-opacity="0.30"/>
  </filter>"""
    body = f"""
<path d="{SQ}" fill="url(#bg)"/>
<g transform="rotate(-6 512 512)">
  <rect x="222" y="242" width="580" height="540" rx="60" fill="#fff" filter="url(#card)"/>
  <g clip-path="url(#photo)">
    <rect x="246" y="266" width="532" height="492" fill="url(#sky)"/>
    <circle cx="610" cy="470" r="86" fill="url(#sun)"/>
    <path d="M246,640 L380,500 L470,580 L560,470 L778,660 L778,758 L246,758 Z" fill="url(#m2)"/>
    <path d="M246,700 L360,620 L470,690 L600,600 L778,710 L778,758 L246,758 Z" fill="url(#m1)"/>
  </g>
</g>
<rect x="500" y="356" width="224" height="224" rx="10" fill="none" stroke="#fff" stroke-width="10"/>
<rect x="500" y="356" width="224" height="224" rx="10" fill="none" stroke="#111" stroke-width="10" stroke-dasharray="28 22"/>
{''.join(f'<rect x="{x-14}" y="{y-14}" width="28" height="28" rx="5" fill="#fff" stroke="#111" stroke-width="6"/>' for x,y in ((500,356),(724,356),(500,580),(724,580)))}"""
    return icon(defs, "url(#bg)", body)


OPCOES = [
    ("vectorcraft-1-bezier", "VectorCraft", "Curva Bézier", vc_bezier),
    ("vectorcraft-2-pena", "VectorCraft", "Pena", vc_pena),
    ("vectorcraft-3-formas", "VectorCraft", "Formas", vc_formas),
    ("photocraft-1-camadas", "PhotoCraft", "Camadas", pc_camadas),
    ("photocraft-2-diafragma", "PhotoCraft", "Diafragma", pc_diafragma),
    ("photocraft-3-selecao", "PhotoCraft", "Seleção", pc_selecao),
]


def prancha(fonts):
    W, H = 2400, 1700
    cell, size = 640, 400
    x0 = (W - 3 * cell) // 2
    rows = [(380, "VectorCraft", "ilustração vetorial"), (1060, "PhotoCraft", "edição de imagens")]
    parts = [f'<rect width="{W}" height="{H}" fill="#f5f3ef"/>']
    # retícula técnica discreta
    parts.append('<g stroke="#1c1c1e" stroke-opacity="0.05" stroke-width="1">' +
                 "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}"/>' for x in range(0, W, 40)) +
                 "".join(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}"/>' for y in range(0, H, 40)) + "</g>")
    parts.append(f'<text x="{x0+40}" y="150" font-family="Instrument Serif" font-style="italic" font-size="84" fill="#1c1c1e">Instrumento Luminoso</text>')
    parts.append(f'<text x="{W-x0-40}" y="150" text-anchor="end" font-family="Geist Mono" font-size="22" letter-spacing="3" fill="#1c1c1e" fill-opacity="0.55">ESTUDO DE ÍCONES · 6 OPÇÕES</text>')
    parts.append(f'<line x1="{x0+40}" y1="196" x2="{W-x0-40}" y2="196" stroke="#1c1c1e" stroke-opacity="0.35" stroke-width="1.5"/>')
    k = 0
    for ry, app, sub in rows:
        parts.append(f'<text x="{x0+40}" y="{ry-60}" font-family="Geist Mono" font-size="22" letter-spacing="3" fill="#1c1c1e">{app.upper()}</text>')
        parts.append(f'<text x="{x0+40+len(app)*17+40}" y="{ry-60}" font-family="Instrument Serif" font-style="italic" font-size="30" fill="#1c1c1e" fill-opacity="0.6">{sub}</text>')
        for col in range(3):
            slug, _, nome, _ = OPCOES[k]
            k += 1
            cx = x0 + col * cell + cell // 2
            parts.append(f'<image href="{slug}.svg" x="{cx-size//2-24}" y="{ry-24}" width="{size+48}" height="{size+48}"/>')
            parts.append(f'<text x="{cx}" y="{ry+size+78}" text-anchor="middle" font-family="Instrument Serif" font-size="40" fill="#1c1c1e">{nome}</text>')
            parts.append(f'<text x="{cx}" y="{ry+size+116}" text-anchor="middle" font-family="Geist Mono" font-size="18" letter-spacing="3" fill="#1c1c1e" fill-opacity="0.5">{app[:1]}{"C" if app else ""}—0{col+1}</text>')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">' + "".join(parts) + "</svg>"
    path = os.path.join(OUT, "prancha.svg")
    with open(path, "w") as f:
        f.write(svg)
    subprocess.run(["resvg", "--skip-system-fonts", "--use-fonts-dir", fonts, "--resources-dir", OUT,
                    path, os.path.join(HERE, "opcoes-icones.png")], check=True)


def main():
    fonts = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    for slug, _, _, fn in OPCOES:
        p = os.path.join(OUT, slug + ".svg")
        with open(p, "w") as f:
            f.write(fn())
        subprocess.run(["resvg", "-w", "1024", p, p[:-4] + ".png"], check=True)
    prancha(fonts)


if __name__ == "__main__":
    main()
