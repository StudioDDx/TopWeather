// snapshot.js — private, atomic weather snapshot export for local consumers.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const CURRENT_FIELDS = [
    'temp',
    'feelsLike',
    'humidity',
    'windSpeed',
    'desc',
    'glyph',
    'isNight',
    'sunrise',
    'sunset',
    'moonPhase',
];

function finiteOrNull(value, {min = -Infinity, max = Infinity} = {}) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
        ? value
        : null;
}

function weatherCodeOrNull(value) {
    if (typeof value === 'string')
        return value;
    return finiteOrNull(value);
}

function fetchedAtMilliseconds(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return Math.trunc(value);
    if (value instanceof Date && !Number.isNaN(value.getTime()))
        return value.getTime();
    if (value && typeof value.to_unix === 'function') {
        const milliseconds = value.to_unix() * 1000;
        const microseconds = typeof value.get_microsecond === 'function'
            ? value.get_microsecond()
            : 0;
        return milliseconds + Math.floor(microseconds / 1000);
    }
    throw new Error('TopWeather snapshot requires a valid fetchedAt time');
}

export function defaultSnapshotPath() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'topweather', 'current.json']);
}

export function buildSnapshot(weather) {
    if (!weather || typeof weather !== 'object' || !weather.current)
        throw new Error('TopWeather snapshot requires normalized weather data');

    const source = weather.current;
    const current = {};
    for (const field of CURRENT_FIELDS)
        current[field] = source[field] ?? null;
    Object.assign(current, {
        cloudCover: finiteOrNull(source.cloudCover, {min: 0, max: 100}),
        precipitation: finiteOrNull(source.precipitation, {min: 0}),
        precipitationAmountMm: finiteOrNull(source.precipitationAmountMm, {min: 0}),
        precipitationPeriodHours: finiteOrNull(source.precipitationPeriodHours, {min: 0}),
        rain: finiteOrNull(source.rain, {min: 0}),
        snowfall: finiteOrNull(source.snowfall, {min: 0}),
        snowfallAmountCm: finiteOrNull(source.snowfallAmountCm, {min: 0}),
        snowfallPeriodHours: finiteOrNull(source.snowfallPeriodHours, {min: 0}),
        windSpeedKmh: finiteOrNull(source.windSpeedKmh, {min: 0}),
        windDirection: finiteOrNull(source.windDirection, {min: 0, max: 360}),
        weatherCode: weatherCodeOrNull(source.weatherCode),
    });

    return {
        schemaVersion: 1,
        fetchedAt: fetchedAtMilliseconds(weather.fetchedAt),
        provider: typeof weather.provider === 'string' ? weather.provider : '',
        location: typeof weather.location === 'string' ? weather.location : '',
        unit: typeof weather.unit === 'string' ? weather.unit : '',
        latitude: finiteOrNull(weather.latitude, {min: -90, max: 90}),
        longitude: finiteOrNull(weather.longitude, {min: -180, max: 180}),
        current,
    };
}

export function writeSnapshot(weather, path = defaultSnapshotPath()) {
    const document = buildSnapshot(weather);
    const directory = GLib.path_get_dirname(path);
    if (GLib.mkdir_with_parents(directory, 0o700) !== 0)
        throw new Error(`Unable to create TopWeather cache directory: ${directory}`);
    if (GLib.chmod(directory, 0o700) !== 0)
        throw new Error(`Unable to make TopWeather cache directory private: ${directory}`);

    const destination = Gio.File.new_for_path(path);
    const temporaryPath = GLib.build_filenamev([
        directory,
        `.${GLib.path_get_basename(path)}.${GLib.uuid_string_random()}.tmp`,
    ]);
    const temporary = Gio.File.new_for_path(temporaryPath);
    try {
        const stream = temporary.create(Gio.FileCreateFlags.PRIVATE, null);
        const bytes = new TextEncoder().encode(`${JSON.stringify(document)}\n`);
        stream.write_all(bytes, null);
        stream.close(null);
        if (GLib.chmod(temporaryPath, 0o600) !== 0)
            throw new Error('Unable to make temporary TopWeather snapshot private');
        temporary.move(destination, Gio.FileCopyFlags.OVERWRITE, null, null);
    } catch (error) {
        try {
            temporary.delete(null);
        } catch (_) {
            // The move may already have removed the temporary name.
        }
        throw error;
    }
    return document;
}

export function invalidateSnapshot(path = defaultSnapshotPath()) {
    const file = Gio.File.new_for_path(path);
    try {
        file.delete(null);
    } catch (error) {
        if (!error.matches?.(Gio.io_error_quark(), Gio.IOErrorEnum.NOT_FOUND))
            throw error;
    }
}

export function tryWriteSnapshot(weather, path = defaultSnapshotPath(), onError = null) {
    try {
        writeSnapshot(weather, path);
        return true;
    } catch (error) {
        onError?.(error);
        return false;
    }
}

export function tryInvalidateSnapshot(path = defaultSnapshotPath(), onError = null) {
    try {
        invalidateSnapshot(path);
        return true;
    } catch (error) {
        onError?.(error);
        return false;
    }
}
