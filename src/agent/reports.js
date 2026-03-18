/**
 * Report Generator
 * Produces formatted summaries of stock, sales, and profits.
 */

import { getDb } from '../db/sqlite.js';
import { getAllStock, getLowStock } from './stock.js';
import { getDailySales, getWeeklySales, getTopSellers } from './sales.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Format a number with thousands separators.
 */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * Generate a daily summary report.
 * @returns {string} Formatted report text
 */
export function dailySummary() {
  const config = getConfig();
  const currency = config.business.currency || 'UGX';
  const daily = getDailySales();
  const topSellers = getTopSellers(5);
  const lowStock = getLowStock();
  const allStock = getAllStock();
  const totalItems = allStock.reduce((sum, p) => sum + p.current_stock, 0);

  const today = new Date().toLocaleDateString('en-UG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  let report = `📊 *Daily Summary — ${today}*\n\n`;
  report += `💰 Sales: ${daily.transactions} transactions\n`;
  report += `💵 Revenue: ${currency} ${fmt(daily.revenue)}\n`;
  report += `📈 Est. Profit: ${currency} ${fmt(daily.estimatedProfit)}\n\n`;

  if (topSellers.length > 0) {
    report += `🏆 *Top Sellers Today:*\n`;
    topSellers.forEach((item, i) => {
      report += `  ${i + 1}. ${item.name} — ${fmt(item.total_sold)} ${item.unit}(s)\n`;
    });
    report += '\n';
  }

  if (lowStock.length > 0) {
    report += `⚠️ *${lowStock.length} item(s) low on stock*\n`;
    lowStock.forEach(item => {
      report += `  • ${item.name}: ${item.current_stock} left (min: ${item.min_stock})\n`;
    });
    report += '\n';
  }

  report += `📦 Total items in store: ${fmt(totalItems)} units`;

  // Save report to DB
  try {
    const db = getDb();
    db.prepare('INSERT INTO reports (type, data, period_start, period_end) VALUES (?, ?, date(\'now\'), date(\'now\'))')
      .run('daily', report);
  } catch (err) {
    logger.error(`Failed to save daily report: ${err.message}`);
  }

  return report;
}

/**
 * Generate a weekly report.
 * @returns {string} Formatted report text
 */
export function weeklyReport() {
  const config = getConfig();
  const currency = config.business.currency || 'UGX';
  const weekly = getWeeklySales();
  const topSellers = getTopSellers(10);
  const lowStock = getLowStock();

  let report = `📊 *Weekly Report — ${weekly.period}*\n\n`;
  report += `💰 Total Sales: ${weekly.transactions} transactions\n`;
  report += `💵 Revenue: ${currency} ${fmt(weekly.revenue)}\n`;
  report += `📈 Est. Profit: ${currency} ${fmt(weekly.estimatedProfit)}\n\n`;

  if (topSellers.length > 0) {
    report += `🏆 *Top Sellers This Week:*\n`;
    topSellers.forEach((item, i) => {
      report += `  ${i + 1}. ${item.name} — ${fmt(item.total_sold)} sold (${currency} ${fmt(item.total_revenue)})\n`;
    });
    report += '\n';
  }

  if (lowStock.length > 0) {
    report += `⚠️ *${lowStock.length} item(s) below minimum:*\n`;
    lowStock.forEach(item => {
      report += `  • ${item.name}: ${item.current_stock}/${item.min_stock}\n`;
    });
  }

  // Save report
  try {
    const db = getDb();
    db.prepare('INSERT INTO reports (type, data, period_start, period_end) VALUES (?, ?, datetime(\'now\', \'-7 days\'), datetime(\'now\'))')
      .run('weekly', report);
  } catch (err) {
    logger.error(`Failed to save weekly report: ${err.message}`);
  }

  return report;
}

/**
 * Generate a stock report with all products and their levels.
 * @returns {string} Formatted report text
 */
export function stockReport() {
  const config = getConfig();
  const currency = config.business.currency || 'UGX';
  const allStock = getAllStock();

  let totalValue = 0;
  let report = `📦 *Stock Report*\n\n`;

  // Group by category
  const categories = {};
  for (const product of allStock) {
    const cat = product.category || 'General';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(product);
    totalValue += product.current_stock * product.buy_price;
  }

  for (const [category, products] of Object.entries(categories)) {
    report += `*${category}:*\n`;
    for (const p of products) {
      const status = p.is_low ? '🔴' : '🟢';
      report += `  ${status} ${p.name}: ${p.current_stock} ${p.unit}(s)`;
      if (p.is_low) report += ` ⚠️ (min: ${p.min_stock})`;
      report += '\n';
    }
    report += '\n';
  }

  report += `💰 Total Stock Value: ${currency} ${fmt(totalValue)}`;

  return report;
}

/**
 * Generate a profit report.
 * @returns {string} Formatted report text
 */
export function profitReport() {
  const db = getDb();
  const config = getConfig();
  const currency = config.business.currency || 'UGX';

  // This week's profit
  const weekData = db.prepare(`
    SELECT
      SUM(t.total_price) as revenue,
      SUM(t.quantity * p.buy_price) as cost
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'stock_out' AND t.created_at >= datetime('now', '-7 days')
  `).get();

  // This month's profit
  const monthData = db.prepare(`
    SELECT
      SUM(t.total_price) as revenue,
      SUM(t.quantity * p.buy_price) as cost
    FROM transactions t
    JOIN products p ON t.product_id = p.id
    WHERE t.type = 'stock_out' AND t.created_at >= datetime('now', 'start of month')
  `).get();

  const weekRevenue = weekData?.revenue || 0;
  const weekCost = weekData?.cost || 0;
  const weekProfit = weekRevenue - weekCost;
  const monthRevenue = monthData?.revenue || 0;
  const monthCost = monthData?.cost || 0;
  const monthProfit = monthRevenue - monthCost;

  let report = `💰 *Profit Report*\n\n`;
  report += `*This Week:*\n`;
  report += `  Revenue: ${currency} ${fmt(weekRevenue)}\n`;
  report += `  Cost: ${currency} ${fmt(weekCost)}\n`;
  report += `  Profit: ${currency} ${fmt(weekProfit)}\n`;
  if (weekRevenue > 0) {
    report += `  Margin: ${((weekProfit / weekRevenue) * 100).toFixed(1)}%\n`;
  }
  report += '\n';
  report += `*This Month:*\n`;
  report += `  Revenue: ${currency} ${fmt(monthRevenue)}\n`;
  report += `  Cost: ${currency} ${fmt(monthCost)}\n`;
  report += `  Profit: ${currency} ${fmt(monthProfit)}\n`;
  if (monthRevenue > 0) {
    report += `  Margin: ${((monthProfit / monthRevenue) * 100).toFixed(1)}%\n`;
  }

  return report;
}

export default { dailySummary, weeklyReport, stockReport, profitReport };
