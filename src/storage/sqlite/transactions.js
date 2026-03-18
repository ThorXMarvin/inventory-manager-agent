/**
 * SQLite Transactions Storage
 * Stock movements, sales recording, and staff activity tracking.
 * Every transaction logs who recorded it via the logged_by column.
 */

import { getSqliteDb } from './client.js';
import { findProduct } from './products.js';
import { getOrCreateCustomer } from './customers.js';

/**
 * Add stock for a product.
 * @param {string} sku - Product SKU or name
 * @param {number} qty - Quantity to add
 * @param {number} buyPrice - Buy price per unit (0 = use product default)
 * @param {string} loggedBy - Staff member who logged this
 * @returns {Object}
 */
export function addStock(sku, qty, buyPrice = 0, loggedBy = 'System') {
  const db = getSqliteDb();
  const product = findProduct(sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');

  const price = buyPrice || product.buy_price;

  db.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, product.id);
  db.prepare("INSERT INTO transactions (product_id, type, quantity, unit_price, total_price, notes, logged_by) VALUES (?, 'stock_in', ?, ?, ?, ?, ?)")
    .run(product.id, qty, price, qty * price, `Added ${qty} ${product.unit}(s)`, loggedBy);

  const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
  return {
    name: product.name,
    sku: product.sku,
    added: qty,
    unit: product.unit,
    newStock: updated.current_stock,
    value: qty * price,
    logged_by: loggedBy,
  };
}

/**
 * Remove stock from a product.
 * @param {string} sku
 * @param {number} qty
 * @param {string} loggedBy
 * @returns {Object}
 */
