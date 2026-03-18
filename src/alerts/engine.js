/**
 * Alert Engine
 * Scans inventory for low-stock items and generates alerts.
 */

import { getLowStock } from '../agent/stock.js';
import { getDb } from '../db/sqlite.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Check for low-stock items and return formatted alert if any found.
 * @returns {object} { hasAlerts, message, items }
 */
export function checkLowStock() {
  const config = getConfig();
  const lowItems = getLowStock();

  if (lowItems.length === 0) {
    logger.debug('Low stock check: all items OK');
    return { hasAlerts: false, message: null, items: [] };
  }

  let message = `⚠️ *LOW STOCK ALERT*\n\n`;
  message += `${lowItems.length} item(s) below minimum level:\n`;

  for (const item of lowItems) {
    message += `  • ${item.name}: ${item.current_stock} left (min: ${item.min_stock})\n`;
  }

  message += `\nRestock these items soon to avoid stockouts.`;

  // Save alert to DB
  try {
    const db = getDb();
    const insertAlert = db.prepare(
      'INSERT INTO alerts (product_id, type, message) VALUES (?, ?, ?)'
    );
    for (const item of lowItems) {
      insertAlert.run(item.id, 'low_stock', `${item.name}: ${item.current_stock}/${item.min_stock}`);
    }
  } catch (err) {
    logger.error(`Failed to save alerts: ${err.message}`);
  }

  logger.warn(`Low stock alert: ${lowItems.length} item(s) below minimum`);
  return { hasAlerts: true, message, items: lowItems };
}

/**
 * Get recent unacknowledged alerts.
 * @param {number} limit
 * @returns {Array}
 */
export function getRecentAlerts(limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT a.*, p.name as product_name
    FROM alerts a
    LEFT JOIN products p ON a.product_id = p.id
    WHERE a.acknowledged = 0
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Acknowledge (dismiss) an alert.
 * @param {number} alertId
 */
export function acknowledgeAlert(alertId) {
  const db = getDb();
  db.prepare('UPDATE alerts SET acknowledged = 1 WHERE id = ?').run(alertId);
}

export default { checkLowStock, getRecentAlerts, acknowledgeAlert };
