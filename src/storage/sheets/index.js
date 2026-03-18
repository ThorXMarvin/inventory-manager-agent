/**
 * Google Sheets Storage Adapter
 * Implements the storage interface using Google Sheets API.
 */

import { initSheetsClient } from './client.js';
import { createSpreadsheet, verifySpreadsheet } from './setup.js';
import { getProducts, getProduct, addProduct, updateProduct, getLowStock } from './products.js';
import { addStock, removeStock, recordSale, getSalesToday, getSalesRange, getTopSellers } from './transactions.js';
import { getCustomers, getCustomerHistory } from './customers.js';
import { logAlert } from './alerts.js';
import { getDailySummary, getWeeklyReport } from './reports.js';
import { sheetsCache } from './cache.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a Google Sheets storage adapter.
 * @param {Object} config - { credentials_file, spreadsheet_id, spreadsheet_name }
 * @returns {Object} Storage adapter implementing the interface
 */
export function createSheetsAdapter(config = {}) {
  let spreadsheetId = config.spreadsheet_id || process.env.GOOGLE_SHEETS_SPREADSHEET_ID || '';

  return {
    name: 'sheets',

    async initialize() {
      // Authenticate with Google
      await initSheetsClient(
        config.credentials_file || process.env.GOOGLE_SHEETS_CREDENTIALS_FILE || './config/google-credentials.json'
      );

      // Create or verify spreadsheet
      if (!spreadsheetId) {
        const name = config.spreadsheet_name || 'Inventory Manager';
        spreadsheetId = await createSpreadsheet(name);
        logger.info(`Auto-created spreadsheet: ${spreadsheetId}`);
        logger.info('⚠️  Save this spreadsheet_id in your config to avoid re-creating on restart');
      } else {
        await verifySpreadsheet(spreadsheetId);
        logger.info(`Connected to spreadsheet: ${spreadsheetId}`);
      }
    },

    async close() {
      sheetsCache.clear();
    },

    // ─── Products ─────────────────────────────────
    async getProducts() { return getProducts(spreadsheetId); },
    async getProduct(skuOrName) { return getProduct(spreadsheetId, skuOrName); },
    async addProduct(data) { return addProduct(spreadsheetId, data); },
    async updateProduct(sku, data) { return updateProduct(spreadsheetId, sku, data); },

    // ─── Stock ────────────────────────────────────
    async addStock(sku, qty, buyPrice = 0) { return addStock(spreadsheetId, sku, qty, buyPrice); },
    async removeStock(sku, qty) { return removeStock(spreadsheetId, sku, qty); },

    // ─── Sales ────────────────────────────────────
    async recordSale(sku, qty, customer = null, price = 0) { return recordSale(spreadsheetId, sku, qty, customer, price); },
    async getSalesToday() { return getSalesToday(spreadsheetId); },
    async getSalesRange(start, end) { return getSalesRange(spreadsheetId, start, end); },
    async getTopSellers(n = 5) { return getTopSellers(spreadsheetId, n); },

    // ─── Customers ────────────────────────────────
    async getCustomers() { return getCustomers(spreadsheetId); },
    async getCustomerHistory(name) { return getCustomerHistory(spreadsheetId, name); },

    // ─── Alerts ───────────────────────────────────
    async getLowStock() { return getLowStock(spreadsheetId); },
    async logAlert(data) { return logAlert(spreadsheetId, data); },

    // ─── Reports ──────────────────────────────────
    async getDailySummary() { return getDailySummary(spreadsheetId); },
    async getWeeklyReport() { return getWeeklyReport(spreadsheetId); },
  };
}

export default { createSheetsAdapter };
