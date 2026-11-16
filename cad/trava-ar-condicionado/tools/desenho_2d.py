"""Desenho técnico 2D (DXF, mm, 1:1) só com linhas: vistas frontal, lateral e superior, com cotas.

uso: python tools/desenho_2d.py <saida.dxf> [preview.png]

Curvas do perfil viram polilinhas de segmentos retos (erro de cordas <= 0,005 mm).
Camadas: CONTORNO, OCULTAS (tracejado), CENTRO, COTAS, TEXTO.
"""
import sys, math
from pathlib import Path
import numpy as np
import ezdxf
from ezdxf.enums import TextEntityAlignment
from shapely.geometry import Polygon, LineString
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import trava_ar_condicionado_v1 as T

saida = sys.argv[1]
# argv[3] (opcional): JSON com parâmetros; argv[4] (opcional): título da versão
import json
kw = json.load(open(sys.argv[3])) if len(sys.argv) > 3 else {}
TITULO = sys.argv[4] if len(sys.argv) > 4 else "TRAVA DE AR-CONDICIONADO v1 - PETG"
P = T.Parametros(**kw)
YB0 = 0.0 if P.base_embutida else -P.espessura_base   # face de colagem (encosta na tampa)
YB1 = P.espessura_base if P.base_embutida else 0.0    # topo da base
solido = T.construir(P)
L = P.largura_total
zf = P.fracao_preenchida * L


def aneis(z):
    """Contornos (externo + fendas) da seção em z, como listas de pontos ordenados."""
    f = solido.section(z).faces().val()
    out = []
    for w in [f.outerWire()] + list(f.innerWires()):
        n = max(400, int(w.Length() / 0.02))
        pts = np.array([[p.x, p.y] for p in (w.positionAt(t) for t in np.linspace(0, 1, n, endpoint=False))])
        ls = LineString(np.vstack([pts, pts[:1]])).simplify(0.005)
        out.append(np.array(ls.coords))
    return out


oco = aneis((zf + L) / 2)          # vista frontal pelo lado oco (Z = L)
macico = aneis(zf / 2)
ext = oco[0]
poly = Polygon(ext, [r for r in oco[1:]])
xmin, ymin = ext[:, 0].min(), ext[:, 1].min()
xmax, ymax = ext[:, 0].max(), ext[:, 1].max()

# ----------------------------------------------------------------- documento
doc = ezdxf.new("R2010", setup=True)
doc.units = ezdxf.units.MM
doc.header["$INSUNITS"] = 4
doc.header["$MEASUREMENT"] = 1
for nome, cor, lt in (("CONTORNO", 7, "CONTINUOUS"), ("OCULTAS", 8, "DASHED"), ("CENTRO", 1, "CENTER"),
                      ("COTAS", 4, "CONTINUOUS"), ("TEXTO", 7, "CONTINUOUS")):
    doc.layers.add(nome, color=cor, linetype=lt)
doc.header["$LTSCALE"] = 0.12
ds = doc.dimstyles.new("MM_TRAVA")
ds.dxf.dimtxt = 0.45; ds.dxf.dimasz = 0.35; ds.dxf.dimexe = 0.3; ds.dxf.dimexo = 0.25
ds.dxf.dimgap = 0.12; ds.dxf.dimdec = 2; ds.dxf.dimadec = 1; ds.dxf.dimdsep = ord(","); ds.dxf.dimtad = 1
ds.dxf.dimzin = 8; ds.dxf.dimlunit = 2; ds.dxf.dimclrd = 4; ds.dxf.dimclre = 4; ds.dxf.dimclrt = 4
msp = doc.modelspace()
C = {"layer": "CONTORNO"}; H = {"layer": "OCULTAS"}; D = {"layer": "COTAS"}


def pl(pts, attr, off=(0, 0), fechado=True):
    msp.add_lwpolyline([(x + off[0], y + off[1]) for x, y in pts], close=fechado, dxfattribs=attr)


def ln(a, b, attr, off=(0, 0)):
    msp.add_line((a[0] + off[0], a[1] + off[1]), (b[0] + off[0], b[1] + off[1]), dxfattribs=attr)


def cota(p1, p2, base, ang=0, txt="<>", off=(0, 0)):
    d = msp.add_linear_dim(base=(base[0] + off[0], base[1] + off[1]), p1=(p1[0] + off[0], p1[1] + off[1]),
                           p2=(p2[0] + off[0], p2[1] + off[1]), angle=ang, text=txt,
                           dimstyle="MM_TRAVA", dxfattribs=D)
    d.render()


