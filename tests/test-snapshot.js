import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

let passed = 0;

function assertEqual(actual, expected, message) {
    if (!Object.is(actual, expected))
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    passed++;
}

function assertDeepEqual(actual, expected, message) {
    const left = JSON.stringify(actual);
    const right = JSON.stringify(expected);
    if (left !== right)
        throw new Error(`${message}: expected ${right}, got ${left}`);
    passed++;
}

let Snapshot;
try {
    Snapshot = await import('../snapshot.js');
} catch (error) {
    throw new Error(`snapshot helper must be importable: ${error.message}`);
}

const weather = {
    provider: 'openmeteo',
    location: 'Detroit, Michigan',
    unit: 'f',
    latitude: 42.331,
    longitude: -83.046,
    fetchedAt: GLib.DateTime.new_from_unix_local(1789233600),
    apiKey: 'must-not-leak',
    current: {
        temp: 73,
        feelsLike: 72,
        humidity: 55,
        windSpeed: 10,
        desc: 'Slight rain',
        glyph: '☔',
        isNight: false,
        sunrise: '2026-09-12T07:10',
        sunset: '2026-09-12T19:48',
        moonPhase: null,
        cloudCover: 72,
        precipitation: 1.25,
        precipitationAmountMm: 1.25,
        precipitationPeriodHours: 1,
        rain: 0.8,
        snowfall: null,
        snowfallAmountCm: 0.3,
        snowfallPeriodHours: 1,
        windSpeedKmh: 16.09344,
        windDirection: 225,
        weatherCode: 61,
        secret: 'must-not-leak',
    },
};

const expectedCurrent = {
    temp: 73,
    feelsLike: 72,
    humidity: 55,
    windSpeed: 10,
    desc: 'Slight rain',
    glyph: '☔',
    isNight: false,
    sunrise: '2026-09-12T07:10',
    sunset: '2026-09-12T19:48',
    moonPhase: null,
    cloudCover: 72,
    precipitation: 1.25,
    precipitationAmountMm: 1.25,
    precipitationPeriodHours: 1,
    rain: 0.8,
    snowfall: null,
    snowfallAmountCm: 0.3,
    snowfallPeriodHours: 1,
    windSpeedKmh: 16.09344,
    windDirection: 225,
    weatherCode: 61,
};

const document = Snapshot.buildSnapshot(weather);
assertEqual(document.schemaVersion, 1, 'snapshot schema is version 1');
assertEqual(document.fetchedAt, 1789233600000, 'GLib fetch time becomes epoch milliseconds');
assertEqual(document.provider, 'openmeteo', 'snapshot includes provider');
assertEqual(document.location, 'Detroit, Michigan', 'snapshot includes resolved location');
assertEqual(document.unit, 'f', 'snapshot includes display unit');
assertEqual(document.latitude, 42.331, 'snapshot includes latitude');
assertEqual(document.longitude, -83.046, 'snapshot includes longitude');
assertDeepEqual(document.current, expectedCurrent, 'snapshot current fields are explicitly allowlisted');
assertEqual(JSON.stringify(document).includes('must-not-leak'), false, 'snapshot excludes unrelated credentials');

const tempRoot = GLib.dir_make_tmp('topweather-snapshot-test-XXXXXX');
const cacheDir = GLib.build_filenamev([tempRoot, 'topweather']);
const path = GLib.build_filenamev([cacheDir, 'current.json']);

try {
    Snapshot.writeSnapshot(weather, path);
    const [ok, bytes] = GLib.file_get_contents(path);
    assertEqual(ok, true, 'snapshot is readable after export');
    assertDeepEqual(JSON.parse(new TextDecoder().decode(bytes)), document,
        'exported JSON matches the snapshot contract');

    const fileInfo = Gio.File.new_for_path(path).query_info(
        Gio.FILE_ATTRIBUTE_UNIX_MODE, Gio.FileQueryInfoFlags.NONE, null);
    assertEqual(fileInfo.get_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE) & 0o777, 0o600,
        'snapshot permissions are private');
    const dirInfo = Gio.File.new_for_path(cacheDir).query_info(
        Gio.FILE_ATTRIBUTE_UNIX_MODE, Gio.FileQueryInfoFlags.NONE, null);
    assertEqual(dirInfo.get_attribute_uint32(Gio.FILE_ATTRIBUTE_UNIX_MODE) & 0o777, 0o700,
        'snapshot directory permissions are private');

    const names = [];
    const enumerator = Gio.File.new_for_path(cacheDir).enumerate_children(
        Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NONE, null);
    for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null))
        names.push(info.get_name());
    enumerator.close(null);
    assertDeepEqual(names, ['current.json'], 'atomic export leaves no temporary files');

    Snapshot.invalidateSnapshot(path);
    assertEqual(GLib.file_test(path, GLib.FileTest.EXISTS), false, 'invalidation removes the snapshot');
    Snapshot.invalidateSnapshot(path);
    assertEqual(GLib.file_test(path, GLib.FileTest.EXISTS), false, 'invalidation is idempotent');

    const blocker = GLib.build_filenamev([tempRoot, 'not-a-directory']);
    GLib.file_set_contents(blocker, 'blocker');
    assertEqual(Snapshot.tryWriteSnapshot(weather, GLib.build_filenamev([blocker, 'current.json'])), false,
        'best-effort export reports failure without throwing');
    assertEqual(GLib.file_test(blocker, GLib.FileTest.IS_REGULAR), true,
        'failed best-effort export does not replace unrelated data');
    GLib.unlink(blocker);

    const invalidationTarget = GLib.build_filenamev([tempRoot, 'directory-target']);
    GLib.mkdir(invalidationTarget, 0o700);
    const invalidationChild = GLib.build_filenamev([invalidationTarget, 'keep']);
    GLib.file_set_contents(invalidationChild, 'keep');
    assertEqual(Snapshot.tryInvalidateSnapshot(invalidationTarget), false,
        'best-effort invalidation reports failure without throwing');
    assertEqual(GLib.file_test(invalidationTarget, GLib.FileTest.IS_DIR), true,
        'failed best-effort invalidation leaves the target untouched');
    GLib.unlink(invalidationChild);
    GLib.rmdir(invalidationTarget);
} finally {
    if (GLib.file_test(path, GLib.FileTest.EXISTS))
        GLib.unlink(path);
    GLib.rmdir(cacheDir);
    GLib.rmdir(tempRoot);
}

print(`snapshot: ${passed} assertions passed`);
