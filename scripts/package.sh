#!/bin/bash
# Creates release packages for GitHub
set -e

VERSION=$(node -p "require('./package.json').version")
NAME="inventory-manager-agent-v${VERSION}"

echo "📦 Packaging ${NAME}..."

# Clean
rm -rf dist/
mkdir -p dist

# Copy files (exclude .git, data, .env, node_modules, logs)
rsync -av \
  --exclude='.git' \
  --exclude='data' \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='logs' \
  --exclude='dist' \
  --exclude='.wwebjs_auth' \
  --exclude='.wwebjs_cache' \
  . "dist/${NAME}/"

# Create archives
cd dist
tar -czf "${NAME}-linux.tar.gz" "${NAME}/"
zip -r "${NAME}-windows.zip" "${NAME}/"

echo ""
echo "✅ Packages created in dist/"
ls -lh "${NAME}-linux.tar.gz" "${NAME}-windows.zip"
