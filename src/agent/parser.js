/**
 * Natural Language Parser
 * Sends user messages to an LLM and gets back structured intents.
 * Supports: OpenAI, Anthropic, Google (via OpenAI compat), Ollama
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

let llmClient = null;

/**
 * Initialize the LLM client based on config.
 */
function initClient() {
  const { llm } = getConfig();

  switch (llm.provider) {
    case 'openai':
      llmClient = { type: 'openai', client: new OpenAI({ apiKey: llm.apiKey }) };
      break;

    case 'anthropic':
      llmClient = { type: 'anthropic', client: new Anthropic({ apiKey: llm.apiKey }) };
      break;

    case 'ollama':
      // Ollama exposes an OpenAI-compatible API
      llmClient = {
        type: 'openai',
        client: new OpenAI({
          apiKey: 'ollama',
          baseURL: `${llm.ollamaBaseUrl}/v1`,
        }),
      };
      break;

    case 'google':
      // Google Gemini via OpenAI-compatible endpoint
      llmClient = {
        type: 'openai',
        client: new OpenAI({
          apiKey: llm.apiKey,
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        }),
      };
      break;

    default:
      logger.warn(`Unknown LLM provider: ${llm.provider}. Falling back to openai.`);
      llmClient = { type: 'openai', client: new OpenAI({ apiKey: llm.apiKey }) };
  }

  logger.info(`LLM parser initialized: ${llm.provider} / ${llm.model}`);
}

/**
 * Build the system prompt for inventory parsing.
 */
function getSystemPrompt() {
  const config = getConfig();
  const currency = config.business.currency || 'UGX';

  return `You are an inventory management assistant for "${config.business.name || 'a store'}".
Your job is to parse the user's natural language message into a structured JSON action.

IMPORTANT: Respond ONLY with valid JSON. No markdown, no explanation, no code blocks.

The supported actions are:
- "add_stock" — user is adding/receiving stock (e.g., "Received 50 bags cement")
- "record_sale" — user is recording a sale (e.g., "Sold 5 bags cement to Kato")
- "check_stock" — user wants to check stock level (e.g., "How much cement do I have?")
- "stock_report" — user wants a full stock report
- "daily_summary" — user wants today's sales/activity summary
- "help" — user wants help or instructions
- "unknown" — you can't determine the intent

Response JSON format:
{
  "action": "add_stock|record_sale|check_stock|stock_report|daily_summary|help|unknown",
  "items": [
    {
      "name": "product name (fuzzy match is OK)",
      "quantity": 5,
      "unit": "bag|piece|kg|tin|etc"
    }
  ],
  "customer": "customer name or null",
  "query": "original query for context"
}

Rules:
- For "check_stock", items array should contain the product(s) to check. If checking all, leave items empty.
- For "add_stock" and "record_sale", always extract quantity and product name.
- Currency is ${currency}.
- Be generous with fuzzy matching: "cement" → "Cement (50kg bag)", "sheets" → "Iron Sheets", etc.
- If the user says "sold" or "sale" or mentions a customer, it's record_sale.
- If the user says "received", "added", "got", "restocked", it's add_stock.
- Numbers like "5 bags" → quantity: 5, unit: "bag"`;
}

/**
 * Parse a user message into a structured intent using the LLM.
 * @param {string} message - The user's raw message
 * @returns {object} Parsed intent: { action, items, customer, query }
 */
export async function parseMessage(message) {
  if (!llmClient) initClient();

  const { llm } = getConfig();
  const systemPrompt = getSystemPrompt();

  try {
    let responseText;

    if (llmClient.type === 'anthropic') {
      const response = await llmClient.client.messages.create({
        model: llm.model,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }],
      });
      responseText = response.content[0].text;
    } else {
      // OpenAI / Ollama / Google (OpenAI-compat)
      const response = await llmClient.client.chat.completions.create({
        model: llm.model,
        max_tokens: 512,
        temperature: 0.1,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
      });
      responseText = response.choices[0].message.content;
    }

    // Clean up response — strip markdown code blocks if present
    responseText = responseText.trim();
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(responseText);
    logger.debug(`Parsed message: "${message}" → ${JSON.stringify(parsed)}`);
    return parsed;
  } catch (err) {
    logger.error(`Failed to parse message: ${err.message}`);
    return {
      action: 'unknown',
      items: [],
      customer: null,
      query: message,
      error: err.message,
    };
  }
}

export default { parseMessage };
