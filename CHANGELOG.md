# Changelog

## 1.5

- Configurable left, center (next to the clock), and right panel placement.
- Explicit loading, refresh failure, and stale-data status, with accessible panel text.
- Cloud cover, wind compass direction, and precipitation amounts with honest period labels.
- Last-good weather on ordinary refresh failure; immediate removal of old-location weather,
  alerts, and snapshots when location, provider, or temperature unit changes.
- Independent weather/alert publication and revision guards for settings changes and teardown.
- Unknown measurements display as unavailable rather than fabricated zero values or `NaN`.
  Partial forecasts no longer discard usable current weather.
- Alert outages are distinct from an all-clear. Unexpired known alerts are retained until
  expiry, disabled alerts disappear immediately, and severe watches remain watch-level.
- Alerts use the resolved location, not a forecast grid cell that may lie across a border.
- Private atomic local weather snapshot for wallpaper and automation consumers.
- Staged schema compilation/install, regression tests, CI, and checksummed release bundles.

Requires GNOME Shell 50. The user-facing version is `1.5`; GNOME's numeric package revision is `2`.
