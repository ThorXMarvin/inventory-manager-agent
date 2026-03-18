/**
 * Alert Notifier
 * Sends alert messages through active channels (WhatsApp, Telegram, Web).
 */

import { logger } from '../utils/logger.js';

// Channel send functions are registered here at runtime
const channels = new Map();

/**
 * Register a channel's send function.
 * @param {string} name - Channel name (whatsapp, telegram, web)
 * @param {Function} sendFn - async function(message) to send via that channel
 */
export function registerChannel(name, sendFn) {
  channels.set(name, sendFn);
  logger.info(`Notifier: registered channel "${name}"`);
}

/**
 * Unregister a channel.
 * @param {string} name
 */
export function unregisterChannel(name) {
  channels.delete(name);
}

/**
 * Send an alert message to all registered channels.
 * @param {string} message - Alert message text
 * @param {Array<string>} viaChannels - Optional: specific channels to use
 */
export async function sendAlert(message, viaChannels = null) {
  const targets = viaChannels
    ? viaChannels.filter(ch => channels.has(ch))
    : Array.from(channels.keys());

  if (targets.length === 0) {
    logger.warn('No channels registered for alert delivery');
    return;
  }

  for (const channelName of targets) {
    try {
      const sendFn = channels.get(channelName);
      await sendFn(message);
      logger.info(`Alert sent via ${channelName}`);
    } catch (err) {
      logger.error(`Failed to send alert via ${channelName}: ${err.message}`);
    }
  }
}

/**
 * Get list of registered channels.
 * @returns {string[]}
 */
export function getRegisteredChannels() {
  return Array.from(channels.keys());
}

export default { registerChannel, unregisterChannel, sendAlert, getRegisteredChannels };
