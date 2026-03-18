/**
 * WhatsApp Channel (Baileys)
 * Connects to WhatsApp via QR code, listens for messages,
 * passes them to the core agent, and replies.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { processMessage } from '../agent/core.js';
import { registerChannel } from '../alerts/notifier.js';
import { logger } from '../utils/logger.js';

let sock = null;
const AUTH_DIR = path.resolve('data/whatsapp-auth');
const adminJid = null; // Set to owner's JID for alert delivery

/**
 * Start the WhatsApp connection.
 */
export async function startWhatsApp() {
  // Ensure auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket.default({
    auth: state,
    printQRInTerminal: true,
    logger: {
      level: 'silent',
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: (...args) => logger.warn('Baileys:', ...args),
      error: (...args) => logger.error('Baileys:', ...args),
      fatal: (...args) => logger.error('Baileys FATAL:', ...args),
      child: () => ({ trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }),
    },
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection events
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('WhatsApp: Scan QR code to connect');
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`WhatsApp connection closed. Status: ${statusCode}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        setTimeout(() => startWhatsApp(), 5000);
      } else {
        logger.error('WhatsApp logged out. Delete data/whatsapp-auth and restart to re-authenticate.');
      }
    }

    if (connection === 'open') {
      logger.info('✅ WhatsApp connected successfully');

      // Register for alert notifications
      registerChannel('whatsapp', async (message) => {
        if (adminJid) {
          await sock.sendMessage(adminJid, { text: message });
        }
      });
    }
  });

  // Handle incoming messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip our own messages and status broadcasts
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      const text = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        '';

      if (!text.trim()) continue;

      const sender = msg.key.remoteJid;
      logger.info(`WhatsApp message from ${sender}: ${text}`);

      try {
        const response = await processMessage(text, {
          channel: 'whatsapp',
          sender,
          name: msg.pushName || 'Unknown',
        });

        await sock.sendMessage(sender, { text: response });
      } catch (err) {
        logger.error(`WhatsApp handler error: ${err.message}`);
        await sock.sendMessage(sender, {
          text: '❌ Sorry, I encountered an error. Please try again.',
        });
      }
    }
  });

  return sock;
}

/**
 * Send a WhatsApp message to a specific JID.
 * @param {string} jid
 * @param {string} text
 */
export async function sendWhatsAppMessage(jid, text) {
  if (!sock) throw new Error('WhatsApp not connected');
  await sock.sendMessage(jid, { text });
}

/**
 * Get connection status.
 */
export function getWhatsAppStatus() {
  return sock ? 'connected' : 'disconnected';
}

export default { startWhatsApp, sendWhatsAppMessage, getWhatsAppStatus };
