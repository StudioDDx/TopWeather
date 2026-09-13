import {parseOpenMeteo, parseWttr, glyphFor, Provider} from '../weather.js';

let passed = 0;
function equal(actual, expected, message) {
    if (!Object.is(actual, expected))
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    passed++;
}
function rejects(fn, message) {
    let rejected = false;
    try { fn(); } catch (_) { rejected = true; }
    equal(rejected, true, message);
}

for (const bad of [null, undefined, '', ' ', 'invalid', false, [], Infinity]) {
    rejects(() => parseOpenMeteo({temperature_2m: bad}, {}, 'c', true),
        `Open-Meteo rejects unusable current temperature ${JSON.stringify(bad)}`);
    rejects(() => parseWttr({current_condition: [{temp_C: bad}]}, 'c', true),
        `wttr rejects unusable current temperature ${JSON.stringify(bad)}`);
}

const open = parseOpenMeteo({temperature_2m: 0, apparent_temperature: null,
    relative_humidity_2m: 110, wind_speed_10m: -2, weather_code: null},
{time: ['2026-09-12']}, 'c', true);
equal(open.current.temp, 0, 'real zero temperature is valid');
equal(open.current.feelsLike, null, 'missing feels-like is not freezing');
equal(open.current.humidity, null, 'invalid humidity is unknown');
equal(open.current.windSpeed, null, 'negative wind is unknown');
equal(open.current.desc, 'Unknown', 'missing weather code is not clear sky');
equal(open.days[0].hi, null, 'missing forecast array is safe and unknown');
equal(open.days[0].lo, null, 'missing low is not zero');

const wttr = parseWttr({current_condition: [{temp_C: '0', FeelsLikeC: '',
    humidity: null, windspeedKmph: 'bad'}], weather: [{date: '2026-09-12'}]}, 'c', true);
equal(wttr.current.feelsLike, null, 'blank wttr feels-like is unknown');
equal(wttr.current.humidity, null, 'null wttr humidity is unknown');
equal(wttr.current.windSpeed, null, 'invalid wttr wind is unknown');
equal(wttr.days[0].hi, null, 'missing wttr high is unknown');
equal(wttr.days[0].desc, 'Unknown', 'missing wttr forecast code is not sunny');
equal(glyphFor(null, Provider.OPENMETEO).desc, 'Unknown', 'null WMO code stays unknown');
equal(parseOpenMeteo({temperature_2m: 12}, null, 'c', true).days.length, 0,
    'missing forecast does not discard valid current weather');
equal(parseWttr({current_condition: [{temp_C: '12'}], weather: [null]}, 'c', true).days.length, 0,
    'null forecast entries do not discard valid wttr current weather');

print(`validation: ${passed} assertions passed`);