def texto(s, pos, h=0.6, alin=TextEntityAlignment.LEFT):
    msp.add_text(s, height=h, dxfattribs={"layer": "TEXTO"}).set_placement(pos, align=alin)


def cruzamentos_material(y):
    """Trechos de material na horizontal y (vista frontal, lado oco), ordenados em x."""
    g = LineString([(xmin - 5, y), (xmax + 5, y)]).intersection(poly)
    segs = [g] if g.geom_type == "LineString" else list(g.geoms)
    return sorted([sorted([s.coords[0][0], s.coords[-1][0]]) for s in segs])


# ================================================================ VISTA FRONTAL
for r in oco:
    pl(r, C)
# linha de centro da base
ln((xmin - 1, (YB0 + YB1) / 2), (xmax + 1, (YB0 + YB1) / 2), {"layer": "CENTRO"})
# cotas gerais
cota((xmin, YB0), (xmax, YB0), (0, YB0 - 1.6))
cota((xmin, YB0), (xmin, YB1), (xmin - 1.2, 0), ang=90)
# alturas dos ganchos a partir da face de colagem (tampa) e altura total
mid = 0.5 * (xmin + xmax)
esq = ext[ext[:, 0] < mid]; dir_ = ext[ext[:, 0] >= mid]
pE = esq[esq[:, 1].argmax()]; pD = dir_[dir_[:, 1].argmax()]
cota((xmin, YB0), (pE[0], pE[1]), (xmin - 2.4, 0), ang=90)
cota((xmax, YB0), (pD[0], pD[1]), (xmax + 1.4, 0), ang=90)
# posição das pontas em X (a partir da borda esquerda)
cota((xmin, YB0), (pE[0], pE[1]), (0, ymax + 1.0))
cota((xmin, YB0), (pD[0], pD[1]), (0, ymax + 2.0))
# vãos entre ganchos: canal inferior e bolsão de travamento
for y, rot in ((P.y_canal, "canal"), (P.y_bolsao, "bolsao")):
    seg = cruzamentos_material(y)
    if len(seg) == 4:
        a, b = seg[1][1], seg[2][0]
        cota((a, y), (b, y), (0, y), txt="<>")
# parede típica: cota ALINHADA perpendicular à perna externa esquerda, em y = 3
seg = cruzamentos_material(3.0)
xa = seg[0][0]
ys_ = np.linspace(2.0, 4.0, 9)
kk = np.polyfit(ys_, [cruzamentos_material(y)[0][0] for y in ys_], 1)[0]
tdir = np.array([kk, 1.0]) / math.hypot(kk, 1.0)          # direção da perna
nrm = np.array([tdir[1], -tdir[0]])                         # normal apontando para dentro (+X)
p_out = np.array([xa, 3.0])
corte = LineString([p_out - 0.05 * nrm, p_out + 3 * nrm]).intersection(poly)
corte = corte if corte.geom_type == "LineString" else min(corte.geoms, key=lambda g: g.distance(LineString([p_out, p_out])))
p_in = np.array(corte.coords[-1])
esp_real = float(np.hypot(*(p_in - p_out)))
d = msp.add_aligned_dim(p1=tuple(p_out), p2=tuple(p_in), distance=-1.2, text=("%.1f parede" % esp_real).replace(".", ","),
                        dimstyle="MM_TRAVA", dxfattribs=D)
d.render()
print("parede medida na perpendicular: %.3f mm" % esp_real)
# ângulo das pernas externas em relação à base
def ajuste_perna(lado):
    """Reta x = k*y + b ajustada à face externa (mais à esquerda/direita) entre y=1,5 e 7,5."""
    ys = np.linspace(1.5, 7.5, 25)
    xs = [cruzamentos_material(y)[0][0] if lado == "E" else cruzamentos_material(y)[-1][1] for y in ys]
    return np.polyfit(ys, xs, 1)
for lado in ("E", "D"):
    k, b = ajuste_perna(lado)
    print("perna externa", lado, "angulo com a base: %.1f graus" % (90 - math.degrees(math.atan(k)) if lado == "E" else 90 + math.degrees(math.atan(k))))
    p0 = np.array([b, 0.0]); p1 = np.array([k * 6 + b, 6.0])
    ref = p0 + np.array([-4.0 if lado == "E" else 4.0, 0.0])
    # para ficar como no exemplo: ângulo interno entre base e face externa
    centro = p0
    a1 = p1 if lado == "E" else ref
    a2 = ref if lado == "E" else p1
    try:
        d = msp.add_angular_dim_3p(base=(centro[0] + (-2.6 if lado == "E" else 2.6), 2.4), center=tuple(centro),
                                   p1=tuple(a1), p2=tuple(a2), dimstyle="MM_TRAVA", dxfattribs=D)
        d.render()
    except Exception as exc:
        print("aviso: cota angular", lado, exc)
    ln(p0, ref, {"layer": "CENTRO"})
