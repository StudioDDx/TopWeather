#!/usr/bin/env bash
# Optional GNOME Shell 50 integration test. Never uses the user's desktop bus,
# settings, extension directory, or cache. Keeps screenshots/logs under /tmp.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(gnome-shell --version)" != 'GNOME Shell 50.'* ]]; then
    echo 'This optional integration test requires GNOME Shell 50.x.' >&2
    exit 77
fi
QA_DIR="$(mktemp -d -t topweather-shell-test.XXXXXX)"
export TOPWEATHER_TEST_ROOT="$ROOT_DIR" TOPWEATHER_QA_DIR="$QA_DIR"
"$ROOT_DIR/build.sh" "$QA_DIR/package"
mkdir -p "$QA_DIR/home" "$QA_DIR/runtime" "$QA_DIR/config" "$QA_DIR/cache"
chmod 700 "$QA_DIR/runtime"
unzip -q "$QA_DIR/package/topweather@rucaradio.shell-extension.zip" -d "$QA_DIR/unpacked"
HOME="$QA_DIR/home" bash "$QA_DIR/unpacked/install.sh" >/dev/null
DRIVER="$QA_DIR/home/.local/share/gnome-shell/extensions/topweather-qa@test"
mkdir "$DRIVER"
cat > "$DRIVER/metadata.json" <<'JSON'
{"uuid":"topweather-qa@test","name":"Isolated QA","description":"Private test harness only","shell-version":["50"]}
JSON
# This evaluator is deliberately confined to the disposable headless session.
cat > "$DRIVER/extension.js" <<'JS'
export default class QA {
    enable() { global.context.unsafe_mode = true; }
    disable() { global.context.unsafe_mode = false; }
}
JS
echo "Isolated GNOME Shell evidence: $QA_DIR"
env -u DISPLAY -u WAYLAND_DISPLAY -u XDG_SESSION_ID \
    HOME="$QA_DIR/home" XDG_DATA_HOME="$QA_DIR/home/.local/share" \
    XDG_CONFIG_HOME="$QA_DIR/config" XDG_CACHE_HOME="$QA_DIR/cache" \
    XDG_RUNTIME_DIR="$QA_DIR/runtime" XDG_DATA_DIRS=/usr/local/share:/usr/share \
    timeout 120 /usr/bin/dbus-run-session -- bash <<'SESSION'
set -euo pipefail
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x900 > "$TOPWEATHER_QA_DIR/shell.log" 2>&1 &
shell_pid=$!
trap 'kill "$shell_pid" 2>/dev/null || true; wait "$shell_pid" 2>/dev/null || true' EXIT
extensions() {
    gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions \
        --method "org.gnome.Shell.Extensions.$1" "${@:2}"
}
evaluate() {
    local result
    result=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "$1")
    printf '%s\n' "$result"
    [[ "$result" == '(true,'* ]]
}
for _ in {1..100}; do
    if extensions ListExtensions >/dev/null 2>&1; then break; fi
    kill -0 "$shell_pid"
    sleep 0.2
done
extensions EnableExtension topweather-qa@test
extensions EnableExtension topweather@rucaradio
for _ in {1..100}; do
    if evaluate "Boolean(Main.panel.statusArea['topweather@rucaradio'])" 2>/dev/null | grep -q "'true'"; then break; fi
    sleep 0.2
done
evaluate "(async () => (await import('file://$TOPWEATHER_TEST_ROOT/tests/shell-checks.js')).run())()"
sleep 1 # Allow the opening animation to finish before capturing the rendered menu.
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot \
    --method org.gnome.Shell.Screenshot.Screenshot false false "$TOPWEATHER_QA_DIR/menu.png"
export WAYLAND_DISPLAY=wayland-0
GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 LD_LIBRARY_PATH=/usr/lib/gnome-shell \
    GSETTINGS_BACKEND=memory gjs -m "$TOPWEATHER_TEST_ROOT/tests/prefs-checks.js" \
    "$HOME/.local/share/gnome-shell/extensions/topweather@rucaradio"
evaluate "Main.panel.statusArea['topweather@rucaradio'].menu.close()"
gnome-extensions prefs topweather@rucaradio
for _ in {1..100}; do
    if evaluate "global.get_window_actors().some(w => w.meta_window.get_title() === 'TopWeather')" | grep -q "'true'"; then break; fi
    sleep 0.2
done
evaluate "(() => { if (!global.get_window_actors().some(w => w.meta_window.get_title() === 'TopWeather')) throw Error('Preferences window failed'); return true; })()"
sleep 1
gdbus call --session --dest org.gnome.Shell.Screenshot --object-path /org/gnome/Shell/Screenshot \
    --method org.gnome.Shell.Screenshot.Screenshot false false "$TOPWEATHER_QA_DIR/prefs.png"
evaluate "global.topweatherTestIndicator = Main.panel.statusArea['topweather@rucaradio']; true"
extensions DisableExtension topweather@rucaradio
evaluate "(() => { const i = global.topweatherTestIndicator; if (!i._destroyed || i._timerId || i._statusTimerId || i._debounceId || i._watchBlinkId) throw Error('Leaked lifecycle resources'); return 'Teardown passed'; })()"
echo 'shell: native rendering, preferences and teardown checks passed'
SESSION
