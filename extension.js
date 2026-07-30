// extension.js — TopWeather panel indicator for GNOME Shell 50.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Weather from './weather.js';
import * as Alerts from './alerts.js';

const REFRESH_DEBOUNCE_MS = 800;
const WATCH_BLINK_SECONDS = 2;

const TopWeatherIndicator = GObject.registerClass(
class TopWeatherIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'TopWeather', false);
        this._extension = extension;
        this._settings = extension.getSettings();
        this._weather = null;        // last-good data
        this._alerts = [];           // last-good NWS alerts
        this._alertLevel = 'none';   // 'warning' | 'watch' | 'none'
        this._watchBlinkId = 0;
        this._watchBlinkOn = false;
        this._fetching = false;
        this._timerId = 0;
        this._debounceId = 0;
        this._settingsSignals = [];

        // --- Panel label -------------------------------------------------
        this._panelBox = new St.BoxLayout({style_class: 'topweather-panel-box'});
        this._glyphLabel = new St.Label({
            style_class: 'topweather-glyph',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._tempLabel = new St.Label({
            style_class: 'topweather-temp',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelBox.add_child(this._glyphLabel);
        this._panelBox.add_child(this._tempLabel);
        this.add_child(this._panelBox);
        this._setPanelText(null);

        // --- Menu --------------------------------------------------------
        this._buildMenu();

        // --- Settings change handling (live updates) ---------------------
        const watch = (key, cb) => {
            this._settingsSignals.push(this._settings.connect(`changed::${key}`, cb));
        };
        watch('show-glyph', () => this._render());
        watch('show-temp', () => this._render());
        watch('unit', () => this._refetch());
        watch('glyph-style', () => this._refetch());
        watch('provider', () => this._refetch());
        watch('location-mode', () => this._refetch());
        watch('location', () => this._refetch());
        watch('appearance', () => this._applyAppearance());
        watch('show-alerts', () => this._refetch());
        watch('refresh-interval', () => this._restartTimer());

        this._applyAppearance();
        this._refetch();
        this._restartTimer();
    }

    _buildMenu() {
        this.menu.removeAll();

        // Alerts section sits at the very top; hidden when there are none.
        this._alertsSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._alertsSection);
        this._alertsSeparator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(this._alertsSeparator);

        this._locationItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            style_class: 'topweather-location',
        });
        this.menu.addMenuItem(this._locationItem);

        this._todaySection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._todaySection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._forecastSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._forecastSection);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh now');
        refreshItem.connect('activate', () => this._refetch());
        this.menu.addMenuItem(refreshItem);

        const prefsItem = new PopupMenu.PopupMenuItem('⚙  Settings');
        prefsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(prefsItem);
    }

    /* ------------------------------------------------------------ */
    /* Settings helpers                                              */
    /* ------------------------------------------------------------ */

    _opts() {
        return {
            provider: this._settings.get_string('provider'),
            mode: this._settings.get_string('location-mode'),
            location: this._settings.get_string('location'),
            unit: this._settings.get_string('unit'),
            mono: this._settings.get_string('glyph-style') === 'mono',
        };
    }

    _applyAppearance() {
        const mode = this._settings.get_string('appearance'); // light|dark|system
        const actor = this.menu.actor;
        actor.remove_style_class_name('topweather-light');
        actor.remove_style_class_name('topweather-dark');
        if (mode === 'light')
            actor.add_style_class_name('topweather-light');
        else if (mode === 'dark')
            actor.add_style_class_name('topweather-dark');
        // 'system' → no override class
    }

    /* ------------------------------------------------------------ */
    /* Fetching                                                      */
    /* ------------------------------------------------------------ */

    _refetch() {
        // Debounce bursts of settings changes.
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = 0;
        }
        this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, REFRESH_DEBOUNCE_MS, () => {
            this._debounceId = 0;
            this._fetchNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    async _fetchNow() {
        if (this._fetching)
            return;
        this._fetching = true;
        try {
            const jobs = [Weather.fetchWeather(this._opts())];
            // Alerts are best-effort: fetchAlerts never rejects.
            if (this._settings.get_boolean('show-alerts'))
                jobs.push(Alerts.fetchAlerts(this._opts()));
            else
                jobs.push(Promise.resolve({alerts: [], level: 'none'}));
            // Settled so an alerts outage can't wipe last-good weather (or vice versa).
            const [weatherResult, alertsResult] = await Promise.allSettled(jobs);
            if (weatherResult.status === 'fulfilled') {
                this._weather = weatherResult.value;
            } else {
                logError(weatherResult.reason, 'topweather: fetch failed; keeping last-good data');
            }
            if (alertsResult.status === 'fulfilled') {
                this._alerts = alertsResult.value.alerts;
                this._alertLevel = alertsResult.value.level;
            }
        } finally {
            this._fetching = false;
            this._updateWatchBlink();
            this._render();
        }
    }

    // Watch level: alternate the panel glyph between the normal conditions
    // glyph and an orange warning glyph on a slow blink.
    _updateWatchBlink() {
        const wantBlink = this._alertLevel === 'watch' &&
            this._settings.get_boolean('show-alerts') &&
            this._settings.get_boolean('show-glyph');
        if (wantBlink && !this._watchBlinkId) {
            this._watchBlinkOn = false;
            this._watchBlinkId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, WATCH_BLINK_SECONDS, () => {
                    this._watchBlinkOn = !this._watchBlinkOn;
                    this._render();
                    return GLib.SOURCE_CONTINUE;
                });
        } else if (!wantBlink && this._watchBlinkId) {
            GLib.source_remove(this._watchBlinkId);
            this._watchBlinkId = 0;
            this._watchBlinkOn = false;
        }
    }

    _restartTimer() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        const minutes = this._settings.get_int('refresh-interval');
        this._timerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            Math.max(60, minutes * 60),
            () => {
                this._fetchNow();
                return GLib.SOURCE_CONTINUE;
            });
    }

    /* ------------------------------------------------------------ */
    /* Rendering                                                     */
    /* ------------------------------------------------------------ */

    _setPanelText(data) {
        const showGlyph = this._settings.get_boolean('show-glyph');
        const showTemp = this._settings.get_boolean('show-temp');
        const alertsOn = this._settings.get_boolean('show-alerts');

        // Alert glyph takes precedence over the conditions glyph.
        let glyphOverride = null;
        let glyphClass = null;
        if (alertsOn && this._alertLevel === 'warning') {
            glyphOverride = '⚠️';
            glyphClass = 'topweather-panel-warning';
        } else if (alertsOn && this._alertLevel === 'watch' && this._watchBlinkOn) {
            glyphOverride = '⚠️';
            glyphClass = 'topweather-panel-watch';
        }

        this._glyphLabel.remove_style_class_name('topweather-panel-warning');
        this._glyphLabel.remove_style_class_name('topweather-panel-watch');
        if (glyphClass)
            this._glyphLabel.add_style_class_name(glyphClass);

        if (!data && !glyphOverride) {
            this._glyphLabel.text = showGlyph ? '⏳' : '';
            this._tempLabel.text = showTemp ? '…' : '';
        } else {
            this._glyphLabel.text = showGlyph
                ? (glyphOverride ?? data.current.glyph)
                : '';
            this._tempLabel.text = showTemp && data ? ` ${data.current.temp}°` : '';
        }
        this._glyphLabel.visible = showGlyph;
        this._tempLabel.visible = showTemp;
        this.visible = showGlyph || showTemp;
    }

    _render() {
        const data = this._weather;
        this._setPanelText(data);
        this._renderAlerts();

        // --- menu ---------------------------------------------------
        this._todaySection.removeAll();
        this._forecastSection.removeAll();

        if (!data) {
            this._locationItem.label.text = 'Loading weather…';
            this._todaySection.addMenuItem(
                new PopupMenu.PopupMenuItem('No data yet — check your connection.', {reactive: false}));
            return;
        }

        const unitSym = data.unit === 'c' ? '°C' : '°F';
        const windUnit = data.unit === 'c' ? 'km/h' : 'mph';

        this._locationItem.label.text =
            `${data.location || 'Current location'}  ·  updated ${data.fetchedAt.format('%H:%M')}`;

        const c = data.current;
        const head = new PopupMenu.PopupMenuItem(
            `${c.glyph}  ${c.temp}${unitSym}  —  ${c.desc}`, {reactive: false,
                style_class: 'topweather-headline'});
        this._todaySection.addMenuItem(head);

        const details = [
            `Feels like: ${c.feelsLike}${unitSym}`,
            `Humidity: ${c.humidity}%`,
            `Wind: ${c.windSpeed} ${windUnit}`,
        ];
        if (c.sunrise && c.sunset)
            details.push(`Sunrise: ${fmtTime(c.sunrise)}   Sunset: ${fmtTime(c.sunset)}`);
        if (c.moonPhase)
            details.push(`Moon: ${c.moonPhase}`);

        const detailItem = new PopupMenu.PopupMenuItem(details.join('\n'), {
            reactive: false,
            style_class: 'topweather-details',
        });
        detailItem.label.clutter_text.set_line_wrap(true);
        this._todaySection.addMenuItem(detailItem);

        for (const d of data.days) {
            const item = new PopupMenu.PopupMenuItem(
                `${d.dayName.padEnd(9)}  ${d.glyph}  ${d.hi}° / ${d.lo}°   ${d.desc}`,
                {reactive: false, style_class: 'topweather-forecast-row'});
            this._forecastSection.addMenuItem(item);
        }
    }

    _renderAlerts() {
        this._alertsSection.removeAll();
        const show = this._settings.get_boolean('show-alerts') && this._alerts.length > 0;
        this._alertsSection.actor.visible = show;
        this._alertsSeparator.visible = show;
        if (!show)
            return;

        for (const a of this._alerts) {
            const isWarning = a.event.endsWith('Warning') ||
                a.severity === 'Extreme' || a.severity === 'Severe';
            const cls = isWarning ? 'topweather-alert-warning' : 'topweather-alert-watch';

            const header = new PopupMenu.PopupMenuItem(
                `⚠  ${a.event}  (${a.severity})`,
                {reactive: false, style_class: `topweather-alert-header ${cls}`});
            this._alertsSection.addMenuItem(header);

            const expires = a.expires
                ? `Expires: ${a.expires.toLocaleString()}`
                : 'Expires: unknown';
            const body = [
                a.headline,
                expires,
                a.senderName ? `Source: ${a.senderName}` : '',
                '',
                a.description,
                a.instruction ? `\nInstructions: ${a.instruction}` : '',
            ].filter(s => s !== '').join('\n');

            const bodyItem = new PopupMenu.PopupMenuItem(body, {
                reactive: false,
                style_class: `topweather-alert-body ${cls}`,
            });
            bodyItem.label.clutter_text.set_line_wrap(true);
            this._alertsSection.addMenuItem(bodyItem);
        }
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
        if (this._watchBlinkId) {
            GLib.source_remove(this._watchBlinkId);
            this._watchBlinkId = 0;
        }
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = 0;
        }
        for (const id of this._settingsSignals)
            this._settings.disconnect(id);
        this._settingsSignals = [];
        this._settings = null;
        this._weather = null;
        super.destroy();
    }
});

function fmtTime(t) {
    // ISO datetimes from Open-Meteo → HH:MM; wttr strings pass through.
    if (t.includes('T')) {
        const d = new Date(t);
        if (!isNaN(d))
            return d.toTimeString().slice(0, 5);
    }
    return t;
}

export default class TopWeatherExtension extends Extension {
    enable() {
        this._indicator = new TopWeatherIndicator(this);
        // Center box, position 1 → immediately right of the clock.
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'center');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
