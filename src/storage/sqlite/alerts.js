/**
 * SQLite Alerts Storage
 */

import { getSqliteDb } from './client.js';

/**
 * Log an alert to the database.
 * @param {Object} data - { product_id, type, message, sent_via }
 */
export function logAlert(data) {
  const db = getSqliteDb();
  db.prepare('INSERT INTO alerts (product_id, type, message, sent_via) VALUES (?, ?, ?, ?)')
    .run(data.product_id || null, data.type, data.message, data.sent_via || null);
}

/**
 * Get recent unacknowledged alerts.
 * @param {number} limit
 * @returns {Array}
 */
export function getRecentAlerts(limit = 20) {
  const db = getSqliteDb();
  return db.prepare(`
    SELECT a.*, p.name as product_name
    FROM alerts a LEFT JOIN products p ON a.product_id = p.id
    WHERE a.acknowledged = 0
    ORDER BY a.created_at DESC LIMIT ?
  `).all(limit);
}

export default { logAlert, getRecentAlerts };
