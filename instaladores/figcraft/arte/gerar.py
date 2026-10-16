#!/usr/bin/env python3
"""Gera a arte dos instaladores do FigCraft a partir do ícone do próprio projeto.

Saídas (já versionadas, então o CI não precisa rodar este script):
    macos/background.tiff     fundo da janela do DMG, 1x e 2x num TIFF HiDPI
    macos/DS_Store            layout da janela do Finder (tamanho, posição dos ícones, fundo)
    windows/assistente-*.bmp  imagens do assistente do instalador .exe (Inno Setup), 100% a 250%

Uso (qualquer sistema, não precisa de Mac):
    pip install 'pillow>=12' ds_store==1.3.3 mac_alias==2.2.3
    cargo install resvg
    python3 arte/gerar.py /caminho/para/figcraft /caminho/para/vectorcraft/assets/fonts

O FigCraft não traz a Inter no repositório; usamos a do VectorCraft (mesma equipe, OFL), que é a
fonte dos outros instaladores.

O DS_Store e o alias do fundo seguem packaging/macos/dmg/generate.py do FigCraft
(MIT OR Apache-2.0).
"""

import datetime
import os
import shutil
import subprocess
import sys
import tempfile

from ds_store import DSStore
from mac_alias import Alias, TargetInfo, VolumeInfo
from PIL import Image, ImageCms, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)

# Manter em sincronia com macos/criar-dmg.sh (nome do volume) e arte/dmg-fundo.svg (layout).
VOLUME = "FigCraft"
WIDTH, HEIGHT = 660, 400
TITLE_BAR = 28
ICON_SIZE = 128
ICONS = {"FigCraft.app": (180, 210), "Applications": (480, 210)}
FIXED_DATE = datetime.datetime(2026, 10, 13, tzinfo=datetime.timezone.utc)

# Tamanhos do assistente "modern" do Inno Setup, de 100% a 250% de escala.
WIZARD_LARGE = [(164, 314), (202, 386), (246, 459), (289, 538), (328, 628), (369, 707), (410, 797)]
WIZARD_SMALL = [55, 64, 83, 92, 110, 119, 138]
TOP, BOTTOM, INK = (0xFB, 0xFB, 0xFD), (0xEE, 0xEE, 0xF2), (0x1D, 0x1D, 0x1F)


def render(svg, fonts, width, out):
    subprocess.run(
        ["resvg", "--skip-system-fonts", "--use-fonts-dir", fonts, "-w", str(width), svg, out],
        check=True,
    )
    with Image.open(out) as im:
        return im.convert("RGB")


def srgb_profile():
    icc = bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
    d = FIXED_DATE
    icc[24:36] = b"".join(v.to_bytes(2, "big") for v in (d.year, d.month, d.day, 0, 0, 0))
    return bytes(icc)


def write_tiff(fonts, out):
    """1x (72 dpi) e 2x (144 dpi) no mesmo TIFF, como o `tiffutil -cathidpicheck`."""
    svg = os.path.join(HERE, "dmg-fundo.svg")
    with tempfile.TemporaryDirectory() as tmp:
        one, two = (render(svg, fonts, WIDTH * s, os.path.join(tmp, f"{s}x.png")) for s in (1, 2))
    two.encoderinfo = {"dpi": (144, 144)}
    one.save(
        out,
        "TIFF",
        save_all=True,
        append_images=[two],
        compression="tiff_adobe_deflate",
        dpi=(72, 72),
        icc_profile=srgb_profile(),
    )
    return two


def background_alias():
    volume = VolumeInfo(VOLUME, FIXED_DATE, b"H+", 5, 0x0D02, b"\0\0")
    volume.posix_path = f"/Volumes/{VOLUME}"
    target = TargetInfo(0, "background.tiff", 25, 26, FIXED_DATE, b"\0\0\0\0", b"\0\0\0\0")
    target.folder_name = ".background"
    target.cnid_path = [25]
    target.carbon_path = f"{VOLUME}:.background:\0background.tiff"
    target.posix_path = "/.background/background.tiff"
    return Alias(volume=volume, target=target).to_bytes()


