/**
 * SQLite Storage Adapter
 * Implements the storage interface using SQLite via better-sqlite3.
 * Wraps the existing SQLite code into the unified adapter pattern.
 */

import { initSqlite, closeSqlite } from './client.js';
import { getProducts, getProduct, addProduct, updateProduct, getLowStock } from './products.js';
import {
  addStock, removeStock, recordSale, getSalesToday, getSalesRange,
  getTopSellers, getStaffActivity, getSalesVelocity, getStaffPerformance,
} from './transactions.js';
import { getCustomers, getCustomerHistory } from './customers.js';
import { logAlert } from './alerts.js';
import { getDailySummary, getWeeklyReport } from './reports.js';

/**
 * Create a SQLite storage adapter.
 * @param {Object} config - { path: "./data/inventory.db" }
 * @returns {Object} Storage adapter implementing the interface
 */
export function createSqliteAdapter(config = {}) {
  const dbPath = config.path || './data/inventory.db';

  return {
    name: 'sqlite',

    // ─── Lifecycle ────────────────────────────────
    async initialize() { initSqlite(dbPath); },
    async close() { closeSqlite(); },

    // ─── Products ─────────────────────────────────
    async getProducts() { return getProducts(); },
    async getProduct(skuOrName) { return getProduct(skuOrName); },
    async addProduct(data) { return addProduct(data); },
    async updateProduct(sku, data) { return updateProduct(sku, data); },

    // ─── Stock (loggedBy = staff name) ────────────
    async addStock(sku, qty, buyPrice = 0, loggedBy = 'System') {
      return addStock(sku, qty, buyPrice, loggedBy);
    },
    async removeStock(sku, qty, loggedBy = 'System') {
      return removeStock(sku, qty, loggedBy);
    },

    // ─── Sales (loggedBy = staff name) ────────────
    async recordSale(sku, qty, customerName = null, sellPrice = 0, loggedBy = 'System') {
      return recordSale(sku, qty, customerName, sellPrice, loggedBy);
    },
    async getSalesToday() { return getSalesToday(); },
    async getSalesRange(start, end) { return getSalesRange(start, end); },
    async getTopSellers(n = 5) { return getTopSellers(n); },

    // ─── Customers ────────────────────────────────
    async getCustomers() { return getCustomers(); },
    async getCustomerHistory(name) { return getCustomerHistory(name); },

    // ─── Alerts ───────────────────────────────────
    async getLowStock() { return getLowStock(); },
    async logAlert(data) { return logAlert(data); },

    // ─── Reports ──────────────────────────────────
    async getDailySummary() { return getDailySummary(); },
    async getWeeklyReport() { return getWeeklyReport(); },

    // ─── Staff & Insights ─────────────────────────
    async getStaffActivity(staffName, date = null) { return getStaffActivity(staffName, date); },
    async getSalesVelocity() { return getSalesVelocity(); },
    async getStaffPerformance() { return getStaffPerformance(); },
  };
}

export default { createSqliteAdapter };
