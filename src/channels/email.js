/**
 * Email Channel — Outbound Notifications via Brevo SMTP
 * 
 * Used for: daily summary reports, low stock alerts, weekly reports.
 * NOT conversational — outbound notifications only.
 * 
 * Uses nodemailer with Brevo (formerly Sendinblue) SMTP relay.
 * Free tier: 300 emails/day — plenty for daily/weekly reports.
 */

import nodemailer from 'nodemailer';
import { registerChannel } from '../alerts/notifier.js';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let transporter = null;
let emailConfig = null;

/**
 * Initialize the email transporter with Brevo SMTP credentials.
 * @param {Object} config - Email configuration from business.yaml
 */
export async function startEmail(config = null) {
  const appConfig = getConfig();
  emailConfig = config || appConfig.channels?.email || {};

  if (!emailConfig.enabled) {
    logger.info('Email channel is disabled');
    return;
  }

  // Validate required fields
  const required = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'from_email', 'owner_email'];
  const missing = required.filter(k => !emailConfig[k]);
  if (missing.length > 0) {
    logger.error(`Email channel missing config: ${missing.join(', ')}`);
    logger.info('Configure email in business.yaml under channels.email');
    return;
  }

  // Create nodemailer transporter
  transporter = nodemailer.createTransport({
    host: emailConfig.smtp_host,
    port: parseInt(emailConfig.smtp_port, 10) || 587,
    secure: emailConfig.smtp_port === 465, // true for 465, false for other ports
    auth: {
      user: emailConfig.smtp_user,
      pass: emailConfig.smtp_pass,
    },
    // Connection pool for efficiency
    pool: true,
    maxConnections: 2,
    maxMessages: 50,
  });

  // Verify connection
  try {
    await transporter.verify();
    logger.info(`✅ Email channel connected via ${emailConfig.smtp_host}:${emailConfig.smtp_port}`);
  } catch (err) {
    logger.error(`Email connection failed: ${err.message}`);
    logger.info('Check your SMTP credentials in business.yaml');
    transporter = null;
    return;
  }

  // Register with the alert notifier
  registerChannel('email', async (message) => {
    await sendNotification(message);
  });

  return transporter;
}

/**
 * Send a notification email to the business owner.
 * Converts the text message to a simple HTML email.
 * @param {string} message - Alert/report text (may contain markdown-style formatting)
 * @param {string} subject - Optional email subject (auto-detected if not provided)
 */
export async function sendNotification(message, subject = null) {
  if (!transporter || !emailConfig) {
    logger.warn('Email not configured — skipping notification');
    return;
  }

  // Auto-detect subject from message content
  if (!subject) {
    if (message.includes('LOW STOCK ALERT')) {
      subject = '⚠️ Low Stock Alert';
    } else if (message.includes('Daily Summary')) {
      subject = '📊 Daily Summary Report';
    } else if (message.includes('Weekly Report')) {
      subject = '📊 Weekly Report';
    } else {
      subject = '📦 Inventory Manager Notification';
    }
  }

  const businessName = getConfig().business?.name || 'Inventory Manager';

  // Convert plain text + emoji to simple HTML
  const htmlBody = textToHtml(message, businessName);

  const mailOptions = {
    from: `"${emailConfig.from_name || businessName}" <${emailConfig.from_email}>`,
    to: emailConfig.owner_email,
    subject: `${subject} — ${businessName}`,
    text: message, // Plain text fallback
    html: htmlBody,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId} → ${emailConfig.owner_email}`);
    return info;
  } catch (err) {
    logger.error(`Failed to send email: ${err.message}`);
    throw err;
  }
}

/**
 * Send a custom email (for weekly reports, etc.).
 * @param {Object} options - { to, subject, text, html }
 */
export async function sendCustomEmail(options) {
  if (!transporter || !emailConfig) {
    logger.warn('Email not configured — skipping');
    return;
  }

  const mailOptions = {
    from: `"${emailConfig.from_name || 'Inventory Manager'}" <${emailConfig.from_email}>`,
    ...options,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId} → ${options.to}`);
    return info;
  } catch (err) {
    logger.error(`Failed to send email: ${err.message}`);
    throw err;
  }
}

/**
 * Convert plain text with emojis and *bold* markers to simple HTML.
 */
function textToHtml(text, businessName) {
  // Escape HTML entities
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert *bold* to <strong>
  html = html.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

  // Convert newlines to <br>
  html = html.replace(/\n/g, '<br>\n');

  // Wrap in a nice email template
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a73e8; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0; }
    .header h2 { margin: 0; font-size: 1.2rem; }
    .body { background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px; line-height: 1.6; }
    .footer { text-align: center; margin-top: 16px; font-size: 0.8rem; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h2>📦 ${businessName}</h2>
  </div>
  <div class="body">
    ${html}
  </div>
  <div class="footer">
    Sent by Inventory Manager Agent
  </div>
</body>
</html>`;
}

/**
 * Check if email is configured and connected.
 */
export function getEmailStatus() {
  if (!emailConfig?.enabled) return 'disabled';
  if (!transporter) return 'not_connected';
  return 'connected';
}

/**
 * Close the email transporter.
 */
export async function stopEmail() {
  if (transporter) {
    transporter.close();
    transporter = null;
    logger.info('Email transporter closed');
  }
}

export default { startEmail, stopEmail, sendNotification, sendCustomEmail, getEmailStatus };
