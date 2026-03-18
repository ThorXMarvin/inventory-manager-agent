/**
 * Inventory Manager Agent — Main Entry Point (v2)
 * 
 * v2 changes:
 * - Uses storage adapter layer instead of direct DB calls
 * - Supports SQLite, Google Sheets, or hybrid ("both") mode
 * - Agent brain uses LLM function calling instead of parser-based intents
 */

import { getConfig, loadBusinessConfig } from './utils/config.js';
import { createStorageAdapter, getStorage, closeStorage } from './storage/adapter.js';
import { initDatabase, getDb, closeDatabase } from './db/sqlite.js';
import { logger } from './utils/logger.js';
import { startWhatsApp, stopWhatsApp } from './channels/whatsapp.js';
import { startTelegram } from './channels/telegram.js';
import { startWeb } from './channels/web.js';
import { startEmail, stopEmail } from './channels/email.js';
import { checkLowStock } from './alerts/engine.js';
import { sendAlert } from './alerts/notifier.js';
import cron from 'node-cron';

async function main() {
  logger.info('🚀 Inventory Manager Agent v2 starting...');

  // Load configuration
  const config = getConfig();
  logger.info(`Business: ${config.business.name || 'Not configured'}`);
  logger.info(`Currency: ${config.business.currency || 'UGX'}`);
  logger.info(`LLM: ${config.llm.provider} / ${config.llm.model}`);

  // ─── Initialize Storage ────────────────────────────────
  const storageMode = config.storage?.mode || 'sqlite';
  logger.info(`Storage mode: ${storageMode}`);

  // Initialize the storage adapter (handles SQLite, Sheets, or both)
  const storage = await createStorageAdapter(config);
  logger.info(`Storage adapter "${storage.name}" initialized`);

  // Also initialize the legacy DB for backward compatibility with existing modules
  // (alerts/engine.js, old reports, etc. still use getDb())
  initDatabase(config.db?.path || config.storage?.sqlite?.path || './data/inventory.db');

  // Seed products from YAML config if DB is empty
  seedProductsFromConfig(config);

  // Start enabled channels
  const startedChannels = [];

  if (config.web.enabled) {
    try {
      await startWeb(config.web.port);
      startedChannels.push('web');
    } catch (err) {
      logger.error(`Failed to start web channel: ${err.message}`);
    }
  }

  if (config.telegram.enabled) {
    try {
      await startTelegram();
      startedChannels.push('telegram');
    } catch (err) {
      logger.error(`Failed to start Telegram channel: ${err.message}`);
    }
  }

  if (config.whatsapp.enabled) {
    try {
      await startWhatsApp();
      startedChannels.push('whatsapp');
    } catch (err) {
      logger.error(`Failed to start WhatsApp channel: ${err.message}`);
    }
  }

  // Email channel (outbound notifications only — not conversational)
  const emailConfig = config.channels?.email;
  if (emailConfig?.enabled) {
    try {
      await startEmail(emailConfig);
      startedChannels.push('email');
    } catch (err) {
      logger.error(`Failed to start email channel: ${err.message}`);
    }
  }

  if (startedChannels.length === 0) {
    logger.warn('No channels started! Enable at least one channel in .env');
    logger.info('Set WEB_ENABLED=true, TELEGRAM_ENABLED=true, or WHATSAPP_ENABLED=true');
  } else {
    logger.info(`Active channels: ${startedChannels.join(', ')}`);
  }

  // ─── Cron Jobs ──────────────────────────────────────────

  // Low stock check every 6 hours
  if (config.alerts?.low_stock?.enabled) {
    cron.schedule('0 */6 * * *', async () => {
      logger.info('Running scheduled low stock check...');
      try {
        const lowItems = await storage.getLowStock();
        if (lowItems.length > 0) {
          let message = `⚠️ *LOW STOCK ALERT*\n\n${lowItems.length} item(s) below minimum:\n`;
          for (const item of lowItems) {
            message += `  • ${item.name}: ${item.current_stock} left (min: ${item.min_stock})\n`;
          }
          message += '\nRestock soon!';
          await sendAlert(message, config.alerts.low_stock.notify_via);
        }
      } catch (err) {
        logger.error(`Low stock check failed: ${err.message}`);
      }
    });
    logger.info('Scheduled: Low stock check every 6 hours');
  }

  // Daily summary at configured time
  if (config.alerts?.daily_summary?.enabled) {
    const time = config.alerts.daily_summary.time || '20:00';
    const [hour, minute] = time.split(':');
    const cronExpr = `${minute || '0'} ${hour || '20'} * * *`;

    cron.schedule(cronExpr, async () => {
      logger.info('Running scheduled daily summary...');
      try {
        const summary = await storage.getDailySummary();
        const currency = config.business.currency || 'UGX';
        const fmt = n => Number(n || 0).toLocaleString();

        let report = `📊 *Daily Summary*\n\n`;
        report += `💰 Sales: ${summary.transactions} transactions\n`;
        report += `💵 Revenue: ${currency} ${fmt(summary.revenue)}\n`;
        report += `📈 Profit: ${currency} ${fmt(summary.estimatedProfit)}\n`;

        await sendAlert(report);
      } catch (err) {
        logger.error(`Daily summary failed: ${err.message}`);
      }
    });
    logger.info(`Scheduled: Daily summary at ${time}`);
  }

  logger.info('✅ Inventory Manager Agent v2 is ready!');
}

/**
 * Seed products from YAML config into the database if it's empty.
 */
function seedProductsFromConfig(config) {
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as c FROM products').get().c;

    if (count > 0) {
      logger.debug(`Database has ${count} products, skipping seed.`);
      return;
    }

    if (!config.categories || config.categories.length === 0) {
      logger.info('No categories in config, skipping product seed.');
      return;
    }

    const insertStmt = db.prepare(`
      INSERT INTO products (name, sku, category, unit, buy_price, sell_price, current_stock, min_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let seeded = 0;
    const txn = db.transaction(() => {
      for (const category of config.categories) {
        for (const product of (category.products || [])) {
          insertStmt.run(
            product.name,
            product.sku || null,
            category.name || 'General',
            product.unit || 'piece',
            product.buy_price || 0,
            product.sell_price || 0,
            product.current_stock || 0,
            product.min_stock || 0,
          );
          seeded++;
        }
      }
    });

    txn();
    logger.info(`Seeded ${seeded} products from config.`);
  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
  }
}

// ─── Graceful Shutdown ──────────────────────────────────

async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down...`);
  await stopWhatsApp();
  await stopEmail();
  await closeStorage();
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}`, err);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});

// Start the agent
main().catch((err) => {
  logger.error(`Fatal error: ${err.message}`, err);
  process.exit(1);
});
