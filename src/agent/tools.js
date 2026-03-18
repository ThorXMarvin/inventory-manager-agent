/**
 * Agent Tool Definitions
 * 13 tools defined as JSON schemas for LLM function calling.
 * Compatible with OpenAI, Anthropic, and Google function calling formats.
 */

export const TOOLS = [
  // ─── Stock Tools ────────────────────────────────
  {
    name: 'add_stock',
    description: 'Add/receive stock for a product. Use when the user says they received, added, or restocked items.',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or SKU to add stock for' },
        quantity: { type: 'number', description: 'Number of units to add' },
        buy_price: { type: 'number', description: 'Buy price per unit (optional, uses default if 0)' },
      },
      required: ['product', 'quantity'],
    },
  },
  {
    name: 'check_stock',
    description: 'Check current stock level for a specific product. Use when the user asks how much of something they have.',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or SKU to check' },
      },
      required: ['product'],
    },
  },
  {
    name: 'adjust_stock',
    description: 'Manually adjust stock to a specific quantity (for corrections/audits).',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or SKU' },
        new_quantity: { type: 'number', description: 'New stock quantity to set' },
      },
      required: ['product', 'new_quantity'],
    },
  },
  {
    name: 'get_low_stock',
    description: 'Get all products that are below their minimum stock level.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },

  // ─── Sales Tools ────────────────────────────────
  {
    name: 'record_sale',
    description: 'Record a sale of a product. Use when the user says they sold something to someone.',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or SKU sold' },
        quantity: { type: 'number', description: 'Number of units sold' },
        customer: { type: 'string', description: 'Customer name (optional)' },
        sell_price: { type: 'number', description: 'Sell price per unit (optional, uses default if 0)' },
      },
      required: ['product', 'quantity'],
    },
  },
  {
    name: 'get_sales_today',
    description: "Get today's sales summary including total revenue and transactions.",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_sales_range',
    description: 'Get sales data for a specific date range.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format' },
        end_date: { type: 'string', description: 'End date in YYYY-MM-DD format' },
      },
      required: ['start_date', 'end_date'],
    },
  },

  // ─── Product Tools ──────────────────────────────
  {
    name: 'add_product',
    description: 'Add a new product to the inventory catalog.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product name' },
        sku: { type: 'string', description: 'Product SKU code (optional)' },
        category: { type: 'string', description: 'Product category' },
        unit: { type: 'string', description: 'Unit of measure (piece, bag, kg, tin, etc.)' },
        buy_price: { type: 'number', description: 'Cost/buy price per unit' },
        sell_price: { type: 'number', description: 'Selling price per unit' },
        min_stock: { type: 'number', description: 'Minimum stock level for alerts' },
        current_stock: { type: 'number', description: 'Initial stock quantity' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_product',
    description: 'Update an existing product (price, category, min stock, etc.).',
    parameters: {
      type: 'object',
      properties: {
        product: { type: 'string', description: 'Product name or SKU to update' },
        name: { type: 'string', description: 'New product name (optional)' },
        buy_price: { type: 'number', description: 'New buy price (optional)' },
        sell_price: { type: 'number', description: 'New sell price (optional)' },
        min_stock: { type: 'number', description: 'New minimum stock level (optional)' },
        category: { type: 'string', description: 'New category (optional)' },
      },
      required: ['product'],
    },
  },
  {
    name: 'search_product',
    description: 'Search for a product by name or SKU. Returns product details including price and stock.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (product name or SKU)' },
      },
      required: ['query'],
    },
  },

  // ─── Customer Tools ─────────────────────────────
  {
    name: 'get_customer_history',
    description: "Get a customer's purchase history.",
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'Customer name to look up' },
      },
      required: ['customer_name'],
    },
  },

  // ─── Report Tools ──────────────────────────────
  {
    name: 'daily_summary',
    description: "Get today's daily summary including sales, revenue, profit, top sellers, and low stock items.",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'weekly_report',
    description: "Get this week's report with sales trends, top products, and stock status.",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Convert tools to OpenAI function calling format.
 */
export function toOpenAITools() {
  return TOOLS.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Convert tools to Anthropic tool format.
 */
export function toAnthropicTools() {
  return TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

/**
 * Convert tools to Google Gemini function calling format.
 */
export function toGoogleTools() {
  return [{
    function_declarations: TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }];
}

export default { TOOLS, toOpenAITools, toAnthropicTools, toGoogleTools };
