# Compact Launcher

A compact, floating application launcher for GNOME Shell, inspired by macOS Launchpad.
Adds a button to the dock (Ubuntu Dock / Dash to Dock) that opens a scrollable icon grid
of all your installed applications — no search bar, just scroll and click to launch.

![GNOME Shell 47+](https://img.shields.io/badge/GNOME%20Shell-47%2B-blue)
![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)

> 📖 [Leia em Português do Brasil](README.pt-BR.md)

---

## Features

- **Scrollable app grid** — all installed apps sorted alphabetically in a clean icon grid
- **No search bar** — just scroll and click to launch
- **Keyboard navigation** — arrow keys move through the grid, `Enter` launches, `Esc` closes
- **Hover zoom** — icons enlarge slightly on hover, matching GNOME's style
- **Smooth animations** — scale + fade on open and close (configurable duration)
- **Click-outside-to-close** — click anywhere on any monitor to dismiss the popup
- **Dock integration** — button injected into every monitor's dock (Ubuntu Dock / Dash to Dock)
- **Multi-monitor** — one launcher button per dock, popup opens on the active monitor
- **Hidden apps filter** — exclude apps by exact name or wildcard pattern (e.g. `Libre*`)
- **Fully configurable** — all layout and appearance parameters editable via a settings window
- **Automatic theming** — colours follow the active GNOME theme (dark / light)
- **Wayland compatible** — no X11 APIs used

---

## Requirements

| Requirement | Version |
|---|---|
| GNOME Shell | 47, 48 or 49 |
| GJS | 1.76+ (bundled with GNOME 47) |
| Ubuntu Dock / Dash to Dock | any recent version |
| Session type | X11 or Wayland |

---

## Installation

### Using the install script (recommended)

```bash
git clone https://github.com/gilson-fonsaca/compact-launcher.git
cd compact_launcher
bash install.sh
```

The script will:
1. Copy all extension files to `~/.local/share/gnome-shell/extensions/compact-launcher@gilsonf/`
2. Compile the GSettings schema
3. Enable the extension automatically (if GNOME Shell is running)

> **After installation:** log out and log back in so GNOME Shell fully loads the extension.

### Manual installation

```bash
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/compact-launcher@gilsonf"
mkdir -p "$EXT_DIR/schemas"

cp metadata.json extension.js prefs.js stylesheet.css "$EXT_DIR/"
cp schemas/*.xml "$EXT_DIR/schemas/"
glib-compile-schemas "$EXT_DIR/schemas/"

gnome-extensions enable compact-launcher@gilsonf
# Then log out and log back in
```

---

## Uninstallation

```bash
bash uninstall.sh
```

The script disables the extension, clears all saved preferences, and removes the extension directory.

---

## Usage

| Action | Result |
|---|---|
| Click the grid icon in the dock | Toggle the launcher |
| `↑ ↓ ← →` | Navigate the icon grid |
| `Enter` | Launch the focused app |
| `Esc` | Close the launcher |
| Click outside the popup | Close the launcher (any monitor) |

---

## Settings

Open the settings window via the **Extensions** app and choose **Extension Settings**.

### Icons tab

| Parameter | Description |
|---|---|
| Icon size (px) | Size of the app icon image |
| Tile width / height (px) | Dimensions of each icon cell |
| Horizontal / vertical spacing (px) | Gap between icon cells |
| Dock icon size (px) | Size of the launcher button icon in the dock |
| Hide default "Show Applications" button | Replace the stock launcher with ours |
| Button position in dock | Left (first) or Right (last) |
| Animation duration (ms) | Open/close animation speed (0 to disable) |

### Layout tab

| Parameter | Description |
|---|---|
| Width / Max height (px) | Popup dimensions in pixels |
| Grid inset (px) | Inset subtracted when fitting columns (prevents overflow) |
| Top gap (fraction) | Minimum distance from the top of the monitor |
| Bottom gap (fraction) | Primary anchor — popup bottom edge sits above the dock |
| Min / Max columns | Column count bounds (0 = automatic max) |

### Filters tab

Add exact names or wildcard patterns to hide apps from the grid:

| Pattern | Effect |
|---|---|
| `Logs` | Hides the app named exactly "Logs" |
| `Libre*` | Hides all apps whose name starts with "Libre" |
| `*Office*` | Hides all apps whose name contains "Office" |

---

## File Structure

```
compact_launcher/
├── metadata.json       Extension manifest (UUID, GNOME Shell version, schema ID)
├── extension.js        All runtime logic — ES modules, GNOME Shell 47+ APIs
├── prefs.js            Preferences window (Adwaita / GTK4)
├── stylesheet.css      CSS — no hardcoded colours, theme-aware
├── install.sh          Installation script
├── uninstall.sh        Uninstallation script
├── schemas/
│   └── org.gnome.shell.extensions.compact-launcher.gschema.xml
└── LICENSE             GNU General Public License v3.0
```

---

## Architecture

```
CompactLauncherExtension          Extension entry point
  ├── CompactLauncherPopup        Floating popup window
  │     ├── St.Widget (overlay)   Full-stage transparent backdrop (click-to-close)
  │     ├── St.ScrollView         Scrollable container
  │     └── Clutter.GridLayout    Icon grid — dynamic column count
  │           └── AppIcon[]       St.Button + icon + wrapping label
  │
  └── DashLauncherButton          Dock button manager
        ├── St.Button × N         One button per monitor dock
        ├── Tooltip                "Applications" label on hover
        └── PopupMenu             Right-click context menu
```

All user-configurable values are stored in **GSettings**
(`org.gnome.shell.extensions.compact-launcher`) and read live on each popup open.
Spacing changes apply immediately; size/layout changes apply on the next open.

---

## Development

```bash
# Tail GNOME Shell logs (all platforms)
journalctl -f -o cat /usr/bin/gnome-shell

# Filter to extension messages only
journalctl -f -o cat /usr/bin/gnome-shell | grep CompactLauncher

# Reload after editing (Wayland — full session restart required)
# Log out → log back in

# Reload after editing (X11 only)
# Alt+F2 → type 'r' → Enter

# Quick deploy during development
EXT="$HOME/.local/share/gnome-shell/extensions/compact-launcher@gilsonf"
cp extension.js prefs.js stylesheet.css "$EXT/"
gnome-extensions disable compact-launcher@gilsonf
gnome-extensions enable compact-launcher@gilsonf
```

---

## License

This project is licensed under the **GNU General Public License v3.0**.  
See [LICENSE](LICENSE) for the full text.
