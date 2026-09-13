import {
    buildOpenMeteoUrl,
    parseOpenMeteo,
    parseWttr,
} from '../weather.js';

let passed = 0;

function assertEqual(actual, expected, message) {
    if (!Object.is(actual, expected))
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    passed++;
}

function assertClose(actual, expected, message) {
    if (typeof actual !== 'number' || Math.abs(actual - expected) > 0.000001)
        throw new Error(`${message}: expected ${expected}, got ${actual}`);
    passed++;
}

function wttrFixture(overrides = {}) {
    const current = {
        temp_F: '50',
        temp_C: '10',
        FeelsLikeF: '48',
        FeelsLikeC: '9',
        humidity: '81',
        windspeedMiles: '10',
        windspeedKmph: '16',
        winddirDegree: '270',
        cloudcover: '87',
        precipMM: '1.4',
        weatherCode: '296',
        ...overrides,
    };
    return {
        current_condition: [current],
        nearest_area: [{
            areaName: [{value: 'Detroit'}],
            region: [{value: 'Michigan'}],
            latitude: '42.331',
            longitude: '-83.046',
        }],
        weather: [{
            date: '2026-09-12',
            maxtempF: '60', maxtempC: '16', mintempF: '44', mintempC: '7',
            astronomy: [{sunrise: '07:10 AM', sunset: '07:48 PM', moon_phase: 'New Moon'}],
            hourly: [{weatherCode: '296'}],
        }],
    };
}

function openMeteoCurrent(overrides = {}) {
    return {
        temperature_2m: 50,
        apparent_temperature: 48,
        relative_humidity_2m: 81,
        weather_code: 61,
        wind_speed_10m: 10,
        wind_direction_10m: 225,
        cloud_cover: 72,
        precipitation: 1.25,
        rain: 0.8,
        snowfall: 0.3,
        is_day: 1,
        ...overrides,
    };
}

const daily = {
    time: ['2026-09-12'],
    weather_code: [61],
    temperature_2m_max: [61],
    temperature_2m_min: [44],
    sunrise: ['2026-09-12T07:10'],
    sunset: ['2026-09-12T19:48'],
};

const url = buildOpenMeteoUrl(42.331, -83.046, 'f');
for (const field of ['cloud_cover', 'precipitation', 'rain', 'snowfall', 'wind_direction_10m'])
    assertEqual(url.includes(field), true, `Open-Meteo request includes ${field}`);

const wttr = parseWttr(wttrFixture(), 'f', true);
assertEqual(wttr.provider, 'wttr', 'wttr parser identifies provider');
assertClose(wttr.latitude, 42.331, 'wttr latitude is numeric');
assertClose(wttr.longitude, -83.046, 'wttr longitude is numeric');
assertEqual(wttr.current.cloudCover, 87, 'wttr cloud cover is numeric');
assertEqual(wttr.current.windSpeedKmh, 16, 'wttr uses the provider native km/h measurement');
assertEqual(wttr.current.windDirection, 270, 'wttr wind direction is numeric');
assertEqual(wttr.current.weatherCode, '296', 'wttr weather code stays a string');
assertEqual(wttr.current.precipitation, null, 'wttr does not invent an hourly precipitation rate');
assertClose(wttr.current.precipitationAmountMm, 1.4, 'wttr preserves its period-unspecified precipitation amount');
assertEqual(wttr.current.precipitationPeriodHours, null, 'wttr marks the precipitation period unknown');
assertEqual(wttr.current.rain, null, 'wttr does not infer rain from a general precipitation amount');
assertEqual(wttr.current.snowfall, null, 'wttr does not infer water-equivalent snowfall');

const malformedWttr = parseWttr(wttrFixture({
    cloudcover: 'many',
    winddirDegree: '-10',
    precipMM: '',
}), 'c', false);
assertEqual(malformedWttr.current.cloudCover, null, 'invalid wttr cloud cover becomes unknown');
assertEqual(malformedWttr.current.windDirection, null, 'out-of-range wttr wind direction becomes unknown');
assertEqual(malformedWttr.current.precipitationAmountMm, null, 'blank wttr precipitation becomes unknown');

const openF = parseOpenMeteo(openMeteoCurrent(), daily, 'f', false, 'Detroit, Michigan', 42.331, -83.046);
assertEqual(openF.provider, 'openmeteo', 'Open-Meteo parser identifies provider');
assertClose(openF.latitude, 42.331, 'Open-Meteo latitude is numeric');
assertClose(openF.longitude, -83.046, 'Open-Meteo longitude is numeric');
assertEqual(openF.current.cloudCover, 72, 'Open-Meteo cloud cover is numeric');
assertClose(openF.current.precipitation, 1.25, 'Open-Meteo prior-hour precipitation is a canonical hourly rate');
assertClose(openF.current.precipitationAmountMm, 1.25, 'Open-Meteo preserves its prior-hour precipitation amount');
assertClose(openF.current.rain, 0.8, 'Open-Meteo prior-hour rain is a canonical hourly rate');
assertEqual(openF.current.precipitationPeriodHours, 1, 'Open-Meteo precipitation period is explicit');
assertEqual(openF.current.snowfall, null, 'Open-Meteo snow depth is not mislabeled water equivalent');
assertClose(openF.current.snowfallAmountCm, 0.3, 'Open-Meteo preserves prior-hour snow depth separately');
assertEqual(openF.current.snowfallPeriodHours, 1, 'Open-Meteo snow depth period is explicit');
assertClose(openF.current.windSpeedKmh, 16.09344, 'Open-Meteo mph converts to canonical km/h');
assertEqual(openF.current.windDirection, 225, 'Open-Meteo wind direction is numeric');
assertEqual(openF.current.weatherCode, 61, 'Open-Meteo weather code stays numeric');

const openC = parseOpenMeteo(openMeteoCurrent({wind_speed_10m: 16}), daily,
    'c', false, '', null, null);
assertEqual(openC.current.windSpeedKmh, 16, 'Open-Meteo km/h remains unchanged');
assertEqual(openC.latitude, null, 'missing Open-Meteo latitude stays unknown');
assertEqual(openC.longitude, null, 'missing Open-Meteo longitude stays unknown');

const malformedOpen = parseOpenMeteo(openMeteoCurrent({
    cloud_cover: 101,
    precipitation: -1,
    rain: 'trace',
    wind_direction_10m: Infinity,
}), daily, 'c', false);
assertEqual(malformedOpen.current.cloudCover, null, 'out-of-range Open-Meteo cloud cover becomes unknown');
assertEqual(malformedOpen.current.precipitation, null, 'negative precipitation becomes unknown');
assertEqual(malformedOpen.current.rain, null, 'non-numeric rain becomes unknown');
assertEqual(malformedOpen.current.windDirection, null, 'non-finite wind direction becomes unknown');

print(`weather: ${passed} assertions passed`);
