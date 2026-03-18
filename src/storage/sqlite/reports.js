/**
 * SQLite Reports Storage
 */

import { getSqliteDb } from './client.js';
import { getProducts, getLowStock } from './products.js';
import { getSalesToday, getSalesRange, getTopSellers } from './transactions.js';

/**
 * Get daily summary data.
 * @returns {Object}
 */
export function getDailySummary() {
  const daily = getSalesToday();
  const topSellers = getTopSellers(5);
  const lowStock = getLowStock();
  const allProducts = getProducts();
  const totalItems = allProducts.reduce((s, p) => s + p.current_stock, 0);

  // Save to reports table
  try {
    const db = getSqliteDb();
    db.prepare("INSERT INTO reports (type, data, period_start, period_end) VALUES ('daily', ?, date('now'), date('now'))")
      .run(JSON.stringify(daily));
  } catch (_) { /* ignore save errors */ }

  return {
    date: daily.date,
    transactions: daily.transactions,
    revenue: daily.revenue,
    estimatedCost: daily.estimatedCost,
    estimatedProfit: daily.estimatedProfit,
    topSellers,
    lowStock,
    totalItems,
    sales: daily.sales,
  };
}

/**
 * Get weekly report data.
 * @returns {Object}
 */
export function getWeeklyReport() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start = weekAgo.toISOString().split('T')[0];
  const end = now.toISOString().split('T')[0];

  const weekly = getSalesRange(start, end);
  const topSellers = getTopSellers(10);
  const lowStock = getLowStock();

  // Save to reports table
  try {
    const db = getSqliteDb();
    db.prepare("INSERT INTO reports (type, data, period_start, period_end) VALUES ('weekly', ?, ?, ?)")
      .run(JSON.stringify(weekly), start, end);
  } catch (_) { /* ignore save errors */ }

  return {
    period: weekly.period,
    transactions: weekly.transactions,
    revenue: weekly.revenue,
    estimatedCost: weekly.estimatedCost,
    estimatedProfit: weekly.estimatedProfit,
    topSellers,
    lowStock,
  };
}

export default { getDailySummary, getWeeklyReport };
