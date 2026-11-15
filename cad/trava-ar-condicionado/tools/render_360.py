"""Gera vistas PNG ao redor da peça (giro em torno do eixo Y, vertical da trava instalada).
uso: python tools/render_360.py <arquivo.stl> <pasta_saida> [passo_graus] [elevacao_graus]"""
import sys, math
from pathlib import Path
import numpy as np, trimesh
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_zbuffer import render

stl, out = sys.argv[1], Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
passo = float(sys.argv[3]) if len(sys.argv) > 3 else 30.0
elev = float(sys.argv[4]) if len(sys.argv) > 4 else 22.0
tm = trimesh.load(stl)
tm.apply_translation(-tm.bounds.mean(0))   # gira em torno do centro da peça
def rx(a):
    a = math.radians(a); c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def ry(a):
    a = math.radians(a); c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
try:
    fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
except OSError:
    fonte = ImageFont.load_default()
# escala fixa para todas as vistas (a peça não "pulsa" de tamanho)
raio = np.linalg.norm(tm.vertices, axis=1).max()
ancora = np.array([[raio, raio, 0], [-raio, -raio, 0]])
imgs = []
for ang in np.arange(0, 360, passo):
    R = rx(elev) @ ry(ang)
    m = tm.copy()
    # pontos-âncora invisíveis fixam o enquadramento: adiciona-os ao cálculo de limites
    lo_hi = trimesh.Trimesh(vertices=np.vstack([m.vertices, ancora @ np.linalg.inv(R).T]), faces=m.faces, process=False)
    im, _ = render(lo_hi, R, tamanho=1200, margem=0.03)
    d = ImageDraw.Draw(im)
    d.text((30, 25), f"{int(ang):03d}°", fill=(40, 40, 40), font=fonte)
    nome = out / f"trava_360_{int(ang):03d}.png"
    im.save(nome); imgs.append(im); print(nome.name)
# folha de contato
cols = 4; rows = math.ceil(len(imgs) / cols); t = 450
folha = Image.new("RGB", (cols * t, rows * t), "white")
for i, im in enumerate(imgs):
    folha.paste(im.resize((t, t), Image.LANCZOS), ((i % cols) * t, (i // cols) * t))
folha.save(out / "trava_360_todas.png"); print("trava_360_todas.png")
