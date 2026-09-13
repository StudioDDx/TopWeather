import * as Refresh from '../refresh.js';
let passed = 0;
function check(value, message) { if (!value) throw new Error(message); passed++; }
check(typeof Refresh.createRefreshJobs === 'function', 'coordinate-bound refresh jobs are available');
let releaseWeather;
const weatherPromise = new Promise(resolve => { releaseWeather = resolve; });
let alertOptions;
const jobs = Refresh.createRefreshJobs({mode: 'auto'}, {
    fetchWeather: () => weatherPromise,
    fetchAlerts: async opts => { alertOptions = opts; return {alerts: []}; },
});
await Promise.resolve();
check(alertOptions === undefined, 'alerts wait for weather location instead of racing a second geocoder');
releaseWeather({latitude: 42, longitude: -83});
await Promise.all(jobs);
check(alertOptions.latitude === 42 && alertOptions.longitude === -83, 'alerts use returned weather coordinates');
await Promise.allSettled(Refresh.createRefreshJobs({mode: 'auto'}, {
    fetchWeather: async () => { throw new Error('weather offline'); },
    fetchAlerts: async opts => { alertOptions = opts; return {alerts: []}; },
    previousWeather: {latitude: 40, longitude: -74},
}));
check(alertOptions.latitude === 40 && alertOptions.longitude === -74,
    'weather failure still checks alerts for the displayed last-good location');
let called = false;
await Promise.all(Refresh.createRefreshJobs({}, {
    fetchWeather: async () => ({}), fetchAlerts: async () => { called = true; }, alertsEnabled: false,
}));
check(!called, 'disabled alerts never initiate a request');
print(`jobs: ${passed} assertions passed`);
