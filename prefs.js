// prefs.js — TopWeather preferences (GTK4 + libadwaita).

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TopWeatherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(560, 640);

        const page = new Adw.PreferencesPage({
            title: 'TopWeather',
            icon_name: 'weather-clear-symbolic',
        });
        window.add(page);

        /* ---------------- General ---------------- */
        const generalGroup = new Adw.PreferencesGroup({title: 'General'});
        page.add(generalGroup);

        // Unit
        const unitRow = new Adw.ComboRow({
            title: 'Temperature unit',
            model: Gtk.StringList.new(['Fahrenheit (°F)', 'Celsius (°C)']),
        });
        unitRow.set_selected(settings.get_string('unit') === 'c' ? 1 : 0);
        unitRow.connect('notify::selected', () => {
            settings.set_string('unit', unitRow.get_selected() === 1 ? 'c' : 'f');
        });
        generalGroup.add(unitRow);

        // Provider
        const providerRow = new Adw.ComboRow({
            title: 'Weather provider',
            subtitle: 'Both are free and require no API key',
            model: Gtk.StringList.new(['wttr.in', 'Open-Meteo']),
        });
        providerRow.set_selected(settings.get_string('provider') === 'openmeteo' ? 1 : 0);
        providerRow.connect('notify::selected', () => {
            settings.set_string('provider', providerRow.get_selected() === 1 ? 'openmeteo' : 'wttr');
        });
        generalGroup.add(providerRow);

        // Refresh interval
        const refreshAdj = new Gtk.Adjustment({
            lower: 5, upper: 120, step_increment: 5, page_increment: 15,
        });
        const refreshRow = new Adw.SpinRow({
            title: 'Refresh interval',
            subtitle: 'Minutes between weather updates (5–120)',
            adjustment: refreshAdj,
        });
        settings.bind('refresh-interval', refreshRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(refreshRow);

        /* ---------------- Location ---------------- */
        const locationGroup = new Adw.PreferencesGroup({title: 'Location'});
        page.add(locationGroup);

        const modeRow = new Adw.ComboRow({
            title: 'Location mode',
            model: Gtk.StringList.new(['Automatic (IP-based)', 'City', 'ZIP code']),
        });
        const modes = ['auto', 'city', 'zip'];
        modeRow.set_selected(Math.max(0, modes.indexOf(settings.get_string('location-mode'))));
        locationGroup.add(modeRow);

        const locationRow = new Adw.EntryRow({
            title: 'City or ZIP code',
        });
        locationRow.set_text(settings.get_string('location'));
        locationRow.connect('changed', () => {
            settings.set_string('location', locationRow.get_text().trim());
        });
        locationGroup.add(locationRow);

        const updateLocationSensitivity = () => {
            locationRow.set_sensitive(modeRow.get_selected() !== 0);
        };
        modeRow.connect('notify::selected', () => {
            settings.set_string('location-mode', modes[modeRow.get_selected()]);
            updateLocationSensitivity();
        });
        updateLocationSensitivity();

        /* ---------------- Appearance ---------------- */
        const appearGroup = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(appearGroup);

        const appearanceRow = new Adw.ComboRow({
            title: 'Menu appearance',
            subtitle: 'Override styling for the dropdown menu',
            model: Gtk.StringList.new(['System', 'Light', 'Dark']),
        });
        const appearances = ['system', 'light', 'dark'];
        appearanceRow.set_selected(Math.max(0, appearances.indexOf(settings.get_string('appearance'))));
        appearanceRow.connect('notify::selected', () => {
            settings.set_string('appearance', appearances[appearanceRow.get_selected()]);
        });
        appearGroup.add(appearanceRow);

        const glyphStyleRow = new Adw.ComboRow({
            title: 'Glyph style',
            subtitle: 'Color emoji or monochrome unicode symbols',
            model: Gtk.StringList.new(['Color emoji', 'Monochrome']),
        });
        glyphStyleRow.set_selected(settings.get_string('glyph-style') === 'mono' ? 1 : 0);
        glyphStyleRow.connect('notify::selected', () => {
            settings.set_string('glyph-style', glyphStyleRow.get_selected() === 1 ? 'mono' : 'color');
        });
        appearGroup.add(glyphStyleRow);

        /* ---------------- Panel ---------------- */
        const panelGroup = new Adw.PreferencesGroup({title: 'Panel'});
        page.add(panelGroup);

        const showGlyphRow = new Adw.SwitchRow({
            title: 'Show glyph in panel',
        });
        settings.bind('show-glyph', showGlyphRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(showGlyphRow);

        const showTempRow = new Adw.SwitchRow({
            title: 'Show temperature in panel',
        });
        settings.bind('show-temp', showTempRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        panelGroup.add(showTempRow);

        /* ---------------- Alerts ---------------- */
        const alertsGroup = new Adw.PreferencesGroup({
            title: 'Severe Weather Alerts',
            description: 'US National Weather Service alerts (weather.gov) for your location',
        });
        page.add(alertsGroup);

        const showAlertsRow = new Adw.SwitchRow({
            title: 'Show severe weather alerts',
            subtitle: 'Warnings replace the panel glyph; watches make it blink',
        });
        settings.bind('show-alerts', showAlertsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        alertsGroup.add(showAlertsRow);

        /* ---------------- About ---------------- */
        const aboutGroup = new Adw.PreferencesGroup({title: 'About'});
        page.add(aboutGroup);
        const aboutRow = new Adw.ActionRow({
            title: 'TopWeather — a StudioDDx product',
            subtitle: 'Weather in your top bar. Open source (MIT). Data: wttr.in / Open-Meteo — no API keys required.',
        });
        aboutGroup.add(aboutRow);

        const linkRow = new Adw.ActionRow({
            title: 'studioddx.com',
            subtitle: 'More StudioDDx projects',
        });
        linkRow.add_suffix(new Gtk.Image({icon_name: 'adw-external-link-symbolic'}));
        linkRow.set_activatable(true);
        linkRow.connect('activated', () => {
            Gtk.show_uri(window, 'https://studioddx.com', Gdk.CURRENT_TIME);
        });
        aboutGroup.add(linkRow);
    }
}
