/**
 * Compact Launcher – Preferences
 *
 * Settings window accessible via the GNOME Extensions app or through
 * the right-click context menu on the dock button.
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CompactLauncherPreferences extends ExtensionPreferences {

    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_default_size(620, 720);
        window.set_title(_('Compact Launcher'));

        // ── Page: Icons ───────────────────────────────────────────────────────
        const iconsPage = new Adw.PreferencesPage({
            title: _('Icons'),
            icon_name: 'applications-graphics-symbolic',
        });
        window.add(iconsPage);

        // ── How changes are applied (info notice) ─────────────────────────────
        const infoGroup = new Adw.PreferencesGroup();
        iconsPage.add(infoGroup);

        const infoRow = new Adw.ActionRow({
            title: _('How changes are applied'),
            subtitle: _(
                '• Icon spacing: applied immediately.\n' +
                '• Size, layout and filters: applied on the next launcher open.\n' +
                '• Log out and back in to ensure all changes take effect.'
            ),
            icon_name: 'dialog-information-symbolic',
        });
        infoGroup.add(infoRow);

        // Group: App tiles
        const tileGroup = new Adw.PreferencesGroup({
            title: _('App Tiles'),
            description: _('Size of each cell in the icon grid.'),
        });
        iconsPage.add(tileGroup);

        tileGroup.add(_makeSpinRow(
            _('Icon size (px)'),
            _('Size in pixels of the icon image inside each tile.'),
            settings, 'icon-size', 16, 128, 8
        ));
        tileGroup.add(_makeSpinRow(
            _('Tile width (px)'),
            _('Fixed width of each cell. Should be larger than the icon size.'),
            settings, 'cell-width', 48, 256, 8
        ));
        tileGroup.add(_makeSpinRow(
            _('Tile height (px)'),
            _('Minimum height of each cell (icon + label).'),
            settings, 'cell-height', 48, 256, 8
        ));

        // Group: Grid spacing
        const spacingGroup = new Adw.PreferencesGroup({
            title: _('Grid Spacing'),
            description: _('Gap between cells in the icon grid.'),
        });
        iconsPage.add(spacingGroup);

        spacingGroup.add(_makeSpinRow(
            _('Horizontal spacing (px)'),
            _('Gap between icon columns.'),
            settings, 'col-spacing', 0, 64, 2
        ));
        spacingGroup.add(_makeSpinRow(
            _('Vertical spacing (px)'),
            _('Gap between icon rows.'),
            settings, 'row-spacing', 0, 64, 2
        ));

        // Group: Dock
        const dockGroup = new Adw.PreferencesGroup({
            title: _('Dock Icon'),
        });
        iconsPage.add(dockGroup);

        dockGroup.add(_makeSpinRow(
            _('Dock icon size (px)'),
            _('Fallback size. The dock may override this value at runtime.'),
            settings, 'dock-icon-size', 16, 96, 8
        ));
        dockGroup.add(_makeComboRow(
            _('Button position in dock'),
            _('Where the launcher button appears in the dock. Takes effect after a logout/login.'),
            settings, 'dock-position',
            [
                {value: 'left',  label: _('Left (first)')},
                {value: 'right', label: _('Right (last)')},
            ]
        ));
        dockGroup.add(_makeSwitchRow(
            _('Hide default "Show Applications" button'),
            _('Hides the dock\'s built-in app launcher icon so only the Compact Launcher button is shown.'),
            settings, 'hide-show-apps-button'
        ));

        // Group: Animation
        const animGroup = new Adw.PreferencesGroup({
            title: _('Animation'),
        });
        iconsPage.add(animGroup);

        animGroup.add(_makeSpinRow(
            _('Animation duration (ms)'),
            _('Duration in milliseconds of the open/close animation. Set to 0 to disable.'),
            settings, 'animation-time', 0, 1000, 10
        ));

        // ── Page: Layout ──────────────────────────────────────────────────────
        const layoutPage = new Adw.PreferencesPage({
            title: _('Layout'),
            icon_name: 'view-grid-symbolic',
        });
        window.add(layoutPage);

        // Group: Popup size
        const sizeGroup = new Adw.PreferencesGroup({
            title: _('Popup Size'),
            description: _('Popup dimensions in pixels. Changes take effect on the next launcher open.'),
        });
        layoutPage.add(sizeGroup);

        sizeGroup.add(_makeSpinRow(
            _('Width (px)'),
            _('Popup width in pixels.'),
            settings, 'popup-width', 200, 3840, 10
        ));
        sizeGroup.add(_makeSpinRow(
            _('Max height (px)'),
            _('Maximum popup height in pixels. May be reduced further by the bottom gap setting.'),
            settings, 'popup-height', 200, 2160, 10
        ));
        sizeGroup.add(_makeSpinRow(
            _('Grid inset (px)'),
            _('Pixel inset subtracted from the popup area when fitting icon columns, preventing overflow at borders and scrollbar.'),
            settings, 'grid-margin-px', 0, 120, 2
        ));

        // Group: Position
        const posGroup = new Adw.PreferencesGroup({
            title: _('Popup Position'),
            description: _('Distance from monitor edges (e.g. 0.12 = 12%).'),
        });
        layoutPage.add(posGroup);

        posGroup.add(_makeDoubleSpinRow(
            _('Top gap (monitor fraction)'),
            _('Minimum distance from the top of the monitor. The popup grows upward from the bottom; this value prevents it from going too high. e.g. 0.12 = 12%.'),
            settings, 'top-fraction', 0.0, 0.5, 0.01
        ));
        posGroup.add(_makeDoubleSpinRow(
            _('Bottom gap (monitor fraction)'),
            _('Primary anchor: the popup bottom edge is placed here. e.g. 0.12 → 12% from the bottom of the monitor (above the dock).'),
            settings, 'bottom-fraction', 0.0, 0.5, 0.01
        ));

        // Group: Columns
        const colsGroup = new Adw.PreferencesGroup({
            title: _('Icon Columns'),
        });
        layoutPage.add(colsGroup);

        colsGroup.add(_makeSpinRow(
            _('Minimum columns'),
            _('Minimum number of columns, regardless of monitor size.'),
            settings, 'min-cols', 1, 20, 1
        ));
        colsGroup.add(_makeSpinRow(
            _('Maximum columns (0 = automatic)'),
            _('Caps the number of columns. With 0, the count is calculated automatically.'),
            settings, 'max-cols', 0, 20, 1
        ));

        // Group: Keyboard shortcut
        const shortcutGroup = new Adw.PreferencesGroup({
            title: _('Keyboard Shortcut'),
            description: _('Global shortcut to open and close the launcher.'),
        });
        layoutPage.add(shortcutGroup);

        shortcutGroup.add(_makeShortcutRow(
            _('Open launcher'),
            _('Press "Set", then the key combination. Backspace clears it.'),
            settings, 'toggle-launcher'
        ));

        // Reset button
        const resetGroup = new Adw.PreferencesGroup();
        layoutPage.add(resetGroup);

        const resetRow = new Adw.ActionRow({
            title: _('Reset to defaults'),
            subtitle: _('Restore all parameters to their original values.'),
        });
        const resetBtn = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetBtn.connect('clicked', () => _resetToDefaults(settings));
        resetRow.add_suffix(resetBtn);
        resetGroup.add(resetRow);

        // ── Page: Filters ─────────────────────────────────────────────────────
        const filtersPage = new Adw.PreferencesPage({
            title: _('Filters'),
            icon_name: 'edit-find-symbolic',
        });
        window.add(filtersPage);

        _buildHiddenAppsSection(filtersPage, settings);

        // ── Page: Donate ──────────────────────────────────────────────────────
        const donatePage = new Adw.PreferencesPage({
            title: _('Support'),
            icon_name: 'emblem-favorite-symbolic',
        });
        window.add(donatePage);

        _buildDonatePage(donatePage);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Creates an Adw.SpinRow bound to an integer GSettings key.
 */
