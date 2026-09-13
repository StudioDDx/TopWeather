#!/usr/bin/env bash
# TopWeather installer — copies the extension into the GNOME Shell
# user extensions directory and compiles the GSettings schemas.
set -euo pipefail

UUID="topweather@rucaradio"
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
if [[ "$SCRIPT_DIR" == "${BASH_SOURCE[0]}" ]]; then
    SCRIPT_DIR="."
fi
SRC_DIR="$(cd "$SCRIPT_DIR" && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
DEST_PARENT="${DEST_DIR%/*}"

REQUIRED_COMMANDS=(cp dirname glib-compile-schemas mkdir mktemp mv rm)
REQUIRED_FILES=(
    extension.js
    prefs.js
    weather.js
    display.js
    refresh.js
    snapshot.js
    alerts.js
    metadata.json
    stylesheet.css
    schemas/org.gnome.shell.extensions.topweather.gschema.xml
)

for command_name in "${REQUIRED_COMMANDS[@]}"; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
done

for relative_path in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$SRC_DIR/$relative_path" || ! -r "$SRC_DIR/$relative_path" ]]; then
        echo "Missing required source file: $relative_path" >&2
        exit 1
    fi
done

echo "Installing TopWeather to $DEST_DIR"

mkdir -p "$DEST_PARENT"
STAGE_DIR="$(mktemp -d "$DEST_PARENT/.${UUID}.stage.XXXXXX")"
BACKUP_DIR=""

cleanup() {
    if [[ -n "$STAGE_DIR" && -d "$STAGE_DIR" ]]; then
        rm -rf "$STAGE_DIR"
    fi
    if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" && ! -e "$DEST_DIR" ]]; then
        mv "$BACKUP_DIR" "$DEST_DIR"
    fi
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR/schemas"
for relative_path in "${REQUIRED_FILES[@]}"; do
    mkdir -p "$STAGE_DIR/$(dirname "$relative_path")"
    cp "$SRC_DIR/$relative_path" "$STAGE_DIR/$relative_path"
done

echo "Compiling GSettings schemas in staging..."
glib-compile-schemas --strict "$STAGE_DIR/schemas"

if [[ -e "$DEST_DIR" || -L "$DEST_DIR" ]]; then
    BACKUP_DIR="$(mktemp -d "$DEST_PARENT/.${UUID}.backup.XXXXXX")"
    rm -rf "$BACKUP_DIR"
    mv "$DEST_DIR" "$BACKUP_DIR"
fi

if ! mv "$STAGE_DIR" "$DEST_DIR"; then
    echo "Unable to replace $DEST_DIR; restoring previous installation" >&2
    exit 1
fi
STAGE_DIR=""

if [[ -n "$BACKUP_DIR" ]]; then
    rm -rf "$BACKUP_DIR"
    BACKUP_DIR=""
fi
trap - EXIT

echo
echo "Done. To finish:"
echo "  1. Restart GNOME Shell:"
echo "       - Wayland: log out and log back in"
echo "       - X11:     press Alt+F2, type 'r', hit Enter"
echo "  2. Enable the extension:"
echo "       gnome-extensions enable $UUID"
echo "  3. Open settings:"
echo "       gnome-extensions prefs $UUID"
