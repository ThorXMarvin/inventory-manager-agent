/**
 * Google Sheets Transactions Storage
 * Transactions sheet: ID, Product ID, Product Name, Type, Quantity, Unit Price, Total Price, Customer, Notes, Created At
 */

import { readSheet, appendSheet } from './client.js';
import { findProduct, updateStock, getProducts } from './products.js';
import { getOrCreateCustomer } from './customers.js';
import { sheetsCache } from './cache.js';
import { logger } from '../../utils/logger.js';

const RANGE = 'Transactions';
const CACHE_KEY = 'sheets:transactions';

function rowToTransaction(row) {
  return {
    id: row[0] || 0,
    product_id: row[1] || 0,
    product_name: row[2] || '',
    type: row[3] || '',
    quantity: Number(row[4]) || 0,
    unit_price: Number(row[5]) || 0,
    total_price: Number(row[6]) || 0,
    customer_name: row[7] || '',
    notes: row[8] || '',
    created_at: row[9] || '',
  };
}

async function getNextTxnId(spreadsheetId) {
  const rows = await readSheet(spreadsheetId, `${RANGE}!A:A`);
  if (rows.length <= 1) return 1;
  const ids = rows.slice(1).map(r => Number(r[0]) || 0);
  return Math.max(...ids) + 1;
}

/**
 * Add stock.
 */
export async function addStock(spreadsheetId, sku, qty, buyPrice = 0) {
  const { product } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');

  const price = buyPrice || product.buy_price;
  const newStock = product.current_stock + qty;
  const txnId = await getNextTxnId(spreadsheetId);

  await appendSheet(spreadsheetId, `${RANGE}!A:J`, [[
    txnId, product.id, product.name, 'stock_in', qty, price, qty * price,
    '', `Added ${qty} ${product.unit}(s)`, new Date().toISOString(),
  ]]);

  await updateStock(spreadsheetId, sku, newStock);
  sheetsCache.invalidate(CACHE_KEY);

  return {
    name: product.name, sku: product.sku,
    added: qty, unit: product.unit, newStock, value: qty * price,
  };
}

/**
 * Remove stock.
 */
export async function removeStock(spreadsheetId, sku, qty) {
  const { product } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');
  if (product.current_stock < qty) {
    throw new Error(`Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`);
  }

  const newStock = product.current_stock - qty;
  const txnId = await getNextTxnId(spreadsheetId);

  await appendSheet(spreadsheetId, `${RANGE}!A:J`, [[
    txnId, product.id, product.name, 'stock_out', qty, 0, 0,
    '', `Removed ${qty} ${product.unit}(s)`, new Date().toISOString(),
  ]]);

  await updateStock(spreadsheetId, sku, newStock);
  sheetsCache.invalidate(CACHE_KEY);

  return { name: product.name, sku: product.sku, removed: qty, unit: product.unit, remaining: newStock };
}

/**
 * Record a sale.
 */
export async function recordSale(spreadsheetId, sku, qty, customerName = null, sellPrice = 0) {
  const { product } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');
  if (product.current_stock < qty) {
    throw new Error(`Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`);
  }

  const price = sellPrice || product.sell_price;
  const totalPrice = qty * price;
  const newStock = product.current_stock - qty;
  const txnId = await getNextTxnId(spreadsheetId);

  if (customerName) {
    await getOrCreateCustomer(spreadsheetId, customerName);
  }

  await appendSheet(spreadsheetId, `${RANGE}!A:J`, [[
    txnId, product.id, product.name, 'stock_out', qty, price, totalPrice,
    customerName || '', `Sale: ${qty} ${product.unit}(s)${customerName ? ` to ${customerName}` : ''}`,
    new Date().toISOString(),
  ]]);

  await updateStock(spreadsheetId, sku, newStock);
  sheetsCache.invalidate(CACHE_KEY);

  return {
    name: product.name, sku: product.sku, quantity: qty, unit: product.unit,
    unitPrice: price, totalPrice, remaining: newStock, customer: customerName,
  };
}

/**
 * Get all transactions (with optional caching).
 */
async function getAllTransactions(spreadsheetId) {
  const cached = sheetsCache.get(CACHE_KEY);
  if (cached) return cached;

  const rows = await readSheet(spreadsheetId, `${RANGE}!A:J`);
  const txns = (rows.slice(1) || []).map(rowToTransaction);
  sheetsCache.set(CACHE_KEY, txns, 30_000); // 30s cache for transactions
  return txns;
}

/**
 * Get today's sales.
 */
export async function getSalesToday(spreadsheetId) {
  const txns = await getAllTransactions(spreadsheetId);
  const today = new Date().toISOString().split('T')[0];
  const products = await getProducts(spreadsheetId);

  const sales = txns.filter(t => t.type === 'stock_out' && t.created_at.startsWith(today));
  const revenue = sales.reduce((s, t) => s + t.total_price, 0);

  // Estimate cost from products
  let cost = 0;
  for (const sale of sales) {
    const prod = products.find(p => p.id === sale.product_id);
    cost += sale.quantity * (prod?.buy_price || 0);
  }

  return {
    date: today,
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
export async function getSalesRange(spreadsheetId, start, end) {
  const txns = await getAllTransactions(spreadsheetId);
  const products = await getProducts(spreadsheetId);

  const sales = txns.filter(t => {
    if (t.type !== 'stock_out') return false;
    const date = t.created_at.split('T')[0];
    return date >= start && date <= end;
  });

  const revenue = sales.reduce((s, t) => s + t.total_price, 0);
  let cost = 0;
  for (const sale of sales) {
    const prod = products.find(p => p.id === sale.product_id);
    cost += sale.quantity * (prod?.buy_price || 0);
  }

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
export async function getTopSellers(spreadsheetId, n = 5) {
  const txns = await getAllTransactions(spreadsheetId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const sales = txns.filter(t => t.type === 'stock_out' && t.created_at >= weekAgo);

  // Group by product
  const grouped = {};
  for (const s of sales) {
    const key = s.product_name || s.product_id;
    if (!grouped[key]) grouped[key] = { name: s.product_name, total_sold: 0, total_revenue: 0 };
    grouped[key].total_sold += s.quantity;
    grouped[key].total_revenue += s.total_price;
  }

  return Object.values(grouped)
    .sort((a, b) => b.total_sold - a.total_sold)
    .slice(0, n);
}

export default { addStock, removeStock, recordSale, getSalesToday, getSalesRange, getTopSellers };