function _makeSpinRow(title, subtitle, settings, key, min, max, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
        }),
    });
    settings.bind(key, row, 'value', 0 /* GET | SET */);
    return row;
}

/**
 * Creates an Adw.SwitchRow bound to a boolean GSettings key.
 */
function _makeSwitchRow(title, subtitle, settings, key) {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', 0 /* GET | SET */);
    return row;
}

/**
 * Creates an Adw.ComboRow bound to a string GSettings key.
 * @param {Array<{value:string, label:string}>} choices
 */
function _makeComboRow(title, subtitle, settings, key, choices) {
    const model = new Gtk.StringList();
    choices.forEach(c => model.append(c.label));

    const row = new Adw.ComboRow({title, subtitle, model});

    // Set initial selection
    const current = settings.get_string(key);
    const idx = choices.findIndex(c => c.value === current);
    if (idx >= 0) row.set_selected(idx);

    // Persist changes
    row.connect('notify::selected', () => {
        const selected = choices[row.get_selected()];
        if (selected) settings.set_string(key, selected.value);
    });

    // Keep in sync if changed externally
    settings.connect(`changed::${key}`, () => {
        const val = settings.get_string(key);
        const i = choices.findIndex(c => c.value === val);
        if (i >= 0 && row.get_selected() !== i) row.set_selected(i);
    });

    return row;
}

