#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Build executable binaries for Inventory Manager Agent
# Creates standalone executables for Linux and Windows
# ──────────────────────────────────────────────────────────────
set -e

VERSION=$(node -p "require('./package.json').version")
NAME="inventory-manager-agent"
DIST="dist/executables"

echo ""
echo "🔨 Building ${NAME} v${VERSION} executables..."
echo ""

# ─── Check/install pkg ────────────────────────────────────────

if ! command -v pkg &> /dev/null; then
  echo "📦 Installing pkg (Node.js → executable compiler)..."
  npm install -g pkg
fi

# ─── Clean ────────────────────────────────────────────────────

rm -rf "${DIST}"
mkdir -p "${DIST}/linux" "${DIST}/windows"

# ─── Build CJS wrapper (pkg needs CommonJS entry) ────────────
# pkg doesn't support ESM directly, so we create a CJS shim
# that uses dynamic import to load our ESM launcher

cat > src/_pkg_entry.cjs << 'EOF'
// CommonJS entry point for pkg (bridges to ESM launcher)
const path = require('path');

async function main() {
  // Set up the app root for pkg mode
  process.chdir(path.dirname(process.execPath));
  
  // Dynamic import of our ESM launcher
  await import('./launcher.js');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
EOF

echo "✅ Created CJS bridge entry point"

# ─── Run pkg ──────────────────────────────────────────────────

echo "🏗️  Compiling Linux binary..."
pkg src/_pkg_entry.cjs \
  --target node18-linux-x64 \
  --output "${DIST}/linux/${NAME}" \
  --config package.json \
  2>&1 | tail -5

echo "🏗️  Compiling Windows binary..."
pkg src/_pkg_entry.cjs \
  --target node18-win-x64 \
  --output "${DIST}/windows/${NAME}.exe" \
  --config package.json \
  2>&1 | tail -5

# ─── Copy native addons ──────────────────────────────────────
# better-sqlite3 uses native .node bindings that pkg can't embed

echo "📎 Copying native addons..."

# Find the better-sqlite3 .node file
SQLITE_NATIVE=$(find node_modules/better-sqlite3 -name "*.node" -type f 2>/dev/null | head -1)

if [ -n "$SQLITE_NATIVE" ]; then
  cp "$SQLITE_NATIVE" "${DIST}/linux/"
  cp "$SQLITE_NATIVE" "${DIST}/windows/"
  echo "  ✅ better-sqlite3 native addon copied"
else
  echo "  ⚠️  Could not find better-sqlite3 .node file"
  echo "     Run 'npm install' first, then rebuild"
fi

# ─── Copy required runtime files ──────────────────────────────
# These files are needed alongside the binary

for TARGET_DIR in "${DIST}/linux" "${DIST}/windows"; do
  # Config templates
  mkdir -p "${TARGET_DIR}/config"
  cp config/*.example.* "${TARGET_DIR}/config/" 2>/dev/null || true
  cp config/default.yaml "${TARGET_DIR}/config/" 2>/dev/null || true

  # Source files (needed for ESM dynamic imports from pkg)
  cp -r src/ "${TARGET_DIR}/src/"
  rm -f "${TARGET_DIR}/src/_pkg_entry.cjs"

  # Node modules (required - pkg can't bundle everything for ESM)
  cp -r node_modules/ "${TARGET_DIR}/node_modules/"

  # Package files
  cp package.json "${TARGET_DIR}/"

  # Start scripts as fallback
  cp start.sh "${TARGET_DIR}/" 2>/dev/null || true
  cp start.bat "${TARGET_DIR}/" 2>/dev/null || true

  # README
  cp README.md "${TARGET_DIR}/" 2>/dev/null || true

  # Create empty data dir
  mkdir -p "${TARGET_DIR}/data"
done

# ─── Create distribution archives ────────────────────────────

echo "📦 Creating archives..."
cd "${DIST}"

tar -czf "${NAME}-v${VERSION}-linux-x64.tar.gz" -C linux .
echo "  ✅ ${NAME}-v${VERSION}-linux-x64.tar.gz"

cd windows && zip -r -q "../${NAME}-v${VERSION}-windows-x64.zip" . && cd ..
echo "  ✅ ${NAME}-v${VERSION}-windows-x64.zip"

# ─── Clean up ─────────────────────────────────────────────────

rm -f ../src/_pkg_entry.cjs

# ─── Summary ──────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Build complete!"
echo ""
echo "  Executables:"
echo "    Linux:   ${DIST}/linux/${NAME}"
echo "    Windows: ${DIST}/windows/${NAME}.exe"
echo ""
echo "  Archives (for GitHub Releases):"
echo "    ${DIST}/${NAME}-v${VERSION}-linux-x64.tar.gz"
echo "    ${DIST}/${NAME}-v${VERSION}-windows-x64.zip"
echo ""
echo "  How users install:"
echo "    1. Download the archive for their OS"
echo "    2. Extract to any folder"
echo "    3. Run the executable (double-click or ./inventory-manager-agent)"
echo "    4. Browser opens to setup wizard automatically"
echo "═══════════════════════════════════════════════════════════"
echo ""
