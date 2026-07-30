# TopWeather

A GNOME Shell 50 extension that puts a weather glyph and the current temperature in the top bar, right next to the clock — with an extended forecast dropdown and a full preferences window.

No API keys required: data comes from free providers ([wttr.in](https://wttr.in) and [Open-Meteo](https://open-meteo.com)).

## Screenshots

<!-- TODO: add screenshots
![Panel](screenshots/panel.png)
![Dropdown menu](screenshots/menu.png)
![Preferences](screenshots/prefs.png)
-->

## Features

- **Panel indicator** in the center box, next to the clock: conditions glyph + temperature (e.g. `☀️ 68°`). Click it for a real dropdown menu.
- **Dropdown menu** with today's details (feels-like, humidity, wind, sunrise/sunset, moon phase) plus a 3-day forecast (day name, glyph, hi/lo). Refresh and Settings items at the bottom.
- **Day/night aware**: clear skies at night show a moon glyph matching the current moon phase (◐ ● ○ in monochrome, 🌒🌕🌘 in color).
- **Severe weather alerts (US)**: National Weather Service warnings replace the panel glyph with a persistent red ⚠ (temp stays) and appear in a red-tinted section at the top of the dropdown with headline, expiry, description, and instructions. Watches make the panel glyph alternate between the conditions glyph and an orange ⚠, shown orange in the menu. Alerts refresh on the same interval as the weather and fail silently — they can never break the weather display.
- **Live settings**: every preference takes effect immediately — no shell restart needed.
- **Graceful failures**: on network errors the last-good data stays on screen and the error is logged.

## Providers

| Provider   | Key needed | Notes |
|------------|-----------|-------|
| wttr.in    | No        | Single request; includes astronomy (sunrise/sunset/moon phase). |
| Open-Meteo | No        | Geocoding via open-meteo's geocoder; automatic mode uses ipapi.co for coordinates. |

## Install

```bash
git clone https://github.com/rucaradio/topweather.git
cd topweather
./install.sh
```

Then restart GNOME Shell (on Wayland: log out and back in; on X11: `Alt+F2` → `r` → Enter) and enable it:

```bash
gnome-extensions enable topweather@rucaradio
gnome-extensions prefs topweather@rucaradio   # open settings
```

## Settings

- **Temperature unit** — Fahrenheit / Celsius
- **Location mode** — Automatic (IP-based), City, or ZIP code, with a text entry for the city/ZIP value
- **Appearance** — Light / Dark / System (dropdown menu styling)
- **Glyph style** — Color emoji or Monochrome unicode (☀ ☁ ☂ ❄ ⛈, moon phases ○ ◐ ●)
- **Refresh interval** — 5–120 minutes
- **Weather provider** — wttr.in / Open-Meteo
- **Panel toggles** — show/hide the glyph and the temperature independently
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
alerts.js       — NWS alert fetching, GeoJSON parsing, warning/watch classification (shell-independent)
schemas/        — GSettings schema (org.gnome.shell.extensions.topweather)
install.sh      — copies files to ~/.local/share/gnome-shell/extensions and compiles schemas
```

`weather.js` is shell-independent and can be smoke-tested standalone with gjs.

## License

MIT — see [LICENSE](LICENSE).
