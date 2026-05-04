/**
 * Compact Launcher – GNOME Shell Extension
 *
 * Opens a floating popup showing all installed applications in a scrollable
 * icon grid. No search bar — just scroll and click to launch.
 *
 * Compatible with GNOME Shell 47+, Wayland, dark/light themes.
 * Settings are managed via GSettings (see prefs.js and the schemas/ folder).
 */

import St from 'gi://St';
import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// ── Default values (used only when GSettings is unavailable) ─────────────────
// All these values are now stored in GSettings and editable via the
// preferences window.  The constants below are kept solely as documentation.
//
//   animation-time         = 180   ms
//   icon-size              = 64    px
//   cell-width             = 104   px
//   cell-height            = 112   px
//   dock-icon-size         = 48    px
//   col-spacing            = 0     px
//   row-spacing            = 0     px
//   popup-width            = 960   px
//   popup-height           = 864   px
//   grid-margin-px         = 20    px
//   top-fraction           = 0.12
//   bottom-fraction        = 0.12
//   min-cols               = 4
//   max-cols               = 0     (0 = automatic)

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if `name` matches the glob `pattern` (case-insensitive).
 * Only `*` is treated as a wildcard (matches any sequence of characters).
 * Exact comparison is used when the pattern contains no `*`.
 */
function _matchesGlob(name, pattern) {
    const p = pattern.trim();
    if (!p) return false;
    if (!p.includes('*'))
        return name.toLowerCase() === p.toLowerCase();
    // Escape all regex special chars except *, then replace * with .*
    const reStr = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try {
        return new RegExp(`^${reStr}$`, 'i').test(name);
    } catch (_e) {
        return false;
    }
}

// ── AppIcon ───────────────────────────────────────────────────────────────────

/**
 * One application tile: icon + label, with a subtle hover zoom.
 */
