"""Mede px/mm pelos traços da régua numa linha da imagem.
uso: python tools/calibrar_regua.py <foto> <linha_y> <x_ini> <x_fim>
(foto 08: linha 1050, x 410..1080 -> 50 intervalos, 12,94 px/mm)"""
import sys, numpy as np, cv2
f, row, x0, x1 = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
im = cv2.imread(f, 0).astype(float)
prof = im[row - 3:row + 3, x0:x1].mean(0)
prof -= np.convolve(prof, np.ones(15) / 15, "same")
idx = [i for i in range(2, len(prof) - 2) if prof[i] < -8 and prof[i] == prof[i - 2:i + 3].min()]
xs = np.array(idx) + x0
k = np.polyfit(np.arange(len(xs)), xs, 1)[0]
print("traços:", len(xs), " px/mm = %.3f" % k, " desvio máx do ajuste linear: %.2f px"
      % np.abs(xs - np.polyval(np.polyfit(np.arange(len(xs)), xs, 1), np.arange(len(xs)))).max())
