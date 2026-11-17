"""Gera Resources/AppIcon.icns a partir de Resources/icon-glyph.svg.
Fundo azul-marinho bem escuro, moldura de seleção branca, foto e sol em azul-lavanda."""
import re, sys, io
import cairosvg
from PIL import Image, ImageDraw, ImageFilter

S = 1024
src = open(sys.argv[1]).read()
paths = re.findall(r'<path d="([^"]+)"', src)
frame, photo, sun = paths

def glyph(d, fill):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 1200 1200">{d}</svg>'
    svg = svg.replace(d, f'<path fill="{fill}" fill-rule="evenodd" d="{d}"/>')
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=S, output_height=S)
    return Image.open(io.BytesIO(png)).convert("RGBA")

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# Fundo: quadrado arredondado com gradiente cinza-escuro
margin, radius = 100, 185
grad = Image.new("RGB", (S, S))
gd = ImageDraw.Draw(grad)
for y in range(S):
    gd.line([(0, y), (S, y)], fill=lerp((38, 44, 62), (18, 21, 30), y / S))
mask = Image.new("L", (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle([margin, margin, S - margin, S - margin], radius, fill=255)

icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([margin, margin + 14, S - margin, S - margin + 14], radius, fill=(0, 0, 0, 120))
icon.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(18)))
body = grad.convert("RGBA")
body.putalpha(mask)
icon.alpha_composite(body)
# brilho sutil na borda superior
hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(hl).rounded_rectangle([margin, margin, S - margin, S - margin], radius, outline=(255, 255, 255, 40), width=3)
icon.alpha_composite(hl)

# Desenho (ocupando ~62% do ícone, centralizado)
art = Image.new("RGBA", (S, S), (0, 0, 0, 0))
art.alpha_composite(glyph(photo, "#9AB2E6"))
art.alpha_composite(glyph(sun, "#9AB2E6"))
art.alpha_composite(glyph(frame, "#FFFFFF"))
size = int(S * 0.62)
art = art.resize((size, size), Image.LANCZOS)
off = (S - size) // 2
icon.alpha_composite(art, (off, off))

out = sys.argv[2]
icon.save(out, sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
icon.save(out.replace(".icns", ".png"))
