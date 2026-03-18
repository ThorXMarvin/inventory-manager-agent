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
echo "🌐 Opening dashboard in browser..."
echo "   If it doesn't open, go to: http://localhost:3000"
echo ""

# Try to open browser
(sleep 2 && (xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null || echo "Open http://localhost:3000 in your browser")) &

node src/index.js
