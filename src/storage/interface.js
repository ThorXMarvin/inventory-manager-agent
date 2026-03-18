/**
 * Storage Interface Documentation
 * 
 * All storage adapters (SQLite, Google Sheets) must implement this interface.
 * This file serves as documentation and a runtime contract validator.
 * 
 * Methods return plain objects/arrays — no DB-specific types leak out.
 */

/**
 * @typedef {Object} StorageAdapter
 * 
 * ─── Products ───────────────────────────────────────────
 * @property {function(): Promise<Array>} getProducts
 *   Returns all products with fields: id, name, sku, category, unit,
 *   buy_price, sell_price, current_stock, min_stock, created_at, updated_at
 * 
 * @property {function(string): Promise<Object|null>} getProduct
 *   Get a single product by SKU or name (fuzzy match).
 *   Returns product object or null.
 * 
 * @property {function(Object): Promise<Object>} addProduct
 *   Add a new product. Data: { name, sku, category, unit, buy_price, sell_price, min_stock, current_stock }
 *   Returns the created product with id.
 * 
 * @property {function(string, Object): Promise<Object>} updateProduct
 *   Update product by SKU. Data can include any product fields.
 *   Returns the updated product.
 * 
 * ─── Stock ──────────────────────────────────────────────
 * @property {function(string, number, number): Promise<Object>} addStock
 *   Add stock: (sku, quantity, buyPrice). Records a stock_in transaction.
 *   Returns { name, added, unit, newStock, value }.
 * 
 * @property {function(string, number): Promise<Object>} removeStock
 *   Remove stock: (sku, quantity). Records a stock_out transaction.
 *   Returns { name, removed, unit, remaining }.
 * 
 * ─── Sales ──────────────────────────────────────────────
 * @property {function(string, number, string|null, number): Promise<Object>} recordSale
 *   Record a sale: (sku, quantity, customerName, sellPrice).
 *   Returns { name, quantity, unit, totalPrice, remaining, customer }.
 * 
 * @property {function(): Promise<Object>} getSalesToday
 *   Get today's sales summary.
 *   Returns { date, transactions, revenue, estimatedCost, estimatedProfit, sales[] }.
 * 
 * @property {function(string, string): Promise<Object>} getSalesRange
 *   Get sales for a date range: (startDate, endDate) in YYYY-MM-DD format.
 *   Returns { period, transactions, revenue, estimatedCost, estimatedProfit }.
 * 
 * @property {function(number): Promise<Array>} getTopSellers
 *   Get top N selling products (last 7 days).
 *   Returns [{ name, unit, total_sold, total_revenue }].
 * 
 * ─── Customers ──────────────────────────────────────────
 * @property {function(): Promise<Array>} getCustomers
 *   Returns all customers: [{ id, name, phone, notes, created_at }].
 * 
 * @property {function(string): Promise<Object>} getCustomerHistory
 *   Get a customer's purchase history by name.
 *   Returns { customer, totalPurchases, totalSpent, recentPurchases[] }.
 * 
 * ─── Alerts ─────────────────────────────────────────────
 * @property {function(): Promise<Array>} getLowStock
 *   Get products below minimum stock level.
 *   Returns [{ id, name, sku, category, unit, current_stock, min_stock }].
 * 
 * @property {function(Object): Promise<void>} logAlert
 *   Log an alert: { product_id, type, message, sent_via }.
 * 
 * ─── Reports ────────────────────────────────────────────
 * @property {function(): Promise<Object>} getDailySummary
 *   Generate daily summary data (not formatted text).
 *   Returns { date, sales, revenue, profit, topSellers[], lowStock[], totalItems }.
 * 
 * @property {function(): Promise<Object>} getWeeklyReport
 *   Generate weekly report data.
 *   Returns { period, transactions, revenue, profit, topSellers[], lowStock[] }.
 * 
 * ─── Staff & Insights ────────────────────────────────────
 * @property {function(string, string|null): Promise<Object>} getStaffActivity
 *   Get all transactions by a staff member on a date.
 *   Returns { staff_name, date, total_transactions, sales, stock_additions, total_revenue, transactions[] }.
 *
 * @property {function(): Promise<Array>} getSalesVelocity
 *   Get sales velocity per product for reorder suggestions.
 *
 * @property {function(): Promise<Array>} getStaffPerformance
 *   Get staff performance summary for the past week.
 *
 * ─── Lifecycle ──────────────────────────────────────────
 * @property {function(): Promise<void>} initialize
 *   Initialize the storage backend (create tables, sheets, etc.).
 * 
 * @property {function(): Promise<void>} close
 *   Clean up resources (close DB connections, flush caches).
 *
 * NOTE: addStock, removeStock, and recordSale accept an optional `loggedBy`
 * (staff name) as their last argument for audit trail.
 */

/**
 * List of all required method names for a valid adapter.
 */
export const REQUIRED_METHODS = [
  'getProducts', 'getProduct', 'addProduct', 'updateProduct',
  'addStock', 'removeStock',
  'recordSale', 'getSalesToday', 'getSalesRange', 'getTopSellers',
  'getCustomers', 'getCustomerHistory',
  'getLowStock', 'logAlert',
  'getDailySummary', 'getWeeklyReport',
  'getStaffActivity', 'getSalesVelocity', 'getStaffPerformance',
  'initialize', 'close',
];

/**
 * Validate that an adapter implements all required methods.
 * @param {Object} adapter - The adapter to validate
 * @throws {Error} If any required method is missing
 */
export function validateAdapter(adapter) {
  const missing = REQUIRED_METHODS.filter(m => typeof adapter[m] !== 'function');
  if (missing.length > 0) {
    throw new Error(`Storage adapter missing methods: ${missing.join(', ')}`);
  }
}

export default { REQUIRED_METHODS, validateAdapter };
