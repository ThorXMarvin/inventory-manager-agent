/**
 * Web Channel (Express)
 * REST API + simple HTML dashboard for inventory management.
 * Includes first-run setup wizard for non-technical users.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { processMessage } from '../agent/core.js';
import { getAllStock, getLowStock, getStock } from '../agent/stock.js';
import { getDailySales, getWeeklySales, getTopSellers } from '../agent/sales.js';
import { dailySummary, stockReport, profitReport } from '../agent/reports.js';
import { checkLowStock } from '../alerts/engine.js';
import { registerChannel } from '../alerts/notifier.js';
import { getWhatsAppQR, getWhatsAppStatus } from './whatsapp.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let server = null;

/**
 * Check if business.yaml exists (not just the .example).
 */
function hasBusinessConfig() {
  return fs.existsSync(path.resolve('config/business.yaml')) ||
         fs.existsSync(path.resolve('config/business.yml'));
}

/**
 * Start the Express web server.
 * @param {number} port
 */
export async function startWeb(port = 3000) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Setup Wizard Routes ────────────────────────────────

  // Test LLM connection
  app.post('/api/setup/test-llm', async (req, res) => {
    const { provider, apiKey, model, endpoint } = req.body;
    try {
      let success = false;
      let message = '';

      if (provider === 'ollama') {
        const baseUrl = endpoint || 'http://localhost:11434';
        const resp = await fetch(`${baseUrl}/api/tags`);
        if (resp.ok) {
          success = true;
          message = 'Connected to Ollama successfully!';
        } else {
          message = 'Could not connect to Ollama. Is it running?';
        }
      } else if (provider === 'openai' || provider === 'azure') {
        const { default: OpenAI } = await import('openai');
        const config = { apiKey };
        if (provider === 'azure') {
          config.baseURL = endpoint;
          config.defaultQuery = { 'api-version': '2024-02-15-preview' };
          config.defaultHeaders = { 'api-key': apiKey };
        }
        const openai = new OpenAI(config);
        const resp = await openai.chat.completions.create({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5,
        });
        if (resp.choices?.[0]?.message) {
          success = true;
          message = 'Connected successfully!';
        }
      } else if (provider === 'anthropic') {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-3-haiku-20240307',
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Say OK' }],
          }),
        });
        if (resp.ok) {
          success = true;
          message = 'Connected to Anthropic successfully!';
        } else {
          const err = await resp.json().catch(() => ({}));
          message = err.error?.message || `Error: ${resp.status}`;
        }
      } else if (provider === 'google') {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-pro'}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'Say OK' }] }],
            }),
          }
        );
        if (resp.ok) {
          success = true;
          message = 'Connected to Google AI successfully!';
        } else {
          const err = await resp.json().catch(() => ({}));
          message = err.error?.message || `Error: ${resp.status}`;
        }
      }

      res.json({ success, message });
    } catch (err) {
      res.json({ success: false, message: err.message });
    }
  });

  // Save setup wizard config
  app.post('/api/setup/save', async (req, res) => {
    try {
      const { business, products, llm, channels } = req.body;

      // Build business.yaml
      const yamlConfig = {
        business: {
          name: business.name,
          type: business.type,
          currency: business.currency,
          phone: business.phone,
          location: '',
        },
        storage: {
          mode: 'sqlite',
          sqlite: { path: './data/inventory.db' },
        },
        categories: [],
        channels: {
          whatsapp: {
            authorized_numbers: [],
            allow_unknown: true,
            unauthorized_message: 'Sorry, you are not authorized to use this inventory system.',
          },
          email: {
            enabled: !!(channels.email?.smtp_user),
            smtp_host: channels.email?.smtp_host || 'smtp-relay.brevo.com',
            smtp_port: parseInt(channels.email?.smtp_port || '587'),
            smtp_user: channels.email?.smtp_user || '',
            smtp_pass: channels.email?.smtp_pass || '',
            from_name: 'Inventory Manager',
            from_email: channels.email?.smtp_user || '',
            owner_email: channels.email?.owner_email || business.email || '',
          },
        },
        alerts: {
          low_stock: { enabled: true, check_interval: '6h', notify_via: ['whatsapp'] },
          daily_summary: { enabled: true, time: '20:00' },
        },
        reports: {
          weekly: true,
          monthly: true,
          include: ['stock_levels', 'sales_summary', 'profit_margin', 'top_sellers'],
        },
      };

      // Group products by category
      if (products && products.length > 0) {
        const grouped = {};
        for (const p of products) {
          const cat = p.category || 'General';
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push({
            name: p.name,
            sku: '',
            unit: p.unit || 'piece',
            buy_price: parseInt(p.buyPrice) || 0,
            sell_price: parseInt(p.sellPrice) || 0,
            min_stock: parseInt(p.minStock) || 5,
            current_stock: parseInt(p.startingStock) || 0,
          });
        }
        yamlConfig.categories = Object.entries(grouped).map(([name, prods]) => ({
          name,
          products: prods,
        }));
      }

      // Write business.yaml
      fs.mkdirSync(path.resolve('config'), { recursive: true });
      fs.writeFileSync(
        path.resolve('config/business.yaml'),
        stringifyYaml(yamlConfig),
        'utf-8'
      );

      // Build .env
      const envLines = [
        `# Generated by Setup Wizard`,
        `LLM_PROVIDER=${llm.provider === 'azure' ? 'openai' : llm.provider}`,
        `LLM_API_KEY=${llm.apiKey || 'not-needed'}`,
        `LLM_MODEL=${llm.model}`,
      ];
      if (llm.provider === 'azure') {
        envLines.push(`OPENAI_BASE_URL=${llm.endpoint}`);
      }
      if (llm.provider === 'ollama') {
        envLines.push(`OLLAMA_BASE_URL=${llm.endpoint || 'http://localhost:11434'}`);
      }
      envLines.push(
        ``,
        `WHATSAPP_ENABLED=${channels.whatsapp ? 'true' : 'false'}`,
        `TELEGRAM_ENABLED=false`,
        ``,
        `EMAIL_SMTP_HOST=${channels.email?.smtp_host || 'smtp-relay.brevo.com'}`,
        `EMAIL_SMTP_PORT=${channels.email?.smtp_port || '587'}`,
        `EMAIL_SMTP_USER=${channels.email?.smtp_user || ''}`,
        `EMAIL_SMTP_PASS=${channels.email?.smtp_pass || ''}`,
        `EMAIL_FROM_NAME=Inventory Manager`,
        `EMAIL_FROM_EMAIL=${channels.email?.smtp_user || ''}`,
        `EMAIL_OWNER_EMAIL=${channels.email?.owner_email || business.email || ''}`,
        ``,
        `WEB_ENABLED=true`,
        `WEB_PORT=${channels.webPort || 3000}`,
        ``,
        `DB_PATH=./data/inventory.db`,
        `LOG_LEVEL=info`,
      );

      fs.writeFileSync(path.resolve('.env'), envLines.join('\n'), 'utf-8');

      // Insert products into SQLite if DB exists
      try {
        const { getDb } = await import('../db/sqlite.js');
        const db = getDb();
        if (db && products && products.length > 0) {
          const insertStmt = db.prepare(`
            INSERT OR IGNORE INTO products (name, sku, category, unit, buy_price, sell_price, current_stock, min_stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);
          const txn = db.transaction(() => {
            for (const p of products) {
              insertStmt.run(
                p.name,
                '',
                p.category || 'General',
                p.unit || 'piece',
                parseInt(p.buyPrice) || 0,
                parseInt(p.sellPrice) || 0,
                parseInt(p.startingStock) || 0,
                parseInt(p.minStock) || 5,
              );
            }
          });
          txn();
        }
      } catch (dbErr) {
        logger.warn(`Could not seed products to DB during setup: ${dbErr.message}`);
      }

      res.json({ success: true, message: 'Configuration saved! Restart the app to apply changes.' });
    } catch (err) {
      logger.error(`Setup save error: ${err.message}`);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ─── API Routes ─────────────────────────────────────────

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

  app.get('/api/alerts', (req, res) => {
    try {
      const alerts = checkLowStock();
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/whatsapp/qr', (req, res) => {
    const qr = getWhatsAppQR();
    const status = getWhatsAppStatus();
    res.json({ status, qr });
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // ─── Main Route ─────────────────────────────────────────

  app.get('/', (req, res) => {
    if (!hasBusinessConfig()) {
      return res.send(getSetupWizardHTML());
    }
    const config = getConfig();
    const businessName = config.business.name || 'Inventory Manager';
    res.send(getDashboardHTML(businessName));
  });

  // ─── Start Server ──────────────────────────────────────

  server = app.listen(port, () => {
    if (!hasBusinessConfig()) {
      logger.info(`🧙 Setup Wizard running at http://localhost:${port}`);
      logger.info(`   Open your browser to configure your inventory system.`);
    } else {
      logger.info(`✅ Web dashboard running at http://localhost:${port}`);
    }
  });

  registerChannel('web', async (message) => {
    logger.info(`[Web Alert] ${message}`);
  });

  return server;
}

// ─────────────────────────────────────────────────────────
// SETUP WIZARD HTML
// ─────────────────────────────────────────────────────────

function getSetupWizardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inventory Manager — Setup</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --surface2: #242836;
      --border: #2e3347;
      --primary: #6366f1;
      --primary-hover: #818cf8;
      --primary-glow: rgba(99,102,241,0.3);
      --success: #22c55e;
      --danger: #ef4444;
      --warning: #f59e0b;
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --radius: 12px;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.6;
    }

    /* Header */
    .wizard-header {
      text-align: center;
      padding: 40px 20px 20px;
    }
    .wizard-header h1 {
      font-size: 2rem;
      background: linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .wizard-header p { color: var(--text-muted); margin-top: 8px; font-size: 1.05rem; }

    /* Step indicator */
    .steps {
      display: flex;
      justify-content: center;
      gap: 0;
      padding: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .step-dot {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--surface2);
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--text-dim);
      transition: all 0.3s;
      position: relative;
      z-index: 1;
    }
    .step-dot.active {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
      box-shadow: 0 0 20px var(--primary-glow);
    }
    .step-dot.done {
      background: var(--success);
      border-color: var(--success);
      color: white;
    }
    .step-line {
      width: 40px;
      height: 2px;
      background: var(--border);
      align-self: center;
      transition: background 0.3s;
    }
    .step-line.done { background: var(--success); }

    /* Container */
    .wizard-container {
      max-width: 640px;
      margin: 0 auto;
      padding: 0 20px 40px;
    }

    /* Card */
    .wizard-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px;
      display: none;
      animation: fadeIn 0.3s ease;
    }
    .wizard-card.active { display: block; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

    .wizard-card h2 {
      font-size: 1.4rem;
      margin-bottom: 6px;
    }
    .wizard-card .subtitle {
      color: var(--text-muted);
      margin-bottom: 24px;
      font-size: 0.95rem;
    }

    /* Form fields */
    .field { margin-bottom: 18px; }
    .field label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .field input, .field select {
      width: 100%;
      padding: 12px 14px;
      background: var(--surface2);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 1rem;
      transition: border-color 0.2s;
    }
    .field input:focus, .field select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }
    .field input::placeholder { color: var(--text-dim); }
    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .field-row-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
    }

    /* Buttons */
    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--primary);
      color: white;
    }
    .btn-primary:hover { background: var(--primary-hover); transform: translateY(-1px); }
    .btn-secondary {
      background: var(--surface2);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--border); }
    .btn-success {
      background: var(--success);
      color: white;
    }
    .btn-success:hover { opacity: 0.9; }
    .btn-small {
      padding: 8px 16px;
      font-size: 0.85rem;
    }
    .btn-nav {
      display: flex;
      justify-content: space-between;
      margin-top: 28px;
    }

    /* Product list */
    .product-list {
      margin-top: 16px;
      max-height: 300px;
      overflow-y: auto;
    }
    .product-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: var(--surface2);
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 0.9rem;
    }
    .product-item .info { flex: 1; }
    .product-item .info strong { color: var(--text); }
    .product-item .info span { color: var(--text-muted); font-size: 0.8rem; margin-left: 8px; }
    .product-item .remove {
      background: none;
      border: none;
      color: var(--danger);
      cursor: pointer;
      font-size: 1.1rem;
      padding: 4px 8px;
    }
    .product-count {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    /* Template buttons */
    .templates {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }
    .template-btn {
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.8rem;
      background: var(--surface2);
      border: 1px solid var(--border);
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.2s;
    }
    .template-btn:hover, .template-btn.selected {
      border-color: var(--primary);
      color: var(--primary);
      background: rgba(99,102,241,0.1);
    }

    /* Test result */
    .test-result {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 0.9rem;
      display: none;
    }
    .test-result.success { display: block; background: rgba(34,197,94,0.1); color: var(--success); border: 1px solid rgba(34,197,94,0.2); }
    .test-result.error { display: block; background: rgba(239,68,68,0.1); color: var(--danger); border: 1px solid rgba(239,68,68,0.2); }

    /* Toggle */
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px;
      background: var(--surface2);
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .toggle-label { font-weight: 600; }
    .toggle-label small { display: block; color: var(--text-muted); font-weight: 400; font-size: 0.8rem; }
    .toggle {
      width: 48px;
      height: 26px;
      background: var(--border);
      border-radius: 13px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
    }
    .toggle.on { background: var(--primary); }
    .toggle::after {
      content: '';
      position: absolute;
      width: 22px;
      height: 22px;
      background: white;
      border-radius: 50%;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
    }
    .toggle.on::after { transform: translateX(22px); }

    /* Collapsible */
    .collapsible { display: none; margin-top: 12px; }
    .collapsible.open { display: block; }

    /* Summary */
    .summary-section {
      padding: 16px;
      background: var(--surface2);
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .summary-section h4 {
      color: var(--primary);
      margin-bottom: 8px;
      font-size: 0.95rem;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 0.9rem;
    }
    .summary-row .label { color: var(--text-muted); }
    .summary-row .value { color: var(--text); font-weight: 500; }

    /* Link */
    .api-links {
      margin-top: 12px;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .api-links a { color: var(--primary); text-decoration: none; }
    .api-links a:hover { text-decoration: underline; }

    /* CSV */
    .csv-upload {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .csv-upload input[type="file"] { display: none; }

    /* Responsive */
    @media (max-width: 480px) {
      .wizard-card { padding: 20px; }
      .field-row, .field-row-3 { grid-template-columns: 1fr; }
      .wizard-header h1 { font-size: 1.5rem; }
      .steps { gap: 0; }
      .step-line { width: 24px; }
    }
  </style>
</head>
<body>
  <div class="wizard-header">
    <h1>📦 Inventory Manager</h1>
    <p>Let's set up your business in a few steps</p>
  </div>

  <div class="steps">
    <div class="step-dot active" id="sd1">1</div>
    <div class="step-line" id="sl1"></div>
    <div class="step-dot" id="sd2">2</div>
    <div class="step-line" id="sl2"></div>
    <div class="step-dot" id="sd3">3</div>
    <div class="step-line" id="sl3"></div>
    <div class="step-dot" id="sd4">4</div>
    <div class="step-line" id="sl4"></div>
    <div class="step-dot" id="sd5">5</div>
  </div>

  <div class="wizard-container">

    <!-- STEP 1: Business Info -->
    <div class="wizard-card active" id="step1">
      <h2>🏪 Business Info</h2>
      <p class="subtitle">Tell us about your business</p>

      <div class="field">
        <label>Business Name</label>
        <input type="text" id="bizName" placeholder="e.g. Mukasa Hardware Store" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Business Type</label>
          <select id="bizType">
            <option value="hardware">🔨 Hardware Store</option>
            <option value="pharmacy">💊 Pharmacy</option>
            <option value="restaurant">🍽️ Restaurant</option>
            <option value="grocery">🛒 Grocery / Duka</option>
            <option value="clothing">👕 Clothing</option>
            <option value="electronics">📱 Electronics</option>
            <option value="general">📦 General Store</option>
          </select>
        </div>
        <div class="field">
          <label>Currency</label>
          <select id="bizCurrency">
            <option value="UGX">UGX — Uganda Shilling</option>
            <option value="KES">KES — Kenya Shilling</option>
            <option value="TZS">TZS — Tanzania Shilling</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>Owner Name</label>
        <input type="text" id="ownerName" placeholder="Your name" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Phone Number</label>
          <input type="tel" id="ownerPhone" placeholder="+256 7XX XXX XXX" />
        </div>
        <div class="field">
          <label>Email</label>
          <input type="email" id="ownerEmail" placeholder="you@email.com" />
        </div>
      </div>

      <div class="btn-nav">
        <span></span>
        <button class="btn btn-primary" onclick="goStep(2)">Next →</button>
      </div>
    </div>

    <!-- STEP 2: Products -->
    <div class="wizard-card" id="step2">
      <h2>📋 Add Your Products</h2>
      <p class="subtitle">Add products one by one or use a template for your business type</p>

      <div class="templates" id="templateBtns">
        <button class="template-btn" onclick="loadTemplate('hardware')">🔨 Hardware</button>
        <button class="template-btn" onclick="loadTemplate('pharmacy')">💊 Pharmacy</button>
        <button class="template-btn" onclick="loadTemplate('restaurant')">🍽️ Restaurant</button>
        <button class="template-btn" onclick="loadTemplate('grocery')">🛒 Grocery</button>
        <button class="template-btn" onclick="loadTemplate('clothing')">👕 Clothing</button>
        <button class="template-btn" onclick="loadTemplate('electronics')">📱 Electronics</button>
      </div>

      <div class="csv-upload">
        <button class="btn btn-secondary btn-small" onclick="document.getElementById('csvFile').click()">📁 Import CSV</button>
        <input type="file" id="csvFile" accept=".csv" onchange="importCSV(this)" />
        <span style="color:var(--text-dim);font-size:0.8rem;align-self:center">Format: Name, Category, Unit, BuyPrice, SellPrice, Stock, MinStock</span>
      </div>

      <div class="field-row">
        <div class="field"><label>Product Name</label><input type="text" id="pName" placeholder="e.g. Cement (50kg)" /></div>
        <div class="field"><label>Category</label><input type="text" id="pCategory" placeholder="e.g. Building Materials" /></div>
      </div>
      <div class="field-row-3">
        <div class="field"><label>Unit</label>
          <select id="pUnit">
            <option value="piece">Piece</option>
            <option value="bag">Bag</option>
            <option value="kg">Kg</option>
            <option value="box">Box</option>
            <option value="tin">Tin</option>
            <option value="bottle">Bottle</option>
            <option value="packet">Packet</option>
            <option value="meter">Meter</option>
            <option value="liter">Liter</option>
            <option value="roll">Roll</option>
          </select>
        </div>
        <div class="field"><label>Buy Price</label><input type="number" id="pBuy" placeholder="0" /></div>
        <div class="field"><label>Sell Price</label><input type="number" id="pSell" placeholder="0" /></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Starting Stock</label><input type="number" id="pStock" placeholder="0" /></div>
        <div class="field"><label>Min Stock Alert</label><input type="number" id="pMin" placeholder="5" /></div>
      </div>

      <button class="btn btn-success btn-small" onclick="addProduct()">+ Add Product</button>

      <div class="product-count" id="productCount"></div>
      <div class="product-list" id="productList"></div>

      <div class="btn-nav">
        <button class="btn btn-secondary" onclick="goStep(1)">← Back</button>
        <button class="btn btn-primary" onclick="goStep(3)">Next →</button>
      </div>
    </div>

    <!-- STEP 3: AI Setup -->
    <div class="wizard-card" id="step3">
      <h2>🤖 AI Setup</h2>
      <p class="subtitle">Connect an AI provider so the agent can understand your messages</p>

      <div class="field">
        <label>AI Provider</label>
        <select id="llmProvider" onchange="updateLLMFields()">
          <option value="openai">OpenAI (GPT-4o)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="google">Google (Gemini)</option>
          <option value="azure">Azure OpenAI</option>
          <option value="ollama">Ollama (Local / Free)</option>
        </select>
      </div>

      <div class="field" id="llmKeyField">
        <label>API Key</label>
        <input type="password" id="llmKey" placeholder="sk-..." />
      </div>

      <div class="field" id="llmEndpointField" style="display:none">
        <label>Endpoint URL</label>
        <input type="text" id="llmEndpoint" placeholder="https://your-resource.openai.azure.com" />
      </div>

      <div class="field">
        <label>Model</label>
        <select id="llmModel"></select>
      </div>

      <div style="display:flex;gap:12px;align-items:center">
        <button class="btn btn-secondary btn-small" onclick="testLLM()">🧪 Test Connection</button>
        <span id="testSpinner" style="display:none;color:var(--text-muted)">Testing...</span>
      </div>
      <div class="test-result" id="testResult"></div>

      <div class="api-links">
        Don't have an API key? Get one free:
        <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI</a> |
        <a href="https://console.anthropic.com/" target="_blank">Anthropic</a> |
        <a href="https://aistudio.google.com/apikey" target="_blank">Google</a>
      </div>

      <div class="btn-nav">
        <button class="btn btn-secondary" onclick="goStep(2)">← Back</button>
        <button class="btn btn-primary" onclick="goStep(4)">Next →</button>
      </div>
    </div>

    <!-- STEP 4: Channels -->
    <div class="wizard-card" id="step4">
      <h2>📡 Channels</h2>
      <p class="subtitle">How do you want to interact with your inventory?</p>

      <div class="toggle-row">
        <div class="toggle-label">📱 WhatsApp<small>Manage inventory via WhatsApp messages</small></div>
        <div class="toggle" id="waToggle" onclick="toggleWA()"></div>
      </div>
      <div class="collapsible" id="waSection">
        <div style="text-align:center;padding:16px;background:var(--surface2);border-radius:8px;margin-bottom:12px;">
          <p style="color:var(--text-muted);font-size:0.85rem">WhatsApp QR code will appear here after setup.<br>You'll scan it with your phone to connect.</p>
        </div>
      </div>

      <div class="toggle-row">
        <div class="toggle-label">📧 Email Alerts<small>Receive daily reports and low-stock alerts by email</small></div>
        <div class="toggle" id="emailToggle" onclick="toggleEmail()"></div>
      </div>
      <div class="collapsible" id="emailSection">
        <div class="field-row">
          <div class="field"><label>SMTP Host</label><input type="text" id="smtpHost" value="smtp-relay.brevo.com" /></div>
          <div class="field"><label>SMTP Port</label><input type="number" id="smtpPort" value="587" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>SMTP User</label><input type="text" id="smtpUser" placeholder="your-brevo-login@email.com" /></div>
          <div class="field"><label>SMTP Password</label><input type="password" id="smtpPass" placeholder="SMTP key" /></div>
        </div>
        <div class="field">
          <label>Send Reports To</label>
          <input type="email" id="alertEmail" placeholder="owner@email.com" />
        </div>
        <button class="btn btn-secondary btn-small" onclick="presetBrevo()" style="margin-bottom:12px">🟦 Use Brevo Defaults</button>
        <p style="font-size:0.8rem;color:var(--text-dim)">
          <a href="https://app.brevo.com" target="_blank" style="color:var(--primary)">Sign up for Brevo</a> — free 300 emails/day, no credit card
        </p>
      </div>

      <div class="field" style="margin-top:16px">
        <label>Web Dashboard Port</label>
        <input type="number" id="webPort" value="3000" />
      </div>

      <div class="btn-nav">
        <button class="btn btn-secondary" onclick="goStep(3)">← Back</button>
        <button class="btn btn-primary" onclick="goStep(5)">Next →</button>
      </div>
    </div>

    <!-- STEP 5: Summary -->
    <div class="wizard-card" id="step5">
      <h2>🎉 All Set!</h2>
      <p class="subtitle">Here's a summary of your configuration</p>

      <div id="summaryContent"></div>

      <div style="text-align:center;margin-top:24px">
        <button class="btn btn-primary" style="padding:16px 40px;font-size:1.1rem" onclick="saveSetup()">
          🚀 Start Managing Inventory →
        </button>
      </div>
      <p id="saveStatus" style="text-align:center;margin-top:12px;font-size:0.9rem;color:var(--text-muted)"></p>

      <div class="btn-nav">
        <button class="btn btn-secondary" onclick="goStep(4)">← Back</button>
        <span></span>
      </div>
    </div>

  </div>

  <script>
    // ─── State ─────────────────────────────────────────
    let currentStep = 1;
    const products = [];
    let waEnabled = false;
    let emailEnabled = false;

    // ─── Product Templates ─────────────────────────────
    const templates = {
      hardware: [
        { name: 'Cement (50kg bag)', category: 'Building Materials', unit: 'bag', buyPrice: 32000, sellPrice: 38000, startingStock: 0, minStock: 20 },
        { name: 'Iron Sheets (30 gauge)', category: 'Building Materials', unit: 'piece', buyPrice: 25000, sellPrice: 32000, startingStock: 0, minStock: 50 },
        { name: 'Nails (4 inch)', category: 'Building Materials', unit: 'kg', buyPrice: 5000, sellPrice: 7000, startingStock: 0, minStock: 15 },
        { name: 'Plascon Emulsion (20L)', category: 'Paint', unit: 'tin', buyPrice: 180000, sellPrice: 220000, startingStock: 0, minStock: 10 },
        { name: 'PVC Pipe (1/2 inch)', category: 'Plumbing', unit: 'piece', buyPrice: 8000, sellPrice: 12000, startingStock: 0, minStock: 20 },
        { name: 'Sand (trip)', category: 'Building Materials', unit: 'piece', buyPrice: 150000, sellPrice: 200000, startingStock: 0, minStock: 2 },
        { name: 'Binding Wire', category: 'Building Materials', unit: 'kg', buyPrice: 6000, sellPrice: 8000, startingStock: 0, minStock: 10 },
        { name: 'Padlock (heavy duty)', category: 'Security', unit: 'piece', buyPrice: 15000, sellPrice: 25000, startingStock: 0, minStock: 5 },
      ],
      pharmacy: [
        { name: 'Paracetamol (500mg)', category: 'Pain Relief', unit: 'packet', buyPrice: 1000, sellPrice: 2000, startingStock: 0, minStock: 50 },
        { name: 'Amoxicillin (250mg)', category: 'Antibiotics', unit: 'packet', buyPrice: 3000, sellPrice: 5000, startingStock: 0, minStock: 30 },
        { name: 'ORS Sachets', category: 'Rehydration', unit: 'packet', buyPrice: 500, sellPrice: 1000, startingStock: 0, minStock: 100 },
        { name: 'Coartem (Artemether)', category: 'Antimalarials', unit: 'packet', buyPrice: 5000, sellPrice: 8000, startingStock: 0, minStock: 30 },
        { name: 'Bandages (roll)', category: 'First Aid', unit: 'roll', buyPrice: 2000, sellPrice: 3500, startingStock: 0, minStock: 20 },
        { name: 'Cough Syrup (100ml)', category: 'Cough & Cold', unit: 'bottle', buyPrice: 4000, sellPrice: 7000, startingStock: 0, minStock: 15 },
      ],
      restaurant: [
        { name: 'Rice (25kg)', category: 'Grains', unit: 'bag', buyPrice: 90000, sellPrice: 0, startingStock: 0, minStock: 5 },
        { name: 'Cooking Oil (20L)', category: 'Oil', unit: 'tin', buyPrice: 85000, sellPrice: 0, startingStock: 0, minStock: 3 },
        { name: 'Tomatoes', category: 'Vegetables', unit: 'kg', buyPrice: 3000, sellPrice: 0, startingStock: 0, minStock: 10 },
        { name: 'Onions', category: 'Vegetables', unit: 'kg', buyPrice: 4000, sellPrice: 0, startingStock: 0, minStock: 10 },
        { name: 'Chicken', category: 'Meat', unit: 'kg', buyPrice: 12000, sellPrice: 0, startingStock: 0, minStock: 5 },
        { name: 'Beef', category: 'Meat', unit: 'kg', buyPrice: 15000, sellPrice: 0, startingStock: 0, minStock: 5 },
        { name: 'Posho Flour (25kg)', category: 'Grains', unit: 'bag', buyPrice: 60000, sellPrice: 0, startingStock: 0, minStock: 3 },
        { name: 'Charcoal (sack)', category: 'Fuel', unit: 'bag', buyPrice: 40000, sellPrice: 0, startingStock: 0, minStock: 2 },
      ],
      grocery: [
        { name: 'Sugar (1kg)', category: 'Staples', unit: 'kg', buyPrice: 4000, sellPrice: 5000, startingStock: 0, minStock: 20 },
        { name: 'Bread (loaf)', category: 'Bakery', unit: 'piece', buyPrice: 4000, sellPrice: 5000, startingStock: 0, minStock: 10 },
        { name: 'Milk (500ml)', category: 'Dairy', unit: 'packet', buyPrice: 2000, sellPrice: 3000, startingStock: 0, minStock: 20 },
        { name: 'Bar Soap', category: 'Personal Care', unit: 'piece', buyPrice: 3000, sellPrice: 4500, startingStock: 0, minStock: 30 },
        { name: 'Washing Powder (1kg)', category: 'Cleaning', unit: 'packet', buyPrice: 5000, sellPrice: 7000, startingStock: 0, minStock: 15 },
        { name: 'Rice (1kg)', category: 'Staples', unit: 'kg', buyPrice: 4000, sellPrice: 5500, startingStock: 0, minStock: 20 },
        { name: 'Eggs (tray of 30)', category: 'Dairy', unit: 'piece', buyPrice: 12000, sellPrice: 15000, startingStock: 0, minStock: 5 },
      ],
      clothing: [
        { name: 'T-Shirt', category: 'Tops', unit: 'piece', buyPrice: 10000, sellPrice: 20000, startingStock: 0, minStock: 10 },
        { name: 'Jeans', category: 'Bottoms', unit: 'piece', buyPrice: 25000, sellPrice: 45000, startingStock: 0, minStock: 5 },
        { name: 'Dress', category: 'Dresses', unit: 'piece', buyPrice: 20000, sellPrice: 40000, startingStock: 0, minStock: 5 },
        { name: 'Shoes (pair)', category: 'Footwear', unit: 'piece', buyPrice: 30000, sellPrice: 55000, startingStock: 0, minStock: 5 },
        { name: 'Socks (pair)', category: 'Accessories', unit: 'piece', buyPrice: 2000, sellPrice: 5000, startingStock: 0, minStock: 20 },
      ],
      electronics: [
        { name: 'Phone Charger (USB-C)', category: 'Accessories', unit: 'piece', buyPrice: 8000, sellPrice: 15000, startingStock: 0, minStock: 10 },
        { name: 'Earphones', category: 'Audio', unit: 'piece', buyPrice: 5000, sellPrice: 12000, startingStock: 0, minStock: 10 },
        { name: 'Screen Protector', category: 'Accessories', unit: 'piece', buyPrice: 2000, sellPrice: 5000, startingStock: 0, minStock: 20 },
        { name: 'Phone Case', category: 'Accessories', unit: 'piece', buyPrice: 5000, sellPrice: 12000, startingStock: 0, minStock: 15 },
        { name: 'USB Cable', category: 'Cables', unit: 'piece', buyPrice: 3000, sellPrice: 7000, startingStock: 0, minStock: 15 },
        { name: 'Power Bank (10000mAh)', category: 'Power', unit: 'piece', buyPrice: 30000, sellPrice: 50000, startingStock: 0, minStock: 5 },
      ],
    };

    // ─── LLM Models ────────────────────────────────────
    const llmModels = {
      openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      anthropic: ['claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
      google: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'],
      azure: ['gpt-4o-mini', 'gpt-4o', 'gpt-4', 'gpt-35-turbo'],
      ollama: ['llama3', 'mistral', 'codellama', 'phi3', 'gemma'],
    };

    // ─── Navigation ────────────────────────────────────
    function goStep(n) {
      // Validate current step before moving forward
      if (n > currentStep) {
        if (currentStep === 1 && !document.getElementById('bizName').value.trim()) {
          document.getElementById('bizName').focus();
          return;
        }
      }

      // Update step indicators
      for (let i = 1; i <= 5; i++) {
        const dot = document.getElementById('sd' + i);
        dot.classList.remove('active', 'done');
        if (i < n) dot.classList.add('done');
        else if (i === n) dot.classList.add('active');

        if (i < 5) {
          const line = document.getElementById('sl' + i);
          line.classList.toggle('done', i < n);
        }

        document.getElementById('step' + i).classList.toggle('active', i === n);
      }

      currentStep = n;

      // Build summary on step 5
      if (n === 5) buildSummary();

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─── Products ──────────────────────────────────────
    function addProduct() {
      const name = document.getElementById('pName').value.trim();
      if (!name) { document.getElementById('pName').focus(); return; }

      products.push({
        name,
        category: document.getElementById('pCategory').value.trim() || 'General',
        unit: document.getElementById('pUnit').value,
        buyPrice: document.getElementById('pBuy').value || 0,
        sellPrice: document.getElementById('pSell').value || 0,
        startingStock: document.getElementById('pStock').value || 0,
        minStock: document.getElementById('pMin').value || 5,
      });

      // Clear form
      document.getElementById('pName').value = '';
      document.getElementById('pBuy').value = '';
      document.getElementById('pSell').value = '';
      document.getElementById('pStock').value = '';
      document.getElementById('pMin').value = '';

      renderProducts();
      document.getElementById('pName').focus();
    }

    function removeProduct(idx) {
      products.splice(idx, 1);
      renderProducts();
    }

    function renderProducts() {
      const list = document.getElementById('productList');
      const count = document.getElementById('productCount');
      count.textContent = products.length ? products.length + ' product(s) added' : '';
      list.innerHTML = products.map((p, i) => \`
        <div class="product-item">
          <div class="info">
            <strong>\${p.name}</strong>
            <span>\${p.category} · \${p.unit} · Buy: \${Number(p.buyPrice).toLocaleString()} / Sell: \${Number(p.sellPrice).toLocaleString()}</span>
          </div>
          <button class="remove" onclick="removeProduct(\${i})">✕</button>
        </div>
      \`).join('');
    }

    function loadTemplate(type) {
      const tpl = templates[type];
      if (!tpl) return;
      // Clear and load template
      products.length = 0;
      for (const p of tpl) products.push({ ...p });
      renderProducts();
      // Highlight button
      document.querySelectorAll('.template-btn').forEach(b => b.classList.remove('selected'));
      event.target.classList.add('selected');
    }

    function importCSV(input) {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const lines = e.target.result.split('\\n').filter(l => l.trim());
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip header
          if (i === 0 && line.toLowerCase().includes('name')) continue;
          const cols = line.split(',').map(c => c.trim());
          if (cols.length >= 1 && cols[0]) {
            products.push({
              name: cols[0],
              category: cols[1] || 'General',
              unit: cols[2] || 'piece',
              buyPrice: cols[3] || 0,
              sellPrice: cols[4] || 0,
              startingStock: cols[5] || 0,
              minStock: cols[6] || 5,
            });
          }
        }
        renderProducts();
      };
      reader.readAsText(file);
      input.value = '';
    }

    // ─── LLM ───────────────────────────────────────────
    function updateLLMFields() {
      const provider = document.getElementById('llmProvider').value;
      const keyField = document.getElementById('llmKeyField');
      const endpointField = document.getElementById('llmEndpointField');
      const modelSelect = document.getElementById('llmModel');

      keyField.style.display = provider === 'ollama' ? 'none' : 'block';
      endpointField.style.display = (provider === 'azure' || provider === 'ollama') ? 'block' : 'none';
      if (provider === 'ollama') {
        document.getElementById('llmEndpoint').placeholder = 'http://localhost:11434';
      } else if (provider === 'azure') {
        document.getElementById('llmEndpoint').placeholder = 'https://your-resource.openai.azure.com';
      }

      const models = llmModels[provider] || [];
      modelSelect.innerHTML = models.map(m => '<option value="' + m + '">' + m + '</option>').join('');

      // Hide test result
      document.getElementById('testResult').className = 'test-result';
      document.getElementById('testResult').style.display = 'none';
    }
    updateLLMFields();

    async function testLLM() {
      const provider = document.getElementById('llmProvider').value;
      const apiKey = document.getElementById('llmKey').value;
      const model = document.getElementById('llmModel').value;
      const endpoint = document.getElementById('llmEndpoint').value;
      const resultEl = document.getElementById('testResult');
      const spinner = document.getElementById('testSpinner');

      spinner.style.display = 'inline';
      resultEl.style.display = 'none';

      try {
        const resp = await fetch('/api/setup/test-llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey, model, endpoint }),
        });
        const data = await resp.json();
        resultEl.textContent = (data.success ? '✅ ' : '❌ ') + data.message;
        resultEl.className = 'test-result ' + (data.success ? 'success' : 'error');
        resultEl.style.display = 'block';
      } catch (err) {
        resultEl.textContent = '❌ ' + err.message;
        resultEl.className = 'test-result error';
        resultEl.style.display = 'block';
      }
      spinner.style.display = 'none';
    }

    // ─── Channels ──────────────────────────────────────
    function toggleWA() {
      waEnabled = !waEnabled;
      document.getElementById('waToggle').classList.toggle('on', waEnabled);
      document.getElementById('waSection').classList.toggle('open', waEnabled);
    }

    function toggleEmail() {
      emailEnabled = !emailEnabled;
      document.getElementById('emailToggle').classList.toggle('on', emailEnabled);
      document.getElementById('emailSection').classList.toggle('open', emailEnabled);
    }

    function presetBrevo() {
      document.getElementById('smtpHost').value = 'smtp-relay.brevo.com';
      document.getElementById('smtpPort').value = '587';
    }

    // ─── Summary ───────────────────────────────────────
    function buildSummary() {
      const html = \`
        <div class="summary-section">
          <h4>🏪 Business</h4>
          <div class="summary-row"><span class="label">Name</span><span class="value">\${document.getElementById('bizName').value || '—'}</span></div>
          <div class="summary-row"><span class="label">Type</span><span class="value">\${document.getElementById('bizType').value}</span></div>
          <div class="summary-row"><span class="label">Currency</span><span class="value">\${document.getElementById('bizCurrency').value}</span></div>
          <div class="summary-row"><span class="label">Owner</span><span class="value">\${document.getElementById('ownerName').value || '—'}</span></div>
        </div>
        <div class="summary-section">
          <h4>📋 Products</h4>
          <div class="summary-row"><span class="label">Total Products</span><span class="value">\${products.length}</span></div>
        </div>
        <div class="summary-section">
          <h4>🤖 AI Provider</h4>
          <div class="summary-row"><span class="label">Provider</span><span class="value">\${document.getElementById('llmProvider').value}</span></div>
          <div class="summary-row"><span class="label">Model</span><span class="value">\${document.getElementById('llmModel').value}</span></div>
        </div>
        <div class="summary-section">
          <h4>📡 Channels</h4>
          <div class="summary-row"><span class="label">WhatsApp</span><span class="value">\${waEnabled ? '✅ Enabled' : '❌ Disabled'}</span></div>
          <div class="summary-row"><span class="label">Email</span><span class="value">\${emailEnabled ? '✅ Enabled' : '❌ Disabled'}</span></div>
          <div class="summary-row"><span class="label">Web Dashboard</span><span class="value">Port \${document.getElementById('webPort').value}</span></div>
        </div>
      \`;
      document.getElementById('summaryContent').innerHTML = html;
    }

    // ─── Save ──────────────────────────────────────────
    async function saveSetup() {
      const statusEl = document.getElementById('saveStatus');
      statusEl.textContent = '⏳ Saving configuration...';

      const payload = {
        business: {
          name: document.getElementById('bizName').value.trim(),
          type: document.getElementById('bizType').value,
          currency: document.getElementById('bizCurrency').value,
          ownerName: document.getElementById('ownerName').value.trim(),
          phone: document.getElementById('ownerPhone').value.trim(),
          email: document.getElementById('ownerEmail').value.trim(),
        },
        products: products,
        llm: {
          provider: document.getElementById('llmProvider').value,
          apiKey: document.getElementById('llmKey').value,
          model: document.getElementById('llmModel').value,
          endpoint: document.getElementById('llmEndpoint').value,
        },
        channels: {
          whatsapp: waEnabled,
          webPort: document.getElementById('webPort').value,
          email: emailEnabled ? {
            smtp_host: document.getElementById('smtpHost').value,
            smtp_port: document.getElementById('smtpPort').value,
            smtp_user: document.getElementById('smtpUser').value,
            smtp_pass: document.getElementById('smtpPass').value,
            owner_email: document.getElementById('alertEmail').value,
          } : null,
        },
      };

      try {
        const resp = await fetch('/api/setup/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await resp.json();
        if (data.success) {
          statusEl.innerHTML = '✅ Configuration saved! <strong>Restarting...</strong><br><small>The page will reload in 3 seconds.</small>';
          setTimeout(() => window.location.reload(), 3000);
        } else {
          statusEl.textContent = '❌ ' + data.message;
        }
      } catch (err) {
        statusEl.textContent = '❌ Error: ' + err.message;
      }
    }

    // Auto-select template based on business type
    document.getElementById('bizType').addEventListener('change', (e) => {
      const type = e.target.value;
      if (templates[type] && products.length === 0) {
        loadTemplate(type);
      }
    });
  </script>
</body>
</html>`;
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
    .qr-section { text-align: center; margin-bottom: 20px; }
    .qr-section canvas { max-width: 280px; }
    .qr-status { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; }
    .qr-status.connected { background: #e8f5e9; color: #2e7d32; }
    .qr-status.qr_pending { background: #fff3e0; color: #e65100; }
    .qr-status.disconnected { background: #ffebee; color: #c62828; }
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

    <!-- WhatsApp QR Code -->
    <div class="card qr-section" id="qrSection" style="display:none; margin-bottom: 20px">
      <h3>📱 WhatsApp Connection</h3>
      <div id="qrStatus" style="margin: 10px 0"></div>
      <div id="qrCanvas"></div>
      <p id="qrHelp" style="margin-top:10px; font-size:0.85rem; color:#666"></p>
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
    setInterval(loadData, 30000);

    // ─── WhatsApp QR Code ──────────────────────────
    const qrScript = document.createElement('script');
    qrScript.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
    document.head.appendChild(qrScript);

    async function checkWhatsApp() {
      try {
        const res = await fetch('/api/whatsapp/qr');
        const data = await res.json();
        const section = document.getElementById('qrSection');
        const statusEl = document.getElementById('qrStatus');
        const canvasEl = document.getElementById('qrCanvas');
        const helpEl = document.getElementById('qrHelp');

        if (data.status === 'connected') {
          section.style.display = 'block';
          statusEl.innerHTML = '<span class="qr-status connected">✅ WhatsApp Connected</span>';
          canvasEl.innerHTML = '';
          helpEl.textContent = 'Your WhatsApp is linked and ready to receive messages.';
        } else if (data.status === 'qr_pending' && data.qr && typeof QRCode !== 'undefined') {
          section.style.display = 'block';
          statusEl.innerHTML = '<span class="qr-status qr_pending">📱 Scan QR Code</span>';
          canvasEl.innerHTML = '<canvas id="qrImg"></canvas>';
          QRCode.toCanvas(document.getElementById('qrImg'), data.qr, { width: 280 });
          helpEl.textContent = 'Open WhatsApp → Settings → Linked Devices → Link a Device → Scan this QR';
        } else if (data.status === 'disconnected') {
          section.style.display = 'block';
          statusEl.innerHTML = '<span class="qr-status disconnected">❌ WhatsApp Disconnected</span>';
          canvasEl.innerHTML = '';
          helpEl.textContent = 'Waiting for reconnection...';
        }
      } catch (err) {
        // Silently ignore — WhatsApp may not be enabled
      }
    }

    setTimeout(checkWhatsApp, 1000);
    setInterval(checkWhatsApp, 3000);
  </script>
</body>
</html>`;
}

export function getWebStatus() {
  return server ? 'running' : 'stopped';
}

export default { startWeb, getWebStatus };
