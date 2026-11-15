"""Sobrepõe o perfil CAD (linha média + faces da parede + base) à foto do molde, na escala da régua.

uso: python tools/comparacao_molde.py <foto_molde.jpeg> <saida.png>
Calibração (foto 08): 12,94 px/mm medido em 50 traços da régua; zero da régua em x=425 px;
borda do papel (topo da base) em y=1028 px.
"""
import sys, json
from pathlib import Path
import numpy as np, cv2
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import trava_ar_condicionado_v1 as T

PX, X0, YB = 12.94, 425.0, 1028.0
foto, saida = sys.argv[1], sys.argv[2]
P = T.Parametros()
# Perfil efetivamente exportado: linha média final + seção do sólido em z = meia extrusão
import cadquery as cq
from scipy.spatial import cKDTree
c = T.linha_media(P)
t2 = P.espessura_parede / 2
solido = T.construir(P)
z_corte = P.largura_total * (1 + P.fracao_preenchida) / 2  # meio do trecho oco
secao = solido.section(z_corte).faces().val()
aneis = []
for w in [secao.outerWire()] + list(secao.innerWires()):
    pts = []
    for e in w.Edges():
        n = max(3, int(e.Length() / 0.03))
        q = [e.positionAt(u) for u in np.linspace(0, 1, n)]
        pts.append(np.array([[v.x, v.y] for v in q]))
    aneis.append(pts)
im = cv2.imread(foto)
x0, x1, y0, y1 = -3.0, 15.0, -2.2, 13.0
a, b = int(X0 + x0 * PX), int(YB - y1 * PX)
cc, d = int(X0 + x1 * PX), int(YB - y0 * PX)
sc = 5
roi = cv2.resize(im[b:d, a:cc], None, fx=sc, fy=sc, interpolation=cv2.INTER_CUBIC)
roi = cv2.addWeighted(roi, 0.75, np.full_like(roi, 255), 0.25, 0)
def uv(q):
    return np.c_[(X0 + q[:, 0] * PX - a) * sc, (YB - q[:, 1] * PX - b) * sc].round().astype(np.int32)
# grade de 1 mm
for x in range(int(x0), int(x1) + 1):
    u = int((X0 + x * PX - a) * sc); cv2.line(roi, (u, 0), (u, roi.shape[0]), (225, 210, 190), 1)
for y in range(int(y0), int(y1) + 1):
    v = int((YB - y * PX - b) * sc); cv2.line(roi, (0, v), (roi.shape[1], v), (225, 210, 190), 1)
for x in range(0, int(x1) + 1, 5):
    u = int((X0 + x * PX - a) * sc); cv2.putText(roi, f"{x}", (u + 3, roi.shape[0] - 8), 0, 0.7, (90, 90, 90), 2)
for y in range(0, int(y1) + 1, 5):
    v = int((YB - y * PX - b) * sc); cv2.putText(roi, f"{y}", (4, v - 4), 0, 0.7, (90, 90, 90), 2)
# pontos do molde usados no ajuste
mp = Path(__file__).resolve().parents[1] / "referencias" / "molde_linha_media_mm.npy"
if mp.exists():
    molde = np.load(mp)
dev, _ = cKDTree(T._reamostrar(c, 0.02)).query(molde[molde[:, 1] > 0.15])
for q in uv(molde):
        cv2.circle(roi, tuple(int(v) for v in q), 2, (0, 170, 0), -1)
for anel in aneis:
    for seg in anel:
        cv2.polylines(roi, [uv(seg)], False, (0, 0, 230), 3, cv2.LINE_AA)
cv2.polylines(roi, [uv(c)], False, (230, 0, 200), 1, cv2.LINE_AA)
# legenda
H = roi.shape[0]
pad = np.full((120, roi.shape[1], 3), 255, np.uint8)
items = [((0, 0, 230), "secao do solido exportado (z = %.0f mm), parede %.1f mm, base %.1f mm"
          % (z_corte, P.espessura_parede, P.espessura_base)),
         ((230, 0, 200), "linha media CAD"),
         ((0, 170, 0), "linha media do contato de tinta (molde)  -  desvio mediano %.2f mm, p90 %.2f mm"
          % (np.median(dev), np.percentile(dev, 90)))]
for i, (col, txt) in enumerate(items):
    yy = 28 + 26 * i
    cv2.line(pad, (15, yy - 6), (55, yy - 6), col, 3); cv2.putText(pad, txt, (65, yy), 0, 0.62, (40, 40, 40), 1, cv2.LINE_AA)
cv2.putText(pad, "foto 08 - escala 12,94 px/mm (regua, 50 tracos) - grade 1 mm", (15, 108), 0, 0.55, (60, 60, 60), 1, cv2.LINE_AA)
cv2.imwrite(saida, np.vstack([roi, pad]))
print("ok", saida)
