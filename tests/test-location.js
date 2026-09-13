import {fetchWeather} from '../weather.js';
let calls = 0;
const weather = await fetchWeather({provider: 'openmeteo', mode: 'city', location: 'Detroit',
    unit: 'c', mono: true}, {request: async () => {
    calls++;
    if (calls === 1) return {results: [{name: 'Detroit', admin1: 'Michigan', latitude: 42.33143,
        longitude: -83.04575}]};
    return {latitude: 42.320606, longitude: -83.031075, current: {temperature_2m: 23}, daily: {}};
}});
if (weather.latitude !== 42.33143 || weather.longitude !== -83.04575)
    throw new Error('Displayed location must keep city coordinates, not a forecast grid point across a border');
print('location: city coordinates preserved independently of forecast grid');
