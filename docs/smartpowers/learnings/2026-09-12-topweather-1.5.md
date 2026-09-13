# TopWeather 1.5 release validation

## Scope and baseline

- Base: `b0392f9`. The existing snapshot, refresh, installer, and test work was
  uncommitted; the user explicitly approved incorporating it into v1.5.
- Implementation: `7566fd4`. No unrelated settings or desktop restart required.
- GNOME target: Shell 50; tested locally on 50.1. Public version `1.5`, integer
  package revision `2`. A disk installation does not prove the current Shell
  process has reloaded imported JavaScript.

## Reproduction and evidence

- `./tests/run.sh`: 148 assertions plus the resolved-coordinate regression;
  missing-file preflight, broken schema, failed final rename/rollback, clean
  replacement, release contents, checksum, and install-from-ZIP checks.
- `./tests/test-shell.sh`: fresh private home/cache/settings/runtime/D-Bus,
  install from ZIP, 21 real Shell UI assertions, 5 native GTK assertions,
  preferences opening, screenshots, and timer/signal teardown checks.
- `shellcheck build.sh install.sh tests/*.sh`, module syntax checks, and
  `git diff --check` passed. Independent review closed both automatic-location
  warning-retention cases: moving after prior weather, and first weather success
  after an alert-only initial failure.
- Live Detroit weather and NWS lookups succeeded through both providers after
  the coordinate fix. These are dated integration checks, not uptime guarantees.

## Durable findings

1. **Forecast grid coordinates are not location identity.** Detroit's geocoder
   returned `42.33143,-83.04575`, but Open-Meteo's forecast grid returned
   `42.320606,-83.031075`, across the border. NWS returned HTTP 400
   (`Parameter "point" is invalid: out of bounds`) for the grid point and 200
   for city coordinates. Rounding the grid coordinates did not help. Preserve
   resolved city/IP coordinates for snapshots and alerts; cover this without
   network access in `tests/test-location.js`.
2. **Unavailable is not zero or all-clear.** JavaScript numeric coercion fabricated
   zero temperatures and clear skies from null values. Parse unknown observations
   explicitly. Keep alert-service availability separate from an empty alert set,
   and bind retained alerts to a known location identity and expiry.
3. **Native artifacts need native tests.** GJS tests cannot exercise panel actor
   reparenting or GTK preferences. The optional Shell harness installs the release
   artifact into a separate desktop session; its test-only evaluator must never
   enter the release bundle or the user's running Shell. Native preferences need
   GNOME's Shew typelib/library paths on this distribution.
4. **GNOME packaging normalizes schemas.** `gnome-extensions pack` omitted the
   compiled schema, even when the schema directory was supplied as extra source.
   Build in temporary staging, then add `schemas/gschemas.compiled` explicitly to
   the ZIP. Verify the archive and install it into a clean temporary home.

## Process evaluation

- Worked: fail-first parser/state tests, independent review, and the live-provider
  check each caught different defects. The isolated Shell test protected the
  user's active session while proving rendered behavior.
- Rework: fixture-only validation missed the forecast-grid border case; guessing
  coordinate precision did not explain the live failure. Packaging also required
  inspecting the actual ZIP rather than assuming the CLI copied compiled files.
- Next time: probe one real provider-to-alert chain and inspect one built archive
  early, while retaining deterministic fixtures for regression coverage.

No persistent cross-project memory was updated; the user did not request it.
