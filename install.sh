#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Compact Launcher – Installation Script
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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID="compact-launcher@gilsonf"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

# ── Files to install ──────────────────────────────────────────────────────────
REQUIRED_FILES=(
    metadata.json
    extension.js
    prefs.js
    stylesheet.css
)

# ── Checks ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}Compact Launcher – Installer${RESET}"
echo "──────────────────────────────────────────────"

# Verify all source files exist
info "Checking source files…"
for f in "${REQUIRED_FILES[@]}"; do
    [[ -f "${SCRIPT_DIR}/${f}" ]] || die "Missing file: ${f}"
done
[[ -d "${SCRIPT_DIR}/schemas" ]] || die "Missing directory: schemas/"
success "All source files found."

# Verify glib-compile-schemas is available
command -v glib-compile-schemas &>/dev/null \
    || die "'glib-compile-schemas' not found. Install 'libglib2.0-bin' and retry."

# Warn if not running under GNOME
if [[ "${XDG_CURRENT_DESKTOP:-}" != *"GNOME"* ]]; then
    warn "Current desktop does not appear to be GNOME (XDG_CURRENT_DESKTOP=${XDG_CURRENT_DESKTOP:-unset})."
    warn "The extension may not work outside GNOME Shell."
fi

# ── Install ───────────────────────────────────────────────────────────────────
info "Installing to: ${EXT_DIR}"
mkdir -p "${EXT_DIR}/schemas"

# Copy main files
for f in "${REQUIRED_FILES[@]}"; do
    cp "${SCRIPT_DIR}/${f}" "${EXT_DIR}/${f}"
done
success "Extension files copied."

# Copy and compile schema
cp "${SCRIPT_DIR}/schemas/"*.xml "${EXT_DIR}/schemas/"
glib-compile-schemas "${EXT_DIR}/schemas/"
success "GSettings schema compiled."

# ── Enable ────────────────────────────────────────────────────────────────────
if command -v gnome-extensions &>/dev/null; then
    if gnome-extensions list | grep -q "^${UUID}$"; then
        info "Enabling extension…"
        gnome-extensions enable "${UUID}" && success "Extension enabled." \
            || warn "Could not enable the extension automatically."
    else
        warn "Extension not yet discovered by GNOME Shell."
        warn "It will be available after the next logout/login."
    fi
else
    warn "'gnome-extensions' command not found – skipping enable step."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo "──────────────────────────────────────────────"
echo -e "  UUID : ${BOLD}${UUID}${RESET}"
echo -e "  Path : ${EXT_DIR}"
echo ""
echo -e "${YELLOW}Next step:${RESET} Log out and log back in (or restart GNOME Shell on X11"
echo "  with Alt+F2 → 'r') so the extension is fully loaded."
