/**
 * Web Channel (Express)
 * REST API + simple HTML dashboard for inventory management.
 */

import express from 'express';
import cors from 'cors';
import { processMessage } from '../agent/core.js';
import { getAllStock, getLowStock, getStock } from '../agent/stock.js';
import { getDailySales, getWeeklySales, getTopSellers } from '../agent/sales.js';
import { dailySummary, stockReport, profitReport } from '../agent/reports.js';
import { checkLowStock } from '../alerts/engine.js';
import { registerChannel } from '../alerts/notifier.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let server = null;

/**
 * Start the Express web server.
 * @param {number} port
 */
export async function startWeb(port = 3000) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ─── API Routes ─────────────────────────────────────────

  // Chat endpoint — process natural language messages
  app.post('/api/message', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'Message is required' });

      const response = await processMessage(message, { channel: 'web' });
      res.json({ response });
    } catch (err) {
      logger.error(`Web /message error: ${err.message}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Stock endpoints
  app.get('/api/stock', (req, res) => {
    try {
      const stock = getAllStock();
      const low = getLowStock();
      res.json({ stock, lowStockCount: low.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stock/:name', (req, res) => {
    try {
      const result = getStock(req.params.name);
      if (result.error) return res.status(404).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sales endpoints
  app.get('/api/sales', (req, res) => {
    try {
      const daily = getDailySales();
      res.json(daily);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sales/weekly', (req, res) => {
    try {
      const weekly = getWeeklySales();
      const topSellers = getTopSellers(10);
      res.json({ ...weekly, topSellers });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reports endpoints
  app.get('/api/reports/daily', (req, res) => {
    try {
      res.json({ report: dailySummary() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/stock', (req, res) => {
    try {
      res.json({ report: stockReport() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/reports/profit', (req, res) => {
    try {
      res.json({ report: profitReport() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Alerts
  app.get('/api/alerts', (req, res) => {
    try {
      const alerts = checkLowStock();
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // ─── Dashboard (HTML) ──────────────────────────────────

  app.get('/', (req, res) => {
    const config = getConfig();
    const businessName = config.business.name || 'Inventory Manager';

    res.send(getDashboardHTML(businessName));
  });

  // ─── Start Server ──────────────────────────────────────

  server = app.listen(port, () => {
    logger.info(`✅ Web dashboard running at http://localhost:${port}`);
  });

  // Register for alert delivery (logs to console for web)
  registerChannel('web', async (message) => {
    logger.info(`[Web Alert] ${message}`);
  });

  return server;
}

/**
 * Simple HTML dashboard.
 */
function getDashboardHTML(businessName) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${businessName} — Inventory Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .header { background: #1a73e8; color: white; padding: 20px 30px; }
    .header h1 { font-size: 1.5rem; }
    .header p { opacity: 0.8; margin-top: 4px; }
    .container { max-width: 1200px; margin: 20px auto; padding: 0 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .card { background: white; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card h3 { margin-bottom: 12px; color: #1a73e8; }
    .stat { font-size: 2rem; font-weight: bold; color: #333; }
    .stat-label { font-size: 0.85rem; color: #666; margin-top: 4px; }
    .chat-box { display: flex; gap: 10px; margin-bottom: 20px; }
    .chat-box input { flex: 1; padding: 12px 16px; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem; }
    .chat-box input:focus { outline: none; border-color: #1a73e8; }
    .chat-box button { padding: 12px 24px; background: #1a73e8; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; }
    .chat-box button:hover { background: #1557b0; }
    #response { background: white; border-radius: 12px; padding: 20px; min-height: 100px; white-space: pre-wrap; font-family: inherit; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
    th { font-weight: 600; color: #666; font-size: 0.85rem; text-transform: uppercase; }
    .low { color: #d32f2f; font-weight: bold; }
    .ok { color: #2e7d32; }
    .loading { color: #999; font-style: italic; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 ${businessName}</h1>
    <p>Inventory Management Dashboard</p>
  </div>

  <div class="container">
    <!-- Chat Interface -->
    <div class="card" style="margin-bottom: 20px">
      <h3>💬 Chat with your inventory agent</h3>
      <div class="chat-box">
        <input type="text" id="chatInput" placeholder='Try: "How much cement do I have?" or "Sold 5 bags cement to Kato"' />
        <button onclick="sendMessage()">Send</button>
      </div>
      <div id="response" class="loading">Type a message above to get started...</div>
    </div>

    <!-- Stats -->
    <div class="grid" id="statsGrid">
      <div class="card">
        <h3>📦 Total Products</h3>
        <div class="stat" id="totalProducts">—</div>
      </div>
      <div class="card">
        <h3>⚠️ Low Stock Items</h3>
        <div class="stat" id="lowStockCount">—</div>
      </div>
      <div class="card">
        <h3>💰 Today's Sales</h3>
        <div class="stat" id="todaySales">—</div>
      </div>
    </div>

    <!-- Stock Table -->
    <div class="card">
      <h3>📋 Current Stock</h3>
      <table>
        <thead>
          <tr><th>Product</th><th>SKU</th><th>Category</th><th>Stock</th><th>Min</th><th>Status</th></tr>
        </thead>
        <tbody id="stockTable">
          <tr><td colspan="6" class="loading">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    async function sendMessage() {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg) return;

      document.getElementById('response').textContent = 'Thinking...';
      document.getElementById('response').className = 'loading';

      try {
        const res = await fetch('/api/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg }),
        });
        const data = await res.json();
        document.getElementById('response').textContent = data.response || data.error;
        document.getElementById('response').className = '';
        input.value = '';
        loadData(); // Refresh stats
      } catch (err) {
        document.getElementById('response').textContent = 'Error: ' + err.message;
      }
    }

    document.getElementById('chatInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });

    async function loadData() {
      try {
        const [stockRes, salesRes] = await Promise.all([
          fetch('/api/stock').then(r => r.json()),
          fetch('/api/sales').then(r => r.json()),
        ]);

        document.getElementById('totalProducts').textContent = stockRes.stock.length;
        document.getElementById('lowStockCount').textContent = stockRes.lowStockCount;
        document.getElementById('todaySales').textContent = salesRes.transactions + ' txns';

        const tbody = document.getElementById('stockTable');
        tbody.innerHTML = stockRes.stock.map(p => \`
          <tr>
            <td>\${p.name}</td>
            <td>\${p.sku || '—'}</td>
            <td>\${p.category}</td>
            <td>\${p.current_stock} \${p.unit}(s)</td>
            <td>\${p.min_stock}</td>
            <td class="\${p.is_low ? 'low' : 'ok'}">\${p.is_low ? '⚠️ LOW' : '✅ OK'}</td>
          </tr>
        \`).join('');
      } catch (err) {
        console.error('Failed to load data:', err);
      }
    }

    loadData();
    setInterval(loadData, 30000); // Refresh every 30s
  </script>
</body>
</html>`;
}

export function getWebStatus() {
  return server ? 'running' : 'stopped';
}

export default { startWeb, getWebStatus };
