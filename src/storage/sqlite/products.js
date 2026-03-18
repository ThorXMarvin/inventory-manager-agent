/**
 * SQLite Products Storage
 * Product CRUD operations against SQLite.
 */

import { getSqliteDb } from './client.js';

/**
 * Find a product by name (fuzzy) or SKU.
 * @param {string} nameOrSku
 * @returns {Object|null}
 */
export function findProduct(nameOrSku) {
  const db = getSqliteDb();
  const term = nameOrSku.trim();

  // Exact SKU match
  let product = db.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?)').get(term);
  if (product) return product;

  // Exact name match
  product = db.prepare('SELECT * FROM products WHERE LOWER(name) = LOWER(?)').get(term);
  if (product) return product;

  // Fuzzy: name contains search term
  product = db.prepare('SELECT * FROM products WHERE LOWER(name) LIKE ? ORDER BY LENGTH(name) ASC LIMIT 1')
    .get(`%${term.toLowerCase()}%`);
  if (product) return product;

  // Fuzzy: search term contains the product name
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
 * Get all products.
 * @returns {Array}
 */
export function getProducts() {
  const db = getSqliteDb();
  return db.prepare(`
    SELECT id, name, sku, category, unit, buy_price, sell_price,
           current_stock, min_stock, created_at, updated_at
    FROM products ORDER BY category, name
  `).all();
}

/**
 * Get a single product by SKU or name.
 * @param {string} skuOrName
 * @returns {Object|null}
 */
export function getProduct(skuOrName) {
  return findProduct(skuOrName);
}

/**
 * Add a new product.
 * @param {Object} data
 * @returns {Object}
 */
export function addProduct(data) {
  const db = getSqliteDb();
  const result = db.prepare(`
    INSERT INTO products (name, sku, category, unit, buy_price, sell_price, current_stock, min_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name,
    data.sku || null,
    data.category || 'General',
    data.unit || 'piece',
    data.buy_price || 0,
    data.sell_price || 0,
    data.current_stock || 0,
    data.min_stock || 0,
  );
  return { id: result.lastInsertRowid, ...data };
}

/**
 * Update a product by SKU.
 * @param {string} sku
 * @param {Object} data
 * @returns {Object}
 */
export function updateProduct(sku, data) {
  const db = getSqliteDb();
  const product = findProduct(sku);
  if (!product) throw new Error(`Product "${sku}" not found`);

  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(data)) {
    if (['name', 'sku', 'category', 'unit', 'buy_price', 'sell_price', 'current_stock', 'min_stock'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (fields.length === 0) return product;

  fields.push("updated_at = datetime('now')");
  values.push(product.id);

  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return { ...product, ...data };
}

/**
 * Get products below minimum stock.
 * @returns {Array}
 */
export function getLowStock() {
  const db = getSqliteDb();
  return db.prepare(`
    SELECT id, name, sku, category, unit, current_stock, min_stock
    FROM products WHERE current_stock < min_stock
    ORDER BY (current_stock * 1.0 / NULLIF(min_stock, 0)) ASC
  `).all();
}

export default { findProduct, getProducts, getProduct, addProduct, updateProduct, getLowStock };
