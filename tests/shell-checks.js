// Run only inside an isolated GNOME Shell 50 session via test-shell.sh.
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const pause = () => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));

export async function run() {
    let passed = 0;
    const check = (value, message) => {
        if (!value) throw new Error(message);
        passed++;
    };
    const indicator = Main.panel.statusArea['topweather@rucaradio'];
    check(Boolean(indicator), 'release extension loads in GNOME Shell');
    const settings = indicator._settings;
    const stopRequests = () => {
        indicator._refreshCoordinator.supersede();
        for (const name of ['_timerId', '_debounceId']) {
            if (indicator[name]) GLib.source_remove(indicator[name]);
            indicator[name] = 0;
        }
    };
    stopRequests();
    const fixture = {
        provider: 'openmeteo', unit: 'c', location: 'Detroit, Michigan',
        latitude: 42.331, longitude: -83.046, fetchedAt: GLib.DateTime.new_now_local(),
        current: {temp: 18, feelsLike: null, humidity: 55, windSpeed: 16,
            windDirection: 225, cloudCover: 72, precipitationAmountMm: 1.25,
            precipitationPeriodHours: 1, glyph: '☂', desc: 'Slight rain',
            sunrise: '2026-09-12T07:10', sunset: '2026-09-12T19:48'},
        days: [{dayName: 'Today', hi: 21, lo: null, glyph: '☂', desc: 'Slight rain'}],
    };
    indicator._state.acceptWeather(fixture);
    indicator._render();
    check(indicator._tempLabel.text.includes('18°'), 'panel renders current temperature');
    const detail = indicator._todaySection._getMenuItems()[1].label.text;
    check(detail.includes('Feels like: —'), 'missing feels-like does not appear as zero');
    check(detail.includes('Wind: 16 km/h SW'), 'richer weather details render');
    check(indicator._forecastSection._getMenuItems()[0].label.text.includes('21° / —'),
        'missing forecast values render safely');

    for (const box of ['left', 'right', 'center']) {
        settings.set_string('panel-position', box);
        await pause();
        check(indicator.container.get_parent() === Main.panel[`_${box}Box`],
            `live panel placement: ${box}`);
    }
    indicator._state.acceptAlerts({alerts: [{event: 'Tornado Watch', severity: 'Severe',
        expires: new Date(Date.now() + 3600000), headline: 'QA watch', description: 'Fixture only'}]});
    indicator._render();
    check(indicator._watchBlinkId !== 0, 'watch starts blink timer');
    settings.set_boolean('show-alerts', false);
    await pause();
    stopRequests();
    check(indicator._watchBlinkId === 0 && !indicator._alertsSection.actor.visible,
        'disabling alerts immediately hides them and stops blinking');
    const Snapshot = await import(`${indicator._extension.dir.get_uri()}/snapshot.js`);
    Snapshot.writeSnapshot(fixture);
    settings.set_string('location', 'New York');
    await pause();
    stopRequests();
    check(indicator._state.weather === null, 'location change immediately clears old weather');
    check(!GLib.file_test(Snapshot.defaultSnapshotPath(), GLib.FileTest.EXISTS),
        'location change removes snapshot');
    check(!indicator._tempLabel.text.includes('18'), 'old-location panel temperature is gone');
    indicator._state.failWeather(new Error('offline fixture'));
    indicator._render();
    check(indicator._statusItem.label.text.includes('Unable to load'), 'initial error is not loading');
    check(indicator._tempLabel.text === '—', 'initial error panel is unavailable');

    indicator._state.acceptWeather({...fixture,
        fetchedAt: GLib.DateTime.new_from_unix_local(Math.floor(Date.now() / 1000) - 7200)});
    indicator._render();
    check(indicator._statusItem.label.text.includes('Stale data'), 'stale-data status renders');
    indicator._state.failWeather(new Error('offline fixture'));
    indicator._render();
    check(indicator._statusItem.label.text.includes('last known weather'), 'failed refresh explains retained data');
    check(indicator._tempLabel.text.includes('18°'), 'ordinary failure preserves last-good temperature');
    for (const appearance of ['light', 'dark', 'system']) {
        settings.set_string('appearance', appearance);
        await pause();
        check(appearance === 'system'
            ? !indicator.menu.actor.has_style_class_name('topweather-dark')
            : indicator.menu.actor.has_style_class_name(`topweather-${appearance}`),
        `live appearance: ${appearance}`);
    }
    indicator._state.acceptWeather(fixture);
    indicator._render();
    Main.overview.hide();
    indicator.menu.open();
    return {passed, message: 'GNOME Shell integration assertions passed; fixture menu open'};
}
