/**
 * Telegram Channel — Placeholder
 * 
 * Telegram support is planned for a future release.
 * The bot framework (Telegraf) is already a dependency.
 * 
 * To implement:
 * 1. Create bot via @BotFather on Telegram
 * 2. Set TELEGRAM_BOT_TOKEN in .env
 * 3. Implement message handling similar to WhatsApp channel
 */

import { logger } from '../utils/logger.js';

/**
 * Start the Telegram bot (placeholder).
 */
export async function startTelegram() {
  logger.info('Telegram channel is not yet implemented. Skipping.');
  logger.info('To use Telegram, implement src/channels/telegram.js');
}

/**
 * Get bot status.
 */
export function getTelegramStatus() {
  return 'not_implemented';
}

export default { startTelegram, getTelegramStatus };
