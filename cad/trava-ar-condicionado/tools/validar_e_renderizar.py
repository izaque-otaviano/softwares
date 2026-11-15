"""Exporta STEP/STL, valida a geometria e gera as prévias ortográficas e isométrica.

uso: python tools/validar_e_renderizar.py <pasta_saida>
"""
import sys, json, math
from pathlib import Path
import numpy as np
import cadquery as cq
import trimesh
from shapely.geometry import LineString
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import trava_ar_condicionado_v1 as T

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
P = T.Parametros()
m = T.construir(P)
step, stl = out / "trava_ar_condicionado_v1.step", out / "trava_ar_condicionado_v1.stl"
cq.exporters.export(m, str(step))
cq.exporters.export(m, str(stl), tolerance=0.005, angularTolerance=0.05)
R = {}

# ---------------- B-rep (reimportando o STEP) ----------------
s = cq.importers.importStep(str(step))
sol = s.solids().vals()
from OCP.BRepCheck import BRepCheck_Analyzer
R["step_solidos"] = len(sol)
R["step_valido_BRepCheck"] = bool(BRepCheck_Analyzer(s.val().wrapped).IsValid())
bb = s.val().BoundingBox()
R["bbox_mm"] = {"X": round(bb.xlen, 3), "Y": round(bb.ylen, 3), "Z": round(bb.zlen, 3)}
sec = s.section(P.largura_total / 2).faces().vals()
from OCP.GProp import GProp_GProps
from OCP.BRepGProp import BRepGProp
g = GProp_GProps(); BRepGProp.SurfaceProperties_s(sec[0].wrapped, g, 1e-6)
R["secao_meio_area_mm2"] = round(g.Mass(), 3)
R["secao_meio_furos_passantes"] = len(sec[0].innerWires())

# ---------------- malha ----------------
tm = trimesh.load(str(stl))
R["stl_triangulos"] = int(len(tm.faces))
R["stl_fechada_watertight"] = bool(tm.is_watertight)
R["stl_normais_consistentes"] = bool(tm.is_winding_consistent)
R["stl_corpos"] = len(tm.split(only_watertight=False))
R["stl_volume_mm3"] = round(float(tm.volume), 2)
R["stl_euler"] = int(tm.euler_number)
R["massa_PETG_g"] = round(float(tm.volume) * 1.27e-3, 2)

# ---------------- verificações funcionais (no perfil 2D) ----------------
c = T.linha_media(P); t = P.espessura_parede
pa = T.perfil_ajustado(P)
fa, fb = T._offset(c, t / 2), T._offset(c, -t / 2)
# espessura da parede ao longo do percurso
from scipy.spatial import cKDTree
dpar, _ = cKDTree(fb).query(fa)
R["parede_espessura_min_max"] = [round(float(dpar[5:-5].min()), 3), round(float(dpar[5:-5].max()), 3)]
# raio mínimo da linha média e raio interno resultante (concentração de tensão)
d1 = np.gradient(c, axis=0); d2 = np.gradient(d1, axis=0)
k = np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.linalg.norm(d1, axis=1) ** 3
rmin = 1 / k[5:-5].max()
R["raio_min_linha_media"] = round(float(rmin), 3)
R["raio_min_face_interna"] = round(float(rmin - t / 2), 3)
# vãos livres e fendas medidos na GEOMETRIA FINAL (cruzamentos horizontais da linha média)
def cruzamentos(y):
    xs = []
    for (x0, y0), (x1, y1) in zip(c[:-1], c[1:]):
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1:
            xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
    return sorted(xs)
for nome, y in (("canal_inferior", P.y_canal), ("bolsao_travamento", P.y_bolsao)):
    xs = cruzamentos(y)
    R[f"vao_{nome}_y{y:.1f}"] = round(xs[2] - xs[1] - t, 3) if len(xs) == 4 else f"cruzamentos={len(xs)}"