const AppIcon = GObject.registerClass(
class CompactLauncherAppIcon extends St.Button {

    // appInfo   : Gio.AppInfo (GDesktopAppInfo)
    // iconSize  : px – image size from GSettings 'icon-size'
    // cellWidth : px – tile width  from GSettings 'cell-width'
    // cellHeight: px – tile height from GSettings 'cell-height'
    _init(appInfo, iconSize, cellWidth, cellHeight) {
        super._init({
            style_class: 'compact-launcher-app-icon',
            can_focus: true,
            reactive: true,
            track_hover: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            // Tile dimensions come from GSettings so changing them in the
            // preferences window is reflected immediately on next open().
            style: `min-width: ${cellWidth}px; max-width: ${cellWidth}px; min-height: ${cellHeight}px;`,
        });

        this.appInfo = appInfo;

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.set_child(box);

        // ── Icon ──────────────────────────────────────────────────────────────
        const iconBin = new St.Bin({x_align: Clutter.ActorAlign.CENTER});
        const icon = new St.Icon({
            gicon: appInfo.get_icon() ?? null,
            icon_size: iconSize,
            fallback_icon_name: 'application-x-executable',
        });
        iconBin.set_child(icon);
        box.add_child(iconBin);

        // ── Label ─────────────────────────────────────────────────────────────
        const label = new St.Label({
            text: appInfo.get_name() || appInfo.get_id() || '',
            style_class: 'compact-launcher-app-label',
            x_align: Clutter.ActorAlign.CENTER,
        });
        // Wrap at word boundaries; ellipsize only if a single word is still too long.
        label.clutter_text.set_line_wrap(true);
        label.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD);
        label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
        box.add_child(label);

        // ── Hover zoom ────────────────────────────────────────────────────────
        this.connect('notify::hover', () => {
            this.ease({
                scale_x: this.hover ? 1.13 : 1.0,
                scale_y: this.hover ? 1.13 : 1.0,
                duration: 120,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
    }
});

// ── CompactLauncherPopup ──────────────────────────────────────────────────────

/**
 * The main popup: a scrollable grid of all installed apps.
 *
 * Design deliberately has no search bar — the user scrolls the alphabetically
 * sorted grid and clicks the desired icon to launch it.
 *
 * Architecture hooks for future additions
 * ────────────────────────────────────────
 * - Search         : add an St.Entry above _scrollView in _buildUI()
 * - Favourite row  : insert a horizontal strip above _scrollView
 * - App folders    : replace AppIcon with a FolderIcon subclass
 * - Categories     : add a sidebar filter beside the grid
 * - Drag-and-drop  : connect 'drag-begin'/'drag-end' on AppIcon
 */
class CompactLauncherPopup {

    constructor(settings) {
        this._settings          = settings;
        this._isOpen            = false;
        this._keyPressId        = null;
        this._appIcons          = [];
        this._iconConnections   = [];
        this._focusIndex        = -1;
        this._appsLoaded        = false;
        this._appSystemId       = null;
        this._settingsChangedId = null;
        this._overlayPressId    = null;
        this._popupPressId      = null;
        this._currentAppsPerRow = 6;   // default; recalculated on open()

        this._buildUI();

        // Reload the grid whenever apps are installed or uninstalled.
        const appSystem = Shell.AppSystem.get_default();
        this._appSystemId = appSystem.connect('installed-changed', () => {
            this._appsLoaded = false;
            this._loadApps();
        });

        // React to settings changes: update spacing immediately and force
        // a full icon rebuild on next open() for size-related changes.
        this._settingsChangedId = this._settings.connect('changed', (_s, key) => {
            if (key === 'col-spacing')
                this._gridBox.layout_manager.column_spacing = this._settings.get_int('col-spacing');
            else if (key === 'row-spacing')
                this._gridBox.layout_manager.row_spacing = this._settings.get_int('row-spacing');
            else
                this._appsLoaded = false;  // force rebuild on next open()
        });

        // Gio.AppInfo.get_all() is ready immediately — no timing issues.
        this._loadApps();
    }

    // ── UI construction ───────────────────────────────────────────────────────

    _buildUI() {
        // Transparent full-screen overlay – clicking it closes the popup.
        // Starts non-reactive; made reactive with a 150 ms delay after open()
        // so the click that triggered open() cannot immediately close it.
        this._overlay = new St.Widget({
            reactive: false,
            style_class: 'compact-launcher-overlay',
        });
        this._overlayPressId = this._overlay.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });

        // ── Popup box ─────────────────────────────────────────────────────────
        // popup-menu-content provides a theme-aware background automatically.
        this._popup = new St.BoxLayout({
            style_class: 'popup-menu-content compact-launcher',
            vertical: true,
            reactive: true,
            track_hover: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
            // width set dynamically in open() based on monitor size
        });
        // Prevent clicks inside the popup from propagating to the overlay
        this._popupPressId = this._popup.connect('button-press-event', () => Clutter.EVENT_STOP);

        // ── Scroll view ───────────────────────────────────────────────────────
        this._scrollView = new St.ScrollView({
            style_class: 'compact-launcher-scroll',
            enable_mouse_scrolling: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._popup.add_child(this._scrollView);

        // ── Grid ──────────────────────────────────────────────────────────────
        this._gridBox = new St.Widget({
            style_class: 'compact-launcher-grid',
            layout_manager: new Clutter.GridLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                column_spacing: this._settings.get_int('col-spacing'),
                row_spacing:    this._settings.get_int('row-spacing'),
            }),
            x_expand: true,
        });

        // St.ScrollView requires a StScrollable direct child; St.BoxLayout qualifies.
        this._gridViewport = new St.BoxLayout({
            vertical: true,
            x_expand: true,
        });
        this._gridViewport.add_child(this._gridBox);
        this._scrollView.set_child(this._gridViewport);
    }

    // ── App loading ───────────────────────────────────────────────────────────

    _disconnectIconSignals() {
        for (const {icon, pressId, focusId} of this._iconConnections) {
            try {
                icon.disconnect(pressId);
                icon.disconnect(focusId);
            } catch (_e) {}
        }
        this._iconConnections = [];
    }

    _loadApps() {
        this._disconnectIconSignals();
        this._gridBox.remove_all_children();
        this._appIcons  = [];
        this._focusIndex = -1;

        try {
            // Gio.AppInfo.get_all() returns GDesktopAppInfo objects directly —
            // no Shell.AppSystem timing issues, names/icons are always available.
            const raw = Gio.AppInfo.get_all();
            log(`[CompactLauncher] Gio.AppInfo.get_all() = ${raw.length} apps`);

            const hiddenPatterns = this._settings.get_strv('hidden-apps')
                .map(p => p.trim()).filter(p => p.length > 0);

            const apps = raw
                .filter(info => {
                    try {
                        if (!info.should_show()) return false;
                        if (hiddenPatterns.length > 0) {
                            const name = info.get_name() ?? '';
                            if (hiddenPatterns.some(p => _matchesGlob(name, p)))
                                return false;
                        }
                        return true;
                    } catch (_e) {
                        return false;
                    }
                })
                .sort((a, b) =>
                    (a.get_name() ?? '').localeCompare(b.get_name() ?? ''));

            log(`[CompactLauncher] after filter: ${apps.length} apps`);
            this._appsLoaded = true;

            const cols       = this._currentAppsPerRow;
            const iconSize   = this._settings.get_int('icon-size');
            const cellWidth  = this._settings.get_int('cell-width');
            const cellHeight = this._settings.get_int('cell-height');
            apps.forEach((info, i) => {
                const icon = new AppIcon(info, iconSize, cellWidth, cellHeight);
                // button-press-event fires instantly and reliably; 'clicked'
                // (which needs press+release) can be blocked by parent containers.
                const pressId = icon.connect('button-press-event', (_a, ev) => {
                    if (ev.get_button() === 1) {
                        this._launchApp(info);
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                });
                const focusId = icon.connect('key-focus-in', () => { this._focusIndex = i; });
                this._iconConnections.push({icon, pressId, focusId});
                this._gridBox.layout_manager.attach(icon, i % cols, Math.floor(i / cols), 1, 1);
                this._appIcons.push(icon);
            });
        } catch (e) {
            log(`[CompactLauncher] _loadApps error: ${e}`);
        }
    }

    _launchApp(appInfo) {
        const shellApp = Shell.AppSystem.get_default().lookup_app(appInfo.get_id());
        if (shellApp && shellApp.get_state() !== Shell.AppState.STOPPED)
            shellApp.activate();
        else
            appInfo.launch([], null);

        this.close();
        if (Main.overview.visible)
            Main.overview.hide();
    }

    // Re-lay out the app grid whenever the column count changes
    _relayoutApps(appsPerRow) {
        if (appsPerRow === this._currentAppsPerRow && this._appIcons.length > 0)
            return;
        this._currentAppsPerRow = appsPerRow;
        // Remove all children and re-attach with new column count
        this._gridBox.remove_all_children();
        this._appIcons.forEach((icon, i) => {
            this._gridBox.layout_manager.attach(icon, i % appsPerRow, Math.floor(i / appsPerRow), 1, 1);
        });
    }

    // ── Keyboard navigation ───────────────────────────────────────────────────

    _moveFocus(delta) {
        const count = this._appIcons.length;
        if (count === 0) return;

        const next = this._focusIndex < 0
            ? (delta >= 0 ? 0 : count - 1)
            : Math.max(0, Math.min(count - 1, this._focusIndex + delta));

        if (next !== this._focusIndex || this._focusIndex < 0) {
            this._focusIndex = next;
            this._appIcons[next].grab_key_focus();
        }
    }

    _onKeyPress(_stage, event) {
        const sym = event.get_key_symbol();

        switch (sym) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;

        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter: {
            const idx = this._focusIndex >= 0 ? this._focusIndex : 0;
            if (this._appIcons[idx])
                this._launchApp(this._appIcons[idx].appInfo);
            return Clutter.EVENT_STOP;
        }

        case Clutter.KEY_Right:
            this._moveFocus(1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Left:
            this._moveFocus(-1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
            this._moveFocus(this._currentAppsPerRow);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
            this._moveFocus(-this._currentAppsPerRow);
            return Clutter.EVENT_STOP;

        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    // ── Open / Close ──────────────────────────────────────────────────────────

    open() {
        if (this._isOpen) return;

        // Belt-and-suspenders: load apps if still empty (e.g. signal never fired)
        if (!this._appsLoaded || this._appIcons.length === 0)
            this._loadApps();

        this._isOpen    = true;
        this._focusIndex = -1;

        // Stop any in-flight close animation so its onComplete does not remove
        // the popup from the stage after we just re-added it.
        this._popup.remove_all_transitions();
        this._overlay.remove_all_transitions();

        // Use the monitor under the current pointer position
        let monitor;
        try {
            const [px, py] = global.get_pointer();
            monitor = Main.layoutManager.monitors.find(
                m => px >= m.x && px < m.x + m.width &&
                     py >= m.y && py < m.y + m.height)
                ?? Main.layoutManager.primaryMonitor;
        } catch (_e) {
            monitor = Main.layoutManager.primaryMonitor;
        }

        // ── Layout parameters — all read from GSettings ───────────────────────
        const popupW      = this._settings.get_int('popup-width');
        const popupH      = this._settings.get_int('popup-height');
        const MARGIN_PX   = this._settings.get_int('grid-margin-px');
        const TOP_FRAC    = this._settings.get_double('top-fraction');
        const BOTTOM_FRAC = this._settings.get_double('bottom-fraction');
        const MIN_COLS    = this._settings.get_int('min-cols');
        const MAX_COLS    = this._settings.get_int('max-cols');
        const CELL_WIDTH  = this._settings.get_int('cell-width');
        // ─────────────────────────────────────────────────────────────────────

        // Maximum height before hitting the bottom safety gap.
        const availableH = Math.floor(monitor.height * (1 - TOP_FRAC - BOTTOM_FRAC));
        // scrollMaxH: whichever is smaller — the configured pixel height or the
        // available space between the top position and the bottom margin.
        const scrollMaxH = Math.min(popupH - MARGIN_PX, availableH);

        // Column count uses the grid area (popup minus inset) so icons never
        // overflow the popup border or overlap the scrollbar.
        // The result is always reduced by 1 extra column as a safety buffer.
        // When MAX_COLS = 0 the upper cap is skipped (fully automatic).
        const gridW      = popupW - MARGIN_PX;
        const rawCols    = Math.max(MIN_COLS, Math.floor(gridW / CELL_WIDTH) - 1);
        const appsPerRow = MAX_COLS > 0 ? Math.min(MAX_COLS, rawCols) : rawCols;

        log(`[CompactLauncher] open() monitor=${monitor.index} popupW=${popupW} gridW=${gridW} appsPerRow=${appsPerRow} scrollMaxH=${scrollMaxH}`);

        try {
            this._popup.set_width(popupW);
            this._scrollView.set_style(`max-height: ${scrollMaxH - 32}px;`);
            this._relayoutApps(appsPerRow);
        } catch (e) {
            log(`[CompactLauncher] open() layout error: ${e}`);
        }

        // Cover the entire stage (all monitors) so a click on any monitor
        // — including secondary monitors — dismisses the popup.
        this._overlay.set_size(global.stage.width, global.stage.height);
        this._overlay.set_position(0, 0);
        this._overlay.set_reactive(false); // activated after 150 ms delay

        if (!this._overlay.get_parent())
            Main.uiGroup.add_child(this._overlay);
        if (!this._popup.get_parent())
            Main.uiGroup.add_child(this._popup);

        // Raise to top so the popup appears above the dock and overview
        Main.uiGroup.set_child_above_sibling(this._overlay, null);
        Main.uiGroup.set_child_above_sibling(this._popup, null);

        // Horizontal: centred on the monitor.
        // Vertical: anchor the popup BOTTOM at the BOTTOM_FRAC line (near the dock).
        //   scrollMaxH ≈ total popup height because the scrollView is set to
        //   (scrollMaxH − 32) and the popup CSS padding is 16 px top + 16 px bottom.
        // TOP_FRAC acts as a minimum top gap: if the popup would extend above it
        //   (e.g. it is taller than the available space), clamp it downward.
        const bottomEdgeY = monitor.y + Math.floor(monitor.height * (1 - BOTTOM_FRAC));
        const popupTopY   = Math.max(
            monitor.y + Math.floor(monitor.height * TOP_FRAC),
            bottomEdgeY - scrollMaxH
        );
        this._popup.set_position(
            monitor.x + Math.floor((monitor.width - popupW) / 2),
            popupTopY
        );

        // ── Animate in ────────────────────────────────────────────────────────
        this._popup.set_opacity(0);
        this._popup.set_scale(0.88, 0.88);
        this._popup.ease({
            opacity: 255,
            scale_x: 1.0,
            scale_y: 1.0,
            duration: this._settings.get_int('animation-time'),
            mode: Clutter.AnimationMode.EASE_OUT_BACK,
        });
        this._overlay.set_opacity(0);
        this._overlay.ease({
            opacity: 255,
            duration: this._settings.get_int('animation-time'),
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Enable overlay click-to-close only after 150 ms so the button-press
        // that triggered open() cannot bubble through and close it instantly.
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            if (this._isOpen) this._overlay.set_reactive(true);
            return GLib.SOURCE_REMOVE;
        });

        this._keyPressId = global.stage.connect(
            'key-press-event', this._onKeyPress.bind(this));

        // Give focus to the first icon after layout
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            if (this._appIcons.length > 0) {
                this._focusIndex = 0;
                this._appIcons[0].grab_key_focus();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;

        // Disable overlay so it cannot fire a second close during the animation
        this._overlay.set_reactive(false);

        if (this._keyPressId !== null) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }

        // ── Animate out ───────────────────────────────────────────────────────
        const animTime = this._settings.get_int('animation-time');
        this._popup.ease({
            opacity: 0,
            scale_x: 0.88,
            scale_y: 0.88,
            duration: animTime,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (!this._isOpen) {
                    this._popup.get_parent()?.remove_child(this._popup);
                    this._overlay.get_parent()?.remove_child(this._overlay);
                }
            },
        });
        this._overlay.ease({
            opacity: 0,
            duration: animTime,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        });
    }

    toggle() {
        log(`[CompactLauncher] toggle() isOpen=${this._isOpen}`);
        if (this._isOpen) this.close();
        else              this.open();
    }

    destroy() {
        if (this._settingsChangedId !== null) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._appSystemId !== null) {
            Shell.AppSystem.get_default().disconnect(this._appSystemId);
            this._appSystemId = null;
        }
        if (this._keyPressId !== null) {
            global.stage.disconnect(this._keyPressId);
            this._keyPressId = null;
        }

        // Disconnect icon signals before the grid is torn down
        this._disconnectIconSignals();

        // Disconnect signals on top-level widgets before destroying them
        if (this._overlayPressId !== null) {
            this._overlay.disconnect(this._overlayPressId);
            this._overlayPressId = null;
        }
        if (this._popupPressId !== null) {
            this._popup.disconnect(this._popupPressId);
            this._popupPressId = null;
        }

        this._popup.remove_all_transitions();
        this._overlay.remove_all_transitions();
        this._popup.get_parent()?.remove_child(this._popup);
        this._overlay.get_parent()?.remove_child(this._overlay);

        // Destroy widget tree innermost-first to avoid double-destroy
        this._gridBox.destroy();
        this._gridBox = null;
        this._gridViewport.destroy();
        this._gridViewport = null;
        this._scrollView.destroy();
        this._scrollView = null;
        this._popup.destroy();
        this._popup = null;
        this._overlay.destroy();
        this._overlay = null;
    }
}

// ── PanelLauncherButton ───────────────────────────────────────────────────────

/**
 * A button in the GNOME top panel — always visible, always works.
 */
class PanelLauncherButton {

    constructor(launcher) {
        this._launcher  = launcher;
        this._clickedId = null;
        this._button = new St.Button({
            style_class: 'panel-button compact-launcher-panel-btn',
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: new St.Icon({
                icon_name: 'view-app-grid-symbolic',
                style_class: 'system-status-icon',
            }),
        });
        this._clickedId = this._button.connect('clicked', () => this._launcher.toggle());
    }

    addToPanel() {
        Main.panel._leftBox.insert_child_at_index(this._button, 0);
    }

    destroy() {
        if (this._clickedId !== null) {
            this._button.disconnect(this._clickedId);
            this._clickedId = null;
        }
        this._button.get_parent()?.remove_child(this._button);
        this._button.destroy();
        this._button = null;
    }
}

// ── DashLauncherButton ────────────────────────────────────────────────────────

/**
 * Injects a launcher button into every visible Ubuntu dock (one per monitor).
 *
 * Ubuntu's Dash to Dock intercepts button events on its container.  We work
 * around this with a stage-level 'captured-event' handler that fires before
 * any actor gets the event.
 *
 * Multi-monitor support: we use a dynamic import of ubuntu-dock's exported
 * dockManager to iterate over all DockDash instances and insert one button
 * per monitor's dock.
 */
class DashLauncherButton {

    constructor(launcher, settings) {
        this._launcher      = launcher;
        this._settings      = settings;
        this._containers    = [];    // one St.Button per dock
        this._dashes        = [];    // parallel array: the DockDash for each container
        this._addedBoxes    = new Set(); // tracks boxes we already inserted into
        this._retryTimerId  = 0;
        this._tooltip       = null;
        this._tooltipTimer  = 0;
        this._captureId     = null;
        this._contextMenu   = null;
        this._menuManager   = null;
        this._destroyed     = false;
    }

    // ── Build one dock icon button ────────────────────────────────────────────

    _makeButton() {
        const btn = new St.Button({
            style_class: 'app-well-app compact-launcher-dash-btn',
            can_focus: true,
            reactive: true,
            track_hover: true,
            pivot_point: new Graphene.Point({x: 0.5, y: 0.5}),
        });

        const iconWidget = new St.Widget({
            style_class: 'overview-icon',
            layout_manager: new Clutter.BinLayout(),
            x_expand: true,
            y_expand: true,
        });
        iconWidget.add_child(new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            style_class: 'compact-launcher-dash-icon',
            // The dock normally overrides this at runtime via its own theming;
            // dock-icon-size from GSettings is the authoritative fallback.
            icon_size: this._settings.get_int('dock-icon-size'),
        }));
        btn.set_child(iconWidget);

        // Primary handler: fires directly on the button before the dock sees it.
        // The captured-event below is a belt-and-suspenders fallback.
        btn.connect('button-press-event', (_a, ev) => {
            if (ev.get_button() === 1) {
                log('[CompactLauncher] dock btn direct press');
                this._launcher.toggle();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        btn.connect('notify::hover', () => {
            btn.ease({
                scale_x: btn.hover ? 1.1 : 1.0,
                scale_y: btn.hover ? 1.1 : 1.0,
                duration: 100,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            if (btn.hover) this._showTooltip(btn);
            else           this._hideTooltip();
        });

        return btn;
    }

    _setupContextMenu(anchor) {
        this._contextMenu = new PopupMenu.PopupMenu(anchor, 0.5, St.Side.BOTTOM);
        this._menuManager = new PopupMenu.PopupMenuManager(anchor);
        this._menuManager.addMenu(this._contextMenu);
        this._contextMenu.addAction('Open Activities Overview', () => {
            this._contextMenu.close();
            Main.overview.show();
        });
        Main.uiGroup.add_child(this._contextMenu.actor);
        this._contextMenu.actor.hide();
    }

    // ── Tooltip ───────────────────────────────────────────────────────────────

    _showTooltip(anchor) {
        if (!this._tooltip) {
            this._tooltip = new St.Label({
                text: 'Applications',
                style_class: 'dash-label',
            });
            Main.layoutManager.uiGroup.add_child(this._tooltip);
        }
        this._tooltip.show();

        if (this._tooltipTimer) GLib.source_remove(this._tooltipTimer);
        this._tooltipTimer = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._tooltipTimer = 0;
            if (!this._tooltip || !anchor) return GLib.SOURCE_REMOVE;
            const [bx, by] = anchor.get_transformed_position();
            const bw = anchor.width;
            const tw = this._tooltip.width;
            this._tooltip.set_position(
                Math.floor(bx + (bw - tw) / 2),
                Math.floor(by - this._tooltip.height - 6)
            );
            return GLib.SOURCE_REMOVE;
        });
    }

    _hideTooltip() {
        if (this._tooltipTimer) {
            GLib.source_remove(this._tooltipTimer);
            this._tooltipTimer = 0;
        }
        this._tooltip?.hide();
    }

    // ── Dock discovery & insertion ────────────────────────────────────────────

    addToDash() {
        // First attempt — some docks may not be ready yet at login
        this._insertIntoNewDocks();

        // Retry after ubuntu-dock finishes setting up all monitor docks
        // (typically < 3 s after the shell finishes initialising)
        const delays = [2000, 5000];
        delays.forEach(ms => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
                if (!this._destroyed) this._insertIntoNewDocks();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _insertIntoNewDocks() {
        this._findDockEntries()
            .then(entries => {
                if (this._destroyed) return;

                let addedNew = false;
                entries.forEach(({box, dash}, idx) => {
                    if (this._addedBoxes.has(box)) return;

                    const btn = this._makeButton();
                    if (!this._contextMenu) this._setupContextMenu(btn);
                    try {
                        const atEnd = this._settings.get_string('dock-position') === 'right';
                        const idx   = atEnd ? -1 : 0;
                        box.insert_child_at_index(btn, idx);
                        this._containers.push(btn);
                        this._dashes.push(dash);
                        this._addedBoxes.add(box);
                        addedNew = true;
                        log(`[CompactLauncher] button inserted in dock ${idx}`);

                        // Optionally hide the dock's built-in "Show Applications" button
                        if (this._settings.get_boolean('hide-show-apps-button'))
                            dash?.hideShowAppsButton?.();
                    } catch (e) {
                        log(`[CompactLauncher] insert failed dock ${idx} — ${e}`);
                        btn.destroy();
                    }
                });

                if (addedNew && !this._captureId) {
                    this._captureId = global.stage.connect(
                        'captured-event', this._onCapturedEvent.bind(this));
                    log('[CompactLauncher] captured-event handler installed');
                }
            })
            .catch(e => log(`[CompactLauncher] _insertIntoNewDocks error: ${e}`));
    }

    /**
     * Returns [{box, dash}] — one entry per monitor dock.
     * Tries ubuntu-dock's DockManager first; falls back to Main.overview.dash.
     */
    async _findDockEntries() {
        const entries = [];

        try {
            const dockExt = Main.extensionManager.lookup('ubuntu-dock@ubuntu.com');
            if (dockExt) {
                const mod = await import(`file://${dockExt.path}/extension.js`);
                const dm  = mod.dockManager;
                if (dm?._allDocks?.length) {
                    for (const dock of dm._allDocks) {
                        const dash = dock.dash;
                        const box  = dash?._box;
                        if (box) entries.push({box, dash});
                    }
                    log(`[CompactLauncher] found ${entries.length} ubuntu-dock entries`);
                }
            }
        } catch (e) {
            log(`[CompactLauncher] ubuntu-dock import failed: ${e}`);
        }

        // Fallback: GNOME's built-in dash
        if (entries.length === 0) {
            const dash = Main.overview?.dash;
            const box  = dash?._box ?? dash?._dashContainer?._box;
            if (box) entries.push({box, dash});
        }

        return entries;
    }

    // Stage-level capture: fires before any actor sees the event.
    // Uses a parent-walk instead of contains() for maximum reliability.
    _onCapturedEvent(_stage, event) {
        if (event.type() !== Clutter.EventType.BUTTON_PRESS)
            return Clutter.EVENT_PROPAGATE;

        const mouseBtn = event.get_button();
        if (mouseBtn !== 1 && mouseBtn !== 3)
            return Clutter.EVENT_PROPAGATE;

        try {
            // Walk up the actor tree from the hit actor to find one of ours
            let actor = event.get_source();
            while (actor) {
                if (this._containers.includes(actor)) {
                    log(`[CompactLauncher] captured btn${mouseBtn} on dock icon`);
                    if (mouseBtn === 1) {
                        this._launcher.toggle();
                        return Clutter.EVENT_STOP;
                    }
                    if (mouseBtn === 3 && this._contextMenu) {
                        this._contextMenu.toggle();
                        return Clutter.EVENT_STOP;
                    }
                    return Clutter.EVENT_PROPAGATE;
                }
                actor = actor.get_parent?.() ?? null;
            }
        } catch (e) {
            log(`[CompactLauncher] captured-event error: ${e}`);
        }

        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        this._destroyed = true;
        this._addedBoxes.clear();

        // Restore the stock "Show Applications" button on every dock
        // (only needed if we hid it; showShowAppsButton is safe to call regardless)
        for (const dash of this._dashes) {
            try { dash?.showShowAppsButton?.(); } catch (_e) {}
        }
        this._dashes = [];

        if (this._captureId !== null) {
            global.stage.disconnect(this._captureId);
            this._captureId = null;
        }

        this._hideTooltip();
        if (this._tooltip) {
            this._tooltip.get_parent()?.remove_child(this._tooltip);
            this._tooltip.destroy();
            this._tooltip = null;
        }

        if (this._menuManager) {
            this._menuManager.removeMenu(this._contextMenu);
            this._menuManager = null;
        }
        if (this._contextMenu) {
            this._contextMenu.destroy();
            this._contextMenu = null;
        }

        for (const btn of this._containers) {
            try { btn.get_parent()?.remove_child(btn); } catch (_e) {}
            btn.destroy();
        }
        this._containers = [];
    }
}

// ── Extension entry point ─────────────────────────────────────────────────────

export default class CompactLauncherExtension extends Extension {

    enable() {
        const settings = this.getSettings('org.gnome.shell.extensions.compact-launcher');

        this._launcher   = new CompactLauncherPopup(settings);
        this._dashButton = new DashLauncherButton(this._launcher, settings);
        this._dashButton.addToDash();
    }

    disable() {
        this._dashButton?.destroy();
        this._dashButton = null;

        this._launcher?.destroy();
        this._launcher = null;
    }
}
