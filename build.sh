#!/bin/bash
# Compila o Recorte e gera build/Recorte.dmg.
# Requisitos: um Mac com Xcode ou só as Command Line Tools (xcode-select --install).
set -euo pipefail
cd "$(dirname "$0")"

APP="Recorte"
BUILD="build"
BUNDLE="$BUILD/$APP.app"
SDK="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$BUILD"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"

# Intel (roda do macOS 10.14 em diante) + Apple Silicon quando o SDK permitir.
ARCHS="${ARCHS:-x86_64 arm64}"
BINARIES=()
for ARCH in $ARCHS; do
  case "$ARCH" in
    x86_64) TARGET="x86_64-apple-macos10.14" ;;
    arm64)  TARGET="arm64-apple-macos11.0" ;;
    *) echo "Arquitetura desconhecida: $ARCH"; exit 1 ;;
  esac
  echo "▸ Compilando para ${ARCH}…"
  if xcrun swiftc -O -sdk "$SDK" -target "$TARGET" \
      -framework Cocoa -framework Carbon -framework Vision -framework AVFoundation -framework AVKit \
      -framework CoreMedia -framework CoreVideo -framework CoreAudio -framework CoreImage -framework Network -framework Security \
      -Xlinker -weak_framework -Xlinker ScreenCaptureKit \
      Sources/*.swift -o "$BUILD/$APP-$ARCH"; then
    BINARIES+=("$BUILD/$APP-$ARCH")
  elif [ "$ARCH" = "arm64" ]; then
    echo "  (SDK antigo sem suporte a arm64 — gerando só a versão Intel)"
  else
    exit 1
  fi
done

lipo -create "${BINARIES[@]}" -output "$BUNDLE/Contents/MacOS/$APP"
rm -f "${BINARIES[@]}"

cp Resources/Info.plist "$BUNDLE/Contents/Info.plist"
cp Resources/AppIcon.icns "$BUNDLE/Contents/Resources/AppIcon.icns"
cp Resources/MenuBarIcon.png "$BUNDLE/Contents/Resources/MenuBarIcon.png"
printf 'APPL????' > "$BUNDLE/Contents/PkgInfo"

# OCR para macOS 10.14 (opcional: gerado por scripts/build_tesseract.sh)
if [ -x vendor/tesseract/bin/tesseract ]; then
  echo "▸ Incluindo Tesseract (OCR)…"
  cp -R vendor/tesseract "$BUNDLE/Contents/Resources/tesseract"
  codesign --force --sign - "$BUNDLE/Contents/Resources/tesseract/bin/tesseract"
else
  echo "  (Tesseract não encontrado: no macOS 10.14 o OCR ficará indisponível)"
fi

echo "▸ Assinando (ad-hoc)…"
codesign --force --deep --sign - "$BUNDLE"

echo "▸ Criando DMG…"
STAGE="$BUILD/dmg"
mkdir -p "$STAGE"
cp -R "$BUNDLE" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "$APP" -srcfolder "$STAGE" -ov -format UDZO "$BUILD/$APP.dmg" >/dev/null
rm -rf "$STAGE"

echo "✓ Pronto: $BUILD/$APP.dmg"
lipo -info "$BUNDLE/Contents/MacOS/$APP"
