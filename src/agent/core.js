/**
 * Core Agent Orchestrator
 * Receives a message, parses intent via LLM, routes to the right module,
 * and returns a formatted response.
 */

import { parseMessage } from './parser.js';
import { addStock, getStock, getAllStock, getLowStock } from './stock.js';
import { recordSale, getDailySales, getCustomerHistory } from './sales.js';
import { dailySummary, weeklyReport, stockReport, profitReport } from './reports.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Format a number with thousands separators.
 */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * Process a user message and return a response.
 * This is the main entry point for all channels.
 * @param {string} message - Raw user message
 * @param {object} meta - Optional metadata (sender, channel, etc.)
 * @returns {string} Response text
 */
export async function processMessage(message, meta = {}) {
  const config = getConfig();
  const currency = config.business.currency || 'UGX';

  try {
    // Parse the message via LLM
    const intent = await parseMessage(message);
    logger.info(`Intent: ${intent.action} | Message: "${message}"`);

    switch (intent.action) {
      case 'add_stock':
        return handleAddStock(intent, currency);

      case 'record_sale':
        return handleRecordSale(intent, currency);

      case 'check_stock':
        return handleCheckStock(intent, currency);

      case 'stock_report':
        return stockReport();

      case 'daily_summary':
        return dailySummary();

      case 'weekly_report':
        return weeklyReport();

      case 'profit_report':
        return profitReport();

      case 'help':
        return getHelpText(config.business.name);

      default:
        return `🤔 I didn't quite understand that. Try:\n` +
          `• "Sold 5 bags cement to Kato"\n` +
          `• "Received 100 bags cement"\n` +
          `• "How much cement do I have?"\n` +
          `• "Stock report"\n` +
          `• "Daily summary"\n` +
          `• "Help"`;
    }
  } catch (err) {
    logger.error(`Error processing message: ${err.message}`, err);
    return `❌ Sorry, something went wrong. Please try again.\nError: ${err.message}`;
  }
}

/**
 * Handle adding stock.
 */
function handleAddStock(intent, currency) {
  if (!intent.items || intent.items.length === 0) {
    return '❓ What items did you receive? E.g., "Received 50 bags cement"';
  }

  const results = addStock(intent.items);
  let response = '✅ *Stock Updated:*\n';

  for (const item of results) {
    if (item.error) {
      response += `  ❌ ${item.name}: ${item.error}\n`;
    } else {
      response += `  • ${item.name}: +${item.added} ${item.unit}(s) → ${item.newStock} total\n`;
    }
  }

  return response;
}

/**
 * Handle recording a sale.
 */
function handleRecordSale(intent, currency) {
  if (!intent.items || intent.items.length === 0) {
    return '❓ What did you sell? E.g., "Sold 5 bags cement to Kato"';
  }

  const sale = recordSale(intent.items, intent.customer);
  let response = '💰 *Sale Recorded:*\n';

  for (const item of sale.items) {
    if (item.error) {
      response += `  ❌ ${item.name}: ${item.error}\n`;
    } else {
      response += `  • ${item.quantity}x ${item.name}: ${currency} ${fmt(item.totalPrice)}\n`;
    }
  }

  if (sale.grandTotal > 0) {
    response += `\n💵 *Total: ${currency} ${fmt(sale.grandTotal)}*`;
  }

  if (sale.customer) {
    response += `\n👤 Customer: ${sale.customer}`;
  }

  // Show remaining stock for sold items
  const stockItems = sale.items.filter(i => !i.error);
  if (stockItems.length > 0) {
    response += '\n\n📦 Stock remaining:';
    for (const item of stockItems) {
      response += `\n  • ${item.name}: ${item.remaining} ${item.unit}(s)`;
    }
  }

  return response;
}

/**
 * Handle checking stock levels.
 */
function handleCheckStock(intent, currency) {
  // If specific items requested
  if (intent.items && intent.items.length > 0) {
    let response = '';
    for (const item of intent.items) {
      const stock = getStock(item.name);
      if (stock.error) {
        response += `❌ ${stock.error}\n`;
        continue;
      }

      const statusIcon = stock.isLow ? '🔴' : '🟢';
      const statusText = stock.isLow ? '⚠️ LOW' : '✅ OK';

      response += `📦 *${stock.name}*\n`;
      response += `  ${statusIcon} In stock: ${stock.currentStock} ${stock.unit}(s) ${statusText}\n`;
      response += `  Min level: ${stock.minStock} ${stock.unit}(s)\n`;
      response += `  This week: -${stock.weekOut} sold, +${stock.weekIn} received\n`;
      response += `  Value: ${currency} ${fmt(stock.stockValue)} (at cost)\n\n`;
    }
    return response.trim();
  }

  // Otherwise show all stock
  return stockReport();
}

/**
 * Get help text.
 */
function getHelpText(businessName) {
  return `🤖 *${businessName || 'Inventory Manager'} — Help*\n\n` +
    `I understand natural language! Here's what I can do:\n\n` +
    `📥 *Add Stock:*\n` +
    `  "Received 50 bags cement"\n` +
    `  "Added 100 iron sheets and 20 tins paint"\n\n` +
    `💰 *Record Sales:*\n` +
    `  "Sold 5 bags cement to Kato"\n` +
    `  "Sale: 10 iron sheets, 2 tins paint"\n\n` +
    `📦 *Check Stock:*\n` +
    `  "How much cement do I have?"\n` +
    `  "Check iron sheets stock"\n\n` +
    `📊 *Reports:*\n` +
    `  "Stock report"\n` +
    `  "Daily summary"\n` +
    `  "Weekly report"\n` +
    `  "Profit report"\n\n` +
    `Just type naturally — I'll figure out what you need! 💪`;
}

export default { processMessage };
