/**
 * Storage Adapter Factory
 * Reads config.storage.mode ("sqlite"|"sheets"|"both") and returns
 * the appropriate storage adapter.
 * 
 * In "both" mode, SQLite is primary for all reads/writes.
 * Sheets receives background syncs every 15 minutes.
 */

import { createSqliteAdapter } from './sqlite/index.js';
import { createSheetsAdapter } from './sheets/index.js';
import { startSync, stopSync } from './sync.js';
import { validateAdapter } from './interface.js';
import { logger } from '../utils/logger.js';

let activeAdapter = null;
let sheetsAdapterForSync = null;

/**
 * Create and initialize the storage adapter based on config.
 * @param {Object} config - Full app config (from getConfig())
 * @returns {Promise<Object>} Initialized storage adapter
 */
export async function createStorageAdapter(config) {
  const storageConfig = config.storage || {};
  const mode = storageConfig.mode || 'sqlite';

  logger.info(`Storage mode: ${mode}`);

  switch (mode) {
    case 'sqlite': {
      const adapter = createSqliteAdapter({
        path: storageConfig.sqlite?.path || config.db?.path || './data/inventory.db',
      });
      await adapter.initialize();
      validateAdapter(adapter);
      activeAdapter = adapter;
      return adapter;
    }

    case 'sheets': {
      const adapter = createSheetsAdapter({
        credentials_file: storageConfig.sheets?.credentials_file,
        spreadsheet_id: storageConfig.sheets?.spreadsheet_id,
        spreadsheet_name: storageConfig.sheets?.spreadsheet_name
          ?.replace('{business_name}', config.business?.name || 'Inventory'),
      });
      await adapter.initialize();
      validateAdapter(adapter);
      activeAdapter = adapter;
      return adapter;
    }

    case 'both': {
      // SQLite is primary
      const sqliteAdapter = createSqliteAdapter({
        path: storageConfig.sqlite?.path || config.db?.path || './data/inventory.db',
      });
      await sqliteAdapter.initialize();
      validateAdapter(sqliteAdapter);

      // Sheets for background sync
      try {
        sheetsAdapterForSync = createSheetsAdapter({
          credentials_file: storageConfig.sheets?.credentials_file,
          spreadsheet_id: storageConfig.sheets?.spreadsheet_id,
          spreadsheet_name: storageConfig.sheets?.spreadsheet_name
            ?.replace('{business_name}', config.business?.name || 'Inventory'),
        });
        await sheetsAdapterForSync.initialize();
        startSync(sqliteAdapter, sheetsAdapterForSync);
        logger.info('Hybrid mode: SQLite (primary) + Sheets (background sync)');
      } catch (err) {
        logger.error(`Failed to initialize Sheets for sync: ${err.message}`);
        logger.warn('Falling back to SQLite-only mode');
      }

      activeAdapter = sqliteAdapter;
      return sqliteAdapter;
    }

    default:
      throw new Error(`Unknown storage mode: ${mode}. Use "sqlite", "sheets", or "both".`);
  }
}

/**
 * Get the currently active storage adapter.
 * @returns {Object}
 */
export function getStorage() {
  if (!activeAdapter) {
    throw new Error('Storage not initialized. Call createStorageAdapter() first.');
  }
  return activeAdapter;
}

/**
 * Close all storage adapters and stop sync.
 */
export async function closeStorage() {
  stopSync();
  if (activeAdapter) {
    await activeAdapter.close();
    activeAdapter = null;
  }
  if (sheetsAdapterForSync) {
    await sheetsAdapterForSync.close();
    sheetsAdapterForSync = null;
  }
  logger.info('Storage closed.');
}

export default { createStorageAdapter, getStorage, closeStorage };
