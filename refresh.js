// refresh.js — shell-independent refresh/revision coordination.

export function createRefreshJobs(opts, {fetchWeather, fetchAlerts, alertsEnabled = true,
    previousWeather = null}) {
    const weather = fetchWeather(opts);
    // Publish weather immediately; only the alert request waits for coordinates.
    // On weather failure, warnings can still refresh for last-good displayed data.
    const alerts = alertsEnabled ? Promise.resolve(weather)
        .catch(() => previousWeather)
        .then(data => fetchAlerts({...opts, latitude: data?.latitude, longitude: data?.longitude}))
        : Promise.resolve({alerts: [], level: 'none'});
    return [weather, alerts];
}

export class RefreshCoordinator {
    constructor() {
        this._revision = 0;
        this._fetching = false;
        this._pending = false;
        this._activeToken = null;
    }

    supersede() {
        this._revision++;
        this._pending = true;
    }

    begin() {
        if (this._fetching) {
            this._pending = true;
            return null;
        }
        this._fetching = true;
        this._pending = false;
        this._activeToken = {revision: this._revision};
        return this._activeToken;
    }

    isCurrent(token) {
        return token === this._activeToken && token.revision === this._revision;
    }

    finish(token) {
        if (token !== this._activeToken)
            throw new Error('RefreshCoordinator received an inactive token');
        const shouldRefresh = this._pending || token.revision !== this._revision;
        this._fetching = false;
        this._pending = false;
        this._activeToken = null;
        return {shouldRefresh};
    }
}

export async function runRefreshCycle(coordinator, createJobs, handlers) {
    const token = coordinator.begin();
    if (token === null)
        return false;

    const active = () => handlers.isActive() && coordinator.isCurrent(token);
    try {
        const [weatherJob, alertsJob] = createJobs();
        // Each result is published as soon as it arrives, without allowing an
        // obsolete location or a disabled extension to mutate current state.
        await Promise.allSettled([
            Promise.resolve(weatherJob).then(value => {
                if (active()) handlers.onWeather(value);
            }, error => {
                if (active()) handlers.onWeatherError(error);
            }),
            Promise.resolve(alertsJob).then(value => {
                if (active()) handlers.onAlerts(value);
            }, error => {
                if (active()) handlers.onAlertsError?.(error);
            }),
        ]);
    } catch (error) {
        if (active()) handlers.onWeatherError(error);
    } finally {
        const {shouldRefresh} = coordinator.finish(token);
        if (handlers.isActive() && shouldRefresh)
            handlers.scheduleRefresh();
    }
    return true;
}
