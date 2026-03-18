/**
 * Sales Tracking Module
 * Records sales, tracks customers, and provides sales analytics.
 */

import { getDb } from '../db/sqlite.js';
import { findProduct } from './stock.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Find or create a customer by name.
 * @param {string} name - Customer name
 * @returns {object} Customer record
 */
function getOrCreateCustomer(name) {
  if (!name) return null;
  const db = getDb();

  let customer = db.prepare('SELECT * FROM customers WHERE LOWER(name) = LOWER(?)').get(name.trim());
  if (!customer) {
    const result = db.prepare('INSERT INTO customers (name) VALUES (?)').run(name.trim());
    customer = { id: result.lastInsertRowid, name: name.trim() };
    logger.info(`New customer created: ${name}`);
  }
  return customer;
}

/**
 * Record a sale of one or more items.
 * @param {Array} items - [{ name, quantity, unit }]
 * @param {string|null} customerName - Customer name (optional)
 * @returns {object} Sale summary
 */
export function recordSale(items, customerName = null) {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';
  const customer = getOrCreateCustomer(customerName);
  const results = [];
  let grandTotal = 0;

  const updateStmt = db.prepare(
    'UPDATE products SET current_stock = current_stock - ?, updated_at = datetime(\'now\') WHERE id = ?'
  );
  const txnStmt = db.prepare(
    'INSERT INTO transactions (product_id, type, quantity, unit_price, total_price, customer_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    for (const item of items) {
      const product = findProduct(item.name);
      if (!product) {
        results.push({ name: item.name, error: 'Product not found' });
        continue;
      }

      const qty = parseFloat(item.quantity) || 0;
      if (qty <= 0) {
        results.push({ name: product.name, error: 'Invalid quantity' });
        continue;
      }

      if (product.current_stock < qty) {
        results.push({
          name: product.name,
          error: `Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`,
        });
        continue;
      }

      const totalPrice = qty * product.sell_price;
      grandTotal += totalPrice;

      updateStmt.run(qty, product.id);
      txnStmt.run(
        product.id, 'stock_out', qty, product.sell_price, totalPrice,
        customer?.id || null,
        `Sale: ${qty} ${product.unit}(s)${customerName ? ` to ${customerName}` : ''}`
      );

      const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
      results.push({
        name: product.name,
        quantity: qty,
        unit: product.unit,
        unitPrice: product.sell_price,
        totalPrice,
        remaining: updated.current_stock,
        currency,
      });
    }
  });

  txn();
  logger.info(`Sale recorded: ${results.filter(r => !r.error).length} item(s), total ${currency} ${grandTotal.toLocaleString()}`);

  return {
    items: results,
    customer: customerName,
    grandTotal,
    currency,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get today's sales summary.
 * @returns {object}
 */
export function getDailySales() {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';

  const sales = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit, p.buy_price,
           c.name as customer_name
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.type = 'stock_out' AND date(t.created_at) = date('now')
    ORDER BY t.created_at DESC
  `).all();

  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_price || 0), 0);
  const totalCost = sales.reduce((sum, s) => sum + (s.quantity * s.buy_price), 0);
  const totalProfit = totalRevenue - totalCost;
  const transactionCount = sales.length;

  return {
    date: new Date().toISOString().split('T')[0],
    transactions: transactionCount,
    revenue: totalRevenue,
    estimatedCost: totalCost,
    estimatedProfit: totalProfit,
    currency,
    sales,
  };
}

/**
 * Get this week's sales summary.
 * @returns {object}
 */
export function getWeeklySales() {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';

  const sales = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit, p.buy_price
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'stock_out' AND t.created_at >= datetime('now', '-7 days')
    ORDER BY t.created_at DESC
  `).all();

  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_price || 0), 0);
  const totalCost = sales.reduce((sum, s) => sum + (s.quantity * s.buy_price), 0);

  return {
    period: 'Last 7 days',
    transactions: sales.length,
    revenue: totalRevenue,
    estimatedCost: totalCost,
    estimatedProfit: totalRevenue - totalCost,
    currency,
  };
}

/**
 * Get top selling products.
 * @param {number} n - Number of top sellers to return
 * @returns {Array}
 */
export function getTopSellers(n = 5) {
  const db = getDb();

  return db.prepare(`
    SELECT p.name, p.unit, SUM(t.quantity) as total_sold,
           SUM(t.total_price) as total_revenue
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'stock_out' AND t.created_at >= datetime('now', '-7 days')
    GROUP BY t.product_id
    ORDER BY total_sold DESC
    LIMIT ?
  `).all(n);
}

/**
 * Get a customer's purchase history.
 * @param {string} customerName
 * @returns {object}
 */
export function getCustomerHistory(customerName) {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';

  const customer = db.prepare('SELECT * FROM customers WHERE LOWER(name) LIKE ?')
    .get(`%${customerName.toLowerCase()}%`);

  if (!customer) return { error: `Customer "${customerName}" not found` };

  const purchases = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.customer_id = ? AND t.type = 'stock_out'
    ORDER BY t.created_at DESC
    LIMIT 50
  `).all(customer.id);

  const totalSpent = purchases.reduce((sum, p) => sum + (p.total_price || 0), 0);

  return {
    customer: customer.name,
    totalPurchases: purchases.length,
    totalSpent,
    currency,
    recentPurchases: purchases.slice(0, 10),
  };
}

export default { recordSale, getDailySales, getWeeklySales, getTopSellers, getCustomerHistory };
