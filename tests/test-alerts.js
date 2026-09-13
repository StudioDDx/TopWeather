import {fetchAlerts, parseNwsAlerts, classifyAlerts} from '../alerts.js';
let passed = 0;
function equal(actual, expected, message) {
    if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, got ${actual}`);
    passed++;
}
const now = new Date('2026-09-12T12:00:00Z');
const alerts = parseNwsAlerts({features: [
    {properties: {event: 'Tornado Watch', severity: 'Severe', expires: '2026-09-12T15:00:00Z'}},
    {properties: {event: 'Tornado Warning', expires: '2026-09-12T11:00:00Z'}},
    {properties: {event: 123}},
]}, now);
equal(alerts.length, 1, 'expired and malformed alerts are excluded');
equal(classifyAlerts(alerts), 'watch', 'Severe watches remain watches, not warnings');
equal(classifyAlerts([...alerts, {event: 'Tornado Warning', severity: 'Severe'}]), 'warning',
    'a warning outranks a watch');
const failed = await fetchAlerts({mode: 'auto'}, {request: async () => { throw new Error('offline'); },
    onError: () => {}});
equal(failed.unavailable, true, 'NWS outage is not an all-clear');
let calls = 0;
const clear = await fetchAlerts({mode: 'auto'}, {request: async () => {
    calls++;
    return calls === 1 ? {latitude: 42, longitude: -83} : {features: []};
}});
equal(clear.unavailable, false, 'confirmed empty response is available');
equal(clear.alerts.length, 0, 'confirmed all-clear has no alerts');
const malformed = await fetchAlerts({mode: 'auto'}, {request: async () => {
    return {latitude: 42, longitude: -83};
}, onError: () => {}});
equal(malformed.unavailable, true, 'malformed NWS response is not an all-clear');
const requested = [];
await fetchAlerts({mode: 'auto', latitude: 42, longitude: -83}, {request: async url => {
    requested.push(url);
    return {features: []};
}, onError: () => {}});
equal(requested.length, 1, 'resolved weather coordinates avoid a second geolocation');
equal(requested[0], 'https://api.weather.gov/alerts/active?point=42,-83',
    'alerts query the coordinates actually displayed by weather');
print(`alerts: ${passed} assertions passed`);
