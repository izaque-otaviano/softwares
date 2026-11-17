"""Imagens de teste do OCR: palavra única minúscula, tema escuro, texto longo."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
F = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
def img(name, lines, size, fg, bg, pad=3, gap=6):
    f = ImageFont.truetype(F, size)
    w = max(int(f.getlength(l)) for l in lines) + pad * 2
    lh = size + gap
    im = Image.new("RGB", (w, lh * len(lines) + pad * 2), bg)
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines): d.text((pad, pad + i * lh), l, font=f, fill=fg)
    im.save(os.path.join(out, name))
img("palavra_1x.png", ["Preferências"], 13, (30, 30, 30), (255, 255, 255))
img("palavra_2x.png", ["Preferências"], 26, (30, 30, 30), (255, 255, 255), pad=4)
img("escuro_1x.png", ["Salvar capturas em: Mesa"], 13, (235, 235, 235), (30, 30, 34))
img("frase_cinza_2x.png", ["Instalador DMG para macOS 10.14"], 26, (70, 70, 80), (240, 240, 242), pad=6)
para = ("O reconhecimento de texto precisa funcionar bem tanto para uma palavra só "
        "quanto para blocos grandes, como este parágrafo de teste com acentuação: "
        "ação, coração, útil, você, até, pães, lingüiça e números 1234567890.")
words = para.split(); lines = []; cur = ""
for wd in words:
    if len(cur) + len(wd) > 70: lines.append(cur); cur = wd
    else: cur = (cur + " " + wd).strip()
lines.append(cur)
img("longo_2x.png", lines * 12, 26, (20, 20, 20), (255, 255, 255), pad=20, gap=12)
