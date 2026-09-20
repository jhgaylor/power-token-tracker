// Power & Token Tracker GNOME Shell Extension
// Tracks GPU power consumption and AI token costs

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const HWMON_DIR = '/sys/class/hwmon';
const DECODER = new TextDecoder();

// hwmon indices are not stable across boots, so locate the GPU by driver name.
function findGpuPowerFile() {
    const names = ['amdgpu', 'nvidia', 'i915', 'xe'];
    const dir = Gio.File.new_for_path(HWMON_DIR);

    let entries;
    try {
        entries = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    } catch (e) {
        console.error(`power-token-tracker: cannot enumerate ${HWMON_DIR}: ${e.message}`);
        return null;
    }

    let info;
    while ((info = entries.next_file(null)) !== null) {
        const path = GLib.build_filenamev([HWMON_DIR, info.get_name()]);
        let name;
        try {
            const [ok, contents] = GLib.file_get_contents(GLib.build_filenamev([path, 'name']));
            if (!ok)
                continue;
            name = DECODER.decode(contents).trim();
        } catch (e) {
            continue;
        }

        if (!names.includes(name))
            continue;

        for (const attr of ['power1_average', 'power1_input']) {
            const file = GLib.build_filenamev([path, attr]);
            if (GLib.file_test(file, GLib.FileTest.EXISTS))
                return file;
        }
    }

    return null;
}

const PowerTokenIndicator = GObject.registerClass(
class PowerTokenIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Power & Token Tracker', false);

        this._extension = extension;
        this._settings = extension.getSettings();
        this._session = new Soup.Session({timeout: 5});
        this._cancellable = new Gio.Cancellable();
        this._updateTimeoutId = 0;
        this._powerFile = findGpuPowerFile();
        this._powerHistory = [];
        this._maxHistoryPoints = 360;

        this._label = new St.Label({
            text: '⚡ --W',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this._powerItem = new PopupMenu.PopupMenuItem('Current Power: -- W');
        this._tokenItem = new PopupMenu.PopupMenuItem('Tokens (1h): --');
        this._costPerTokenItem = new PopupMenu.PopupMenuItem('Cost/M Tokens: --');
        this._avgPowerItem = new PopupMenu.PopupMenuItem('Avg Power: -- W');
        this._energyCostItem = new PopupMenu.PopupMenuItem('Energy Cost/Hr: --');

        for (const item of [this._powerItem, this._tokenItem, this._costPerTokenItem,
                            this._avgPowerItem, this._energyCostItem]) {
            item.sensitive = false;
            this.menu.addMenuItem(item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const settingsItem = new PopupMenu.PopupMenuItem('⚙️ Configure');
        settingsItem.connect('activate', () => extension.openPreferences());
        this.menu.addMenuItem(settingsItem);

        this._settings.connect('changed::update-interval', () => this._restartUpdates());
        this._restartUpdates();
        this._update();
    }

    _restartUpdates() {
        if (this._updateTimeoutId) {
            GLib.source_remove(this._updateTimeoutId);
            this._updateTimeoutId = 0;
        }

        const interval = this._settings.get_int('update-interval');
        this._updateTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _readPower() {
        if (!this._powerFile)
            return 0;

        try {
            const [ok, contents] = GLib.file_get_contents(this._powerFile);
            if (!ok)
                return 0;
            // hwmon reports microwatts.
            return parseFloat(DECODER.decode(contents).trim()) / 1_000_000;
        } catch (e) {
            console.error(`power-token-tracker: error reading power: ${e.message}`);
            return 0;
        }
    }

    _fetchTokenMetrics(callback) {
        const baseUrl = this._settings.get_string('hal0-url').replace(/\/+$/, '');
        let message;
        try {
            message = Soup.Message.new('GET', `${baseUrl}/api/stats`);
        } catch (e) {
            callback(null);
            return;
        }

        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this._cancellable, (session, res) => {
            try {
                const bytes = session.send_and_read_finish(res);
                if (message.get_status() !== Soup.Status.OK)
                    throw new Error(`HTTP ${message.get_status()}`);

                const json = JSON.parse(DECODER.decode(bytes.get_data()));
                callback(json.totals?.tokens_completed ?? null);
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.error(`power-token-tracker: error fetching token metrics: ${e.message}`);
                callback(null);
            }
        });
    }

    _update() {
        const power = this._readPower();
        this._powerHistory.push(power);
        if (this._powerHistory.length > this._maxHistoryPoints)
            this._powerHistory.shift();

        const avgPower = this._powerHistory.reduce((sum, p) => sum + p, 0) / this._powerHistory.length;
        const costPerKwh = this._settings.get_double('cost-per-kwh');
        const costPerHour = (avgPower / 1000) * costPerKwh;

        this._label.text = `⚡ ${power.toFixed(0)}W`;
        this._powerItem.label.text = `Current Power: ${power.toFixed(1)} W`;
        this._avgPowerItem.label.text = `Avg Power: ${avgPower.toFixed(1)} W`;
        this._energyCostItem.label.text = `Energy Cost/Hr: $${costPerHour.toFixed(4)}`;

        this._fetchTokenMetrics(tokensPerHour => {
            if (tokensPerHour === null) {
                this._tokenItem.label.text = 'Tokens (1h): unavailable';
                this._costPerTokenItem.label.text = 'Cost/M Tokens: --';
                return;
            }

            this._tokenItem.label.text = `Tokens (1h): ${tokensPerHour.toLocaleString()}`;

            if (!this._settings.get_boolean('show-cost-per-token')) {
                this._costPerTokenItem.label.text = 'Cost/M Tokens: --';
                return;
            }

            // hal0 reports a rolling 1h window, so tokens/hour pairs directly with $/hour.
            const costPerMillionTokens = tokensPerHour > 0
                ? (costPerHour / tokensPerHour) * 1_000_000
                : 0;
            this._costPerTokenItem.label.text = tokensPerHour > 0
                ? `Cost/M Tokens: $${costPerMillionTokens.toFixed(4)}`
                : 'Cost/M Tokens: idle';
        });
    }

    destroy() {
        if (this._updateTimeoutId) {
            GLib.source_remove(this._updateTimeoutId);
            this._updateTimeoutId = 0;
        }
        this._cancellable.cancel();
        this._session.abort();
        this._session = null;
        this._settings = null;
        this._extension = null;
        super.destroy();
    }
});

export default class PowerTokenTrackerExtension extends Extension {
    enable() {
        this._indicator = new PowerTokenIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'right');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
