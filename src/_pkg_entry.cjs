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
