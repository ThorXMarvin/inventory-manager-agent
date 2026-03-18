/**
 * Google Sheets Setup
 * Auto-creates the spreadsheet with 5 tabs, headers, and formatting.
 */

import { getSheetsApi, getDriveApi } from './client.js';
import { logger } from '../../utils/logger.js';

// Sheet tab definitions with headers
const SHEET_TABS = [
  {
    name: 'Products',
    headers: ['ID', 'Name', 'SKU', 'Category', 'Unit', 'Buy Price', 'Sell Price', 'Current Stock', 'Min Stock', 'Created At', 'Updated At'],
    frozenRows: 1,
    color: { red: 0.2, green: 0.66, blue: 0.33 }, // green
  },
  {
    name: 'Transactions',
    headers: ['ID', 'Product ID', 'Product Name', 'Type', 'Quantity', 'Unit Price', 'Total Price', 'Customer', 'Notes', 'Created At'],
    frozenRows: 1,
    color: { red: 0.1, green: 0.45, blue: 0.82 }, // blue
  },
  {
    name: 'Customers',
    headers: ['ID', 'Name', 'Phone', 'Notes', 'Created At'],
    frozenRows: 1,
    color: { red: 0.98, green: 0.74, blue: 0.18 }, // yellow
  },
  {
    name: 'Daily Summaries',
    headers: ['Date', 'Transactions', 'Revenue', 'Estimated Cost', 'Estimated Profit', 'Top Sellers', 'Low Stock Items', 'Total Items'],
    frozenRows: 1,
    color: { red: 0.67, green: 0.28, blue: 0.74 }, // purple
  },
  {
    name: 'Alerts Log',
    headers: ['ID', 'Product ID', 'Product Name', 'Type', 'Message', 'Sent Via', 'Acknowledged', 'Created At'],
    frozenRows: 1,
    color: { red: 0.92, green: 0.26, blue: 0.21 }, // red
  },
];

/**
 * Create a new spreadsheet with all required tabs.
 * @param {string} spreadsheetName - Name for the spreadsheet
 * @returns {string} The new spreadsheet ID
 */
export async function createSpreadsheet(spreadsheetName) {
  const sheets = getSheetsApi();

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: spreadsheetName },
      sheets: SHEET_TABS.map((tab, i) => ({
        properties: {
          title: tab.name,
          index: i,
          tabColorStyle: { rgbColor: tab.color },
          gridProperties: {
            frozenRowCount: tab.frozenRows,
          },
        },
      })),
    },
  });

  const spreadsheetId = res.data.spreadsheetId;
  logger.info(`Created spreadsheet: ${spreadsheetName} (${spreadsheetId})`);

  // Write headers to all tabs
  const headerData = SHEET_TABS.map(tab => ({
    range: `'${tab.name}'!A1`,
    values: [tab.headers],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: headerData,
    },
  });

  // Bold the header rows
  const requests = [];
  for (let i = 0; i < SHEET_TABS.length; i++) {
    const sheetId = res.data.sheets[i].properties.sheetId;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          },
        },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    });

    // Auto-resize columns
    requests.push({
      autoResizeDimensions: {
        dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: SHEET_TABS[i].headers.length },
      },
    });
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  logger.info('Spreadsheet setup complete with headers and formatting');
  return spreadsheetId;
}

/**
 * Verify an existing spreadsheet has the required tabs.
 * @param {string} spreadsheetId
 * @returns {boolean}
 */
export async function verifySpreadsheet(spreadsheetId) {
  const sheets = getSheetsApi();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const existingTabs = res.data.sheets.map(s => s.properties.title);
  const requiredTabs = SHEET_TABS.map(t => t.name);
  const missing = requiredTabs.filter(t => !existingTabs.includes(t));

  if (missing.length > 0) {
    logger.warn(`Spreadsheet missing tabs: ${missing.join(', ')}. Adding...`);

    // Add missing tabs
    const requests = missing.map(name => ({
      addSheet: { properties: { title: name } },
    }));

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

    // Add headers to new tabs
    const tab = SHEET_TABS.filter(t => missing.includes(t.name));
    const headerData = tab.map(t => ({
      range: `'${t.name}'!A1`,
      values: [t.headers],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: headerData },
    });
  }

  return true;
}

export { SHEET_TABS };
export default { createSpreadsheet, verifySpreadsheet, SHEET_TABS };
