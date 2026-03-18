/**
 * SQLite Database Layer
 * Handles all database initialization, migrations, and low-level queries.
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger.js';

let db = null;

/**
 * Initialize the SQLite database and create tables if they don't exist.
 * @param {string} dbPath - Path to the SQLite database file
 * @returns {Database} The database instance
 */
export function initDatabase(dbPath = './data/inventory.db') {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created database directory: ${dir}`);
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  logger.info(`Database initialized at ${dbPath}`);

  return db;
}

/**
 * Create all required tables if they don't exist.
 */
function createTables() {
  db.exec(`
    -- Products table: master list of all inventory items
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      category TEXT DEFAULT 'General',
      unit TEXT DEFAULT 'piece',
      buy_price REAL DEFAULT 0,
      sell_price REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      min_stock REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Transactions table: every stock movement (in or out)
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stock_in', 'stock_out', 'adjustment')),
      quantity REAL NOT NULL,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      customer_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Alerts table: log of all alerts sent
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_via TEXT,
      acknowledged INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Customers table: track who buys what
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Reports table: generated report snapshots
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
  `);
}

/**
 * Get the database instance. Throws if not initialized.
 * @returns {Database}
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection gracefully.
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed.');
  }
}

export default { initDatabase, getDb, closeDatabase };
