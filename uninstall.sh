#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Compact Launcher – Uninstallation Script
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Paths ─────────────────────────────────────────────────────────────────────
UUID="compact-launcher@gilsonf"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
SCHEMA_ID="org.gnome.shell.extensions.compact-launcher"

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}Compact Launcher – Uninstaller${RESET}"
echo "──────────────────────────────────────────────"

# ── Check ─────────────────────────────────────────────────────────────────────
if [[ ! -d "${EXT_DIR}" ]]; then
    warn "Extension directory not found: ${EXT_DIR}"
    warn "Nothing to uninstall."
    exit 0
fi

# ── Disable ───────────────────────────────────────────────────────────────────
if command -v gnome-extensions &>/dev/null; then
    if gnome-extensions list --enabled | grep -q "^${UUID}$"; then
        info "Disabling extension…"
        gnome-extensions disable "${UUID}" && success "Extension disabled." \
            || warn "Could not disable the extension automatically."
    else
        info "Extension is already disabled."
    fi
else
    warn "'gnome-extensions' command not found – skipping disable step."
fi

# ── Reset GSettings (optional – clears saved preferences) ────────────────────
if command -v gsettings &>/dev/null; then
    if gsettings list-schemas 2>/dev/null | grep -q "^${SCHEMA_ID}$"; then
        info "Resetting saved preferences…"
        KEYS=(
            animation-time
            icon-size cell-width cell-height
            col-spacing row-spacing
            dock-icon-size hide-show-apps-button dock-position
            popup-width-fraction popup-height-fraction grid-margin
            top-fraction bottom-fraction
            min-cols max-cols
            hidden-apps
        )
        for key in "${KEYS[@]}"; do
            gsettings reset "${SCHEMA_ID}" "${key}" 2>/dev/null || true
        done
        success "Preferences cleared."
    else
        info "No saved preferences found (schema not registered)."
    fi
fi

# ── Remove extension directory ────────────────────────────────────────────────
info "Removing: ${EXT_DIR}"
rm -rf "${EXT_DIR}"
success "Extension files removed."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Uninstallation complete!${RESET}"
echo "──────────────────────────────────────────────"
echo -e "${YELLOW}Next step:${RESET} Log out and log back in so GNOME Shell fully unloads"
echo "  the extension."
