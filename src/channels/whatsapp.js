/**
 * WhatsApp Channel (Baileys) — Staff Management Tool
 * 
 * The business owner links their WhatsApp number by scanning a QR code.
 * Staff and owner message this number to manage inventory via AI.
 * This is an INTERNAL management tool, not a customer-facing chatbot.
 * 
 * Features:
 * - QR code in terminal AND on web dashboard (via shared state)
 * - Session persistence (auth state saved to disk, auto-reconnect)
 * - Staff authorization with role-based access (owner vs staff)
 * - Every transaction logged with the staff member's name
 * - Owner JID auto-detected for alert delivery
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import { processMessage } from '../agent/core.js';
import { registerChannel } from '../alerts/notifier.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let sock = null;
let ownerJid = null;       // Auto-detected: the connected account's JID
let currentQR = null;       // Latest QR string for web dashboard display
let connectionStatus = 'disconnected'; // disconnected | qr_pending | connected

const AUTH_DIR = path.resolve('data/whatsapp-auth');

// ─── Exported State (for web dashboard) ─────────────────

/** Get the current QR code string (null if already connected). */
export function getWhatsAppQR() { return currentQR; }

/** Get current connection status. */
export function getWhatsAppStatus() { return connectionStatus; }

/** Get the connected owner JID. */
export function getOwnerJid() { return ownerJid; }

// ─── Staff Authorization ────────────────────────────────

/**
 * Get staff info for a sender based on authorized_numbers config.
 * @param {string} senderJid - WhatsApp JID (e.g., "256700000001@s.whatsapp.net")
 * @returns {{ name: string, phone: string, role: string } | null}
 */
export function getStaffInfo(senderJid) {
  const config = getConfig();
  const authorizedNumbers = config.channels?.whatsapp?.authorized_numbers || [];

  if (authorizedNumbers.length === 0) return null;

  const phone = senderJid.split('@')[0];

  for (const entry of authorizedNumbers) {
    const cleaned = (entry.phone || '').replace(/[^0-9]/g, '');
    if (phone === cleaned || phone.endsWith(cleaned) || cleaned.endsWith(phone)) {
      return {
        name: entry.name || 'Unknown',
        phone: entry.phone || '',
        role: entry.role || 'staff',
      };
    }
  }

  return null;
}

/**
 * Check if a sender is allowed to interact with the bot.
 * Uses role-based authorized_numbers if configured, falls back to flat list.
 */
function isSenderAllowed(senderJid) {
  const config = getConfig();

  // New role-based config
  const authorizedNumbers = config.channels?.whatsapp?.authorized_numbers || [];
  if (authorizedNumbers.length > 0) {
    const allowUnknown = config.channels?.whatsapp?.allow_unknown ?? false;
    const staffInfo = getStaffInfo(senderJid);
    if (staffInfo) return true;
    return allowUnknown;
  }

  // Legacy flat list fallback
  const allowList = config.authorizedUsers || [];

  // Empty list = allow everyone
  if (allowList.length === 0) return true;

  const phone = senderJid.split('@')[0];

  return allowList.some(allowed => {
    const cleaned = allowed.replace(/[^0-9]/g, '');
    return phone === cleaned || phone.endsWith(cleaned) || cleaned.endsWith(phone);
  });
}

// ─── Main Connection ────────────────────────────────────

