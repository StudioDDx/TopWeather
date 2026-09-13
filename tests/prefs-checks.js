// Native GTK/libadwaita checks against the installed release artifact.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
Adw.init();
for (const resource of ['org.gnome.Shell.Extensions.src.gresource',
    'gnome-shell-dbus-interfaces.gresource'])
    Gio.resources_register(Gio.Resource.load(`/usr/share/gnome-shell/${resource}`));

const path = ARGV[0];
const [, contents] = GLib.file_get_contents(`${path}/metadata.json`);
const metadata = JSON.parse(new TextDecoder().decode(contents));
metadata.path = path;
metadata.dir = Gio.File.new_for_path(path);
const {default: Preferences} = await import(`${metadata.dir.get_uri()}/prefs.js`);
const prefs = new Preferences(metadata);
const window = new Adw.PreferencesWindow();
prefs.fillPreferencesWindow(window);
const settings = prefs.getSettings();
const widgets = [];
function visit(widget) {
    widgets.push(widget);
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling()) visit(child);
}
visit(window);
let passed = 0;
function check(value, message) {
    if (!value) throw new Error(message);
    passed++;
}
const row = widgets.find(widget => widget instanceof Adw.ComboRow && widget.title === 'Panel position');
check(Boolean(row), 'native panel placement preference exists');
for (const [selected, expected] of [[0, 'left'], [2, 'right'], [1, 'center']]) {
    row.selected = selected;
    check(settings.get_string('panel-position') === expected, `native preference writes ${expected}`);
}
const about = widgets.find(widget => widget instanceof Adw.ActionRow && widget.title.includes('StudioDDx'));
check(about.title.includes('1.5'), 'About shows release version');
window.destroy();
print(`prefs: ${passed} native GTK assertions passed`);
