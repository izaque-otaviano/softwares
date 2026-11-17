"""Gera Resources/MenuBarIcon.png (template preto, 36×36 = 18pt @2x) a partir do glyph."""
import re, sys, io
import cairosvg
from PIL import Image
src = open(sys.argv[1]).read()
paths = re.findall(r'<path d="([^"]+)"', src)
body = "".join(f'<path fill="#000" fill-rule="evenodd" d="{d}"/>' for d in paths)
svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 1200 1200">{body}</svg>'
png = cairosvg.svg2png(bytestring=svg.encode(), output_width=36, output_height=36)
Image.open(io.BytesIO(png)).convert("RGBA").save(sys.argv[2])
