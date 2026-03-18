/**
 * SQLite Storage Adapter
 * Implements the storage interface using SQLite via better-sqlite3.
 * Wraps the existing v1 SQLite code into the unified adapter pattern.
 */

import { initSqlite, closeSqlite } from './client.js';
import { getProducts, getProduct, addProduct, updateProduct, getLowStock } from './products.js';
import { addStock, removeStock, recordSale, getSalesToday, getSalesRange, getTopSellers } from './transactions.js';
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
    async initialize() {
      initSqlite(dbPath);
    },

    async close() {
      closeSqlite();
    },

    // ─── Products ─────────────────────────────────
    async getProducts() {
      return getProducts();
    },

    async getProduct(skuOrName) {
      return getProduct(skuOrName);
    },

    async addProduct(data) {
      return addProduct(data);
    },

    async updateProduct(sku, data) {
      return updateProduct(sku, data);
    },

    // ─── Stock ────────────────────────────────────
    async addStock(sku, qty, buyPrice = 0) {
      return addStock(sku, qty, buyPrice);
    },

    async removeStock(sku, qty) {
      return removeStock(sku, qty);
    },

    // ─── Sales ────────────────────────────────────
    async recordSale(sku, qty, customerName = null, sellPrice = 0) {
      return recordSale(sku, qty, customerName, sellPrice);
    },

    async getSalesToday() {
      return getSalesToday();
    },

    async getSalesRange(start, end) {
      return getSalesRange(start, end);
    },

    async getTopSellers(n = 5) {
      return getTopSellers(n);
    },

    // ─── Customers ────────────────────────────────
    async getCustomers() {
      return getCustomers();
    },

    async getCustomerHistory(name) {
      return getCustomerHistory(name);
    },

    // ─── Alerts ───────────────────────────────────
    async getLowStock() {
      return getLowStock();
    },

    async logAlert(data) {
      return logAlert(data);
    },

    // ─── Reports ──────────────────────────────────
    async getDailySummary() {
      return getDailySummary();
    },

    async getWeeklyReport() {
      return getWeeklyReport();
    },
  };
}

export default { createSqliteAdapter };
