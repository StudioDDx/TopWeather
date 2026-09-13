// Shell-independent presentation and last-good data state.
import {classifyAlerts} from './alerts.js';

export function measurement(value, suffix = '') {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '—';
}

export function windDirection(degrees) {
    if (typeof degrees !== 'number' || !Number.isFinite(degrees) || degrees < 0 || degrees > 360)
        return '';
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
}

export function formatSunTime(value) {
    // Provider timestamps with timezone=auto represent the location's clock,
    // not the user's computer timezone. Do not convert them with Date.
    if (typeof value !== 'string') return '—';
    return value.match(/T(\d{2}:\d{2})/)?.[1] ?? value;
}

export function weatherDetails(data) {
    const c = data.current;
    const unit = data.unit === 'c' ? '°C' : '°F';
    const speed = data.unit === 'c' ? ' km/h' : ' mph';
    const direction = windDirection(c.windDirection);
    const details = [
        `Feels like: ${measurement(c.feelsLike, unit)}`,
        `Humidity: ${measurement(c.humidity, '%')}`,
        `Wind: ${measurement(c.windSpeed, speed)}${direction ? ` ${direction}` : ''}`,
    ];
    if (Number.isFinite(c.cloudCover)) details.push(`Cloud cover: ${c.cloudCover}%`);
    if (Number.isFinite(c.precipitationAmountMm)) {
        const period = c.precipitationPeriodHours === 1 ? 'past hour' : 'provider period unspecified';
        details.push(`Precipitation (${period}): ${c.precipitationAmountMm} mm`);
    }
    if (c.sunrise && c.sunset)
        details.push(`Sunrise: ${formatSunTime(c.sunrise)}   Sunset: ${formatSunTime(c.sunset)}`);
    if (c.moonPhase) details.push(`Moon: ${c.moonPhase}`);
    return details;
}

export function panelPlacement(value) {
    const box = ['left', 'center', 'right'].includes(value) ? value : 'center';
    return {box, index: box === 'center' ? 1 : 0};
}

function timestamp(value) {
    if (typeof value?.to_unix === 'function') return value.to_unix() * 1000;
    if (value instanceof Date) return value.getTime();
    return value;
}

export class WeatherState {
    constructor() { this.reset(); }

    reset() {
        this.weather = null;
        this.error = null;
        this.updating = true;
        this.clearAlerts();
    }

    clearAlerts() {
        this.alerts = [];
        this.alertLevel = 'none';
        this.alertsUnavailable = false;
    }

    acceptWeather(weather) {
        if (!this.weather || ['provider', 'location', 'latitude', 'longitude']
            .some(key => this.weather[key] !== weather[key])) this.clearAlerts();
        this.weather = weather;
        this.error = null;
        this.updating = false;
    }

    failWeather(error) {
        this.error = error;
        this.updating = false;
    }

    acceptAlerts(result, now = Date.now()) {
        this.alertsUnavailable = Boolean(result.unavailable);
        if (!this.alertsUnavailable) this.alerts = result.alerts;
        this.pruneAlerts(now);
    }

    pruneAlerts(now = Date.now()) {
        // Without a valid expiry we cannot safely retain an alert on outage.
        this.alerts = this.alerts.filter(alert => alert.expires
            ? alert.expires.getTime() > now : !this.alertsUnavailable);
        this.alertLevel = classifyAlerts(this.alerts);
    }

    status(now = Date.now(), intervalMinutes = 30) {
        if (this.updating)
            return {kind: 'loading', text: this.weather ? 'Refreshing weather…' : 'Loading weather…'};
        if (this.error)
            return {kind: 'error', text: this.weather
                ? 'Refresh failed — showing last known weather. Try Refresh now.'
                : 'Unable to load weather. Check your connection and location, then retry.'};
        const age = Math.max(0, now - timestamp(this.weather?.fetchedAt));
        const minutes = Math.floor(age / 60000);
        const stale = age > intervalMinutes * 60000;
        return {kind: stale ? 'stale' : 'fresh', text:
            `${stale ? 'Stale data · ' : ''}Updated ${minutes < 1 ? 'just now' : `${minutes} min ago`}`};
    }
}
