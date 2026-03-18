/**
 * Google Sheets Transactions Storage
 * Transactions sheet: ID, Product ID, Product Name, Type, Quantity, Unit Price, Total Price, Customer, Notes, Created At, Logged By
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
    logged_by: row[10] || 'System',
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
export async function addStock(spreadsheetId, sku, qty, buyPrice = 0, loggedBy = 'System') {
  const { product } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');

  const price = buyPrice || product.buy_price;
  const newStock = product.current_stock + qty;
  const txnId = await getNextTxnId(spreadsheetId);

  await appendSheet(spreadsheetId, `${RANGE}!A:K`, [[
    txnId, product.id, product.name, 'stock_in', qty, price, qty * price,
    '', `Added ${qty} ${product.unit}(s)`, new Date().toISOString(), loggedBy,
  ]]);

  await updateStock(spreadsheetId, sku, newStock);
  sheetsCache.invalidate(CACHE_KEY);

  return {
    name: product.name, sku: product.sku,
    added: qty, unit: product.unit, newStock, value: qty * price, logged_by: loggedBy,
  };
}

/**
 * Remove stock.
 */
export async function removeStock(spreadsheetId, sku, qty, loggedBy = 'System') {
  const { product } = await findProduct(spreadsheetId, sku);
  if (!product) throw new Error(`Product "${sku}" not found`);
  if (qty <= 0) throw new Error('Quantity must be positive');
  if (product.current_stock < qty) {
    throw new Error(`Insufficient stock. Only ${product.current_stock} ${product.unit}(s) available`);
  }

  const newStock = product.current_stock - qty;
  const txnId = await getNextTxnId(spreadsheetId);

  await appendSheet(spreadsheetId, `${RANGE}!A:K`, [[
    txnId, product.id, product.name, 'stock_out', qty, 0, 0,
    '', `Removed ${qty} ${product.unit}(s)`, new Date().toISOString(), loggedBy,
  ]]);

  await updateStock(spreadsheetId, sku, newStock);
  sheetsCache.invalidate(CACHE_KEY);

  return { name: product.name, sku: product.sku, removed: qty, unit: product.unit, remaining: newStock, logged_by: loggedBy };
}

/**
 * Record a sale.
 */
export async function recordSale(spreadsheetId, sku, qty, customerName = null, sellPrice = 0, loggedBy = 'System') {
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

  await appendSheet(spreadsheetId, `${RANGE}!A:K`, [[
    txnId, product.id, product.name, 'stock_out', qty, price, totalPrice,
    customerName || '', `Sale: ${qty} ${product.unit}(s)${customerName ? ` to ${customerName}` : ''}`,
    new Date().toISOString(), loggedBy,
  ]]);

  await updateStock(spreadsheetId, sku, newStock);
  sheetsCache.invalidate(CACHE_KEY);

  return {
    name: product.name, sku: product.sku, quantity: qty, unit: product.unit,
    unitPrice: price, totalPrice, remaining: newStock, customer: customerName, logged_by: loggedBy,
  };
}

/**
 * Get all transactions (with optional caching).
 */
async function getAllTransactions(spreadsheetId) {
  const cached = sheetsCache.get(CACHE_KEY);
  if (cached) return cached;

  const rows = await readSheet(spreadsheetId, `${RANGE}!A:K`);
  const txns = (rows.slice(1) || []).map(rowToTransaction);
  sheetsCache.set(CACHE_KEY, txns, 30_000);
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

  let cost = 0;
  for (const sale of sales) {
    const prod = products.find(p => p.id === sale.product_id);
    cost += sale.quantity * (prod?.buy_price || 0);
  }

  return {
    date: today, transactions: sales.length, revenue,
    estimatedCost: cost, estimatedProfit: revenue - cost, sales,
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
    period: `${start} to ${end}`, transactions: sales.length, revenue,
    estimatedCost: cost, estimatedProfit: revenue - cost, sales,
  };
}

