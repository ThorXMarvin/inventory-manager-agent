#!/bin/bash
echo "🚀 Inventory Manager Agent"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Download it from: https://nodejs.org"
    echo "   Or run: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (first time only)..."
    npm install --production
fi

echo ""
node src/launcher.js
