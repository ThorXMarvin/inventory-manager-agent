/**
 * Telegram Channel (Telegraf)
 * Runs a Telegram bot that listens for messages,
 * passes them to the core agent, and replies.
 */

import { Telegraf } from 'telegraf';
import { processMessage } from '../agent/core.js';
import { registerChannel } from '../alerts/notifier.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let bot = null;
const adminChatIds = new Set(); // Tracks chat IDs for alert delivery

/**
 * Start the Telegram bot.
 */
export async function startTelegram() {
  const config = getConfig();
  const token = config.telegram.token;

  if (!token) {
    logger.error('Telegram bot token not configured. Set TELEGRAM_BOT_TOKEN in .env');
    return;
  }

  bot = new Telegraf(token);

  // /start command
  bot.start((ctx) => {
    const name = ctx.from.first_name || 'there';
    adminChatIds.add(ctx.chat.id);
    ctx.reply(
      `👋 Hello ${name}! I'm your inventory manager.\n\n` +
      `Send me messages like:\n` +
      `• "Sold 5 bags cement to Kato"\n` +
      `• "Received 100 iron sheets"\n` +
      `• "Stock report"\n` +
      `• "Help"\n\n` +
      `I understand natural language — just type!`
    );
  });

  // /help command
  bot.help(async (ctx) => {
    const response = await processMessage('help', {
      channel: 'telegram',
      sender: ctx.from.id,
      name: ctx.from.first_name,
    });
    ctx.reply(response, { parse_mode: 'Markdown' });
  });

  // /report command shortcuts
  bot.command('stock', async (ctx) => {
    const response = await processMessage('stock report', {
      channel: 'telegram',
      sender: ctx.from.id,
    });
    ctx.reply(response, { parse_mode: 'Markdown' });
  });

  bot.command('summary', async (ctx) => {
    const response = await processMessage('daily summary', {
      channel: 'telegram',
      sender: ctx.from.id,
    });
    ctx.reply(response, { parse_mode: 'Markdown' });
  });

  // Handle all text messages
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const sender = ctx.from.id;
    const name = ctx.from.first_name || 'Unknown';

    // Track chat for alerts
    adminChatIds.add(ctx.chat.id);

    logger.info(`Telegram message from ${name} (${sender}): ${text}`);

    try {
      const response = await processMessage(text, {
        channel: 'telegram',
        sender,
        name,
      });

      // Try Markdown first, fall back to plain text
      try {
        await ctx.reply(response, { parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(response);
      }
    } catch (err) {
      logger.error(`Telegram handler error: ${err.message}`);
      ctx.reply('❌ Sorry, I encountered an error. Please try again.');
    }
  });

  // Register for alert notifications
  registerChannel('telegram', async (message) => {
    for (const chatId of adminChatIds) {
      try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      } catch (err) {
        logger.error(`Failed to send Telegram alert to ${chatId}: ${err.message}`);
      }
    }
  });

  // Start polling
  bot.launch();
  logger.info('✅ Telegram bot started');

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

/**
 * Get bot status.
 */
export function getTelegramStatus() {
  return bot ? 'running' : 'stopped';
}

export default { startTelegram, getTelegramStatus };
