#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

gjs -m "$ROOT_DIR/tests/test-weather.js"
gjs -m "$ROOT_DIR/tests/test-validation.js"
gjs -m "$ROOT_DIR/tests/test-display.js"
gjs -m "$ROOT_DIR/tests/test-alerts.js"
gjs -m "$ROOT_DIR/tests/test-snapshot.js"
gjs -m "$ROOT_DIR/tests/test-refresh.js"
gjs -m "$ROOT_DIR/tests/test-jobs.js"
gjs -m "$ROOT_DIR/tests/test-location.js"
bash "$ROOT_DIR/tests/test-install.sh"
bash "$ROOT_DIR/tests/test-build.sh"
