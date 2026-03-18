/**
 * SQLite Customers Storage
 */

import { getSqliteDb } from './client.js';
import { logger } from '../../utils/logger.js';

/**
 * Find or create a customer by name.
 * @param {string} name
 * @returns {Object}
 */
export function getOrCreateCustomer(name) {
  if (!name) return null;
  const db = getSqliteDb();
  let customer = db.prepare('SELECT * FROM customers WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (!customer) {
    const result = db.prepare('INSERT INTO customers (name) VALUES (?)').run(name.trim());
    customer = { id: result.lastInsertRowid, name: name.trim() };
    logger.info(`New customer created: ${name}`);
  }
  return customer;
}

/**
 * Get all customers.
 * @returns {Array}
 */
export function getCustomers() {
  const db = getSqliteDb();
  return db.prepare('SELECT * FROM customers ORDER BY name').all();
}

/**
 * Get a customer's purchase history.
 * @param {string} customerName
 * @returns {Object}
 */
export function getCustomerHistory(customerName) {
  const db = getSqliteDb();
  const customer = db.prepare('SELECT * FROM customers WHERE LOWER(name) LIKE ?')
    .get(`%${customerName.toLowerCase()}%`);

  if (!customer) return { error: `Customer "${customerName}" not found`, customer: null, totalPurchases: 0, totalSpent: 0, recentPurchases: [] };

  const purchases = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit
    FROM transactions t JOIN products p ON t.product_id = p.id
    WHERE t.customer_id = ? AND t.type = 'stock_out'
    ORDER BY t.created_at DESC LIMIT 50
  `).all(customer.id);

  const totalSpent = purchases.reduce((s, p) => s + (p.total_price || 0), 0);

  return {
    customer: customer.name,
    totalPurchases: purchases.length,
    totalSpent,
    recentPurchases: purchases.slice(0, 10),
  };
}

export default { getOrCreateCustomer, getCustomers, getCustomerHistory };
