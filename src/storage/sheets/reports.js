/**
 * Google Sheets Reports Storage
 * Daily Summaries sheet: Date, Transactions, Revenue, Est Cost, Est Profit, Top Sellers, Low Stock Items, Total Items
 */

import { appendSheet } from './client.js';
import { getProducts, getLowStock } from './products.js';
import { getSalesToday, getSalesRange, getTopSellers } from './transactions.js';
import { logger } from '../../utils/logger.js';

/**
 * Get daily summary data and optionally write to the sheet.
 */
export async function getDailySummary(spreadsheetId) {
  const daily = await getSalesToday(spreadsheetId);
  const topSellers = await getTopSellers(spreadsheetId, 5);
  const lowStock = await getLowStock(spreadsheetId);
  const products = await getProducts(spreadsheetId);
  const totalItems = products.reduce((s, p) => s + p.current_stock, 0);

  const summary = {
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

  // Write summary row to Daily Summaries sheet
  try {
    await appendSheet(spreadsheetId, "'Daily Summaries'!A:H", [[
      summary.date,
      summary.transactions,
      summary.revenue,
      summary.estimatedCost,
      summary.estimatedProfit,
      topSellers.map(t => `${t.name}: ${t.total_sold}`).join(', '),
      lowStock.length,
      totalItems,
    ]]);
  } catch (err) {
    logger.error(`Failed to write daily summary to Sheets: ${err.message}`);
  }

  return summary;
}

/**
 * Get weekly report data.
 */
export async function getWeeklyReport(spreadsheetId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start = weekAgo.toISOString().split('T')[0];
  const end = now.toISOString().split('T')[0];

  const weekly = await getSalesRange(spreadsheetId, start, end);
  const topSellers = await getTopSellers(spreadsheetId, 10);
  const lowStock = await getLowStock(spreadsheetId);

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
