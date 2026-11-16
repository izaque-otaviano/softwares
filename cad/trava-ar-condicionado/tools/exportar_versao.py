"""Exporta e valida uma versão a partir de um JSON de parâmetros.
uso: python tools/exportar_versao.py <parametros.json> <prefixo_saida>"""
import sys, json, math
from pathlib import Path
import numpy as np, cadquery as cq, trimesh
from shapely.geometry import LineString, Polygon
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import trava_ar_condicionado_v1 as T
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.IGESControl import IGESControl_Writer

kw = json.load(open(sys.argv[1])); pre = sys.argv[2]
P = T.Parametros(**kw); m = T.construir(P)
cq.exporters.export(m, pre + ".step")
cq.exporters.export(m, pre + ".stl", tolerance=0.005, angularTolerance=0.05)
cq.exporters.export(m, pre + ".3mf")
w = IGESControl_Writer("MM", 1); w.AddShape(m.val().wrapped); w.ComputeModel(); w.Write(pre + ".igs")
R = {}
s = cq.importers.importStep(pre + ".step")
R["step_solidos"] = len(s.solids().vals()); R["step_valido"] = bool(BRepCheck_Analyzer(s.val().wrapped).IsValid())
bb = s.val().BoundingBox(); R["bbox_mm"] = [round(bb.xlen, 2), round(bb.ylen, 2), round(bb.zlen, 2)]
R["y_min_face_colagem"] = round(bb.ymin, 3)
tm = trimesh.load(pre + ".stl")
R["stl_fechada"] = bool(tm.is_watertight); R["stl_corpos"] = len(tm.split(only_watertight=False))
R["volume_mm3"] = round(float(tm.volume), 1); R["massa_PETG_g"] = round(float(tm.volume) * 1.27e-3, 2)
L = P.largura_total; zf = P.fracao_preenchida * L
for nome, z in (("macico", zf / 2), ("oco", (zf + L) / 2)):
    R[f"fendas_secao_{nome}"] = len(s.section(z).faces().val().innerWires())
# medidas no trecho oco
f = s.section((zf + L) / 2).faces().val()
def anel(wire):
    n = max(400, int(wire.Length() / 0.02))
    return [(p.x, p.y) for p in (wire.positionAt(t) for t in np.linspace(0, 1, n, endpoint=False))]
poly = Polygon(anel(f.outerWire()), [anel(wi) for wi in f.innerWires()])
def trechos(y):
    g = LineString([(-50, y), (50, y)]).intersection(poly)
    segs = [g] if g.geom_type == "LineString" else list(g.geoms)
    return sorted([sorted([q.coords[0][0], q.coords[-1][0]]) for q in segs])
for nome, y in (("canal", 4.5), ("bolsao", 7.5)):
    t_ = trechos(y); R[f"vao_{nome}_y{y}"] = round(t_[2][0] - t_[1][1], 2) if len(t_) == 4 else None
R["fendas_livres_y2_4_6_8"] = []
for y in (2, 4, 6, 8):
    t_ = trechos(y)
    R["fendas_livres_y2_4_6_8"].append([round(t_[1][0] - t_[0][1], 2), round(t_[3][0] - t_[2][1], 2)] if len(t_) == 4 else None)
c = T.linha_media(P); R["raio_min_face_interna"] = round(float(T.raio_curvatura(c)[3:-3].min() - P.espessura_parede / 2), 2)
R["parametros"] = kw
json.dump(R, open(pre + "_validacao.json", "w"), indent=1, ensure_ascii=False)
for k, v in R.items():
    if k != "parametros": print(f"{k}: {v}")
