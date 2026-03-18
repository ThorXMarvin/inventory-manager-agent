/**
 * Inventory Manager Agent — Main Entry Point
 * Loads config, initializes DB, starts enabled channels, and schedules cron jobs.
 */

import { getConfig, loadBusinessConfig } from './utils/config.js';
import { initDatabase, getDb, closeDatabase } from './db/sqlite.js';
import { logger } from './utils/logger.js';
import { startWhatsApp } from './channels/whatsapp.js';
import { startTelegram } from './channels/telegram.js';
import { startWeb } from './channels/web.js';
import { checkLowStock } from './alerts/engine.js';
import { sendAlert } from './alerts/notifier.js';
import { dailySummary } from './agent/reports.js';
import cron from 'node-cron';

async function main() {
  logger.info('🚀 Inventory Manager Agent starting...');

  // Load configuration
  const config = getConfig();
  logger.info(`Business: ${config.business.name || 'Not configured'}`);
  logger.info(`Currency: ${config.business.currency || 'UGX'}`);
  logger.info(`LLM: ${config.llm.provider} / ${config.llm.model}`);

  // Initialize database
  initDatabase(config.db.path);

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
      const result = checkLowStock();
      if (result.hasAlerts) {
        await sendAlert(result.message, config.alerts.low_stock.notify_via);
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
      const report = dailySummary();
      await sendAlert(report);
    });
    logger.info(`Scheduled: Daily summary at ${time}`);
  }

  logger.info('✅ Inventory Manager Agent is ready!');
}

/**
 * Seed products from YAML config into the database if it's empty.
 * Only runs on first start with a fresh DB.
 */
function seedProductsFromConfig(config) {
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
}

// ─── Graceful Shutdown ──────────────────────────────────

function shutdown(signal) {
  logger.info(`${signal} received. Shutting down...`);
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
