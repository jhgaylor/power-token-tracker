// Power & Token Tracker GNOME Shell Extension
// Tracks GPU power consumption and AI token costs

const { Gio, GLib, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

class PowerTokenTracker {
    constructor() {
        this._settings = ExtensionUtils.getSettings();
        this._indicator = null;
        this._updateTimeoutId = null;
        this._totalTokens = 0;
        this._powerHistory = [];
        this._maxHistoryPoints = 360;
    }

    enable() {
        this._indicator = new PanelMenu.Button(0.0, 'Power & Token Tracker', false);
        this._label = new St.Label({ text: '⚡ --W' });
        this._indicator.add_child(this._label);
        Main.panel.addToStatusArea('PowerTokenTracker', this._indicator, 1, 'right');

        this._menu = new PopupMenu.PopupMenu(this._indicator, 0.5, St.Side.BOTTOM);
        this._indicator.add_child(this._menu.actor);

        this._powerItem = new PopupMenu.PopupMenuItem('Power: -- W');
        this._tokenItem = new PopupMenu.PopupMenuItem('Tokens (1h): --');
        this._costPerTokenItem = new PopupMenu.PopupMenuItem('Cost/M Tokens: --');
        this._avgPowerItem = new PopupMenu.PopupMenuItem('Avg Power: -- W');
        this._energyCostItem = new PopupMenu.PopupMenuItem('Energy Cost/Hr: --');
        this._settingsItem = new PopupMenu.PopupMenuItem('⚙️ Configure');

        this._menu.addMenuItem(this._powerItem);
        this._menu.addMenuItem(this._tokenItem);
        this._menu.addMenuItem(this._costPerTokenItem);
        this._menu.addMenuItem(this._avgPowerItem);
        this._menu.addMenuItem(this._energyCostItem);
        this._menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menu.addMenuItem(this._settingsItem);

        this._settingsItem.connect('activate', () => {
            this._openSettings();
        });

        this._startUpdates();
        this._update();
    }

    disable() {
        if (this._updateTimeoutId) {
            GLib.source_remove(this._updateTimeoutId);
            this._updateTimeoutId = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        this._settings = null;
    }

    _startUpdates() {
        const interval = this._settings.get_int('update-interval');
        this._updateTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._update();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _readPower() {
        try {
            const powerFile = '/sys/class/hwmon/hwmon6/power1_average';
            const [success, contents] = GLib.file_get_contents(powerFile);
            if (success) {
                const watts = parseFloat(GLib.UTF8_TO_STRING_TRIMMED(contents)) / 1_000_000;
                return watts;
            }
        } catch (e) {
            log(`Error reading power: ${e.message}`);
        }
        return 0;
    }

    _fetchTokenMetrics(callback) {
        const baseUrl = this._settings.get_string('hal0-url');
        const uri = `${baseUrl}/api/stats`;
        const file = Gio.File.new_for_uri(uri);
        const cancellable = new Gio.Cancellable();

        file.load_contents_async(cancellable, (source, res) => {
            try {
                const [success, contents] = source.load_contents_finish(res);
                const json = JSON.parse(GLib.UTF8_TO_STRING_TRIMMED(contents));
                callback(json.totals?.tokens_completed || 0);
            } catch (e) {
                log(`Error fetching token metrics: ${e.message}`);
                callback(0);
            }
        });
    }

    _update() {
        const power = this._readPower();
        this._powerHistory.push(power);
        if (this._powerHistory.length > this._maxHistoryPoints) {
            this._powerHistory.shift();
        }

        this._fetchTokenMetrics((totalTokens) => {
            const newTokens = totalTokens - this._totalTokens;
            this._totalTokens = totalTokens;

            const avgPower = this._powerHistory.reduce((sum, p) => sum + p, 0) / this._powerHistory.length;
            const costPerKwh = this._settings.get_double('cost-per-kwh');
            const energyPerHour = avgPower / 1000;
            const costPerHour = energyPerHour * costPerKwh;
            const costPerMillionTokens = newTokens > 0 ? (costPerHour / newTokens) * 1_000_000 : 0;

            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                try {
                    this._label.text = `⚡ ${power.toFixed(0)}W`;
                    this._powerItem.label = `Current Power: ${power.toFixed(1)} W`;
                    this._tokenItem.label = `Tokens (1h): ${totalTokens.toLocaleString()} (+${newTokens.toLocaleString()})`;
                    this._avgPowerItem.label = `Avg Power: ${avgPower.toFixed(1)} W`;
                    this._energyCostItem.label = `Energy Cost/Hr: $${costPerHour.toFixed(4)}`;

                    if (this._settings.get_boolean('show-cost-per-token')) {
                        this._costPerTokenItem.label = `Cost/M Tokens: $${costPerMillionTokens.toFixed(4)}`;
                    } else {
                        this._costPerTokenItem.label = 'Cost/M Tokens: --';
                    }
                } catch (e) {
                    log(`Error updating UI: ${e.message}`);
                }
                return GLib.SOURCE_REMOVE;
            });
        });

        return GLib.SOURCE_CONTINUE;
    }

    _openSettings() {
        GLib.spawn_command_line_sync('gnome-extensions prefs power-token-tracker@jhgaylor.local');
    }
}

let powerTokenTracker;

function init() {
    return new PowerTokenTracker();
}

function enable() {
    powerTokenTracker = new PowerTokenTracker();
    powerTokenTracker.enable();
}

function disable() {
    powerTokenTracker.disable();
    powerTokenTracker = null;
}
