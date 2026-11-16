"""Vistas 360° com cotas (mm) desenhadas sobre a renderização.

uso: python tools/render_360_cotas.py <parametros.json> <arquivo.stl> <pasta_saida> [passo] [elevacao]

As cotas são definidas em 3D (coordenadas reais da peça) e projetadas em cada vista.
Em cada vista, cada cota é presa à face/lateral voltada para a câmera e só aparece
se não ficar encurtada demais (legível).
"""
import sys, json, math
from pathlib import Path
import numpy as np, trimesh
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import LineString, Polygon
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_zbuffer import render
import trava_ar_condicionado_v1 as T

kw = json.load(open(sys.argv[1])); stl = sys.argv[2]; out = Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
passo = float(sys.argv[4]) if len(sys.argv) > 4 else 30.0
elev = float(sys.argv[5]) if len(sys.argv) > 5 else 22.0
P = T.Parametros(**kw)
L = P.largura_total; zf = P.fracao_preenchida * L

# ---------------- geometria de referência (seção no trecho oco) ----------------
solido = T.construir(P)
f = solido.section((zf + L) / 2).faces().val()
def anel(w):
    n = max(400, int(w.Length() / 0.02))
    return [(p.x, p.y) for p in (w.positionAt(t) for t in np.linspace(0, 1, n, endpoint=False))]
ext = np.array(anel(f.outerWire()))
poly = Polygon(ext, [anel(w) for w in f.innerWires()])
def trechos(y):
    g = LineString([(-50, y), (50, y)]).intersection(poly)
    segs = [g] if g.geom_type == "LineString" else list(g.geoms)
    return sorted([sorted([q.coords[0][0], q.coords[-1][0]]) for q in segs])
xmin, xmax = ext[:, 0].min(), ext[:, 0].max()
ymin, ymax = ext[:, 1].min(), ext[:, 1].max()
tc, tb = trechos(P.y_canal), trechos(P.y_bolsao)
canal = (tc[1][1], tc[2][0]); bolsao = (tb[1][1], tb[2][0])
eb = P.espessura_base
mid = 0.5 * (xmin + xmax)
pE = ext[ext[:, 0] < mid][ext[ext[:, 0] < mid][:, 1].argmax()]
pD = ext[ext[:, 0] >= mid][ext[ext[:, 0] >= mid][:, 1].argmax()]

def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".").replace(".", ",")

# ---------------- malha e câmera ----------------
tm = trimesh.load(stl)
centro = tm.bounds.mean(0)
tm.apply_translation(-centro)
raio = np.linalg.norm(tm.vertices, axis=1).max() * 1.32   # folga para as cotas
def rx(a):
    a = math.radians(a); c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def ry(a):
    a = math.radians(a); c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def fonte(sz):
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", sz)
    except OSError:
        return ImageFont.load_default()
F_COTA, F_TIT, F_LEG = fonte(30), fonte(34), fonte(24)
AZUL = (10, 90, 200)


