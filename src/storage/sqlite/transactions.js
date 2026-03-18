/**
 * SQLite Transactions Storage
 * Stock movements and sales recording.
 */

import { getSqliteDb } from './client.js';
import { findProduct } from './products.js';
import { getOrCreateCustomer } from './customers.js';

/**
 * Add stock for a product.
 * @param {string} sku - Product SKU or name
 * @param {number} qty - Quantity to add
 * @param {number} buyPrice - Buy price per unit (0 = use product default)
 * @returns {Object}
 */
export function addStock(sku, qty, buyPrice = 0) {
  const db = getSqliteDb();
  const product = findProduct(sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');

  const price = buyPrice || product.buy_price;

  db.prepare("UPDATE products SET current_stock = current_stock + ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, product.id);
  db.prepare("INSERT INTO transactions (product_id, type, quantity, unit_price, total_price, notes) VALUES (?, 'stock_in', ?, ?, ?, ?)")
    .run(product.id, qty, price, qty * price, `Added ${qty} ${product.unit}(s)`);

  const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
  return {
    name: product.name,
    sku: product.sku,
    added: qty,
    unit: product.unit,
    newStock: updated.current_stock,
    value: qty * price,
  };
}

/**
 * Remove stock from a product.
 * @param {string} sku
 * @param {number} qty
 * @returns {Object}
 */
export function removeStock(sku, qty) {
  const db = getSqliteDb();
  const product = findProduct(sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');
  if (product.current_stock < qty) {
    throw new Error(`Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`);
  }

  db.prepare("UPDATE products SET current_stock = current_stock - ?, updated_at = datetime('now') WHERE id = ?")
    .run(qty, product.id);
  db.prepare("INSERT INTO transactions (product_id, type, quantity, notes) VALUES (?, 'stock_out', ?, ?)")
    .run(product.id, qty, `Removed ${qty} ${product.unit}(s)`);

  const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
  return {
    name: product.name,
    sku: product.sku,
    removed: qty,
    unit: product.unit,
    remaining: updated.current_stock,
  };
}

/**
 * Record a sale.
 * @param {string} sku
 * @param {number} qty
 * @param {string|null} customerName
 * @param {number} sellPrice - Sell price per unit (0 = use product default)
 * @returns {Object}
 */
export function recordSale(sku, qty, customerName = null, sellPrice = 0) {
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
  db.prepare(`INSERT INTO transactions (product_id, type, quantity, unit_price, total_price, customer_id, notes)
    VALUES (?, 'stock_out', ?, ?, ?, ?, ?)`)
    .run(product.id, qty, price, totalPrice, customer?.id || null,
      `Sale: ${qty} ${product.unit}(s)${customerName ? ` to ${customerName}` : ''}`);

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
  };
}

/**
 * Get today's sales.
 * @returns {Object}
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
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {Object}
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
 * @param {number} n
 * @returns {Array}
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

export default { addStock, removeStock, recordSale, getSalesToday, getSalesRange, getTopSellers };
