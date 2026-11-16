#!/bin/bash
# Compila o Tesseract (OCR) estático para Intel / macOS 10.14 e baixa os
# dicionários de português e inglês. Resultado em vendor/tesseract.
# Usado pelo Recorte no macOS 10.14 (no 10.15+ o app usa o Vision da Apple).
set -euo pipefail
cd "$(dirname "$0")/.."

LEPT_VERSION=1.82.0
TESS_VERSION=4.1.3
OUT="$PWD/vendor/tesseract"

if [ -x "$OUT/bin/tesseract" ] && [ -f "$OUT/tessdata/por.traineddata" ]; then
  echo "Tesseract já compilado em $OUT"
  exit 0
fi

WORK="$PWD/build-deps"
PREFIX="$WORK/prefix"
rm -rf "$WORK"
mkdir -p "$WORK"
cd "$WORK"

curl -fsSL -o lept.tar.gz "https://github.com/DanBloomberg/leptonica/releases/download/$LEPT_VERSION/leptonica-$LEPT_VERSION.tar.gz"
curl -fsSL -o tess.tar.gz "https://github.com/tesseract-ocr/tesseract/archive/refs/tags/$TESS_VERSION.tar.gz"
tar xzf lept.tar.gz
tar xzf tess.tar.gz

COMMON=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_OSX_ARCHITECTURES=x86_64
  -DCMAKE_OSX_DEPLOYMENT_TARGET=10.14
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  -DBUILD_SHARED_LIBS=OFF
  -DCMAKE_INSTALL_PREFIX="$PREFIX"
  -DCMAKE_PREFIX_PATH="$PREFIX"
  "-DCMAKE_IGNORE_PREFIX_PATH=/opt/homebrew;/usr/local"
)

echo "▸ Leptonica $LEPT_VERSION"
cmake -S "leptonica-$LEPT_VERSION" -B lept-build "${COMMON[@]}" \
  -DSW_BUILD=OFF -DBUILD_PROG=OFF \
  -DENABLE_ZLIB=OFF -DENABLE_PNG=OFF -DENABLE_GIF=OFF -DENABLE_JPEG=OFF \
  -DENABLE_TIFF=OFF -DENABLE_WEBP=OFF -DENABLE_OPENJPEG=OFF
cmake --build lept-build -j 4
cmake --install lept-build

LEPT_DIR="$(dirname "$(find "$PREFIX" -name 'LeptonicaConfig.cmake' | head -1)")"
echo "Leptonica_DIR=$LEPT_DIR"

echo "▸ Tesseract $TESS_VERSION"
cmake -S "tesseract-$TESS_VERSION" -B tess-build "${COMMON[@]}" \
  -DSW_BUILD=OFF -DOPENMP_BUILD=OFF -DBUILD_TRAINING_TOOLS=OFF -DBUILD_TESTS=OFF \
  -DAUTO_OPTIMIZE=OFF -DGRAPHICS_DISABLED=ON -DDISABLED_LEGACY_ENGINE=ON \
  -DLeptonica_DIR="$LEPT_DIR"
cmake --build tess-build -j 4 --target tesseract
BIN="$(find tess-build -type f -name tesseract -perm -u+x | head -1)"

mkdir -p "$OUT/bin" "$OUT/tessdata"
cp "$BIN" "$OUT/bin/tesseract"
strip -x "$OUT/bin/tesseract" || true

for LANG in por eng; do
  curl -fsSL -o "$OUT/tessdata/$LANG.traineddata" \
    "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$LANG.traineddata"
done

echo "▸ Dependências do binário:"
otool -L "$OUT/bin/tesseract"
otool -l "$OUT/bin/tesseract" | grep -A3 LC_BUILD_VERSION || true
ls -la "$OUT/bin" "$OUT/tessdata"
