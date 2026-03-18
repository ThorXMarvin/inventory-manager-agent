/**
 * CSV Product Importer
 * Import products from a CSV file into the database.
 *
 * Usage: node src/utils/csv-import.js <path-to-csv>
 *
 * CSV format:
 *   name,sku,category,unit,buy_price,sell_price,min_stock,current_stock
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { initDatabase, getDb } from '../db/sqlite.js';
import { loadBusinessConfig, env } from './config.js';
import { logger } from './logger.js';

/**
 * Import products from a CSV file.
 * @param {string} csvPath - Path to the CSV file
 * @returns {object} Import results
 */
export function importProductsFromCSV(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    return { imported: 0, skipped: 0, errors: [] };
  }

  const db = getDb();
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO products (name, sku, category, unit, buy_price, sell_price, current_stock, min_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;
  const errors = [];

  const txn = db.transaction(() => {
    for (const row of records) {
      try {
        if (!row.name) {
          skipped++;
          continue;
        }

        insertStmt.run(
          row.name,
          row.sku || null,
          row.category || 'General',
          row.unit || 'piece',
          parseFloat(row.buy_price) || 0,
          parseFloat(row.sell_price) || 0,
          parseFloat(row.current_stock) || 0,
          parseFloat(row.min_stock) || 0,
        );
        imported++;
      } catch (err) {
        errors.push({ row: row.name, error: err.message });
        skipped++;
      }
    }
  });

  txn();
  return { imported, skipped, errors };
}

// ─── CLI Entry Point ──────────────────────────────────────

const args = process.argv.slice(2);
if (args.length > 0) {
  const csvPath = path.resolve(args[0]);

  console.log(`📦 Importing products from: ${csvPath}`);

  // Init database
  const dbPath = env('DB_PATH', './data/inventory.db');
  initDatabase(dbPath);

  try {
    const result = importProductsFromCSV(csvPath);
    console.log(`\n✅ Import complete:`);
    console.log(`  Imported: ${result.imported}`);
    console.log(`  Skipped: ${result.skipped}`);

    if (result.errors.length > 0) {
      console.log(`  Errors:`);
      for (const err of result.errors) {
        console.log(`    - ${err.row}: ${err.error}`);
      }
    }
  } catch (err) {
    console.error(`❌ Import failed: ${err.message}`);
    process.exit(1);
  }
}

export default { importProductsFromCSV };