/**
 * Start the WhatsApp connection with Baileys.
 * Shows QR in terminal, saves auth state, auto-reconnects.
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
    // Suppress noisy Baileys logs — only show warnings and errors
    logger: {
      level: 'silent',
      trace: () => {}, debug: () => {}, info: () => {},
      warn: (...args) => logger.warn('Baileys:', ...args),
      error: (...args) => logger.error('Baileys:', ...args),
      fatal: (...args) => logger.error('Baileys FATAL:', ...args),
      child: () => ({
        trace: () => {}, debug: () => {}, info: () => {},
        warn: () => {}, error: () => {}, fatal: () => {},
      }),
    },
  });

  // Save credentials whenever they update
  sock.ev.on('creds.update', saveCreds);

  // ─── Connection Events ──────────────────────────────

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR code available — share it for terminal and web dashboard
    if (qr) {
      currentQR = qr;
      connectionStatus = 'qr_pending';
      logger.info('📱 WhatsApp: Scan the QR code with your phone to connect');
      logger.info('   Open WhatsApp → Settings → Linked Devices → Link a Device');
      logger.info('   QR also available on the web dashboard at /api/whatsapp/qr');
    }

    // Connection closed — decide whether to reconnect
    if (connection === 'close') {
      currentQR = null;
      connectionStatus = 'disconnected';

      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      logger.warn(`WhatsApp disconnected. Code: ${statusCode}. Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        // Exponential backoff: wait 3-15 seconds
        const delay = Math.min(3000 + Math.random() * 5000, 15000);
        setTimeout(() => startWhatsApp(), delay);
      } else {
        logger.error('WhatsApp logged out. Delete data/whatsapp-auth/ and restart to re-scan QR.');
      }
    }

    // Connected successfully
    if (connection === 'open') {
      currentQR = null;
      connectionStatus = 'connected';

      // Auto-detect owner JID (the account that scanned the QR)
      ownerJid = sock.user?.id;
      if (ownerJid) {
        // Normalize: "256700000001:42@s.whatsapp.net" → "256700000001@s.whatsapp.net"
        ownerJid = ownerJid.replace(/:.*@/, '@');
        logger.info(`✅ WhatsApp connected as ${ownerJid}`);
      } else {
        logger.info('✅ WhatsApp connected');
      }

      // Register for alert delivery → sends alerts to the owner's own chat
      registerChannel('whatsapp', async (message) => {
        if (ownerJid && sock) {
          try {
            await sock.sendMessage(ownerJid, { text: message });
          } catch (err) {
            logger.error(`Failed to send WhatsApp alert: ${err.message}`);
          }
        }
      });
    }
  });

  // ─── Message Handling ─────────────────────────────────

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Skip our own outgoing messages
      if (msg.key.fromMe) continue;
      // Skip status broadcasts
      if (msg.key.remoteJid === 'status@broadcast') continue;
      // Skip group messages (optional: could enable later)
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;

      // Extract text from various message types
      const text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        '';

      if (!text.trim()) continue;

      const sender = msg.key.remoteJid;
      const senderName = msg.pushName || 'Unknown';

      // Check authorization
      if (!isSenderAllowed(sender)) {
        logger.info(`WhatsApp: Blocked unauthorized sender ${sender}`);
        const config = getConfig();
        const unauthorizedMsg = config.channels?.whatsapp?.unauthorized_message
          || 'Sorry, you are not authorized to use this system.';
        try {
          await sock.sendMessage(sender, { text: unauthorizedMsg });
        } catch (_) { /* ignore send errors for unauthorized */ }
        continue;
      }

      logger.info(`WhatsApp [${senderName}] (${sender}): ${text}`);

      try {
        // Get staff info for role-based access
        const staffInfo = getStaffInfo(sender);

        // Process the message through the agent
        const response = await processMessage(text, {
          channel: 'whatsapp',
          sender,
          name: senderName,
          staff: staffInfo || { name: senderName, phone: sender, role: 'owner' },
        });

        // Send reply
        await sock.sendMessage(sender, { text: response });
      } catch (err) {
        logger.error(`WhatsApp handler error: ${err.message}`);
        await sock.sendMessage(sender, {
          text: '❌ Sorry, I encountered an error processing your message. Please try again.',
        });
      }
    }
  });

  return sock;
}

/**
 * Send a WhatsApp message to a specific number.
 * @param {string} jid - WhatsApp JID (e.g., "256700000001@s.whatsapp.net")
 * @param {string} text - Message text
 */
export async function sendWhatsAppMessage(jid, text) {
  if (!sock) throw new Error('WhatsApp not connected');
  await sock.sendMessage(jid, { text });
}

/**
 * Stop the WhatsApp connection gracefully.
 */
export async function stopWhatsApp() {
  if (sock) {
    sock.end(undefined);
    sock = null;
    currentQR = null;
    connectionStatus = 'disconnected';
    logger.info('WhatsApp connection closed');
  }
}

export default { startWhatsApp, stopWhatsApp, sendWhatsAppMessage, getWhatsAppStatus, getWhatsAppQR, getOwnerJid };
