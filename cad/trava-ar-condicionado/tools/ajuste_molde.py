"""Ajusta PERFIL_MOLDE aos pontos da linha média extraídos do molde (mold_pts.npy, mm)."""
import sys, json, numpy as np
from pathlib import Path
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import trava_ar_condicionado_v1 as T

pts = np.load(sys.argv[1])
pts = pts[pts[:, 1] > 0.15]          # ignora a borda do papel / pé borrado
# Âncoras lidas na grade (foto 08) onde a faixa cinza some sob a tinta preta acumulada
# perna externa direita: borda externa preta − meia parede − espalhamento (~0,25 mm)
ancoras = np.array([[10.75, 4.0], [11.05, 2.5], [11.30, 1.0]])
pts = np.vstack([pts] + [ancoras] * 8)  # peso equivalente a ~24 pontos
keys = list(T.PERFIL_MOLDE)
x0 = np.array([T.PERFIL_MOLDE[k] for k in keys])
faixa = {k: 0.8 for k in keys}
faixa.update(E_ressalto=1.0, D_ressalto=0.8, E_ressalto_y=1.2, D_ressalto_y=1.2,
             E_ressalto_larg=0.5, D_ressalto_larg=0.5, E_ponta_alt=0.5, D_ponta_alt=0.5,
             U_prof=0.6, U_inicio_y=0.8)
lb = np.array([x0[i] - faixa[k] for i, k in enumerate(keys)])
ub = np.array([x0[i] + faixa[k] for i, k in enumerate(keys)])
for k in ("E_ressalto_larg", "D_ressalto_larg", "E_ponta_alt", "D_ponta_alt", "U_prof"):
    i = keys.index(k); lb[i] = max(lb[i], 0.3)

def curva(x):
    p = dict(zip(keys, x))
    c = T.linha_media_molde(p, y_pe=0.0)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(c, axis=0).T))]
    s = np.linspace(0, d[-1], 700)
    return np.c_[np.interp(s, d, c[:, 0]), np.interp(s, d, c[:, 1])]

def res(x):
    c = curva(x)
    d1, _ = cKDTree(c).query(pts)          # molde -> CAD
    d2, _ = cKDTree(pts).query(c)          # CAD -> molde (evita "atalhos")
    reg = 0.02 * (x - x0)
    return np.r_[d1, 0.5 * d2, reg]

r = least_squares(res, x0, bounds=(lb, ub), loss="soft_l1", f_scale=0.12, max_nfev=4000)
c = curva(r.x)
d1, _ = cKDTree(c).query(pts)
print("pontos:", len(pts), " desvio molde->CAD  mediana %.3f  p90 %.3f  max %.3f mm"
      % (np.median(d1), np.percentile(d1, 90), d1.max()))
fit = {k: round(float(v), 2) for k, v in zip(keys, r.x)}
print(json.dumps(fit, indent=1))
json.dump(fit, open(sys.argv[2], "w"), indent=1)
