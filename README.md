# TopWeather 1.5

[![A StudioDDx Product](https://img.shields.io/badge/A%20StudioDDx-Product-6c3df4)](https://studioddx.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red)](https://opensource.org/licenses/MIT)
[![GNOME Shell 50](https://img.shields.io/badge/GNOME%20Shell-50-4A86CF)](https://www.gnome.org)

A GNOME Shell 50 extension that puts a weather glyph and the current temperature in the top bar — next to the clock by default, or on the left/right — with an extended forecast dropdown and a full preferences window.

No API keys required: data comes from free providers ([wttr.in](https://wttr.in) and [Open-Meteo](https://open-meteo.com)).

## Screenshots

<!-- TODO: add screenshots
![Panel](screenshots/panel.png)
![Dropdown menu](screenshots/menu.png)
![Preferences](screenshots/prefs.png)
-->

## Features

- **Configurable panel placement**: left, center next to the clock, or right, updated immediately. Conditions glyph + temperature (e.g. `☀️ 68°`) open a dropdown menu.
- **Richer conditions**: feels-like, humidity, wind speed and compass direction, cloud cover, precipitation amount/period, sunrise/sunset, and moon phase where available. Forecasts show up to 3 days from wttr.in or 4 from Open-Meteo, including today. Unknown observations use `—`, never fabricated zero values.
- **Clear refresh status**: loading, failure, last-known data, and stale-data notices. Status ages every minute and when the menu opens; data is marked stale after the configured refresh interval.
- **Day/night aware**: clear skies at night show a moon glyph matching the current moon phase (◐ ● ○ in monochrome, 🌒🌕🌘 in color).
- **Severe weather alerts (US)**: National Weather Service warnings replace the panel glyph with a persistent red ⚠ (temp stays) and appear in a red-tinted section with headline, expiry, description, and instructions. Watches alternate the conditions glyph with an orange ⚠. Alerts use resolved weather coordinates when available. An outage is shown as unavailable, not an all-clear; previously known alerts with valid future expiry are retained only for the same displayed location. Weather renders without waiting for the alert request to finish.
- **Live settings**: every preference takes effect immediately — no shell restart needed.
- **Graceful failures**: ordinary network errors retain last-good weather with a visible failure notice. Changing location, provider, or temperature unit immediately removes obsolete data and snapshots. Old in-flight responses cannot overwrite newer settings.
- **Local weather snapshot**: every successful refresh atomically publishes a private, key-free JSON snapshot for local wallpaper and automation consumers.

## Local weather snapshot

After a successful weather refresh, TopWeather writes
`$XDG_CACHE_HOME/topweather/current.json` (normally
`~/.cache/topweather/current.json`). The directory is mode `0700`, the file is
mode `0600`, and replacement is atomic. Export failures are logged but never
replace or interrupt the panel's last-good weather display. Changing the
provider, location, or temperature unit, or disabling the extension, invalidates the snapshot.

The version 1 document has this shape:

```json
{
  "schemaVersion": 1,
  "fetchedAt": 1789233600000,
  "provider": "openmeteo",
  "location": "Detroit, Michigan",
  "unit": "f",
  "latitude": 42.331,
  "longitude": -83.046,
  "current": {
    "temp": 73,
    "feelsLike": 72,
    "humidity": 55,
    "windSpeed": 10,
    "desc": "Slight rain",
    "glyph": "☔",
    "isNight": false,
    "sunrise": "2026-09-12T07:10",
    "sunset": "2026-09-12T19:48",
    "moonPhase": null,
    "cloudCover": 72,
    "precipitation": 1.25,
    "precipitationAmountMm": 1.25,
    "precipitationPeriodHours": 1,
    "rain": 0.8,
    "snowfall": null,
    "snowfallAmountCm": 0.3,
    "snowfallPeriodHours": 1,
    "windSpeedKmh": 16.09344,
    "windDirection": 225,
    "weatherCode": 61
  }
}
```

`fetchedAt` is Unix epoch milliseconds. Coordinates and unavailable
measurements are `null`, never guessed. `cloudCover` is percent,
`windSpeedKmh` is always km/h, and `windDirection` is degrees. The canonical
precipitation, rain, and snowfall fields are mm/hour; Open-Meteo's
precipitation and rain values cover the preceding hour, so
`precipitationPeriodHours` is `1`. Open-Meteo reports snowfall as centimetres
of snow depth, not water equivalent, so canonical `snowfall` stays `null`;
`snowfallAmountCm` and `snowfallPeriodHours` preserve the observed depth and
its period without a fake density conversion. wttr.in does not declare an
accumulation interval for `precipMM`, so its canonical
precipitation/rain/snowfall fields and `precipitationPeriodHours` stay `null`
rather than inventing a rate, while `precipitationAmountMm` preserves the
provider value. Raw provenance fields remain numeric or `null`. No
credentials or unrelated provider response fields are exported.

## Providers

| Provider   | Key needed | Notes |
|------------|-----------|-------|
| wttr.in    | No        | Single request; includes astronomy (sunrise/sunset/moon phase). |
| Open-Meteo | No        | Geocoding via open-meteo's geocoder; automatic mode uses ipapi.co for coordinates. |

## Install

Download `topweather@rucaradio.shell-extension.zip` and `SHA256SUMS` from the
[v1.5 release](https://github.com/StudioDDx/TopWeather/releases/tag/v1.5), then:

```bash
sha256sum -c SHA256SUMS
gnome-extensions install --force topweather@rucaradio.shell-extension.zip
```

Or build/install from source:

```bash
git clone https://github.com/StudioDDx/TopWeather.git
cd TopWeather
./install.sh
```

Then restart GNOME Shell (on Wayland: log out and back in; on X11: `Alt+F2` → `r` → Enter) and enable it:

```bash
gnome-extensions enable topweather@rucaradio
gnome-extensions prefs topweather@rucaradio   # open settings
```

Updating files does not reload imported JavaScript in an already-running GNOME
Shell. A fresh session is required to activate an upgrade reliably; toggling the
extension alone is not a release verification. Existing preferences are preserved.

## Settings

- **Temperature unit** — Fahrenheit / Celsius
- **Location mode** — Automatic (IP-based), City, or ZIP code, with a text entry for the city/ZIP value
- **Appearance** — Light / Dark / System (dropdown menu styling)
- **Glyph style** — Color emoji or Monochrome unicode (☀ ☁ ☂ ❄ ⛈, moon phases ○ ◐ ●)
- **Refresh interval** — 5–120 minutes
- **Weather provider** — wttr.in / Open-Meteo
- **Panel toggles** — show/hide the glyph and the temperature independently
- **Panel position** — Left / Center (next to clock) / Right
- **Severe weather alerts** — on/off toggle (default on)

## Data sources

- Weather data: [wttr.in](https://wttr.in) / [Open-Meteo](https://open-meteo.com)
- Alert data: National Weather Service (weather.gov)
- Geocoding: Open-Meteo geocoder, Nominatim (OpenStreetMap), ipapi.co

## Development

```
extension.js    — panel indicator, dropdown menu, settings wiring, refresh timer
prefs.js        — Adw preferences window
weather.js      — provider fetching + WMO/wttr code→glyph/description tables (shell-independent)
refresh.js      — revision-aware asynchronous refresh coordination
display.js      — testable presentation state, freshness, units, and compass directions
snapshot.js     — atomic private cache snapshot construction/export/invalidation
alerts.js       — NWS alert fetching, GeoJSON parsing, warning/watch classification (shell-independent)
schemas/        — GSettings schema (org.gnome.shell.extensions.topweather)
install.sh      — copies files to ~/.local/share/gnome-shell/extensions and compiles schemas
build.sh        — staged schema compilation, installable ZIP, SHA256SUMS
```

`weather.js` and `snapshot.js` are shell-independent. Run the local parser and
actual Gio filesystem export tests with:

```bash
./tests/run.sh
./build.sh                 # output: dist/
shellcheck build.sh install.sh tests/*.sh
```

The test suite covers parsers, missing observations, alert failures, asynchronous
ordering, snapshot permissions, installer rollback, and a clean installation from
the built ZIP. GitHub Actions runs this suite and uploads the bundle.

For native UI verification on a machine with GNOME Shell 50.x:

```bash
./tests/test-shell.sh
```

This optional test creates a disposable headless GNOME session with a private
home, settings, cache, runtime directory, and D-Bus session. It checks live panel
placement, rendering, status, native GTK preferences, and teardown, then leaves
screenshots/logs at the printed `/tmp/topweather-shell-test.*` path. Its test-only
evaluator is never packaged or enabled in the user's desktop session. Generic
desktop-service warnings in this isolated environment are separate from extension
errors; inspect `shell.log` if the test fails. It does not test real provider uptime.

See [CHANGELOG.md](CHANGELOG.md) for release notes. User-facing release `1.5` uses
GNOME's integer package revision `2`; supported GNOME Shell versions remain `50`.

## License

Open source under the [MIT License](LICENSE) — free to use, modify, and distribute.

---

**TopWeather** is a [StudioDDx](https://studioddx.com) product.
