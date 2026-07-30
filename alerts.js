// alerts.js — US severe weather alerts via the National Weather Service.
// Shell-independent: testable under gjs. Never throws past fetchAlerts —
// callers get [] on any failure so alerts can never break weather display.

import {fetchJson, buildIpApiUrl, LocationMode} from './weather.js';

const NWS_UA = 'topweather-gnome-extension (github.com/rucaradio/topweather)';

/* ------------------------------------------------------------------ */
/* URL builders (pure)                                                 */
/* ------------------------------------------------------------------ */

export function buildNominatimUrl(query) {
    return `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
}

export function buildNwsAlertsUrl(lat, lon) {
    return `https://api.weather.gov/alerts/active?point=${lat},${lon}`;
}

/* ------------------------------------------------------------------ */
/* Parsing / classification (pure)                                     */
/* ------------------------------------------------------------------ */

// GeoJSON → [{event, severity, headline, description, instruction,
//             expires (Date|null), senderName}], expired alerts removed.
export function parseNwsAlerts(geojson, now = new Date()) {
    const features = geojson?.features;
    if (!Array.isArray(features))
        return [];
    const alerts = [];
    for (const f of features) {
        const p = f?.properties;
        if (!p || !p.event)
            continue;
        const expires = p.expires ? new Date(p.expires) : null;
        if (expires && !isNaN(expires) && expires <= now)
            continue; // already expired
        alerts.push({
            event: p.event,
            severity: p.severity ?? 'Unknown',
            headline: p.headline ?? p.event,
            description: p.description ?? '',
            instruction: p.instruction ?? '',
            expires: expires && !isNaN(expires) ? expires : null,
            senderName: p.senderName ?? '',
        });
    }
    return alerts;
}

// 'warning' | 'watch' | 'none'. Any Warning outranks any Watch.
export function classifyAlerts(alerts) {
    let sawWatch = false;
    for (const a of alerts) {
        if (a.event.endsWith('Warning') ||
            a.severity === 'Extreme' || a.severity === 'Severe')
            return 'warning';
        if (a.event.endsWith('Watch') || a.severity === 'Moderate')
            sawWatch = true;
    }
    return sawWatch ? 'watch' : 'none';
}

/* ------------------------------------------------------------------ */
/* Fetch orchestration                                                 */
/* ------------------------------------------------------------------ */

// opts: {mode, location} — resolves coordinates then queries the NWS.
// Returns {alerts, level} or {alerts: [], level: 'none'} on any error.
export async function fetchAlerts({mode, location}) {
    try {
        const {lat, lon} = await resolveCoords(mode, location);
        const geojson = await fetchJson(buildNwsAlertsUrl(lat, lon), {userAgent: NWS_UA});
        const alerts = parseNwsAlerts(geojson);
        return {alerts, level: classifyAlerts(alerts)};
    } catch (e) {
        logError(e, 'topweather: alerts fetch failed; treating as no alerts');
        return {alerts: [], level: 'none'};
    }
}

async function resolveCoords(mode, location) {
    if (mode === LocationMode.AUTO) {
        const ip = await fetchJson(buildIpApiUrl());
        if (typeof ip.latitude !== 'number' || typeof ip.longitude !== 'number')
            throw new Error('ipapi.co: no coordinates in response');
        return {lat: ip.latitude, lon: ip.longitude};
    }
    const hits = await fetchJson(buildNominatimUrl(location), {userAgent: NWS_UA});
    const hit = Array.isArray(hits) ? hits[0] : null;
    if (!hit)
        throw new Error(`Nominatim: no result for "${location}"`);
    return {lat: parseFloat(hit.lat), lon: parseFloat(hit.lon)};
}