/**
 * Creates an Adw.SpinRow bound to a double GSettings key.
 * Displays two decimal places.
 */
function _makeDoubleSpinRow(title, subtitle, settings, key, min, max, step) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        digits: 2,
        adjustment: new Gtk.Adjustment({
            lower: min,
            upper: max,
            step_increment: step,
            page_increment: step * 5,
        }),
    });
    settings.bind(key, row, 'value', 0 /* GET | SET */);
    return row;
}

/**
 * Creates an Adw.ActionRow that displays and captures a keyboard shortcut
 * stored in an 'as' GSettings key (GNOME keybindings are string arrays).
 */
function _makeShortcutRow(title, subtitle, settings, key) {
    const row = new Adw.ActionRow({title, subtitle});

    const shortcutLabel = new Gtk.ShortcutLabel({
        valign: Gtk.Align.CENTER,
        disabled_text: _('Disabled'),
    });

    const syncLabel = () => {
        const val = settings.get_strv(key);
        shortcutLabel.set_accelerator(val.length > 0 ? val[0] : '');
    };
    syncLabel();
    settings.connect(`changed::${key}`, syncLabel);

    const setBtn = new Gtk.Button({
        label: _('Set'),
        valign: Gtk.Align.CENTER,
    });
    setBtn.connect('clicked', () => _captureShortcut(row, settings, key));

    row.add_suffix(shortcutLabel);
    row.add_suffix(setBtn);
    return row;
}

/**
 * Opens a modal dialog that captures the next key combination and stores it.
 * Escape cancels; Backspace clears the shortcut.
 */
function _captureShortcut(parentRow, settings, key) {
    const dialog = new Adw.Window({
        modal: true,
        transient_for: parentRow.get_root(),
        default_width: 420,
        default_height: 180,
    });

    const status = new Adw.StatusPage({
        title: _('Set Shortcut'),
        description: _('Press the desired combination.\nEsc to cancel · Backspace to clear.'),
        icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
    });
    dialog.set_content(status);

    const controller = new Gtk.EventControllerKey();
    controller.connect('key-pressed', (_c, keyval, keycode, state) => {
        const mask = state & Gtk.accelerator_get_default_mod_mask();

        if (keyval === Gdk.KEY_Escape && mask === 0) {
            dialog.close();
            return Gdk.EVENT_STOP;
        }
        if (keyval === Gdk.KEY_BackSpace && mask === 0) {
            settings.set_strv(key, []);
            dialog.close();
            return Gdk.EVENT_STOP;
        }

        // Ignore presses of modifier keys on their own.
        if (Gtk.accelerator_valid(keyval, mask)) {
            const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
            settings.set_strv(key, [accel]);
            dialog.close();
            return Gdk.EVENT_STOP;
        }

        return Gdk.EVENT_STOP;
    });
    dialog.add_controller(controller);

    dialog.present();
}

/**
 * Builds the "Hidden Apps" section inside the Filters page.
 *
 * Layout:
 *   ┌─ Hidden Apps ──────────────────────────────────────────────┐
 *   │ [entry row]  Add pattern…                          [apply] │
 *   │ [Logs]                                                 [🗑] │
 *   │ [Libre*]                                               [🗑] │
 *   └────────────────────────────────────────────────────────────┘
 *
 * The entry row stays at the top; pattern rows are appended below it
 * and rebuilt whenever the GSettings 'hidden-apps' key changes.
 */
function _buildHiddenAppsSection(page, settings) {
    const group = new Adw.PreferencesGroup({
        title: _('Hidden Apps'),
        description: _(
            'Enter an exact name or a wildcard pattern (*) to hide apps from the grid.\n' +
            'Examples: "Logs" hides the Logs app; "Libre*" hides the entire LibreOffice suite.'
        ),
    });
    page.add(group);

    // ── Entry row (always first) ──────────────────────────────────────────────
    const entryRow = new Adw.EntryRow({
        title: _('Add pattern (e.g. Logs, Libre*)'),
        show_apply_button: true,
    });
    group.add(entryRow);

    entryRow.connect('apply', () => {
        const text = entryRow.get_text().trim();
        if (!text) return;
        const current = settings.get_strv('hidden-apps');
        if (!current.includes(text))
            settings.set_strv('hidden-apps', [...current, text]);
        entryRow.set_text('');
    });

    // ── Dynamic pattern rows (rebuilt on every settings change) ───────────────
    const patternRows = [];

    function syncRows() {
        for (const r of patternRows)
            group.remove(r);
        patternRows.length = 0;

        for (const pattern of settings.get_strv('hidden-apps')) {
            const row = new Adw.ActionRow({title: pattern});

            const delBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                tooltip_text: _('Remove'),
            });
            delBtn.connect('clicked', () => {
                const cur = settings.get_strv('hidden-apps');
                settings.set_strv('hidden-apps', cur.filter(p => p !== pattern));
            });

            row.add_suffix(delBtn);
            row.set_activatable_widget(delBtn);
            group.add(row);
            patternRows.push(row);
        }
    }

    syncRows();
    settings.connect('changed::hidden-apps', syncRows);
}

