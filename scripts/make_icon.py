"""Gera Resources/AppIcon.icns (rodado uma vez; o .icns já fica no repositório)."""
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 1024
out = sys.argv[1]

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# Fundo: quadrado arredondado com gradiente azul (estilo ícones macOS)
grad = Image.new("RGB", (S, S))
gd = ImageDraw.Draw(grad)
top, bottom = (90, 200, 250), (0, 110, 230)
for y in range(S):
    gd.line([(0, y), (S, y)], fill=lerp(top, bottom, y / S))

margin, radius = 100, 185
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([margin, margin, S - margin, S - margin], radius, fill=255)

icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([margin, margin + 14, S - margin, S - margin + 14], radius, fill=(0, 0, 0, 110))
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
icon.alpha_composite(shadow)
body = grad.convert("RGBA")
body.putalpha(mask)
icon.alpha_composite(body)

d = ImageDraw.Draw(icon)
white = (255, 255, 255, 255)
w = 46
a, b = 250, S - 250
l = 150
for (x, y, dx, dy) in [(a, a, 1, 1), (b, a, -1, 1), (b, b, -1, -1), (a, b, 1, -1)]:
    d.line([(x, y + dy * l), (x, y), (x + dx * l, y)], fill=white, width=w, joint="curve")
    for p in [(x, y + dy * l), (x + dx * l, y), (x, y)]:
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=white)

# Seta vermelha
red = (255, 69, 58, 255)
d.line([(390, 640), (610, 420)], fill=red, width=54)
d.ellipse([390 - 27, 640 - 27, 390 + 27, 640 + 27], fill=red)
d.polygon([(680, 350), (520, 390), (640, 510)], fill=red)

icon.save(out, sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
icon.save(out.replace(".icns", ".png"))
