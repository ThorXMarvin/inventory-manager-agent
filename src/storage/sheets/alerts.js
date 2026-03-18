/**
 * Google Sheets Alerts Storage
 * Alerts Log sheet: ID, Product ID, Product Name, Type, Message, Sent Via, Acknowledged, Created At
 */

import { readSheet, appendSheet } from './client.js';
import { getProducts } from './products.js';
import { logger } from '../../utils/logger.js';

/**
 * Log an alert to the Alerts Log sheet.
 */
export async function logAlert(spreadsheetId, data) {
  const rows = await readSheet(spreadsheetId, "'Alerts Log'!A:A");
  const nextId = rows.length > 0 ? rows.length : 1;

  // Try to get product name
  let productName = '';
  if (data.product_id) {
    try {
      const products = await getProducts(spreadsheetId);
      const prod = products.find(p => p.id === data.product_id);
      productName = prod?.name || '';
    } catch (_) { /* ignore */ }
  }

  await appendSheet(spreadsheetId, "'Alerts Log'!A:H", [[
    nextId,
    data.product_id || '',
    productName,
    data.type || 'general',
    data.message || '',
    data.sent_via || '',
    0,
    new Date().toISOString(),
  ]]);
}

export default { logAlert };