def write_ds_store(out):
    if os.path.exists(out):
        os.remove(out)
    with DSStore.open(out, "w+") as d:
        d["."]["bwsp"] = {
            "ShowStatusBar": False,
            "ShowToolbar": False,
            "ShowTabView": False,
            "ContainerShowSidebar": False,
            "ShowSidebar": False,
            "ShowPathbar": False,
            "WindowBounds": f"{{{{200, 300}}, {{{WIDTH}, {HEIGHT + TITLE_BAR}}}}}",
        }
        d["."]["icvp"] = {
            "viewOptionsVersion": 1,
            "backgroundType": 2,
            "backgroundImageAlias": background_alias(),
            "backgroundColorRed": 1.0,
            "backgroundColorGreen": 1.0,
            "backgroundColorBlue": 1.0,
            "gridOffsetX": 0.0,
            "gridOffsetY": 0.0,
            "gridSpacing": 100.0,
            "arrangeBy": "none",
            "showIconPreview": True,
            "showItemInfo": False,
            "labelOnBottom": True,
            "textSize": 13.0,
            "iconSize": float(ICON_SIZE),
        }
        d["."]["vSrn"] = ("long", 1)
        for name, pos in ICONS.items():
            d[name]["Iloc"] = pos


def gradient(w, h):
    im = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(h - 1, 1)
        px.line([(0, y), (w, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return im


def paste_icon(canvas, icon, size, center):
    ic = icon.resize((size, size), Image.LANCZOS)
    canvas.paste(ic, (center[0] - size // 2, center[1] - size // 2), ic)


def write_wizard(vc, fonts, out_dir):
    icon = Image.open(os.path.join(vc, "assets", "app-icon", "hicolor", "512x512", "apps", "ai.storyteller.figcraft.png")).convert("RGBA")
    font_path = os.path.join(fonts, "Inter-SemiBold.ttf")
    sub_path = os.path.join(fonts, "Inter-Regular.ttf")
    for i, (w, h) in enumerate(WIZARD_LARGE):
        s = w / 164
        im = gradient(w, h)
        paste_icon(im, icon, round(112 * s), (w // 2, round(128 * s)))
        d = ImageDraw.Draw(im)
        d.text((w / 2, 214 * s), "FigCraft", font=ImageFont.truetype(font_path, round(19 * s)),
               fill=INK, anchor="mm")
        d.text((w / 2, 238 * s), "Design de interfaces", font=ImageFont.truetype(sub_path, round(10.5 * s)),
               fill=(0x6E, 0x6E, 0x73), anchor="mm")
        im.save(os.path.join(out_dir, f"assistente-grande-{i}.bmp"))
    for i, n in enumerate(WIZARD_SMALL):
        im = Image.new("RGB", (n, n), (255, 255, 255))
        paste_icon(im, icon, round(n * 0.92), (n // 2, n // 2))
        im.save(os.path.join(out_dir, f"assistente-pequeno-{i}.bmp"))


def folder_icon(n):
    """Pasta azul aproximada, só para a prévia (o Finder desenha a de verdade)."""
    im = Image.new("RGBA", (n, n))
    d = ImageDraw.Draw(im)
    r = n // 14
    d.rounded_rectangle([n * 0.08, n * 0.2, n * 0.48, n * 0.36], r, fill=(0x4A, 0x9F, 0xE8))
    d.rounded_rectangle([n * 0.08, n * 0.27, n * 0.92, n * 0.82], r, fill=(0x6C, 0xB6, 0xF2))
    d.text((n / 2, n * 0.56), "A", font=ImageFont.truetype(preview.font, round(n * 0.26)),
           fill=(0x3D, 0x8E, 0xD6), anchor="mm")
    return im


def preview(two, out):
    """Prévia (não vai no DMG): o fundo 2x com ícones e rótulos como o Finder mostra."""
    im = two.copy()
    d = ImageDraw.Draw(im)
    label = ImageFont.truetype(preview.font, 26)
    for (name, (x, y)), ic in zip(ICONS.items(), (preview.icon, folder_icon(ICON_SIZE * 2))):
        paste_icon(im, ic, ICON_SIZE * 2, (x * 2, y * 2))
        text = "FigCraft" if name.endswith(".app") else "Aplicativos"
        d.text((x * 2, (y + 80) * 2), text, font=label, fill=INK, anchor="mm")
    im.save(out)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    vc = os.path.abspath(sys.argv[1])
    fonts = os.path.abspath(sys.argv[2])
    if not shutil.which("resvg"):
        sys.exit("erro: resvg não encontrado (cargo install resvg)")
    two = write_tiff(fonts, os.path.join(OUT, "macos", "background.tiff"))
    write_ds_store(os.path.join(OUT, "macos", "DS_Store"))
    write_wizard(vc, fonts, os.path.join(OUT, "windows"))
    icon = Image.open(os.path.join(vc, "assets", "app-icon", "figcraft-1024.png")).convert("RGBA")
    preview.icon = icon
    preview.font = os.path.join(fonts, "Inter-Regular.ttf")
    preview(two, os.path.join(HERE, "previa-dmg.png"))


if __name__ == "__main__":
    main()
