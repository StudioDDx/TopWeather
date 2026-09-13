#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_ROOT="$(mktemp -d -t topweather-install-test.XXXXXX)"
trap 'rm -rf "$TEMP_ROOT"' EXIT

SOURCE="$TEMP_ROOT/source"
HOME_DIR="$TEMP_ROOT/home"
DEST="$HOME_DIR/.local/share/gnome-shell/extensions/topweather@rucaradio"
mkdir -p "$SOURCE/schemas" "$DEST"

for file in extension.js prefs.js weather.js display.js refresh.js alerts.js metadata.json stylesheet.css install.sh; do
    cp "$ROOT_DIR/$file" "$SOURCE/$file"
done
cp "$ROOT_DIR/schemas/org.gnome.shell.extensions.topweather.gschema.xml" "$SOURCE/schemas/"
chmod +x "$SOURCE/install.sh"

printf 'previous extension\n' > "$DEST/extension.js"
printf 'keep me\n' > "$DEST/installed-marker"

set +e
HOME="$HOME_DIR" "$SOURCE/install.sh" >"$TEMP_ROOT/missing.log" 2>&1
status=$?
set -e

if [[ $status -eq 0 ]]; then
    echo 'installer unexpectedly succeeded without snapshot.js' >&2
    exit 1
fi
if [[ "$(cat "$DEST/extension.js")" != 'previous extension' ]]; then
    echo 'missing-file preflight modified the previous extension' >&2
    exit 1
fi
if [[ "$(cat "$DEST/installed-marker")" != 'keep me' ]]; then
    echo 'missing-file preflight removed the previous installation' >&2
    exit 1
fi
if [[ -e "$DEST/weather.js" ]]; then
    echo 'missing-file preflight partially copied new files' >&2
    exit 1
fi

echo 'install: missing snapshot preflight preserved previous installation'

cp "$ROOT_DIR/snapshot.js" "$SOURCE/"
printf '\n<broken>\n' >> "$SOURCE/schemas/org.gnome.shell.extensions.topweather.gschema.xml"
if HOME="$HOME_DIR" "$SOURCE/install.sh" >"$TEMP_ROOT/schema.log" 2>&1; then
    echo 'installer unexpectedly accepted broken schema' >&2
    exit 1
fi
[[ "$(cat "$DEST/installed-marker")" == 'keep me' ]]
cp "$ROOT_DIR/schemas/org.gnome.shell.extensions.topweather.gschema.xml" "$SOURCE/schemas/"

# Fail only the final staging rename; allow backup creation and restoration.
mkdir "$TEMP_ROOT/bin"
cat > "$TEMP_ROOT/bin/mv" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == *'.stage.'* ]]; then exit 1; fi
exec /bin/mv "$@"
SH
chmod +x "$TEMP_ROOT/bin/mv"
if HOME="$HOME_DIR" PATH="$TEMP_ROOT/bin:$PATH" "$SOURCE/install.sh" >"$TEMP_ROOT/rename.log" 2>&1; then
    echo 'installer unexpectedly succeeded when final rename failed' >&2
    exit 1
fi
[[ "$(cat "$DEST/installed-marker")" == 'keep me' ]]
[[ "$(cat "$DEST/extension.js")" == 'previous extension' ]]
HOME="$HOME_DIR" "$SOURCE/install.sh" >"$TEMP_ROOT/success.log" 2>&1
cmp "$SOURCE/extension.js" "$DEST/extension.js"
test -s "$DEST/schemas/gschemas.compiled"
echo 'install: schema failure, rename rollback, and successful replacement passed'
