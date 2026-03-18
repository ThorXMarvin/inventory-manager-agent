/**
 * Stock Management Module
 * Handles all stock-related operations: add, remove, adjust, query.
 */

import { getDb } from '../db/sqlite.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Find a product by name (fuzzy match) or SKU.
 * @param {string} nameOrSku - Product name or SKU to search for
 * @returns {object|null} Product row or null
 */
export function findProduct(nameOrSku) {
  const db = getDb();
  const term = nameOrSku.trim();

  // Exact SKU match first
  let product = db.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?)').get(term);
  if (product) return product;

  // Exact name match
  product = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(term);
  if (product) return product;

  // Fuzzy: name contains the search term
  product = db.prepare('SELECT * FROM products WHERE LOWER(name) LIKE ? ORDER BY LENGTH(name) ASC LIMIT 1')
    .get(`%${term.toLowerCase()}%`);
  if (product) return product;

  // Fuzzy: search term contains the product name (short queries like "cement")
  const all = db.prepare('SELECT * FROM products').all();
  for (const p of all) {
    if (p.name.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(p.name.toLowerCase().split('(')[0].trim())) {
      return p;
    }
  }

  return null;
}

/**
 * Add stock for one or more items.
 * @param {Array} items - [{ name, quantity, unit }]
 * @returns {object} Result with updated stock info
 */
export function addStock(items) {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';
  const results = [];

  const updateStmt = db.prepare(
    'UPDATE products SET current_stock = current_stock + ?, updated_at = datetime(\'now\') WHERE id = ?'
  );
  const txnStmt = db.prepare(
    'INSERT INTO transactions (product_id, type, quantity, unit_price, total_price, notes) VALUES (?, ?, ?, ?, ?, ?)'
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

      updateStmt.run(qty, product.id);
      txnStmt.run(product.id, 'stock_in', qty, product.buy_price, qty * product.buy_price, `Added ${qty} ${product.unit}(s)`);

      const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
      results.push({
        name: product.name,
        added: qty,
        unit: product.unit,
        newStock: updated.current_stock,
        value: qty * product.buy_price,
        currency,
      });
    }
  });

  txn();
  logger.info(`Stock added: ${results.length} item(s) processed`);
  return results;
}

/**
 * Remove stock (record a sale without customer/price tracking — use sales.js for full sales).
 * @param {Array} items - [{ name, quantity }]
 * @returns {Array} Results
 */
export function removeStock(items) {
  const db = getDb();
  const results = [];

  const updateStmt = db.prepare(
    'UPDATE products SET current_stock = current_stock - ?, updated_at = datetime(\'now\') WHERE id = ?'
  );
  const txnStmt = db.prepare(
    'INSERT INTO transactions (product_id, type, quantity, notes) VALUES (?, ?, ?, ?)'
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

      updateStmt.run(qty, product.id);
      txnStmt.run(product.id, 'stock_out', qty, `Removed ${qty} ${product.unit}(s)`);

      const updated = db.prepare('SELECT current_stock FROM products WHERE id = ?').get(product.id);
      results.push({
        name: product.name,
        removed: qty,
        unit: product.unit,
        remaining: updated.current_stock,
      });
    }
  });

  txn();
  return results;
}

/**
 * Adjust stock to a specific quantity.
 * @param {string} productName
 * @param {number} newQty
 * @returns {object}
 */
export function adjustStock(productName, newQty) {
  const db = getDb();
  const product = findProduct(productName);
  if (!product) return { error: `Product "${productName}" not found` };

  const diff = newQty - product.current_stock;
  db.prepare('UPDATE products SET current_stock = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(newQty, product.id);
  db.prepare('INSERT INTO transactions (product_id, type, quantity, notes) VALUES (?, ?, ?, ?)')
    .run(product.id, 'adjustment', Math.abs(diff), `Adjusted from ${product.current_stock} to ${newQty}`);

  return {
    name: product.name,
    previousStock: product.current_stock,
    newStock: newQty,
    difference: diff,
  };
}

/**
 * Get stock info for a specific product.
 * @param {string} productName
 * @returns {object}
 */
export function getStock(productName) {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';
  const product = findProduct(productName);
  if (!product) return { error: `Product "${productName}" not found` };

  // Get this week's transactions
  const weekActivity = db.prepare(`
    SELECT type, SUM(quantity) as total
    FROM transactions
    WHERE product_id = ? AND created_at >= datetime('now', '-7 days')
    GROUP BY type
  `).all(product.id);

  const weekIn = weekActivity.find(r => r.type === 'stock_in')?.total || 0;
  const weekOut = weekActivity.find(r => r.type === 'stock_out')?.total || 0;

  return {
    name: product.name,
    sku: product.sku,
    category: product.category,
    currentStock: product.current_stock,
    unit: product.unit,
    minStock: product.min_stock,
    isLow: product.current_stock < product.min_stock,
    buyPrice: product.buy_price,
    sellPrice: product.sell_price,
    stockValue: product.current_stock * product.buy_price,
    weekIn,
    weekOut,
    currency,
  };
}

/**
 * Get all products with stock levels.
 * @returns {Array}
 */
export function getAllStock() {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, sku, category, unit, buy_price, sell_price,
           current_stock, min_stock,
           CASE WHEN current_stock < min_stock THEN 1 ELSE 0 END as is_low
    FROM products
    ORDER BY category, name
  `).all();
}

/**
 * Get products below minimum stock level.
 * @returns {Array}
 */
export function getLowStock() {
  const db = getDb();
  return db.prepare(`
    SELECT id, name, sku, category, unit, current_stock, min_stock
    FROM products
    WHERE current_stock < min_stock
    ORDER BY (current_stock * 1.0 / NULLIF(min_stock, 0)) ASC
  `).all();
}

export default { findProduct, addStock, removeStock, adjustStock, getStock, getAllStock, getLowStock };
