/**
 * Configuration Loader
 * Loads business config from YAML and environment variables from .env
 */

import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import dotenv from 'dotenv';
import { logger } from './logger.js';

// Load .env file
dotenv.config();

let businessConfig = null;

/**
 * Load the business YAML configuration file.
 * Falls back to example config if main config doesn't exist.
 * @returns {object} Parsed business configuration
 */
export function loadBusinessConfig() {
  const configPaths = [
    path.resolve('config/business.yaml'),
    path.resolve('config/business.yml'),
    path.resolve('config/business.yaml.example'),
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        businessConfig = parseYaml(raw);
        logger.info(`Loaded business config from ${configPath}`);
        return businessConfig;
      } catch (err) {
        logger.error(`Failed to parse config at ${configPath}: ${err.message}`);
      }
    }
  }

  logger.warn('No business config found. Using defaults.');
  businessConfig = getDefaultConfig();
  return businessConfig;
}

/**
 * Get the currently loaded business config.
 * @returns {object}
 */
export function getBusinessConfig() {
  if (!businessConfig) {
    return loadBusinessConfig();
  }
  return businessConfig;
}

/**
 * Get an environment variable with an optional default.
 * @param {string} key
 * @param {string} defaultValue
 * @returns {string}
 */
export function env(key, defaultValue = '') {
  return process.env[key] || defaultValue;
}

/**
 * Check if an environment variable is truthy (true, 1, yes).
 * @param {string} key
 * @returns {boolean}
 */
export function envBool(key) {
  const val = (process.env[key] || '').toLowerCase();
  return ['true', '1', 'yes'].includes(val);
}

/**
 * Get the full application config (env + business YAML merged).
 * @returns {object}
 */
export function getConfig() {
  const biz = getBusinessConfig();
  return {
    llm: {
      provider: env('LLM_PROVIDER', 'openai'),
      apiKey: env('LLM_API_KEY'),
      model: env('LLM_MODEL', 'gpt-4o-mini'),
      ollamaBaseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    },
    telegram: {
      enabled: envBool('TELEGRAM_ENABLED'),
      token: env('TELEGRAM_BOT_TOKEN'),
    },
    whatsapp: {
      enabled: envBool('WHATSAPP_ENABLED'),
      respond_to: biz.channels?.whatsapp?.respond_to || 'all', // "all" or "authorized"
    },
    web: {
      enabled: envBool('WEB_ENABLED'),
      port: parseInt(env('WEB_PORT', '3000'), 10),
    },
    db: {
      path: env('DB_PATH', './data/inventory.db'),
    },
    storage: {
      mode: biz.storage?.mode || 'sqlite',
      sqlite: {
        path: biz.storage?.sqlite?.path || env('DB_PATH', './data/inventory.db'),
      },
      sheets: {
        credentials_file: biz.storage?.sheets?.credentials_file || env('GOOGLE_SHEETS_CREDENTIALS_FILE', './config/google-credentials.json'),
        spreadsheet_id: biz.storage?.sheets?.spreadsheet_id || env('GOOGLE_SHEETS_SPREADSHEET_ID', ''),
        spreadsheet_name: biz.storage?.sheets?.spreadsheet_name || '{business_name} - Inventory',
      },
    },
    channels: {
      email: biz.channels?.email || {
        enabled: false,
        smtp_host: env('EMAIL_SMTP_HOST', 'smtp-relay.brevo.com'),
        smtp_port: parseInt(env('EMAIL_SMTP_PORT', '587'), 10),
        smtp_user: env('EMAIL_SMTP_USER', ''),
        smtp_pass: env('EMAIL_SMTP_PASS', ''),
        from_name: env('EMAIL_FROM_NAME', 'Inventory Manager'),
        from_email: env('EMAIL_FROM_EMAIL', ''),
        owner_email: env('EMAIL_OWNER_EMAIL', ''),
      },
      whatsapp: biz.channels?.whatsapp || {},
    },
    logLevel: env('LOG_LEVEL', 'info'),
    business: biz.business || {},
    categories: biz.categories || [],
    alerts: biz.alerts || {},
    reports: biz.reports || {},
    authorizedUsers: biz.authorized_users || [],
  };
}

/**
 * Default configuration when no YAML file is found.
 */
function getDefaultConfig() {
  return {
    business: {
      name: 'My Store',
      type: 'retail',
      currency: 'UGX',
    },
    categories: [],
    alerts: {
      low_stock: { enabled: true, check_interval: '6h', notify_via: [] },
      daily_summary: { enabled: false, time: '20:00' },
    },
    reports: { weekly: false, monthly: false, include: [] },
    authorized_users: [],
  };
}

export default { loadBusinessConfig, getBusinessConfig, getConfig, env, envBool };
