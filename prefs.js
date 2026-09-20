// Power & Token Tracker Preferences
const { Adw, Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

function init() {}

function buildPrefsWidget() {
    const settings = ExtensionUtils.getSettings();

    const frame = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_start: 24,
        margin_end: 24,
        margin_top: 24,
        margin_bottom: 24,
        spacing: 16
    });

    const title = new Gtk.Label({
        label: '<b>Power & Token Tracker Settings</b>',
        use_markup: true,
        halign: Gtk.Align.START
    });
    frame.append(title);

    const desc = new Gtk.Label({
        label: 'Track your GPU power consumption and calculate the cost per token for your AI usage.',
        halign: Gtk.Align.START,
        margin_bottom: 16
    });
    frame.append(desc);

    const costRow = buildSpinRow(settings, 'cost-per-kwh', 'Cost per kWh ($)', 0.01, 2.0, 0.01, 0.12);
    frame.append(costRow);

    const intervalRow = buildSpinRow(settings, 'update-interval', 'Update Interval (seconds)', 5, 120, 5, 10);
    frame.append(intervalRow);

    const showCostRow = buildSwitchRow(settings, 'show-cost-per-token', 'Show Cost per Token', 'Display the calculated cost per million tokens');
    frame.append(showCostRow);

    const urlRow = buildEntryRow(settings, 'hal0-url', 'hal0 API URL', 'http://localhost:8080');
    frame.append(urlRow);

    const infoBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 16,
        spacing: 8
    });

    const infoLabel = new Gtk.Label({
        label: '<b>How it works:</b>\n' +
               '• Monitors AMD GPU power via /sys/class/hwmon/hwmon6\n' +
               '• Fetches token metrics from hal0 API\n' +
               '• Calculates cost per token based on your electricity rate\n' +
               '• Panel shows: ⚡ [power]W\n' +
               '• Click for detailed stats and history',
        use_markup: true,
        halign: Gtk.Align.START,
        xalign: 0
    });
    infoBox.append(infoLabel);
    frame.append(infoBox);

    return frame;
}

function buildSpinRow(settings, key, title, min, max, step, value) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12
    });

    const label = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        xalign: 0,
        hexpand: true
    });
    row.append(label);

    const spin = Gtk.SpinButton.new_with_range(min, max, step);
    spin.set_value(settings.get_double(key));
    spin.connect('value-changed', (button) => {
        settings.set_double(key, button.get_value());
    });
    settings.connect(`changed::${key}`, () => {
        spin.set_value(settings.get_double(key));
    });
    row.append(spin);

    return row;
}

function buildSwitchRow(settings, key, title, subtitle) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12
    });

    const labelBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        halign: Gtk.Align.START,
        hexpand: true
    });

    const label = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        xalign: 0
    });
    labelBox.append(label);

    if (subtitle) {
        const subtitleLabel = new Gtk.Label({
            label: subtitle,
            halign: Gtk.Align.START,
            xalign: 0,
            use_markup: true
        });
        subtitleLabel.add_css_class('caption');
        labelBox.append(subtitleLabel);
    }

    row.append(labelBox);

    const switchBtn = new Gtk.Switch({
        active: settings.get_boolean(key)
    });
    switchBtn.connect('notify::active', (sw) => {
        settings.set_boolean(key, sw.get_active());
    });
    settings.connect(`changed::${key}`, () => {
        switchBtn.set_active(settings.get_boolean(key));
    });
    row.append(switchBtn);

    return row;
}

function buildEntryRow(settings, key, title, placeholder) {
    const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12
    });

    const label = new Gtk.Label({
        label: title,
        halign: Gtk.Align.START,
        xalign: 0,
        hexpand: true
    });
    row.append(label);

    const entry = new Gtk.Entry({
        text: settings.get_string(key),
        placeholder_text: placeholder,
        width_chars: 20
    });
    entry.connect('changed', (e) => {
        settings.set_string(key, e.get_text());
    });
    settings.connect(`changed::${key}`, () => {
        entry.set_text(settings.get_string(key));
    });
    row.append(entry);

    return row;
}

function initPreferences() {
    return buildPrefsWidget();
}
