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
import * as Snapshot from './snapshot.js';
import {RefreshCoordinator, runRefreshCycle, createRefreshJobs} from './refresh.js';
import {WeatherState, measurement, weatherDetails, panelPlacement} from './display.js';

const REFRESH_DEBOUNCE_MS = 800;
const WATCH_BLINK_SECONDS = 2;

const TopWeatherIndicator = GObject.registerClass(
class TopWeatherIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'TopWeather', false);
        this._extension = extension;
        this._settings = extension.getSettings();
        this._state = new WeatherState();
        this._watchBlinkId = 0;
        this._watchBlinkOn = false;
        this._timerId = 0;
        this._statusTimerId = 0;
        this._debounceId = 0;
        this._settingsSignals = [];
        this._refreshCoordinator = new RefreshCoordinator();
        this._destroyed = false;

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
        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open) this._render();
        });

        // --- Settings change handling (live updates) ---------------------
        const watch = (key, cb) => {
            this._settingsSignals.push(this._settings.connect(`changed::${key}`, cb));
        };
        watch('show-glyph', () => { this._updateWatchBlink(); this._render(); });
        watch('show-temp', () => this._render());
        watch('unit', () => this._invalidateAndRefetch());
        watch('glyph-style', () => this._supersedeAndRefetch());
        watch('provider', () => this._invalidateAndRefetch());
        watch('location-mode', () => this._invalidateAndRefetch());
        watch('location', () => this._invalidateAndRefetch());
        watch('appearance', () => this._applyAppearance());
        watch('show-alerts', () => {
            this._state.clearAlerts();
            this._updateWatchBlink();
            this._supersedeAndRefetch();
            this._render();
        });
        watch('refresh-interval', () => this._restartTimer());

        this._applyAppearance();
        this._refetch();
        this._restartTimer();
        this._statusTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 60, () => {
            this._state.pruneAlerts();
            this._updateWatchBlink();
            this._setPanelText(this._state.weather);
            this._renderAlerts();
            this._renderStatus();
            return GLib.SOURCE_CONTINUE;
        });
        this._render();
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

        this._statusItem = new PopupMenu.PopupMenuItem('', {reactive: false,
            style_class: 'topweather-status'});
        this._statusItem.label.clutter_text.set_line_wrap(true);
        this.menu.addMenuItem(this._statusItem);

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

    _invalidateSnapshot() {
        Snapshot.tryInvalidateSnapshot(undefined, error =>
            logError(error, 'topweather: unable to invalidate weather snapshot'));
    }

    _supersedeAndRefetch() {
        this._refreshCoordinator.supersede();
        this._refetch();
    }

    _invalidateAndRefetch() {
        this._refreshCoordinator.supersede();
        this._invalidateSnapshot();
        this._state.reset();
        this._updateWatchBlink();
        this._render();
        this._refetch();
    }

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
        if (this._destroyed)
            return;
        await runRefreshCycle(this._refreshCoordinator, () => {
            this._state.updating = true;
            this._renderStatus();
            const opts = this._opts();
            return createRefreshJobs(opts, {
                fetchWeather: Weather.fetchWeather,
                fetchAlerts: Alerts.fetchAlerts,
                alertsEnabled: this._settings.get_boolean('show-alerts'),
                previousWeather: this._state.weather,
            });
        }, {
            isActive: () => !this._destroyed,
            onWeather: weather => {
                this._state.acceptWeather(weather);
                Snapshot.tryWriteSnapshot(weather, undefined, error =>
                    logError(error, 'topweather: unable to export weather snapshot'));
                this._render();
            },
            onWeatherError: error => {
                this._state.failWeather(error);
                logError(error, 'topweather: fetch failed; keeping last-good data');
                this._render();
            },
            onAlerts: result => {
                this._state.acceptAlerts(result);
                this._updateWatchBlink();
                this._render();
            },
            onAlertsError: () => {
                this._state.acceptAlerts({unavailable: true});
                this._updateWatchBlink();
                this._render();
            },
            scheduleRefresh: () => this._refetch(),
        });
    }

    // Watch level: alternate the panel glyph between the normal conditions
    // glyph and an orange warning glyph on a slow blink.
    _updateWatchBlink() {
        const wantBlink = this._state.alertLevel === 'watch' &&
            this._settings.get_boolean('show-alerts') &&
            this._settings.get_boolean('show-glyph');
        if (wantBlink && !this._watchBlinkId) {
            this._watchBlinkOn = false;
            this._watchBlinkId = GLib.timeout_add_seconds(
                GLib.PRIORITY_DEFAULT, WATCH_BLINK_SECONDS, () => {
                    this._watchBlinkOn = !this._watchBlinkOn;
                    this._setPanelText(this._state.weather);
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
        if (alertsOn && this._state.alertLevel === 'warning') {
            glyphOverride = '⚠️';
            glyphClass = 'topweather-panel-warning';
        } else if (alertsOn && this._state.alertLevel === 'watch' && this._watchBlinkOn) {
            glyphOverride = '⚠️';
            glyphClass = 'topweather-panel-watch';
        }

        this._glyphLabel.remove_style_class_name('topweather-panel-warning');
        this._glyphLabel.remove_style_class_name('topweather-panel-watch');
        if (glyphClass)
            this._glyphLabel.add_style_class_name(glyphClass);

        if (!data && !glyphOverride) {
            this._glyphLabel.text = showGlyph ? (this._state.error ? '⚠' : '⏳') : '';
            this._tempLabel.text = showTemp ? (this._state.error ? '—' : '…') : '';
        } else {
            this._glyphLabel.text = showGlyph
                ? (glyphOverride ?? data.current.glyph)
                : '';
            this._tempLabel.text = showTemp && data ? ` ${measurement(data.current.temp, '°')}` : '';
        }
        this._glyphLabel.visible = showGlyph;
        this._tempLabel.visible = showTemp;
        this.visible = showGlyph || showTemp;
    }

    _render() {
        const data = this._state.weather;
        this._state.pruneAlerts();
        this._updateWatchBlink();
        this._setPanelText(data);
        this._renderAlerts();
        this._renderStatus();

        // --- menu ---------------------------------------------------
        this._todaySection.removeAll();
        this._forecastSection.removeAll();

        if (!data) {
            this._locationItem.label.text = this._settings.get_string('location-mode') === 'auto'
                ? 'Current location' : this._settings.get_string('location') || 'Set a location in Settings';
            this._todaySection.addMenuItem(
                new PopupMenu.PopupMenuItem('No weather data available yet.', {reactive: false}));
            return;
        }

        const unitSym = data.unit === 'c' ? '°C' : '°F';

        this._locationItem.label.text =
            `${data.location || 'Current location'}  ·  updated ${data.fetchedAt.format('%H:%M')}`;

        const c = data.current;
        const head = new PopupMenu.PopupMenuItem(
            `${c.glyph}  ${c.temp}${unitSym}  —  ${c.desc}`, {reactive: false,
                style_class: 'topweather-headline'});
        this._todaySection.addMenuItem(head);

        const details = weatherDetails(data);

        const detailItem = new PopupMenu.PopupMenuItem(details.join('\n'), {
            reactive: false,
            style_class: 'topweather-details',
        });
        detailItem.label.clutter_text.set_line_wrap(true);
        this._todaySection.addMenuItem(detailItem);

        for (const d of data.days) {
            const item = new PopupMenu.PopupMenuItem(
                `${d.dayName.padEnd(9)}  ${d.glyph}  ${measurement(d.hi, '°')} / ${measurement(d.lo, '°')}   ${d.desc}`,
                {reactive: false, style_class: 'topweather-forecast-row'});
            this._forecastSection.addMenuItem(item);
        }
    }

    _renderStatus() {
        const status = this._state.status(Date.now(), this._settings.get_int('refresh-interval'));
        this._statusItem.label.text = status.text +
            (this._settings.get_boolean('show-alerts') && this._state.alertsUnavailable
                ? '\nAlerts unavailable — any unexpired previous alerts are retained.' : '');
        this._statusItem.remove_style_class_name('topweather-status-warning');
        if (status.kind === 'error' || status.kind === 'stale' || this._state.alertsUnavailable)
            this._statusItem.add_style_class_name('topweather-status-warning');
        this.accessible_name = `TopWeather. ${this._state.weather
            ? `${this._state.weather.location}. ${measurement(this._state.weather.current.temp,
                this._state.weather.unit === 'c' ? ' degrees Celsius' : ' degrees Fahrenheit')}. ` : ''}${status.text}`;
    }

    _renderAlerts() {
        this._alertsSection.removeAll();
        const show = this._settings.get_boolean('show-alerts') && this._state.alerts.length > 0;
        this._alertsSection.actor.visible = show;
        this._alertsSeparator.visible = show;
        if (!show)
            return;

        for (const a of this._state.alerts) {
            const isWarning = Alerts.classifyAlerts([a]) === 'warning';
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
        this._destroyed = true;
        this._refreshCoordinator.supersede();
        this._invalidateSnapshot();
        if (this._statusTimerId) {
            GLib.source_remove(this._statusTimerId);
            this._statusTimerId = 0;
        }
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
        this._state.reset();
        super.destroy();
    }
});

export default class TopWeatherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new TopWeatherIndicator(this);
        const {box, index} = panelPlacement(this._settings.get_string('panel-position'));
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, box);
        this._positionSignal = this._settings.connect('changed::panel-position', () => {
            this._indicator.menu.close();
            const placement = panelPlacement(this._settings.get_string('panel-position'));
            const target = {left: Main.panel._leftBox, center: Main.panel._centerBox,
                right: Main.panel._rightBox}[placement.box];
            const container = this._indicator.container;
            container.get_parent()?.remove_child(container);
            target.insert_child_at_index(container, placement.index);
        });
    }

    disable() {
        if (this._positionSignal) this._settings.disconnect(this._positionSignal);
        this._positionSignal = 0;
        this._settings = null;
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
