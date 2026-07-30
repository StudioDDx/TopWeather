// weather.js — shell-independent weather fetching + code mapping for TopWeather.
// Importable from extension.js and smoke-testable under gjs (no shell resources).

import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

export const Provider = {
    WTTR: 'wttr',
    OPENMETEO: 'openmeteo',
};

export const LocationMode = {
    AUTO: 'auto',
    CITY: 'city',
    ZIP: 'zip',
};

/* ------------------------------------------------------------------ */
/* URL builders (pure functions — unit-testable)                       */
/* ------------------------------------------------------------------ */

export function buildWttrUrl(location) {
    const loc = (location ?? '').trim();
    const encoded = loc === '' ? '' : encodeURIComponent(loc);
    return `https://wttr.in/${encoded}?format=j1`;
}

export function buildGeocodeUrl(name) {
    return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`;
}

export function buildOpenMeteoUrl(lat, lon, unit) {
    const tempUnit = unit === 'c' ? 'celsius' : 'fahrenheit';
    const windUnit = unit === 'c' ? 'kmh' : 'mph';
    return 'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
        `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&forecast_days=4&timezone=auto`;
}

export function buildIpApiUrl() {
    return 'https://ipapi.co/json/';
}

/* ------------------------------------------------------------------ */
/* HTTP (Soup 3, fully async)                                          */
/* ------------------------------------------------------------------ */

let _session = null;

function getSession() {
    if (_session === null) {
        _session = new Soup.Session();
        _session.set_user_agent('topweather@rucaradio GNOME Shell extension');
        _session.set_timeout(15);
    }
    return _session;
}

// opts.userAgent: override the session User-Agent for this request
// (required by api.weather.gov and nominatim.openstreetmap.org).
export function fetchJson(url, opts = {}) {
    return new Promise((resolve, reject) => {
        const session = getSession();
        const message = Soup.Message.new('GET', url);
        if (message === null) {
            reject(new Error(`Invalid URL: ${url}`));
            return;
        }
        if (opts.userAgent)
            message.get_request_headers().replace('User-Agent', opts.userAgent);
        session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (sess, result) => {
            try {
                const bytes = sess.send_and_read_finish(result);
                const status = message.get_status();
                if (status !== Soup.Status.OK) {
                    reject(new Error(`HTTP ${status} for ${url}`));
                    return;
                }
                const text = new TextDecoder('utf-8').decode(bytes.get_data());
                resolve(JSON.parse(text));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/* ------------------------------------------------------------------ */
/* Code mapping tables                                                 */
/* Each entry: [description, colorGlyph, monoGlyph]                    */
/* mono variants for day/night where relevant via *Night keys.         */
/* ------------------------------------------------------------------ */

// wttr.in weather codes (worldweatheronline codes as strings)
export const WTTR_CODES = {
    '113': ['Clear/Sunny', '☀️', '☀'],
    '116': ['Partly cloudy', '⛅', '⛅'],
    '119': ['Cloudy', '☁️', '☁'],
    '122': ['Overcast', '☁️', '☁'],
    '143': ['Mist', '🌫️', '≋'],
    '176': ['Patchy rain possible', '🌦️', '☂'],
    '179': ['Patchy snow possible', '🌨️', '❄'],
    '182': ['Patchy sleet possible', '🌨️', '❄'],
    '185': ['Patchy freezing drizzle', '🌧️', '☂'],
    '200': ['Thundery outbreaks possible', '⛈️', '⛈'],
    '227': ['Blowing snow', '🌨️', '❄'],
    '230': ['Blizzard', '🌨️', '❄'],
    '248': ['Fog', '🌫️', '≋'],
    '260': ['Freezing fog', '🌫️', '≋'],
    '263': ['Patchy light drizzle', '🌦️', '☂'],
    '266': ['Light drizzle', '🌦️', '☂'],
    '281': ['Freezing drizzle', '🌧️', '☂'],
    '284': ['Heavy freezing drizzle', '🌧️', '☂'],
    '293': ['Patchy light rain', '🌦️', '☂'],
    '296': ['Light rain', '🌦️', '☂'],
    '299': ['Moderate rain at times', '🌧️', '☂'],
    '302': ['Moderate rain', '🌧️', '☂'],
    '305': ['Heavy rain at times', '🌧️', '☂'],
    '308': ['Heavy rain', '🌧️', '☂'],
    '311': ['Light freezing rain', '🌧️', '☂'],
    '314': ['Moderate or heavy freezing rain', '🌧️', '☂'],
    '317': ['Light sleet', '🌨️', '❄'],
    '320': ['Moderate or heavy sleet', '🌨️', '❄'],
    '323': ['Patchy light snow', '🌨️', '❄'],
    '326': ['Light snow', '🌨️', '❄'],
    '329': ['Patchy moderate snow', '🌨️', '❄'],
    '332': ['Moderate snow', '🌨️', '❄'],
    '335': ['Patchy heavy snow', '🌨️', '❄'],
    '338': ['Heavy snow', '🌨️', '❄'],
    '350': ['Ice pellets', '🌨️', '❄'],
    '353': ['Light rain shower', '🌦️', '☂'],
    '356': ['Moderate or heavy rain shower', '🌧️', '☂'],
    '359': ['Torrential rain shower', '🌧️', '☂'],
    '362': ['Light sleet showers', '🌨️', '❄'],
    '365': ['Moderate or heavy sleet showers', '🌨️', '❄'],
    '368': ['Light snow showers', '🌨️', '❄'],
    '371': ['Moderate or heavy snow showers', '🌨️', '❄'],
    '374': ['Light showers of ice pellets', '🌨️', '❄'],
    '377': ['Moderate or heavy showers of ice pellets', '🌨️', '❄'],
    '386': ['Patchy light rain with thunder', '⛈️', '⛈'],
    '389': ['Moderate or heavy rain with thunder', '⛈️', '⛈'],
    '392': ['Patchy light snow with thunder', '⛈️', '⛈'],
    '395': ['Moderate or heavy snow with thunder', '⛈️', '⛈'],
};

// WMO weather interpretation codes (Open-Meteo)
export const WMO_CODES = {
    0: ['Clear sky', '☀️', '☀'],
    1: ['Mainly clear', '🌤️', '☀'],
    2: ['Partly cloudy', '⛅', '⛅'],
    3: ['Overcast', '☁️', '☁'],
    45: ['Fog', '🌫️', '≋'],
    48: ['Depositing rime fog', '🌫️', '≋'],
    51: ['Light drizzle', '🌦️', '☂'],
    53: ['Moderate drizzle', '🌦️', '☂'],
    55: ['Dense drizzle', '🌧️', '☂'],
    56: ['Light freezing drizzle', '🌧️', '☂'],
    57: ['Dense freezing drizzle', '🌧️', '☂'],
    61: ['Slight rain', '🌦️', '☂'],
    63: ['Moderate rain', '🌧️', '☂'],
    65: ['Heavy rain', '🌧️', '☂'],
    66: ['Light freezing rain', '🌧️', '☂'],
    67: ['Heavy freezing rain', '🌧️', '☂'],
    71: ['Slight snow fall', '🌨️', '❄'],
    73: ['Moderate snow fall', '🌨️', '❄'],
    75: ['Heavy snow fall', '🌨️', '❄'],
    77: ['Snow grains', '🌨️', '❄'],
    80: ['Slight rain showers', '🌦️', '☂'],
    81: ['Moderate rain showers', '🌧️', '☂'],
    82: ['Violent rain showers', '🌧️', '☂'],
    85: ['Slight snow showers', '🌨️', '❄'],
    86: ['Heavy snow showers', '🌨️', '❄'],
    95: ['Thunderstorm', '⛈️', '⛈'],
    96: ['Thunderstorm with slight hail', '⛈️', '⛈'],
    99: ['Thunderstorm with heavy hail', '⛈️', '⛈'],
};

// Codes considered "clear" — swapped for moon glyphs at night.
const CLEAR_WTTR = new Set(['113']);
const CLEAR_WMO = new Set([0, 1]);

/* ------------------------------------------------------------------ */
/* Moon phases                                                         */
/* ------------------------------------------------------------------ */

// wttr.in moon_phase strings → [colorGlyph, monoGlyph]
export const MOON_PHASES = {
    'New Moon': ['🌑', '○'],
    'Waxing Crescent': ['🌒', '◐'],
    'First Quarter': ['🌓', '◐'],
    'Waxing Gibbous': ['🌔', '◐'],
    'Full Moon': ['🌕', '●'],
    'Waning Gibbous': ['🌖', '◑'],
    'Last Quarter': ['🌗', '◑'],
    'Third Quarter': ['🌗', '◑'],
    'Waning Crescent': ['🌘', '◑'],
};

export function moonPhaseGlyph(phaseName, mono) {
    const entry = MOON_PHASES[phaseName];
    if (entry)
        return mono ? entry[1] : entry[0];
    return mono ? '●' : '🌙';
}

// Approximate moon-phase glyph when only a date is known (Open-Meteo path).
// Synodic month 29.53 days from a known new moon (2000-01-06 18:14 UTC).
export function approximateMoonGlyph(date, mono) {
    const synodic = 29.53058867;
    const knownNew = Date.UTC(2000, 0, 6, 18, 14) / 86400000; // days
    const nowDays = date.getTime() / 86400000;
    let age = (nowDays - knownNew) % synodic;
    if (age < 0)
        age += synodic;
    const idx = Math.floor(((age / synodic) * 8) + 0.5) % 8;
    const color = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const mono_ = ['○', '◐', '◐', '◐', '●', '◑', '◑', '◑'];
    return mono ? mono_[idx] : color[idx];
}

/* ------------------------------------------------------------------ */
/* Glyph resolution                                                    */
/* ------------------------------------------------------------------ */

// isNight: boolean; moonGlyph: string to use for clear-night skies (may be null)
export function glyphFor(code, provider, {mono = false, isNight = false, moonGlyph = null} = {}) {
    const table = provider === Provider.OPENMETEO ? WMO_CODES : WTTR_CODES;
    const key = provider === Provider.OPENMETEO ? Number(code) : String(code);
    const entry = table[key];
    const clearSet = provider === Provider.OPENMETEO ? CLEAR_WMO : CLEAR_WTTR;

    if (isNight && clearSet.has(key))
        return {glyph: moonGlyph ?? (mono ? '●' : '🌙'), desc: entry ? 'Clear night' : 'Clear'};

    if (!entry)
        return {glyph: mono ? '?' : '❓', desc: 'Unknown'};
    return {glyph: mono ? entry[2] : entry[1], desc: entry[0]};
}

/* ------------------------------------------------------------------ */
/* Time helpers                                                        */
/* ------------------------------------------------------------------ */

// "06:12 AM" / "18:45" / ISO datetime → minutes since midnight, or null
export function timeToMinutes(t) {
    if (!t)
        return null;
    if (t.includes('T')) {
        const d = new Date(t);
        if (isNaN(d))
            return null;
        return d.getHours() * 60 + d.getMinutes();
    }
    const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(t.trim());
    if (!m)
        return null;
    let h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const ap = m[3] ? m[3].toUpperCase() : null;
    if (ap === 'PM' && h !== 12)
        h += 12;
    if (ap === 'AM' && h === 12)
        h = 0;
    return h * 60 + min;
}

export function isNightNow(sunrise, sunset, now = new Date()) {
    const rise = timeToMinutes(sunrise);
    const set = timeToMinutes(sunset);
    if (rise === null || set === null)
        return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    return cur < rise || cur >= set;
}

/* ------------------------------------------------------------------ */
/* Parsers — normalize both providers to one shape:                    */
/* {                                                                   */
/*   current: {temp, feelsLike, humidity, windSpeed, desc, glyph,      */
/*             isNight, sunrise, sunset, moonPhase},                   */
/*   days: [{date, dayName, hi, lo, desc, glyph}],                     */
/*   location: string, unit: 'f'|'c', fetchedAt: GLib.DateTime         */
/* } Temps are numbers in the requested unit. Wind in mph ('f') or     */
/* km/h ('c').                                                         */
/* ------------------------------------------------------------------ */

export function parseWttr(json, unit, mono) {
    const cur = json.current_condition?.[0];
    if (!cur)
        throw new Error('wttr.in: missing current_condition');
    const days = json.weather ?? [];
    const astro = days[0]?.astronomy?.[0] ?? {};
    const sunrise = astro.sunrise ?? null;
    const sunset = astro.sunset ?? null;
    const moonPhase = astro.moon_phase ?? null;
    const isNight = isNightNow(sunrise, sunset);
    const moonGlyph = moonPhase ? moonPhaseGlyph(moonPhase, mono) : null;

    const pick = (f, c) => unit === 'c' ? c : f;
    const area = json.nearest_area?.[0];
    const locName = area
        ? [area.areaName?.[0]?.value, area.region?.[0]?.value].filter(Boolean).join(', ')
        : '';

    const {glyph, desc} = glyphFor(String(cur.weatherCode), Provider.WTTR, {mono, isNight, moonGlyph});

    const forecast = days.slice(0, 4).map(d => {
        const g = glyphFor(String(d.hourly?.[4]?.weatherCode ?? d.hourly?.[0]?.weatherCode ?? '113'), Provider.WTTR, {mono});
        return {
            date: d.date,
            dayName: dayName(d.date),
            hi: Number(pick(d.maxtempF, d.maxtempC)),
            lo: Number(pick(d.mintempF, d.mintempC)),
            desc: g.desc,
            glyph: g.glyph,
        };
    });

    return {
        current: {
            temp: Number(pick(cur.temp_F, cur.temp_C)),
            feelsLike: Number(pick(cur.FeelsLikeF, cur.FeelsLikeC)),
            humidity: Number(cur.humidity),
            windSpeed: Number(pick(cur.windspeedMiles, cur.windspeedKmph)),
            desc, glyph, isNight, sunrise, sunset, moonPhase,
        },
        days: forecast,
        location: locName,
        unit,
        fetchedAt: GLib.DateTime.new_now_local(),
    };
}

export function parseOpenMeteo(current, daily, unit, mono, locName = '') {
    if (!current || !daily)
        throw new Error('Open-Meteo: missing current/daily data');

    const sunrise = daily.sunrise?.[0] ?? null;
    const sunset = daily.sunset?.[0] ?? null;
    // Prefer the API's is_day flag; fall back to computing from sun times.
    const isNight = current.is_day !== undefined
        ? current.is_day === 0
        : isNightNow(sunrise, sunset);
    const moonGlyph = approximateMoonGlyph(new Date(), mono);

    const {glyph, desc} = glyphFor(current.weather_code, Provider.OPENMETEO, {mono, isNight, moonGlyph});

    const forecast = (daily.time ?? []).slice(0, 4).map((t, i) => {
        const g = glyphFor(daily.weather_code[i], Provider.OPENMETEO, {mono});
        return {
            date: t,
            dayName: dayName(t),
            hi: Math.round(daily.temperature_2m_max[i]),
            lo: Math.round(daily.temperature_2m_min[i]),
            desc: g.desc,
            glyph: g.glyph,
            sunrise: daily.sunrise?.[i] ?? null,
            sunset: daily.sunset?.[i] ?? null,
        };
    });

    return {
        current: {
            temp: Math.round(current.temperature_2m),
            feelsLike: Math.round(current.apparent_temperature),
            humidity: Math.round(current.relative_humidity_2m),
            windSpeed: Math.round(current.wind_speed_10m),
            desc, glyph, isNight, sunrise, sunset, moonPhase: null,
        },
        days: forecast,
        location: locName,
        unit,
        fetchedAt: GLib.DateTime.new_now_local(),
    };
}

export function dayName(isoDate) {
    const d = new Date(`${isoDate}T12:00:00`);
    if (isNaN(d))
        return '';
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = new Date();
    if (d.toDateString() === today.toDateString())
        return 'Today';
    return names[d.getDay()];
}

/* ------------------------------------------------------------------ */
/* High-level fetch orchestration                                      */
/* ------------------------------------------------------------------ */

// opts: {provider, mode, location, unit, mono}
// Returns the normalized weather object (see parsers above).
export async function fetchWeather(opts) {
    const {provider, mode, location, unit, mono} = opts;
    if (provider === Provider.OPENMETEO)
        return fetchOpenMeteo(opts);
    return fetchWttr(opts);
}

async function fetchWttr({mode, location, unit, mono}) {
    const loc = mode === LocationMode.AUTO ? '' : location;
    const json = await fetchJson(buildWttrUrl(loc));
    return parseWttr(json, unit, mono);
}

async function fetchOpenMeteo({mode, location, unit, mono}) {
    let lat, lon, locName;
    if (mode === LocationMode.AUTO) {
        const ip = await fetchJson(buildIpApiUrl());
        if (typeof ip.latitude !== 'number' || typeof ip.longitude !== 'number')
            throw new Error('ipapi.co: no coordinates in response');
        lat = ip.latitude;
        lon = ip.longitude;
        locName = [ip.city, ip.region].filter(Boolean).join(', ');
    } else {
        const geo = await fetchJson(buildGeocodeUrl(location));
        const hit = geo.results?.[0];
        if (!hit)
            throw new Error(`Open-Meteo geocoding: no result for "${location}"`);
        lat = hit.latitude;
        lon = hit.longitude;
        locName = [hit.name, hit.admin1 ?? hit.country].filter(Boolean).join(', ');
    }
    const json = await fetchJson(buildOpenMeteoUrl(lat, lon, unit));
    return parseOpenMeteo(json.current, json.daily, unit, mono, locName);
}