export function removeStock(sku, qty, loggedBy = 'System') {
  const db = getSqliteDb();
  const product = findProduct(sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');
  if (product.current_stock < qty) {
    throw new Error(`Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`);
  }

  db.prepare("UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, product.id);
  db.prepare("INSERT INTO transactions (product_id, type, quantity, notes, logged_by) VALUES (?, 'stock_out', ?, ?, ?)")
    .run(product.id, qty, `Removed ${qty} ${product.unit}(s)`, loggedBy);

  const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
  return {
    name: product.name,
    sku: product.sku,
    removed: qty,
    unit: product.unit,
    remaining: updated.current_stock,
    logged_by: loggedBy,
  };
}

/**
 * Record a sale.
 * @param {string} sku
 * @param {number} qty
 * @param {string|null} customerName
 * @param {number} sellPrice
 * @param {string} loggedBy - Staff member who recorded this sale
 * @returns {Object}
 */
export function recordSale(sku, qty, customerName = null, sellPrice = 0, loggedBy = 'System') {
  const db = getSqliteDb();
  const product = findProduct(sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');
  if (product.current_stock < qty) {
    throw new Error(`Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`);
  }

  const price = sellPrice || product.sell_price;
  const totalPrice = qty * price;
  const customer = customerName ? getOrCreateCustomer(customerName) : null;

  db.prepare("UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, product.id);
  db.prepare(`INSERT INTO transactions (product_id, type, quantity, unit_price, total_price, customer_id, notes, logged_by)
    VALUES (?, 'stock_out', ?, ?, ?, ?, ?, ?)`)
    .run(product.id, qty, price, totalPrice, customer?.id || null,
      `Sale: ${qty} ${product.unit}(s)${customerName ? ` to ${customerName}` : ''}`, loggedBy);

  const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
  return {
    name: product.name,
    sku: product.sku,
    quantity: qty,
    unit: product.unit,
    unitPrice: price,
    totalPrice,
    remaining: updated.current_stock,
    customer: customerName,
    logged_by: loggedBy,
  };
}

/**
 * Get today's sales.
 */
export function getSalesToday() {
  const db = getSqliteDb();
  const sales = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit, p.buy_price, c.name as customer_name
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE t.type = 'stock_out' AND date(t.created_at) = date('now')
    ORDER BY t.created_at DESC
  `).all();

  const revenue = sales.reduce((s, r) => s + (r.total_price || 0), 0);
  const cost = sales.reduce((s, r) => s + (r.quantity * r.buy_price), 0);

  return {
    date: new Date().toISOString().split('T')[0],
    transactions: sales.length,
    revenue,
    estimatedCost: cost,
    estimatedProfit: revenue - cost,
    sales,
  };
}

/**
 * Get sales for a date range.
 */
export function getSalesRange(start, end) {
  const db = getSqliteDb();
  const sales = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit, p.buy_price
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'stock_out'
      AND date(t.created_at) >= date(?) AND date(t.created_at) <= date(?)
    ORDER BY t.created_at DESC
  `).all(start, end);

  const revenue = sales.reduce((s, r) => s + (r.total_price || 0), 0);
  const cost = sales.reduce((s, r) => s + (r.quantity * r.buy_price), 0);

  return {
    period: `${start} to ${end}`,
    transactions: sales.length,
    revenue,
    estimatedCost: cost,
    estimatedProfit: revenue - cost,
    sales,
  };
}

/**
 * Get top selling products (last 7 days).
 */
export function getTopSellers(n = 5) {
  const db = getSqliteDb();
  return db.prepare(`
    SELECT p.name, p.unit, SUM(t.quantity) as total_sold, SUM(t.total_price) as total_revenue
    FROM transactions t JOIN products p ON t.product_id = p.id
    WHERE t.type = 'stock_out' AND t.created_at >= datetime('now', '-7 days')
    GROUP BY t.product_id ORDER BY total_sold DESC LIMIT ?
  `).all(n);
}

/**
 * Get all transactions logged by a specific staff member.
 * @param {string} staffName - Staff member's name
 * @param {string|null} date - Date filter (YYYY-MM-DD), defaults to today
 * @returns {Object}
 */
export function getStaffActivity(staffName, date = null) {
  const db = getSqliteDb();
  const targetDate = date || new Date().toISOString().split('T')[0];

  const transactions = db.prepare(`
    SELECT t.*, p.name as product_name, p.unit, c.name as customer_name
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    LEFT JOIN customers c ON t.customer_id = c.id
    WHERE LOWER(t.logged_by) LIKE LOWER(?) AND date(t.created_at) = date(?)
    ORDER BY t.created_at DESC
  `).all(`%${staffName}%`, targetDate);

  const salesCount = transactions.filter(t => t.type === 'stock_out').length;
  const stockInsCount = transactions.filter(t => t.type === 'stock_in').length;
  const totalRevenue = transactions
    .filter(t => t.type === 'stock_out')
    .reduce((s, t) => s + (t.total_price || 0), 0);

  return {
    staff_name: staffName,
    date: targetDate,
    total_transactions: transactions.length,
    sales: salesCount,
    stock_additions: stockInsCount,
    total_revenue: totalRevenue,
    transactions: transactions.map(t => ({
      type: t.type,
      product: t.product_name,
      quantity: t.quantity,
      total_price: t.total_price,
      customer: t.customer_name,
      notes: t.notes,
      time: t.created_at,
    })),
  };
}

/**
 * Get sales velocity for reorder suggestions.
 * Returns products with avg daily sales and estimated days until stockout.
 */
export function getSalesVelocity() {
  const db = getSqliteDb();
  return db.prepare(`
    SELECT
      p.id, p.name, p.sku, p.unit, p.current_stock, p.min_stock,
      p.buy_price, p.sell_price,
      COALESCE(SUM(t.quantity), 0) as total_sold_7d,
      COALESCE(SUM(t.quantity) / 7.0, 0) as avg_daily_sales,
      CASE
        WHEN COALESCE(SUM(t.quantity), 0) > 0
        THEN ROUND(p.current_stock / (SUM(t.quantity) / 7.0), 1)
        ELSE 999
      END as days_until_stockout
    FROM products p
    LEFT JOIN transactions t ON t.product_id = p.id
      AND t.type = 'stock_out'
      AND t.created_at >= datetime('now', '-7 days')
    GROUP BY p.id
    ORDER BY days_until_stockout ASC
  `).all();
}

/**
 * Get staff performance summary (all staff, this week).
 */
export function getStaffPerformance() {
  const db = getSqliteDb();
  return db.prepare(`
    SELECT
      t.logged_by as staff_name,
      COUNT(*) as total_transactions,
      SUM(CASE WHEN t.type = 'stock_out' THEN 1 ELSE 0 END) as sales_count,
      SUM(CASE WHEN t.type = 'stock_in' THEN 1 ELSE 0 END) as stock_in_count,
      SUM(CASE WHEN t.type = 'stock_out' THEN t.total_price ELSE 0 END) as total_revenue
    FROM transactions t
    WHERE t.created_at >= datetime('now', '-7 days')
      AND t.logged_by != 'System'
    GROUP BY t.logged_by
    ORDER BY total_revenue DESC
  `).all();
}

export default {
  addStock, removeStock, recordSale, getSalesToday, getSalesRange,
  getTopSellers, getStaffActivity, getSalesVelocity, getStaffPerformance,
};
