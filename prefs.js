// Power & Token Tracker Preferences

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class PowerTokenTrackerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Tracking',
            description: 'Track your GPU power consumption and calculate the cost per token for your AI usage.',
        });
        page.add(group);

        const startRow = new Adw.SwitchRow({
            title: 'Start Tracking on Login',
            subtitle: 'When off, the indicator starts paused; start it from its menu',
        });
        group.add(startRow);
        settings.bind('start-on-login', startRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const costRow = new Adw.SpinRow({
            title: 'Cost per kWh ($)',
            subtitle: 'Your electricity rate',
            adjustment: new Gtk.Adjustment({
                lower: 0.01,
                upper: 2.0,
                step_increment: 0.01,
                page_increment: 0.1,
            }),
            digits: 3,
        });
        group.add(costRow);
        settings.bind('cost-per-kwh', costRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const intervalRow = new Adw.SpinRow({
            title: 'Update Interval (seconds)',
            subtitle: 'How often power and token data refresh',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 120,
                step_increment: 5,
                page_increment: 10,
            }),
        });
        group.add(intervalRow);
        settings.bind('update-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);

        const showCostRow = new Adw.SwitchRow({
            title: 'Show Cost per Token',
            subtitle: 'Display the calculated cost per million tokens',
        });
        group.add(showCostRow);
        settings.bind('show-cost-per-token', showCostRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        const urlRow = new Adw.EntryRow({title: 'hal0 API URL'});
        group.add(urlRow);
        settings.bind('hal0-url', urlRow, 'text', Gio.SettingsBindFlags.DEFAULT);

        const infoGroup = new Adw.PreferencesGroup({title: 'How it works'});
        page.add(infoGroup);
        infoGroup.add(new Gtk.Label({
            label: '• Monitors GPU power via /sys/class/hwmon (located by driver name)\n' +
                   '• Fetches token metrics from the hal0 API (1 hour rolling window)\n' +
                   '• Calculates cost per million tokens from your electricity rate\n' +
                   '• Panel shows: ⚡ [power]W — click for detailed stats',
            halign: Gtk.Align.START,
            xalign: 0,
            margin_top: 12,
            margin_bottom: 12,
            margin_start: 12,
            margin_end: 12,
            wrap: true,
        }));
    }
}