/**
 * Get top selling products (last 7 days).
 */
export async function getTopSellers(spreadsheetId, n = 5) {
  const txns = await getAllTransactions(spreadsheetId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const sales = txns.filter(t => t.type === 'stock_out' && t.created_at >= weekAgo);
  const grouped = {};
  for (const s of sales) {
    const key = s.product_name || s.product_id;
    if (!grouped[key]) grouped[key] = { name: s.product_name, total_sold: 0, total_revenue: 0 };
    grouped[key].total_sold += s.quantity;
    grouped[key].total_revenue += s.total_price;
  }

  return Object.values(grouped).sort((a, b) => b.total_sold - a.total_sold).slice(0, n);
}

/**
 * Get staff activity from sheets.
 */
export async function getStaffActivity(spreadsheetId, staffName, date = null) {
  const txns = await getAllTransactions(spreadsheetId);
  const targetDate = date || new Date().toISOString().split('T')[0];
  const nameLower = staffName.toLowerCase();

  const filtered = txns.filter(t =>
    (t.logged_by || '').toLowerCase().includes(nameLower) &&
    t.created_at.startsWith(targetDate)
  );

  const salesCount = filtered.filter(t => t.type === 'stock_out').length;
  const stockInsCount = filtered.filter(t => t.type === 'stock_in').length;
  const totalRevenue = filtered.filter(t => t.type === 'stock_out').reduce((s, t) => s + t.total_price, 0);

  return {
    staff_name: staffName, date: targetDate,
    total_transactions: filtered.length, sales: salesCount,
    stock_additions: stockInsCount, total_revenue: totalRevenue,
    transactions: filtered.map(t => ({
      type: t.type, product: t.product_name, quantity: t.quantity,
      total_price: t.total_price, customer: t.customer_name,
      notes: t.notes, time: t.created_at,
    })),
  };
}

/**
 * Get sales velocity (sheets version).
 */
export async function getSalesVelocity(spreadsheetId) {
  const products = await getProducts(spreadsheetId);
  const txns = await getAllTransactions(spreadsheetId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  return products.map(p => {
    const sold = txns
      .filter(t => t.product_id === p.id && t.type === 'stock_out' && t.created_at >= weekAgo)
      .reduce((s, t) => s + t.quantity, 0);
    const avgDaily = sold / 7;
    return {
      id: p.id, name: p.name, sku: p.sku, unit: p.unit,
      current_stock: p.current_stock, min_stock: p.min_stock,
      buy_price: p.buy_price, sell_price: p.sell_price,
      total_sold_7d: sold, avg_daily_sales: Math.round(avgDaily * 10) / 10,
      days_until_stockout: avgDaily > 0 ? Math.round(p.current_stock / avgDaily * 10) / 10 : 999,
    };
  }).sort((a, b) => a.days_until_stockout - b.days_until_stockout);
}

/**
 * Get staff performance (sheets version).
 */
export async function getStaffPerformance(spreadsheetId) {
  const txns = await getAllTransactions(spreadsheetId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const recent = txns.filter(t => t.created_at >= weekAgo && t.logged_by !== 'System');
  const grouped = {};
  for (const t of recent) {
    if (!grouped[t.logged_by]) grouped[t.logged_by] = { staff_name: t.logged_by, total_transactions: 0, sales_count: 0, stock_in_count: 0, total_revenue: 0 };
    grouped[t.logged_by].total_transactions++;
    if (t.type === 'stock_out') { grouped[t.logged_by].sales_count++; grouped[t.logged_by].total_revenue += t.total_price; }
    if (t.type === 'stock_in') grouped[t.logged_by].stock_in_count++;
  }

  return Object.values(grouped).sort((a, b) => b.total_revenue - a.total_revenue);
}

export default {
  addStock, removeStock, recordSale, getSalesToday, getSalesRange,
  getTopSellers, getStaffActivity, getSalesVelocity, getStaffPerformance,
};