def desenhar_cotas(dr, R, s, off, Tn):
    def prj(p):
        q = R @ (np.asarray(p, float) - centro)
        return np.array([(q[0] - off[0]) * s + Tn / 2, Tn / 2 - (q[1] - off[1]) * s])
    def visivel(n):
        return (R @ np.asarray(n, float))[2] > 0.12
    zf_face = L if visivel([0, 0, 1]) else 0.0         # face Z visível
    x_lado = xmax if visivel([1, 0, 0]) else xmin       # lateral X visível
    sx_lado = 1 if x_lado == xmax else -1
    y_lado = ymax                                       # topo sempre visível (câmera elevada)
    cotas = []   # (p1, p2, direção do afastamento, afastamento mm, texto, exige face Z visível)
    zf_vis = visivel([0, 0, 1]) or visivel([0, 0, -1])
    # largura total, embaixo, na face Z visível
    cotas.append(((xmin, 0, zf_face), (xmax, 0, zf_face), (0, -1, 0), 1.8, f"{fmt(xmax - xmin)}", zf_vis))
    # altura total e base, na lateral visível, na quina da face Z visível
    # comprimento em Z, dividido em maciço/oco, na lateral visível, embaixo
    zc = 0.0
    cotas.append(((x_lado, 0, 0), (x_lado, 0, L), (sx_lado, -0.6, 0), 1.8, f"{fmt(L)}", True))
    cotas.append(((x_lado, y_lado, 0), (x_lado, y_lado, zf), (0, 1, 0), 1.2, f"{fmt(zf)} maciço", True))
    cotas.append(((x_lado, y_lado, zf), (x_lado, y_lado, L), (0, 1, 0), 1.2, f"{fmt(L - zf)} oco", True))
    # vãos entre ganchos, na face Z visível
    cotas.append(((canal[0], P.y_canal, zf_face), (canal[1], P.y_canal, zf_face), (0, 0, 0), 0, fmt(canal[1] - canal[0]), zf_vis))
    cotas.append(((bolsao[0], P.y_bolsao, zf_face), (bolsao[1], P.y_bolsao, zf_face), (0, 0, 0), 0, fmt(bolsao[1] - bolsao[0]), zf_vis))
    quinas = [(x, z) for x in (xmin, xmax) for z in (0.0, L)]
    xs_ = [prj((q[0], 0, q[1]))[0] for q in quinas]
    cand = [q for q, xv in zip(quinas, xs_) if xv >= max(xs_) - 6]          # empatadas na borda direita
    xq, zq = max(cand, key=lambda q: (R @ (np.array([q[0], 0, q[1]]) - centro))[2])  # a mais próxima da câmera
    # face Z mais próxima da câmera; cota medida na ponta do gancho alto (referência real dos 12 mm)
    zq = L if visivel([0, 0, 1]) else 0.0
    a0, b0 = prj((pD[0], 0, zq)), prj((pD[0], ymax, zq))
    xr = max(prj((x, y, z))[0] for x in (xmin, xmax) for y in (0, ymax) for z in (0, L)) + 40
    for p in (a0, b0):
        dr.line([(p[0] + 8, p[1]), (xr + 12, p[1])], fill=AZUL, width=2)
    A, B = np.array([xr, a0[1]]), np.array([xr, b0[1]])
    dr.line([tuple(A), tuple(B)], fill=AZUL, width=3)
    for tip, sgn in ((A, -1), (B, 1)):
        dr.polygon([tuple(tip), (tip[0] - 6, tip[1] + sgn * 16), (tip[0] + 6, tip[1] + sgn * 16)], fill=AZUL)
    txt = fmt(ymax); bx = dr.textbbox((0, 0), txt, font=F_COTA); w, h = bx[2] - bx[0], bx[3] - bx[1]
    cx, cy = xr - w / 2, (A[1] + B[1]) / 2 - h / 2
    dr.rectangle([cx - 6, cy - 4, cx + w + 6, cy + h + 8], fill=(255, 255, 255), outline=AZUL, width=2)
    dr.text((cx, cy), txt, fill=AZUL, font=F_COTA)
    for p1, p2, dirc, afast, txt, cond in cotas:
        if not cond:
            continue
        p1, p2 = np.array(p1, float), np.array(p2, float)
        d = np.array(dirc, float); d = d / np.linalg.norm(d) if np.linalg.norm(d) > 0 else d
        q1, q2 = p1 + d * afast, p2 + d * afast
        a, b = prj(q1), prj(q2)
        comp = np.hypot(*(b - a))
        if comp < 0.5 * np.linalg.norm(p2 - p1) * s or comp < 30:   # encurtada demais
            continue
        if afast > 0:   # linhas de chamada
            for p, q in ((p1, q1), (p2, q2)):
                e0, e1 = prj(p + d * 0.25), prj(q + d * 0.35)
                dr.line([tuple(e0), tuple(e1)], fill=AZUL, width=2)
        dr.line([tuple(a), tuple(b)], fill=AZUL, width=3)
        u = (b - a) / comp; nrm = np.array([-u[1], u[0]])
        for tip, sgn in ((a, 1), (b, -1)):   # setas
            base = tip + sgn * u * 16
            dr.polygon([tuple(tip), tuple(base + nrm * 6), tuple(base - nrm * 6)], fill=AZUL)
        m = (a + b) / 2
        bx = dr.textbbox((0, 0), txt, font=F_COTA); w, h = bx[2] - bx[0], bx[3] - bx[1]
        cx, cy = m[0] - w / 2, m[1] - h / 2 - 2
        dr.rectangle([cx - 6, cy - 4, cx + w + 6, cy + h + 8], fill=(255, 255, 255), outline=AZUL, width=2)
        dr.text((cx, cy), txt, fill=AZUL, font=F_COTA)


imgs = []
for ang in np.arange(0, 360, passo):
    R = rx(elev) @ ry(ang)
    ancora = np.array([[raio, raio, 0], [-raio, -raio, 0]]) @ np.linalg.inv(R).T
    malha = trimesh.Trimesh(vertices=np.vstack([tm.vertices, ancora]), faces=tm.faces, process=False)
    im, (s, off, Tn) = render(malha, R, tamanho=1400, margem=0.0)
    dr = ImageDraw.Draw(im)
    desenhar_cotas(dr, R, s, off, Tn)
    dr.text((30, 25), f"{int(ang):03d}°", fill=(40, 40, 40), font=F_TIT)
    dr.text((30, Tn - 70), "Trava v2B - cotas em mm", fill=(80, 80, 80), font=F_LEG)
    dr.text((30, Tn - 40), "parede 1,0 | base embutida 1,0 (dentro dos 12) | hastes ~75° com a horizontal", fill=(80, 80, 80), font=F_LEG)
    nome = out / f"trava_v2B_cotas_{int(ang):03d}.png"
    im.save(nome); imgs.append(im); print(nome.name)
cols = 4; rows = math.ceil(len(imgs) / cols); t = 560
folha = Image.new("RGB", (cols * t, rows * t), "white")
for i, im in enumerate(imgs):
    folha.paste(im.resize((t, t), Image.LANCZOS), ((i % cols) * t, (i // cols) * t))
folha.save(out / "trava_v2B_cotas_todas.png"); print("trava_v2B_cotas_todas.png")
