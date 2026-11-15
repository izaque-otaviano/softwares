"""Extrai a linha média da faixa de CONTATO (cinza) do molde de tinta, em mm.

uso: python tools/extrair_molde.py referencias/foto08_molde_regua.jpeg referencias/molde_linha_media_mm.npy

Calibração da foto 08 (medida por tools/calibrar_regua.py ... ver README):
  12,94 px/mm (50 intervalos de 1 mm, espaçamento 12–13 px uniforme -> sem perspectiva relevante)
  zero da régua em x = 425 px; borda do papel (= topo da base) em y = 1028 px.

A tinta preta acumulada nas bordas e dentro dos canais NÃO é tratada como material:
usa-se só a faixa cinza (78 <= nível < 170), onde houve contato real com a face da peça.
"""
import sys
import numpy as np, cv2
from skimage.morphology import skeletonize, remove_small_objects

PX, X0, YB = 12.94, 425.0, 1028.0
ROI = (380, 850, 650, 1029)  # x0, y0, x1, y1 (px)

im = cv2.imread(sys.argv[1])
a, b, c, d = ROI
g = cv2.GaussianBlur(cv2.cvtColor(im[b:d, a:c], cv2.COLOR_BGR2GRAY), (3, 3), 0)
cinza = (g >= 78) & (g < 170)
cinza = remove_small_objects(cinza, max_size=40)
cinza = cv2.morphologyEx(cinza.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
esq = skeletonize(cinza > 0)
dt = cv2.distanceTransform(cinza, cv2.DIST_L2, 5)
ys, xs = np.nonzero(esq)
ok = dt[ys, xs] >= 2.0          # descarta ramos espúrios em regiões muito finas
ys, xs = ys[ok], xs[ok]
pts = np.c_[(xs + a - X0) / PX, (YB - (ys + b)) / PX]
print("pontos:", len(pts), " largura mediana da faixa de contato: %.2f mm" % np.median(2 * dt[ys, xs] / PX))
np.save(sys.argv[2], pts)
