#!/usr/bin/env bash
# Build the GNOME extension archive; JavaScript runs in GJS, schemas are compiled.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$ROOT_DIR/dist}"
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
STAGE_DIR="$(mktemp -d -t topweather-package.XXXXXX)"
trap 'rm -rf "$STAGE_DIR"' EXIT
for file in extension.js prefs.js weather.js display.js refresh.js snapshot.js alerts.js \
    metadata.json stylesheet.css install.sh LICENSE README.md CHANGELOG.md; do
    cp "$ROOT_DIR/$file" "$STAGE_DIR/$file"
done
mkdir "$STAGE_DIR/schemas"
cp "$ROOT_DIR"/schemas/*.gschema.xml "$STAGE_DIR/schemas/"
glib-compile-schemas --strict "$STAGE_DIR/schemas"
gnome-extensions pack "$STAGE_DIR" --force --out-dir="$OUT_DIR" \
    --extra-source=weather.js --extra-source=display.js --extra-source=refresh.js \
    --extra-source=snapshot.js --extra-source=alerts.js --extra-source=install.sh \
    --extra-source=LICENSE --extra-source=README.md --extra-source=CHANGELOG.md
# GNOME's pack command normalizes schemas to XML only. Include the locally
# compiled schema explicitly for direct extraction, as well as normal installs.
(cd "$STAGE_DIR" && zip -q "$OUT_DIR/topweather@rucaradio.shell-extension.zip" schemas/gschemas.compiled)
(cd "$OUT_DIR" && sha256sum topweather@rucaradio.shell-extension.zip > SHA256SUMS)
printf 'Built: %s/topweather@rucaradio.shell-extension.zip\n' "$OUT_DIR"