/**
 * Builds the donation page using an Adw.StatusPage as the centrepiece.
 * The "Buy me a coffee" button opens buymeacoffee.com/Gilsonf in the
 * default browser via Gio.AppInfo.launch_default_for_uri().
 */
function _buildDonatePage(page) {
    const DONATE_URL = 'https://www.buymeacoffee.com/Gilsonf';

    // ── Status page (hero area) ───────────────────────────────────────────────
    const status = new Adw.StatusPage({
        title: _('Support Compact Launcher'),
        description: _(
            'Compact Launcher is free and open source, built and\n' +
            'maintained in spare time. If it has made your GNOME\n' +
            'desktop a little better, a coffee goes a long way! ☕'
        ),
        icon_name: 'emblem-favorite-symbolic',
        vexpand: true,
    });

    // ── Donate button ─────────────────────────────────────────────────────────
    const donateBtn = new Gtk.Button({
        label: _('☕  Buy me a coffee'),
        halign: Gtk.Align.CENTER,
        css_classes: ['suggested-action', 'pill'],
        margin_top: 8,
    });
    donateBtn.connect('clicked', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(DONATE_URL, null);
        } catch (e) {
            console.error('[CompactLauncher] Could not open donation URL', e);
        }
    });

    // ── "No pressure" note ────────────────────────────────────────────────────
    const noteLabel = new Gtk.Label({
        label: _('No account needed · Secure payment via Buy Me a Coffee'),
        halign: Gtk.Align.CENTER,
        margin_top: 12,
        css_classes: ['dim-label', 'caption'],
    });

    // Wrap in a box and attach to the status page child slot
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        halign: Gtk.Align.CENTER,
    });
    box.append(donateBtn);
    box.append(noteLabel);
    status.set_child(box);

    // ── Group: other ways to help ─────────────────────────────────────────────
    const helpGroup = new Adw.PreferencesGroup({
        title: _('Other ways to help'),
        margin_top: 0,
    });

    const githubRow = new Adw.ActionRow({
        title: _('Star the project on GitHub'),
        subtitle: _('Visibility helps the extension reach more users.'),
        activatable: true,
    });
    githubRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    githubRow.connect('activated', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(
                'https://github.com/gilson-fonsaca/compact-launcher', null);
        } catch (e) {}
    });

    const bugRow = new Adw.ActionRow({
        title: _('Report a bug or suggest a feature'),
        subtitle: _('Open an issue on the GitHub repository.'),
        activatable: true,
    });
    bugRow.add_suffix(new Gtk.Image({icon_name: 'go-next-symbolic'}));
    bugRow.connect('activated', () => {
        try {
            Gio.AppInfo.launch_default_for_uri(
                'https://github.com/gilson-fonsaca/compact-launcher/issues', null);
        } catch (e) {}
    });

    helpGroup.add(githubRow);
    helpGroup.add(bugRow);

    // ── Layout: status page + help group inside a scrollable preferences page ─
    // Adw.PreferencesPage uses a Gtk.ScrolledWindow internally, so we add a
    // wrapping group that contains the status page as a custom widget.
    const heroGroup = new Adw.PreferencesGroup();

    // Adw.PreferencesGroup.add() expects a Gtk.Widget; StatusPage qualifies.
    heroGroup.add(status);

    page.add(heroGroup);
    page.add(helpGroup);
}

/**
 * Resets all settings keys to their schema-defined defaults.
 */
function _resetToDefaults(settings) {
    const keys = [
        'animation-time',
        'icon-size', 'cell-width', 'cell-height',
        'col-spacing', 'row-spacing',
        'dock-icon-size',
        'popup-width', 'popup-height', 'grid-margin-px',
        'top-fraction', 'bottom-fraction',
        'min-cols', 'max-cols',
        'hide-show-apps-button', 'dock-position',
        'hidden-apps',
        'toggle-launcher',
    ];
    for (const key of keys)
        settings.reset(key);
}
