/**
 * Google Sheets Products Storage
 * Products sheet columns: ID, Name, SKU, Category, Unit, Buy Price, Sell Price, Current Stock, Min Stock, Created At, Updated At
 */

import { readSheet, updateSheet, appendSheet } from './client.js';
import { sheetsCache } from './cache.js';
import { logger } from '../../utils/logger.js';

const RANGE = 'Products';
const CACHE_KEY = 'sheets:products';

/**
 * Parse a row from the Products sheet into an object.
 */
function rowToProduct(row) {
  return {
    id: row[0] || 0,
    name: row[1] || '',
    sku: row[2] || '',
    category: row[3] || 'General',
    unit: row[4] || 'piece',
    buy_price: Number(row[5]) || 0,
    sell_price: Number(row[6]) || 0,
    current_stock: Number(row[7]) || 0,
    min_stock: Number(row[8]) || 0,
    created_at: row[9] || '',
    updated_at: row[10] || '',
  };
}

/**
 * Convert a product object to a sheet row.
 */
function productToRow(p) {
  return [
    p.id, p.name, p.sku || '', p.category || 'General', p.unit || 'piece',
    p.buy_price || 0, p.sell_price || 0, p.current_stock || 0, p.min_stock || 0,
    p.created_at || new Date().toISOString(), p.updated_at || new Date().toISOString(),
  ];
}

/**
 * Get all products.
 * @param {string} spreadsheetId
 * @returns {Promise<Array>}
 */
export async function getProducts(spreadsheetId) {
  const cached = sheetsCache.get(CACHE_KEY);
  if (cached) return cached;

  const rows = await readSheet(spreadsheetId, `${RANGE}!A:K`);
  // Skip header row
  const products = (rows.slice(1) || []).map(rowToProduct);
  sheetsCache.set(CACHE_KEY, products);
  return products;
}

/**
 * Find product by SKU or name (fuzzy).
 * @param {string} spreadsheetId
 * @param {string} skuOrName
 * @returns {Promise<{product: Object|null, rowIndex: number}>}
 */
export async function findProduct(spreadsheetId, skuOrName) {
  const products = await getProducts(spreadsheetId);
  const term = skuOrName.trim().toLowerCase();

  // Exact SKU
  let idx = products.findIndex(p => (p.sku || '').toLowerCase() === term);
  if (idx >= 0) return { product: products[idx], rowIndex: idx + 2 }; // +2 for header + 1-based

  // Exact name
  idx = products.findIndex(p => p.name.toLowerCase() === term);
  if (idx >= 0) return { product: products[idx], rowIndex: idx + 2 };

  // Fuzzy: name contains term
  idx = products.findIndex(p => p.name.toLowerCase().includes(term));
  if (idx >= 0) return { product: products[idx], rowIndex: idx + 2 };

  // Fuzzy: term contains product name prefix
  idx = products.findIndex(p => term.includes(p.name.toLowerCase().split('(')[0].trim()));
  if (idx >= 0) return { product: products[idx], rowIndex: idx + 2 };

  return { product: null, rowIndex: -1 };
}

/**
 * Get a single product by SKU or name.
 */
export async function getProduct(spreadsheetId, skuOrName) {
  const { product } = await findProduct(spreadsheetId, skuOrName);
  return product;
}

/**
 * Add a new product.
 */
export async function addProduct(spreadsheetId, data) {
  const products = await getProducts(spreadsheetId);
  const nextId = products.length > 0 ? Math.max(...products.map(p => Number(p.id) || 0)) + 1 : 1;

  const product = {
    id: nextId,
    name: data.name,
    sku: data.sku || '',
    category: data.category || 'General',
    unit: data.unit || 'piece',
    buy_price: data.buy_price || 0,
    sell_price: data.sell_price || 0,
    current_stock: data.current_stock || 0,
    min_stock: data.min_stock || 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await appendSheet(spreadsheetId, `${RANGE}!A:K`, [productToRow(product)]);
  sheetsCache.invalidate(CACHE_KEY);
  return product;
}

/**
 * Update a product by SKU.
 */
export async function updateProduct(spreadsheetId, sku, data) {
  const { product, rowIndex } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);

  const updated = { ...product, ...data, updated_at: new Date().toISOString() };
  await updateSheet(spreadsheetId, `${RANGE}!A${rowIndex}:K${rowIndex}`, [productToRow(updated)]);
  sheetsCache.invalidate(CACHE_KEY);
  return updated;
}

/**
 * Update stock quantity for a product.
 */
export async function updateStock(spreadsheetId, sku, newQty) {
  const { product, rowIndex } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);

  // Update only stock column (H) and updated_at (K)
  const now = new Date().toISOString();
  await updateSheet(spreadsheetId, `${RANGE}!H${rowIndex}:H${rowIndex}`, [[newQty]]);
  await updateSheet(spreadsheetId, `${RANGE}!K${rowIndex}:K${rowIndex}`, [[now]]);
  sheetsCache.invalidate(CACHE_KEY);
  return { ...product, current_stock: newQty, updated_at: now };
}

/**
 * Get products below minimum stock.
 */
export async function getLowStock(spreadsheetId) {
  const products = await getProducts(spreadsheetId);
  return products
    .filter(p => p.current_stock < p.min_stock)
    .sort((a, b) => (a.current_stock / (a.min_stock || 1)) - (b.current_stock / (b.min_stock || 1)));
}

export default { getProducts, getProduct, findProduct, addProduct, updateProduct, updateStock, getLowStock };
