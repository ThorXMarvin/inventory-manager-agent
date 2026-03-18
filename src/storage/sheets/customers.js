/**
 * Google Sheets Customers Storage
 * Customers sheet: ID, Name, Phone, Notes, Created At
 */

import { readSheet, appendSheet } from './client.js';
import { sheetsCache } from './cache.js';
import { logger } from '../../utils/logger.js';

const RANGE = 'Customers';
const CACHE_KEY = 'sheets:customers';

function rowToCustomer(row) {
  return {
    id: row[0] || 0,
    name: row[1] || '',
    phone: row[2] || '',
    notes: row[3] || '',
    created_at: row[4] || '',
  };
}

/**
 * Get all customers.
 */
export async function getCustomers(spreadsheetId) {
  const cached = sheetsCache.get(CACHE_KEY);
  if (cached) return cached;

  const rows = await readSheet(spreadsheetId, `${RANGE}!A:E`);
  const customers = (rows.slice(1) || []).map(rowToCustomer);
  sheetsCache.set(CACHE_KEY, customers);
  return customers;
}

/**
 * Find or create a customer by name.
 */
export async function getOrCreateCustomer(spreadsheetId, name) {
  if (!name) return null;
  const customers = await getCustomers(spreadsheetId);
  let customer = customers.find(c => c.name.toLowerCase() === name.trim().toLowerCase());

  if (!customer) {
    const nextId = customers.length > 0 ? Math.max(...customers.map(c => Number(c.id) || 0)) + 1 : 1;
    customer = { id: nextId, name: name.trim(), phone: '', notes: '', created_at: new Date().toISOString() };
    await appendSheet(spreadsheetId, `${RANGE}!A:E`, [
      [customer.id, customer.name, '', '', customer.created_at],
    ]);
    sheetsCache.invalidate(CACHE_KEY);
    logger.info(`New customer created in Sheets: ${name}`);
  }

  return customer;
}

/**
 * Get customer purchase history.
 */
export async function getCustomerHistory(spreadsheetId, customerName) {
  // Read transactions to find this customer's purchases
  const txnRows = await readSheet(spreadsheetId, 'Transactions!A:J');
  const txns = (txnRows.slice(1) || [])
    .filter(row => (row[7] || '').toLowerCase().includes(customerName.toLowerCase()) && row[3] === 'stock_out');

  if (txns.length === 0) {
    return { customer: customerName, totalPurchases: 0, totalSpent: 0, recentPurchases: [] };
  }

  const totalSpent = txns.reduce((s, r) => s + (Number(r[6]) || 0), 0);
  const recent = txns.slice(-10).reverse().map(row => ({
    product_name: row[2] || '',
    quantity: Number(row[4]) || 0,
    total_price: Number(row[6]) || 0,
    created_at: row[9] || '',
  }));

  return {
    customer: customerName,
    totalPurchases: txns.length,
    totalSpent,
    recentPurchases: recent,
  };
}

export default { getCustomers, getOrCreateCustomer, getCustomerHistory };