for y in (2, 4, 6, 8):
    xs = cruzamentos(y)
    if len(xs) == 4:
        R.setdefault("fenda_interna_gancho_esq_y2468", []).append(round(xs[1] - xs[0] - t, 2))
        R.setdefault("fenda_interna_gancho_dir_y2468", []).append(round(xs[3] - xs[2] - t, 2))
# folga mínima global entre partes NÃO adjacentes da parede (detecta "soldas" na impressão)
L = LineString(c); segs = [LineString(c[i:i + 2]) for i in range(len(c) - 1)]
arc = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
tree = cKDTree(c); pares = tree.query_pairs(r=t + 0.8)
gmin = 99; gwhere = None
for i, j in pares:
    if abs(arc[i] - arc[j]) > 4.0:  # pontos distantes ao longo da lâmina
        d = np.hypot(*(c[i] - c[j])) - t
        if d < gmin: gmin, gwhere = d, (c[i].round(2).tolist(), c[j].round(2).tolist())
R["folga_min_entre_paredes_nao_adjacentes"] = round(float(gmin), 3) if gmin < 99 else ">0.8"
R["folga_min_local"] = gwhere
yb = c[(c[:, 0] > c[:, 0].min() + 2.5) & (c[:, 0] < c[:, 0].max() - 2.5), 1].min() - t / 2
R["fundo_U_acima_da_base"] = round(float(yb), 3)
R["fundo_U_unido_por_nervura"] = P.unir_U_base
# estimativa de deformação na flexão (viga engastada, perna externa)
Lp = pa["E_topo_y"]; eps = lambda delta: 1.5 * t * delta / Lp ** 2
R["deformacao_flexao_%_para_0.5mm_na_ponta"] = round(100 * eps(0.5), 2)
R["deformacao_flexao_%_para_1.0mm_na_ponta"] = round(100 * eps(1.0), 2)
json.dump(R, open(out / "relatorio_validacao.json", "w"), indent=1, ensure_ascii=False)
for k_, v in R.items(): print(f"{k_}: {v}")

# ---------------- renderização (z-buffer, ortográfica) ----------------
from render_zbuffer import render
from PIL import ImageDraw, ImageFont
def fonte(sz):
    for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVuSans.ttf"):
        try: return ImageFont.truetype(f, sz)
        except OSError: pass
    return ImageFont.load_default()
def rot(ax_, a):
    a = math.radians(a); c_, s_ = math.cos(a), math.sin(a)
    return {"x": np.array([[1, 0, 0], [0, c_, -s_], [0, s_, c_]]), "y": np.array([[c_, 0, s_], [0, 1, 0], [-s_, 0, c_]])}[ax_]
def salvar(nome, R_, titulo, eixo_h=None, eixo_v=None):
    im, (s_, off, T_) = render(tm, R_)
    dr = ImageDraw.Draw(im)
    if eixo_h:  # régua de 5 mm + rótulos de eixo
        x0, y0 = 60, T_ - 60
        dr.line([(x0, y0), (x0 + 5 * s_, y0)], fill=(200, 30, 30), width=5)
        dr.text((x0, y0 + 10), "5 mm", fill=(200, 30, 30), font=fonte(26))
        dr.text((T_ - 260, T_ - 50), f"horiz.: {eixo_h}  vert.: {eixo_v}", fill=(90, 90, 90), font=fonte(24))
    dr.text((40, 30), titulo, fill=(30, 30, 30), font=fonte(34))
    im.save(out / nome)
salvar("previa_frontal.png", np.eye(3), "Vista frontal — perfil (ao longo de Z)", "X", "Y")
salvar("previa_lateral.png", np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]]), "Vista lateral (de +X)", "-Z", "Y")
salvar("previa_superior.png", np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]]), "Vista superior (de +Y: pontas)", "X", "-Z")
salvar("previa_isometrica.png", rot("x", 30) @ rot("y", -40), "Trava v1 — isométrica (PETG)")
print("renders ok")
