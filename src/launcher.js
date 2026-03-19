#!/usr/bin/env node
/**
 * Inventory Manager Agent — Launcher
 * 
 * Entry point for packaged executables (pkg) and direct Node.js usage.
 * On first run (no business config), auto-opens browser to setup wizard.
 * 
 * Usage:
 *   - As executable: ./inventory-manager (double-click or run from terminal)
 *   - As Node.js:    node src/launcher.js
 */

import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// ─── Path Resolution (works in both pkg and normal Node.js) ───────────

let appRoot;

if (process.pkg) {
  // Running as a pkg binary — CWD is where the user ran the executable
  appRoot = process.cwd();
  
  // If critical files aren't in CWD, check next to the executable
  const exeDir = path.dirname(process.execPath);
  if (!fs.existsSync(path.join(appRoot, 'src')) && fs.existsSync(path.join(exeDir, 'src'))) {
    appRoot = exeDir;
  }
} else {
  // Running as normal Node.js
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  appRoot = path.resolve(__dirname, '..');
}

// Change to app root so all relative paths work
process.chdir(appRoot);

// ─── Ensure data directory exists ─────────────────────────────────────

const dataDir = path.join(appRoot, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ─── First-run detection ──────────────────────────────────────────────

function isFirstRun() {
  const configPaths = [
    path.join(appRoot, 'config', 'business.yaml'),
    path.join(appRoot, 'config', 'business.yml'),
    path.join(appRoot, '.env'),
  ];
  return !configPaths.some(p => fs.existsSync(p));
}

// ─── Get port from env or default ─────────────────────────────────────

function getPort() {
  if (process.env.WEB_PORT) return parseInt(process.env.WEB_PORT, 10);
  if (process.env.PORT) return parseInt(process.env.PORT, 10);
  return 3000;
}

// ─── Open browser (cross-platform, no dependencies) ──────────────────

async function openBrowser(url) {
  const { exec } = await import('child_process');
  
  const commands = {
    win32: `start "" "${url}"`,
    darwin: `open "${url}"`,
    linux: `xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || echo "Open ${url} in your browser"`,
  };

  const cmd = commands[process.platform];
  if (cmd) {
    exec(cmd, (err) => {
      if (err) {
        console.log(`\n  👉 Open this URL in your browser: ${url}\n`);
      }
    });
  }
}

// ─── Banner ───────────────────────────────────────────────────────────

function printBanner(port, firstRun) {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║     📦 Inventory Manager Agent v1.0.0       ║');
  console.log('  ║     AI-powered stock management              ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  
  if (firstRun) {
    console.log('  🆕 First run detected!');
    console.log(`  🌐 Opening setup wizard at http://localhost:${port}/setup`);
    console.log('');
    console.log('  Follow the wizard to configure:');
    console.log('    1. Business name & currency');
    console.log('    2. AI provider & API key');
    console.log('    3. WhatsApp connection');
    console.log('    4. Products & categories');
    console.log('');
  } else {
    console.log(`  🌐 Dashboard: http://localhost:${port}`);
    console.log(`  ⚙️  Settings:  http://localhost:${port}/setup`);
    console.log('');
  }

  console.log('  Press Ctrl+C to stop the agent.');
  console.log('');
}

// ─── Main ─────────────────────────────────────────────────────────────

async function launch() {
  const port = getPort();
  const firstRun = isFirstRun();

  printBanner(port, firstRun);

  // Import and start the main agent
  // Dynamic import so path resolution happens after chdir
  await import('./index.js');

  // On first run, open browser to setup wizard after a short delay
  // (give the Express server time to start)
  if (firstRun) {
    setTimeout(() => {
      openBrowser(`http://localhost:${port}/setup`);
    }, 2000);
  }
}

launch().catch((err) => {
  console.error('');
  console.error('  ❌ Failed to start Inventory Manager Agent');
  console.error(`     ${err.message}`);
  console.error('');
  console.error('  Common fixes:');
  console.error('    • Make sure port is not in use (try WEB_PORT=3001)');
  console.error('    • Check that config/ directory exists');
  console.error('    • Run from the folder containing the agent files');
  console.error('');
  process.exit(1);
});
