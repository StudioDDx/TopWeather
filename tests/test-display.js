let Display;
try { Display = await import('../display.js'); } catch (_) { Display = {}; }
let passed = 0;
function equal(actual, expected, message) {
    if (!Object.is(actual, expected))
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    passed++;
}
equal(typeof Display.WeatherState, 'function', 'weather presentation state is available');
const state = new Display.WeatherState();
equal(state.status(0, 30).kind, 'loading', 'first load is explicit');
state.failWeather(new Error('HTTP 503'));
equal(state.status(0, 30).kind, 'error', 'first failure is not perpetual loading');
state.acceptWeather({fetchedAt: new Date(0), current: {temp: 10}});
equal(state.status(60000, 30).kind, 'fresh', 'recent weather is fresh');
equal(state.status(31 * 60000, 30).kind, 'stale', 'weather ages without a request');
state.failWeather(new Error('offline'));
equal(state.weather.current.temp, 10, 'ordinary failure preserves last-good temperature');
equal(state.status(60000, 30).kind, 'error', 'stale last-good data shows failure');
state.acceptAlerts({alerts: [{event: 'Tornado Warning', severity: 'Severe',
    expires: new Date(200000)}], level: 'warning'}, 0);
state.acceptAlerts({unavailable: true}, 60000);
equal(state.alertLevel, 'warning', 'outage does not silently clear an unexpired warning');
equal(state.alertsUnavailable, true, 'outage is distinct from no active alerts');
state.pruneAlerts(200000);
equal(state.alertLevel, 'none', 'expired warnings cannot blink forever');
state.reset();
equal(state.weather, null, 'identity changes clear old-location weather');
equal(state.alerts.length, 0, 'identity changes clear old-location alerts');
equal(state.status(0, 30).kind, 'loading', 'identity changes restart status');

equal(Display.measurement(null, '°C'), '—', 'unknown does not render as zero');
equal(Display.measurement(NaN, '%'), '—', 'nonfinite does not leak NaN into UI');
equal(Display.measurement(0, '°C'), '0°C', 'real zero remains visible');
equal(Display.windDirection(225), 'SW', 'wind direction is compass based');
equal(Display.windDirection(360), 'N', 'north wraps correctly');
equal(Display.windDirection(null), '', 'unknown direction is omitted');
const details = Display.weatherDetails({unit: 'c', current: {feelsLike: null, humidity: 0,
    windSpeed: 16, windDirection: 225, cloudCover: 72, precipitationAmountMm: 1.25,
    precipitationPeriodHours: 1}});
equal(details.includes('Cloud cover: 72%'), true, 'cloud cover is shown');
equal(details.includes('Precipitation (past hour): 1.25 mm'), true, 'precipitation period is explicit');
equal(details.includes('Wind: 16 km/h SW'), true, 'wind has speed, unit and compass direction');
equal(Display.weatherDetails({unit: 'f', current: {precipitationAmountMm: 0,
    precipitationPeriodHours: null}}).includes('Precipitation (provider period unspecified): 0 mm'),
true, 'wttr accumulation is never mislabeled hourly');
equal(Display.panelPlacement('right').box, 'right', 'right preference selects right panel');
equal(Display.panelPlacement('bogus').box, 'center', 'invalid placement safely falls back');
equal(Display.formatSunTime('2026-09-12T07:10'), '07:10', 'sunrise keeps provider-local clock time');
state.acceptWeather({provider: 'openmeteo', location: 'City A', latitude: 42, longitude: -83});
state.acceptAlerts({alerts: [{event: 'Tornado Warning', severity: 'Severe', expires: new Date(200000)}]}, 0);
state.acceptWeather({provider: 'openmeteo', location: 'City B', latitude: 40, longitude: -74});
state.acceptAlerts({unavailable: true}, 60000);
equal(state.alertLevel, 'none', 'automatic movement cannot retain a previous city warning');
state.reset();
state.acceptAlerts({alerts: [{event: 'City A Warning', severity: 'Severe', expires: new Date(200000)}]}, 0);
state.acceptWeather({provider: 'openmeteo', location: 'City B', latitude: 40, longitude: -74});
state.acceptAlerts({unavailable: true}, 60000);
equal(state.alertLevel, 'none', 'first weather success clears previously unbound alert-only data');
print(`display: ${passed} assertions passed`);
