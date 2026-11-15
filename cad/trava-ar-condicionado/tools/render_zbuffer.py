"""Renderizador ortográfico simples com z-buffer (numpy) para prévias de malhas STL.
Sombreamento Lambert + arestas vivas visíveis (teste de profundidade)."""
import math
import numpy as np
from PIL import Image, ImageDraw


def render(mesh, R, tamanho=1400, margem=0.08, luz=(-0.35, 0.5, 0.8), cor=(232, 230, 222),
           angulo_aresta=30.0, fundo=(255, 255, 255)):
    V = mesh.vertices @ np.asarray(R).T
    F = mesh.faces
    N = mesh.face_normals @ np.asarray(R).T
    lo, hi = V[:, :2].min(0), V[:, :2].max(0)
    span = (hi - lo).max() * (1 + 2 * margem)
    s = tamanho / span
    off = (lo + hi) / 2
    P = np.c_[(V[:, 0] - off[0]) * s + tamanho / 2, tamanho / 2 - (V[:, 1] - off[1]) * s, V[:, 2]]
    zb = np.full((tamanho, tamanho), -np.inf)
    img = np.zeros((tamanho, tamanho, 3)); img[:] = fundo
    L = np.array(luz, float); L /= np.linalg.norm(L)
    sh = 0.30 + 0.70 * np.clip(N @ L, 0, 1) + 0.12 * np.clip(N[:, 2], 0, 1) ** 8
    base = np.array(cor, float)
    front = N[:, 2] > 1e-6
    for f in np.where(front)[0]:
        a, b, c = P[F[f]]
        x0, x1 = int(max(0, math.floor(min(a[0], b[0], c[0])))), int(min(tamanho - 1, math.ceil(max(a[0], b[0], c[0]))))
        y0, y1 = int(max(0, math.floor(min(a[1], b[1], c[1])))), int(min(tamanho - 1, math.ceil(max(a[1], b[1], c[1]))))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(d) < 1e-12:
            continue
        w0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / d
        w1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / d
        w2 = 1 - w0 - w1
        m = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not m.any():
            continue
        z = w0 * a[2] + w1 * b[2] + w2 * c[2]
        sub = zb[y0:y1 + 1, x0:x1 + 1]
        upd = m & (z > sub)
        sub[upd] = z[upd]
        img[y0:y1 + 1, x0:x1 + 1][upd] = np.clip(base * sh[f], 0, 255)
    im = Image.fromarray(img.astype(np.uint8))
    dr = ImageDraw.Draw(im)
    # arestas vivas + silhuetas
    adj, ang = mesh.face_adjacency, mesh.face_adjacency_angles
    fa, fb = front[adj[:, 0]], front[adj[:, 1]]
    sel = ((ang > math.radians(angulo_aresta)) & (fa | fb)) | (fa ^ fb)
    eps = span * s * 0.004
    for (i, j) in mesh.face_adjacency_edges[sel]:
        p, q = P[i], P[j]
        n = max(2, int(np.hypot(*(q[:2] - p[:2])) / 2))
        t = np.linspace(0, 1, n)
        pts = p[None] + t[:, None] * (q - p)[None]
        xi = np.clip(pts[:, 0].astype(int), 0, tamanho - 1); yi = np.clip(pts[:, 1].astype(int), 0, tamanho - 1)
        vis = pts[:, 2] >= zb[yi, xi] - eps
        for k in range(n - 1):
            if vis[k] and vis[k + 1]:
                dr.line([tuple(pts[k, :2]), tuple(pts[k + 1, :2])], fill=(45, 45, 50), width=2)
    return im, (s, off, tamanho)
