#!/usr/bin/env bash
# TopWeather installer — copies the extension into the GNOME Shell
# user extensions directory and compiles the GSettings schemas.
set -euo pipefail

UUID="topweather@rucaradio"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "Installing TopWeather to $DEST_DIR"

mkdir -p "$DEST_DIR"

cp "$SRC_DIR/extension.js" "$DEST_DIR/"
cp "$SRC_DIR/prefs.js" "$DEST_DIR/"
cp "$SRC_DIR/weather.js" "$DEST_DIR/"
cp "$SRC_DIR/alerts.js" "$DEST_DIR/"
cp "$SRC_DIR/metadata.json" "$DEST_DIR/"
cp "$SRC_DIR/stylesheet.css" "$DEST_DIR/"

mkdir -p "$DEST_DIR/schemas"
cp "$SRC_DIR/schemas/org.gnome.shell.extensions.topweather.gschema.xml" "$DEST_DIR/schemas/"

echo "Compiling GSettings schemas..."
glib-compile-schemas --strict "$DEST_DIR/schemas"

echo
echo "Done. To finish:"
echo "  1. Restart GNOME Shell:"
echo "       - Wayland: log out and log back in"
echo "       - X11:     press Alt+F2, type 'r', hit Enter"
echo "  2. Enable the extension:"
echo "       gnome-extensions enable $UUID"
echo "  3. Open settings:"
echo "       gnome-extensions prefs $UUID"
