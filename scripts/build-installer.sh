#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Build self-installing executable for Inventory Manager Agent
# 
# Creates:
#   - Linux:   inventory-manager-setup.run (self-extracting installer)
#   - Windows: inventory-manager-setup-windows.zip (extract & double-click setup.bat)
#
# The installer bundles Node.js — users don't need ANYTHING installed.
# ──────────────────────────────────────────────────────────────
set -e

VERSION=$(node -p "require('./package.json').version")
DIST="dist/installer"
STAGE_LINUX="$DIST/stage-linux"
STAGE_WIN="$DIST/stage-windows"
NODE_VERSION="18.20.8"  # LTS, smaller binary

echo ""
echo "  🔨 Building Inventory Manager Agent v${VERSION} installer..."
echo ""

# ─── Clean ────────────────────────────────────────────────────

rm -rf "$DIST"
mkdir -p "$DIST" "$STAGE_LINUX" "$STAGE_WIN"

# ─── Download Node.js binaries ────────────────────────────────

echo "  📥 Downloading Node.js v${NODE_VERSION} (Linux)..."
if [ ! -f "/tmp/node-v${NODE_VERSION}-linux-x64.tar.xz" ]; then
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
        -o "/tmp/node-v${NODE_VERSION}-linux-x64.tar.xz"
fi
mkdir -p "$STAGE_LINUX/node/bin"
tar -xf "/tmp/node-v${NODE_VERSION}-linux-x64.tar.xz" -C /tmp/ 2>/dev/null || true
cp "/tmp/node-v${NODE_VERSION}-linux-x64/bin/node" "$STAGE_LINUX/node/bin/node"
chmod +x "$STAGE_LINUX/node/bin/node"
echo "  ✅ Node.js Linux binary ready"

echo "  📥 Downloading Node.js v${NODE_VERSION} (Windows)..."
if [ ! -f "/tmp/node-v${NODE_VERSION}-win-x64.zip" ]; then
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip" \
        -o "/tmp/node-v${NODE_VERSION}-win-x64.zip"
fi
mkdir -p "$STAGE_WIN/node"
unzip -q -o "/tmp/node-v${NODE_VERSION}-win-x64.zip" "node-v${NODE_VERSION}-win-x64/node.exe" -d /tmp/ 2>/dev/null || true
cp "/tmp/node-v${NODE_VERSION}-win-x64/node.exe" "$STAGE_WIN/node/node.exe"
echo "  ✅ Node.js Windows binary ready"

# ─── Copy app files (both platforms) ──────────────────────────

echo "  📦 Bundling application files..."
for STAGE in "$STAGE_LINUX" "$STAGE_WIN"; do
    # Source code
    cp -r src/ "$STAGE/src/"
    
    # Dependencies (production only, skip dev)
    cp -r node_modules/ "$STAGE/node_modules/"
    
    # Config templates
    mkdir -p "$STAGE/config"
    cp config/*.example.* "$STAGE/config/" 2>/dev/null || true
    cp config/default.yaml "$STAGE/config/" 2>/dev/null || true
    
    # Package metadata
    cp package.json "$STAGE/"
    cp README.md "$STAGE/" 2>/dev/null || true
    
    # Empty data dir
    mkdir -p "$STAGE/data"
done

# ─── Linux-specific files ────────────────────────────────────

cp scripts/installer/run.sh "$STAGE_LINUX/run.sh"
chmod +x "$STAGE_LINUX/run.sh"

# Create a simple icon (placeholder - can be replaced with real icon)
# Using a 1x1 transparent PNG as placeholder
echo "" > "$STAGE_LINUX/icon.png"

echo "  ✅ Linux bundle ready"

# ─── Windows-specific files ──────────────────────────────────

cp scripts/installer/setup.bat "$STAGE_WIN/setup.bat"
cp scripts/installer/run.bat "$STAGE_WIN/run.bat"

echo "  ✅ Windows bundle ready"

# ─── Build Linux self-extracting installer ────────────────────

echo "  🏗️  Building Linux installer (.run)..."

MAKESELF="/tmp/tools/makeself.sh"
if [ ! -f "$MAKESELF" ]; then
    echo "  📥 Downloading makeself..."
    mkdir -p /tmp/tools
    curl -fsSL https://raw.githubusercontent.com/megastep/makeself/master/makeself.sh -o "$MAKESELF"
    curl -fsSL https://raw.githubusercontent.com/megastep/makeself/master/makeself-header.sh -o /tmp/tools/makeself-header.sh
    chmod +x "$MAKESELF"
fi

# Copy setup script into staging
cp scripts/installer/setup.sh "$STAGE_LINUX/setup.sh"
chmod +x "$STAGE_LINUX/setup.sh"

bash "$MAKESELF" --gzip \
    "$STAGE_LINUX" \
    "$DIST/inventory-manager-setup-v${VERSION}.run" \
    "Inventory Manager Agent v${VERSION}" \
    ./setup.sh

echo "  ✅ Linux installer built"

# ─── Build Windows zip ───────────────────────────────────────

echo "  🏗️  Building Windows installer (.zip)..."
cd "$STAGE_WIN"
zip -r -q "$OLDPWD/$DIST/inventory-manager-setup-v${VERSION}-windows.zip" .
cd - > /dev/null

echo "  ✅ Windows installer built"

# ─── Summary ──────────────────────────────────────────────────

LINUX_SIZE=$(du -sh "$DIST/inventory-manager-setup-v${VERSION}.run" | cut -f1)
WIN_SIZE=$(du -sh "$DIST/inventory-manager-setup-v${VERSION}-windows.zip" | cut -f1)

echo ""
echo "  ═══════════════════════════════════════════════════════"
echo "  ✅ Installers built!"
echo ""
echo "  Linux:   $DIST/inventory-manager-setup-v${VERSION}.run ($LINUX_SIZE)"
echo "  Windows: $DIST/inventory-manager-setup-v${VERSION}-windows.zip ($WIN_SIZE)"
echo ""
echo "  Linux users:"
echo "    chmod +x inventory-manager-setup-v${VERSION}.run"
echo "    ./inventory-manager-setup-v${VERSION}.run"
echo ""
echo "  Windows users:"
echo "    Extract zip → Double-click setup.bat"
echo "  ═══════════════════════════════════════════════════════"
echo ""