texto("VISTA FRONTAL (lado oco, Z = 10)", (xmin, ymax + 3.4), 0.7)

# ================================================================ VISTA LATERAL (de +X)
ox = xmax + 9.0
Y0, Y1 = YB0, ymax
# contorno externo: retângulo Z x Y
pl([(0, Y0), (L, Y0), (L, Y1), (0, Y1)], C, (ox, 0))
ln((0, YB1), (L, YB1), C, (ox, 0))                    # topo da base
# fendas (ocultas) só no trecho oco: de z = zf a L, de y=0 até o topo de cada fenda
for r in oco[1:]:
    yt = r[:, 1].max()
    pl([(zf, YB1), (L, YB1), (L, yt), (zf, yt)], H, (ox, 0))
cota((0, Y0), (L, Y0), (0, Y0 - 1.6), off=(ox, 0))
cota((0, Y1), (zf, Y1), (0, Y1 + 1.0), txt="<> (maciço)", off=(ox, 0))
cota((zf, Y1), (L, Y1), (0, Y1 + 1.0), txt="<> (oco)", off=(ox, 0))
cota((L, Y0), (L, Y1), (L + 1.4, 0), ang=90, off=(ox, 0))
texto("VISTA LATERAL (de +X)", (ox, Y1 + 3.4), 0.7)

# ================================================================ VISTA SUPERIOR (de +Y)
oy = YB0 - 7.0 - L
# base
pl([(xmin, 0), (xmax, 0), (xmax, L), (xmin, L)], C, (0, oy))
# silhuetas dos ganchos (linhas ao longo de Z nas extremidades e nas pontas)
def extremos(pts):
    q = pts[pts[:, 1] > 0.5]
    return q[:, 0].min(), q[:, 0].max()
for lado in (esq, dir_):
    a, b = extremos(lado)
    for x in (a, b):
        ln((x, 0), (x, L), C, (0, oy))
for p in (pE, pD):  # linha de centro da crista de cada ponta
    ln((p[0], -0.6), (p[0], L + 0.6), {"layer": "CENTRO"}, (0, oy))
# fendas ocultas no trecho oco (vistas de cima)
for r in oco[1:]:
    a, b = r[:, 0].min(), r[:, 0].max()
    pl([(a, zf), (b, zf), (b, L), (a, L)], H, (0, oy))
cota((xmin, 0), (xmin, L), (xmin - 1.2, 0), ang=90, off=(0, oy))
cota((xmin, 0), (xmax, 0), (0, -1.4), off=(0, oy))
texto("VISTA SUPERIOR (de +Y)", (xmin, oy + L + 1.6), 0.7)

# ================================================================ LEGENDA
lx, ly = ox, oy + L - 0.5
for i, s in enumerate([
        TITULO,
        "Unidade: mm   Escala 1:1",
        (f"Parede: {P.espessura_parede:.1f} mm   Base: {P.espessura_base:.1f} mm" + (" (embutida, nao aumenta a altura)" if P.base_embutida else "")).replace(".", ","),
        f"Ganchos maciços de Z=0 a {zf:.0f} e ocos de Z={zf:.0f} a {L:.0f}",
        "Imprimir com a face Z=0 (lado maciço) na mesa",
        "Curvas aproximadas por segmentos retos (erro < 0,005 mm)",
        "Tracejado = arestas ocultas (fendas)",
        "Angulos: face externa das pernas x linha da base"]):
    texto(s, (lx, ly - i * 1.0), 0.55 if i else 0.75)

doc.saveas(saida)
print("ok", saida)

# ------------------------------------------------------------------ prévia PNG
if len(sys.argv) > 2:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from ezdxf.addons.drawing import RenderContext, Frontend
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
    from ezdxf.addons.drawing.config import Configuration, BackgroundPolicy, ColorPolicy
    fig = plt.figure(figsize=(14, 11), dpi=160)
    ax = fig.add_axes([0, 0, 1, 1])
    cfg = Configuration(background_policy=BackgroundPolicy.CUSTOM, custom_bg_color="#1f2430",
                        color_policy=ColorPolicy.COLOR, lineweight_scaling=1.6)
    Frontend(RenderContext(doc), MatplotlibBackend(ax), config=cfg).draw_layout(msp, finalize=True)
    fig.savefig(sys.argv[2], facecolor="#1f2430")
    print("ok", sys.argv[2])
