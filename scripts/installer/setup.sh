#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Inventory Manager Agent — Self-Installer
# This script runs when the user opens the .run file
# ──────────────────────────────────────────────────────────────

APP_NAME="Inventory Manager Agent"
INSTALL_DIR="$HOME/.inventory-manager"
DESKTOP_FILE="$HOME/.local/share/applications/inventory-manager.desktop"
SHORTCUT="$HOME/Desktop/Inventory Manager.desktop"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║  📦 Installing $APP_NAME        ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ─── Install to home directory ────────────────────────────────

if [ -d "$INSTALL_DIR" ]; then
    echo "  ⬆️  Updating existing installation..."
    # Preserve user data
    cp -r "$INSTALL_DIR/data" /tmp/inventory-manager-data-backup 2>/dev/null || true
    cp "$INSTALL_DIR/config/business.yaml" /tmp/inventory-manager-config-backup.yaml 2>/dev/null || true
    cp "$INSTALL_DIR/.env" /tmp/inventory-manager-env-backup 2>/dev/null || true
    rm -rf "$INSTALL_DIR"
fi

echo "  📂 Installing to $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
cp -r . "$INSTALL_DIR/"

# Restore user data if upgrading
if [ -d "/tmp/inventory-manager-data-backup" ]; then
    cp -r /tmp/inventory-manager-data-backup "$INSTALL_DIR/data"
    rm -rf /tmp/inventory-manager-data-backup
    echo "  ✅ Your data has been preserved"
fi
if [ -f "/tmp/inventory-manager-config-backup.yaml" ]; then
    cp /tmp/inventory-manager-config-backup.yaml "$INSTALL_DIR/config/business.yaml"
    rm -f /tmp/inventory-manager-config-backup.yaml
    echo "  ✅ Your configuration has been preserved"
fi
if [ -f "/tmp/inventory-manager-env-backup" ]; then
    cp /tmp/inventory-manager-env-backup "$INSTALL_DIR/.env"
    rm -f /tmp/inventory-manager-env-backup
fi

# ─── Make launcher executable ─────────────────────────────────

chmod +x "$INSTALL_DIR/run.sh"
chmod +x "$INSTALL_DIR/node/bin/node"

# ─── Create desktop shortcut ─────────────────────────────────

mkdir -p "$(dirname "$DESKTOP_FILE")"
mkdir -p "$HOME/Desktop" 2>/dev/null || true

cat > "$DESKTOP_FILE" << DESKTOP
[Desktop Entry]
Name=Inventory Manager
Comment=AI-powered inventory management for your business
Exec=$INSTALL_DIR/run.sh
Icon=$INSTALL_DIR/icon.png
Terminal=false
Type=Application
Categories=Office;Business;
StartupNotify=true
DESKTOP

# Copy to Desktop too
cp "$DESKTOP_FILE" "$SHORTCUT" 2>/dev/null || true
chmod +x "$SHORTCUT" 2>/dev/null || true

echo "  ✅ Desktop shortcut created"

# ─── Create terminal command ──────────────────────────────────

mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/run.sh" "$HOME/.local/bin/inventory-manager"
echo "  ✅ Terminal command: inventory-manager"

# ─── Done ─────────────────────────────────────────────────────

echo ""
echo "  ══════════════════════════════════════════════"
echo "  ✅ Installation complete!"
echo ""
echo "  To start: Double-click 'Inventory Manager' on your Desktop"
echo "  Or run:   inventory-manager"
echo ""
echo "  Starting now..."
echo "  ══════════════════════════════════════════════"
echo ""

# Start the app
exec "$INSTALL_DIR/run.sh"
