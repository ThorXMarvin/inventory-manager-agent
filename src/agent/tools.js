/**
 * Agent Tool Definitions
 * Tools for staff-facing inventory management via WhatsApp.
 * Compatible with OpenAI, Anthropic, and Google function calling formats.
 * 
 * Role access:
 * - staff: record sales, add stock, check stock, search products, add products, 
 *          get sales today, get low stock, get customer history, get sales range
 * - owner: everything staff can do PLUS profit reports, price changes, stock adjustments,
 *          weekly reports, staff activity, reorder suggestions, staff performance, trend comparison
 */

export const TOOLS = [
  // ─── Stock Tools ────────────────────────────────
  {
    name: 'add_stock',
    description: 'Add/receive stock for a product. Use when staff says they received, added, or restocked items.',
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
    description: 'Check current stock level for a specific product.',
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
    description: 'Manually adjust stock to a specific quantity (for corrections/audits). OWNER ONLY.',
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
    description: 'Get all products below their minimum stock level.',
    parameters: { type: 'object', properties: {} },
  },

  // ─── Sales Tools ────────────────────────────────
  {
    name: 'record_sale',
    description: 'Record a sale of a product. Use when staff says they sold something to a customer.',
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
    parameters: { type: 'object', properties: {} },
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
    description: 'Update an existing product (price, category, min stock). OWNER ONLY.',
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
    description: 'Search for a product by name or SKU. Returns details including price and stock.',
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
    description: "Get today's daily summary: sales, revenue, profit, top sellers, low stock. OWNER ONLY for profit data.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'weekly_report',
    description: "Get this week's report with sales trends, top products, and stock status. OWNER ONLY.",
    parameters: { type: 'object', properties: {} },
  },

  // ─── Staff & Insight Tools ─────────────────────
  {
    name: 'get_staff_activity',
    description: "Get all transactions logged by a specific staff member. Use when owner asks 'What did John do today?'. OWNER ONLY.",
    parameters: {
      type: 'object',
      properties: {
        staff_name: { type: 'string', description: 'Name of the staff member' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (optional, defaults to today)' },
      },
      required: ['staff_name'],
    },
  },
  {
    name: 'get_reorder_suggestions',
    description: "Get smart reorder suggestions based on sales velocity. Shows which products to reorder and how urgently. Use when asked 'What should I reorder?' OWNER ONLY.",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_staff_performance',
    description: "Compare staff performance this week: who sold the most, total transactions, revenue per person. OWNER ONLY.",
    parameters: { type: 'object', properties: {} },
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
