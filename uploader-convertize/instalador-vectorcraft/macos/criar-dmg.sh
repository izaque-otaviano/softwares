#!/usr/bin/env bash
# Cria o DMG de instalação do VectorCraft no padrão da Apple: abre uma janela limpa do Finder com
# o app e um atalho para Aplicativos lado a lado, e o usuário só arrasta um para o outro.
#
# Uso: instalador-vectorcraft/macos/criar-dmg.sh <VectorCraft.app> <saida.dmg>
#
# Assinatura (opcional, env): MACOS_SIGN_IDENTITY (padrão "-" = ad-hoc), MACOS_KEYCHAIN.
# Notarização (opcional, env, precisa de identidade real): APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID.
#
# O layout da janela vem pronto (background.tiff e DS_Store, gerados por arte/gerar.py), então o
# script não depende de AppleScript/Finder e roda em runners de CI sem tela.
set -euo pipefail

APP="${1:?uso: criar-dmg.sh <VectorCraft.app> <saida.dmg>}"
DMG="${2:?uso: criar-dmg.sh <VectorCraft.app> <saida.dmg>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Sem versão no nome: o DS_Store acha o fundo por um alias que inclui o nome do volume.
VOLUME="VectorCraft"
IDENTITY="${MACOS_SIGN_IDENTITY:--}"

[ -d "$APP/Contents/MacOS" ] || { echo "erro: $APP não é um .app" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'hdiutil detach "$WORK/mnt" -quiet 2>/dev/null || true; rm -rf "$WORK"' EXIT

# Tenta de novo: hdiutil às vezes falha em runners de CI com "Resource busy".
hdiutil_retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if hdiutil "$@"; then return 0; fi
    [ "$attempt" = 5 ] && { echo "hdiutil $1 falhou 5 vezes" >&2; return 1; }
    echo "hdiutil $1 falhou (tentativa $attempt de 5); nova tentativa em $((attempt * 10))s" >&2
    sleep $((attempt * 10))
  done
}

echo "==> montando o conteúdo do DMG"
STAGE="$WORK/stage"
mkdir -p "$STAGE/.background"
ditto "$APP" "$STAGE/VectorCraft.app"
ln -s /Applications "$STAGE/Applications"
cp "$HERE/background.tiff" "$STAGE/.background/background.tiff"
cp "$HERE/DS_Store" "$STAGE/.DS_Store"
cp "$APP/Contents/Resources/VectorCraft.icns" "$STAGE/.VolumeIcon.icns"

# Imagem gravável primeiro, para marcar o ícone do volume; depois comprime em UDZO.
# `create -srcfolder` (e não `makehybrid`) não grava FinderInfo nos arquivos do app, que o
# `codesign --verify --strict` rejeitaria.
echo "==> criando a imagem"
hdiutil_retry create -srcfolder "$STAGE" -volname "$VOLUME" -fs HFS+ -format UDRW -ov "$WORK/rw.dmg"
mkdir -p "$WORK/mnt"
hdiutil_retry attach -nobrowse -noautoopen -readwrite -mountpoint "$WORK/mnt" "$WORK/rw.dmg" >/dev/null
# Bit "kHasCustomIcon" só na raiz do volume: o Finder mostra o ícone do VectorCraft no disco.
xattr -wx com.apple.FinderInfo \
  "0000000000000000040000000000000000000000000000000000000000000000" "$WORK/mnt" || true
SetFile -a V "$WORK/mnt/.VolumeIcon.icns" 2>/dev/null || true
sync
hdiutil_retry detach "$WORK/mnt" -quiet

mkdir -p "$(dirname "$DMG")"
rm -f "$DMG"
hdiutil_retry convert "$WORK/rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$DMG"

echo "==> assinando ($IDENTITY)"
kc=()
[ -n "${MACOS_KEYCHAIN:-}" ] && kc=(--keychain "$MACOS_KEYCHAIN")
ts=(--timestamp)
[ "$IDENTITY" = "-" ] && ts=(--timestamp=none)
codesign --force --sign "$IDENTITY" ${kc[@]+"${kc[@]}"} "${ts[@]}" "$DMG"
codesign --verify --strict --verbose=2 "$DMG"

# O app dentro da imagem precisa continuar válido.
hdiutil_retry attach -nobrowse -readonly -mountpoint "$WORK/mnt" "$DMG" >/dev/null
codesign --verify --strict --deep --verbose=2 "$WORK/mnt/VectorCraft.app"
hdiutil_retry detach "$WORK/mnt" -quiet

if [ "$IDENTITY" != "-" ] && [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; then
  echo "==> notarizando (pode levar alguns minutos)"
  xcrun notarytool submit "$DMG" --apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" --wait --timeout 1h
  xcrun stapler staple "$DMG"
  spctl --assess --type open --context context:primary-signature -vvv "$DMG"
fi

echo "==> pronto"
ls -lh "$DMG"
