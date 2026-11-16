"""Imagem de exemplo com texto (usada só nos prints automáticos do OCR)."""
import sys
from PIL import Image, ImageDraw, ImageFont
W, H = 2048, 1536
im = Image.new("RGB", (W, H), (236, 238, 243))
d = ImageDraw.Draw(im)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 54)
reg = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 38)
d.rounded_rectangle([120, 220, 1480, 1120], 36, fill=(255, 255, 255))
d.text((190, 290), "Reunião de planejamento", font=bold, fill=(25, 25, 35))
lines = [
    "Olá equipe, seguem os pontos combinados hoje:",
    "",
    "1. Lançar a nova página de preços até sexta-feira.",
    "2. Revisar as campanhas de e-mail de novembro.",
    "3. Enviar o relatório de conversão para a diretoria.",
    "",
    "Qualquer dúvida, falem comigo. Obrigado!",
    "Ana Souza — Marketing",
]
y = 420
for l in lines:
    d.text((190, y), l, font=reg, fill=(60, 60, 75))
    y += 76
im.save(sys.argv[1])
