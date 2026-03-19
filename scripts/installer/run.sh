#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Inventory Manager Agent — Run Script
# Uses the bundled Node.js — no system Node.js required
# ──────────────────────────────────────────────────────────────

# Resolve install directory (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Use bundled Node.js
export PATH="$SCRIPT_DIR/node/bin:$PATH"

# Create data dir if needed
mkdir -p "$SCRIPT_DIR/data"

# Start the agent
exec "$SCRIPT_DIR/node/bin/node" "$SCRIPT_DIR/src/launcher.js"
