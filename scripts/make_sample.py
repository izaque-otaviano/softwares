"""Imagem de exemplo (um 'site' fictício) usada só nos prints automáticos do CI."""
import sys
from PIL import Image, ImageDraw, ImageFont
W, H = 1600, 1000
im = Image.new("RGB", (W, H), (246, 247, 250))
d = ImageDraw.Draw(im)
try:
    f = lambda s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", s)
    g = lambda s: ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", s)
except Exception:
    f = g = lambda s: ImageFont.load_default()
d.rectangle([0, 0, W, 90], fill=(255, 255, 255))
d.text((48, 26), "Painel de Vendas", font=f(36), fill=(30, 30, 40))
for i, t in enumerate(["Início", "Relatórios", "Clientes", "Ajustes"]):
    d.text((900 + i * 170, 34), t, font=g(26), fill=(90, 90, 110))
cards = [("Receita", "R$ 48.920", (52, 120, 246)), ("Pedidos", "1.284", (52, 199, 89)), ("Conversão", "3,8%", (255, 149, 0))]
for i, (a, b, c) in enumerate(cards):
    x = 48 + i * 512
    d.rounded_rectangle([x, 130, x + 480, 320], 22, fill=(255, 255, 255))
    d.text((x + 32, 160), a, font=g(28), fill=(110, 110, 130))
    d.text((x + 32, 210), b, font=f(56), fill=c)
d.rounded_rectangle([48, 360, W - 48, 950], 22, fill=(255, 255, 255))
d.text((80, 390), "Vendas por mês", font=f(30), fill=(30, 30, 40))
vals = [40, 55, 48, 70, 62, 85, 78, 92, 66, 74, 88, 98]
for i, v in enumerate(vals):
    x = 110 + i * 118
    d.rounded_rectangle([x, 900 - v * 4.5, x + 70, 900], 10, fill=(52, 120, 246) if i != 11 else (255, 59, 48))
im.save(sys.argv[1])
