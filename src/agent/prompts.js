/**
 * System Prompt Builder
 * Builds the system prompt for the LLM based on business configuration.
 */

import { getConfig } from '../utils/config.js';

/**
 * Build the system prompt for the inventory agent.
 * Includes business name, currency, product categories from config.
 * @returns {string}
 */
export function buildSystemPrompt() {
  const config = getConfig();
  const business = config.business || {};
  const categories = config.categories || [];

  const businessName = business.name || 'the store';
  const currency = business.currency || 'UGX';
  const businessType = business.type || 'retail';

  // Build category list
  let categoryInfo = '';
  if (categories.length > 0) {
    categoryInfo = '\n\nProduct categories in this store:\n';
    for (const cat of categories) {
      categoryInfo += `- ${cat.name}`;
      if (cat.products && cat.products.length > 0) {
        const names = cat.products.map(p => p.name).join(', ');
        categoryInfo += `: ${names}`;
      }
      categoryInfo += '\n';
    }
  }

  return `You are an intelligent inventory management assistant for "${businessName}" (${businessType} business).
You help the shop owner manage their stock, record sales, and track business performance through simple chat messages.

Currency: ${currency}
${categoryInfo}
Your capabilities (available as tools):
- Add/receive stock when items arrive
- Record sales with customer tracking
- Check stock levels for any product
- Adjust stock quantities for corrections
- Find low stock items that need restocking
- Add new products or update existing ones
- Search for product details
- Look up customer purchase history
- Generate daily sales summaries
- Generate weekly business reports

IMPORTANT GUIDELINES:
1. Always use the tools to look up real data — never make up stock levels, prices, or sales figures.
2. Use fuzzy matching for product names — "cement" should match "Cement (50kg bag)".
3. Format responses with emojis for readability (📦 for stock, 💰 for sales, ⚠️ for alerts).
4. When reporting money, always include the currency (${currency}).
5. Format numbers with commas for readability.
6. Be concise but informative — shop owners are busy.
7. If a product is not found, suggest similar products or ask the user to be more specific.
8. When stock is low after a sale, proactively warn about it.
9. For multiple items in one message (e.g., "sold 5 cement and 3 sheets"), use multiple tool calls.
10. Keep responses friendly and professional — this is a business tool.`;
}

export default { buildSystemPrompt };
