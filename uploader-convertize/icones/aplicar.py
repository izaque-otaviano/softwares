#!/usr/bin/env python3
"""Gera, a partir da logo final (SVG em icones/finais/), todos os arquivos que o app usa em
assets/app-icon/, com os mesmos nomes do projeto original. O workflow copia essa pasta por cima do
checkout antes de compilar, então o ícone novo entra no .exe, no .app, na janela, no Dock e no
instalador.

    python3 icones/aplicar.py

Duas versões do desenho:
- "macOS": a grade de 1024 com margem e sombra (o macOS espera a margem no próprio arquivo);
- "cheia": o squircle ocupando quase todo o quadro, sem sombra (Windows, Linux, instaladores).
"""

import io
import os
import re
import subprocess

from PIL import Image

from gerar_icones import SQ, icon

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
HICOLOR = [16, 24, 32, 48, 64, 128, 256, 512]

APPS = {
    # app: (logo final, png de 1024 é a versão macOS?, png macOS de 512 extra?)
    # A logo é quadrada, com o fundo cheio; usamos a variante clara (padrão) das SVGs "adaptive".
    "vectorcraft": ("vectorcraft-claro.svg", False, True),
    "photocraft": ("photocraft-claro.svg", True, False),
}


def moldura(logo):
    """Coloca a logo quadrada dentro do squircle do macOS (824 de 1024), com a sombra externa."""
    logo = re.sub(r"<svg[^>]*>", '<svg x="100" y="100" width="824" height="824" viewBox="0 0 1000 1000">',
                  logo, count=1)
    return icon("", "#000", f'<path d="{SQ}" fill="#000"/>{logo}', glass=False)


def cheia(svg):
    """Sem a sombra externa e recortado em volta do squircle (margem de 2%)."""
    svg = svg.replace('<g filter="url(#drop)">', "<g>")
    return re.sub(r'viewBox="0 0 1024 1024"', 'viewBox="84 84 856 856"', svg, count=1)


def render(svg_text, size):
    with open("/dev/shm/icone.svg" if os.path.isdir("/dev/shm") else "icone.svg", "w") as f:
        f.write(svg_text)
        path = f.name
    out = subprocess.run(["resvg", "-w", str(size), "-h", str(size), path, "-c"],
                         check=True, capture_output=True).stdout
    os.remove(path)
    return Image.open(io.BytesIO(out)).convert("RGBA")


def main():
    for app, (escolhido, macos_1024, macos_512) in APPS.items():
        with open(os.path.join(HERE, "finais", escolhido)) as f:
            mac = moldura(f.read())
        full = cheia(mac)
        dest = os.path.join(ROOT, f"instalador-{app}", "icone", "app-icon")
        os.makedirs(dest, exist_ok=True)

        # SVGs (o original usa o SVG como arte-mestre e em hicolor/scalable)
        for name in (f"{app}.svg", f"{app}-small.svg"):
            with open(os.path.join(dest, name), "w") as f:
                f.write(full)
        sc = os.path.join(dest, "hicolor", "scalable", "apps")
        os.makedirs(sc, exist_ok=True)
        with open(os.path.join(sc, f"ai.storyteller.{app}.svg"), "w") as f:
            f.write(full)

        # PNGs hicolor (janela no Windows/Linux, marca dentro do app)
        for s in HICOLOR:
            d = os.path.join(dest, "hicolor", f"{s}x{s}", "apps")
            os.makedirs(d, exist_ok=True)
            render(full, s).save(os.path.join(d, f"ai.storyteller.{app}.png"), optimize=True)

        render(mac if macos_1024 else full, 1024).save(os.path.join(dest, f"{app}-1024.png"), optimize=True)
        if macos_512:
            render(mac, 512).save(os.path.join(dest, f"{app}-macos-512.png"), optimize=True)

        # .ico do Windows: executável, atalhos, instalador
        big = render(full, 256)
        big.save(os.path.join(dest, f"{app}.ico"), sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)], bitmap_format="bmp")

        # .icns do macOS: bundle .app e ícone do disco no DMG
        render(mac, 1024).save(os.path.join(dest, f"{app}.icns"))
        print(f"{app}: ok -> {os.path.relpath(dest, ROOT)}")


if __name__ == "__main__":
    main()
