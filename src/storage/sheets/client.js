/**
 * Google Sheets API Client
 * Handles authentication (service account or OAuth2) and provides
 * a rate-limited wrapper for Sheets API calls.
 */

import { google } from 'googleapis';
import fs from 'fs';
import { logger } from '../../utils/logger.js';

let sheetsApi = null;
let driveApi = null;

// Simple rate limiter: max 90 requests per 100 seconds (buffer under Google's 100/100s limit)
const rateLimiter = {
  tokens: 90,
  maxTokens: 90,
  refillRate: 0.9, // tokens per second
  lastRefill: Date.now(),

  async acquire() {
    // Refill tokens based on elapsed time
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;

    if (this.tokens < 1) {
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
      logger.debug(`Sheets rate limit: waiting ${waitMs}ms`);
      await new Promise(r => setTimeout(r, waitMs));
      this.tokens = 1;
    }
    this.tokens -= 1;
  },
};

/**
 * Initialize Google API auth from service account JSON key file.
 * @param {string} credentialsFile - Path to service account JSON key
 * @returns {{ sheets: Object, drive: Object }}
 */
export async function initSheetsClient(credentialsFile) {
  if (!credentialsFile || !fs.existsSync(credentialsFile)) {
    throw new Error(`Google credentials file not found: ${credentialsFile}`);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsFile, 'utf-8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });

  const authClient = await auth.getClient();
  sheetsApi = google.sheets({ version: 'v4', auth: authClient });
  driveApi = google.drive({ version: 'v3', auth: authClient });

  logger.info('Google Sheets API client initialized');
  return { sheets: sheetsApi, drive: driveApi };
}

/**
 * Get the Sheets API instance.
 */
export function getSheetsApi() {
  if (!sheetsApi) throw new Error('Sheets API not initialized. Call initSheetsClient() first.');
  return sheetsApi;
}

/**
 * Get the Drive API instance.
 */
export function getDriveApi() {
  if (!driveApi) throw new Error('Drive API not initialized. Call initSheetsClient() first.');
  return driveApi;
}

/**
 * Rate-limited wrapper: read values from a sheet range.
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "Products!A:J"
 * @returns {Array<Array>} rows
 */
export async function readSheet(spreadsheetId, range) {
  await rateLimiter.acquire();
  const res = await getSheetsApi().spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return res.data.values || [];
}

/**
 * Rate-limited wrapper: append rows to a sheet.
 * @param {string} spreadsheetId
 * @param {string} range
 * @param {Array<Array>} rows
 */
export async function appendSheet(spreadsheetId, range, rows) {
  await rateLimiter.acquire();
  await getSheetsApi().spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });
}

/**
 * Rate-limited wrapper: update a specific range.
 * @param {string} spreadsheetId
 * @param {string} range
 * @param {Array<Array>} rows
 */
export async function updateSheet(spreadsheetId, range, rows) {
  await rateLimiter.acquire();
  await getSheetsApi().spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

/**
 * Rate-limited wrapper: batch update multiple ranges.
 * @param {string} spreadsheetId
 * @param {Array<{ range: string, values: Array<Array> }>} data
 */
export async function batchUpdateSheet(spreadsheetId, data) {
  await rateLimiter.acquire();
  await getSheetsApi().spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data,
    },
  });
}

export default { initSheetsClient, getSheetsApi, getDriveApi, readSheet, appendSheet, updateSheet, batchUpdateSheet };
