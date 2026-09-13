#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_ROOT="$(mktemp -d -t topweather-build-test.XXXXXX)"
trap 'rm -rf "$TEMP_ROOT"' EXIT
if [[ ! -x "$ROOT_DIR/build.sh" ]]; then
    echo 'FAIL: release build must provide an executable build.sh' >&2
    exit 1
fi
"$ROOT_DIR/build.sh" "$TEMP_ROOT/output"
ARCHIVE="$TEMP_ROOT/output/topweather@rucaradio.shell-extension.zip"
unzip -q "$ARCHIVE" -d "$TEMP_ROOT/unpacked"
for file in extension.js prefs.js weather.js display.js refresh.js snapshot.js alerts.js \
    metadata.json stylesheet.css schemas/gschemas.compiled LICENSE install.sh; do
    test -s "$TEMP_ROOT/unpacked/$file"
done
# Exercise the actual artifact, not the source tree, on a clean temporary home.
HOME="$TEMP_ROOT/home" bash "$TEMP_ROOT/unpacked/install.sh" >/dev/null
DEST="$TEMP_ROOT/home/.local/share/gnome-shell/extensions/topweather@rucaradio"
cmp "$DEST/display.js" "$ROOT_DIR/display.js"
gsettings --schemadir "$DEST/schemas" range org.gnome.shell.extensions.topweather panel-position |
    grep -q "'right'"
(cd "$TEMP_ROOT/output" && sha256sum -c SHA256SUMS)
echo 'build: archive contents, checksum, clean install and placement schema passed'
