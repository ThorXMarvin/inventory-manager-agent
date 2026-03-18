/**
 * Tool Executor
 * Receives tool calls from the LLM, checks role-based permissions,
 * executes against the storage adapter, and returns results.
 * 
 * Every stock/sale operation logs the staff member who recorded it.
 */

import { getStorage } from '../storage/adapter.js';
import { logger } from '../utils/logger.js';

// Tools restricted to owner role only
const OWNER_ONLY_TOOLS = new Set([
  'adjust_stock',
  'update_product',
  'daily_summary',   // Contains profit data
  'weekly_report',
  'get_staff_activity',
  'get_reorder_suggestions',
  'get_staff_performance',
]);

/**
 * Check if the current user has permission to use a tool.
 * @param {string} toolName
 * @param {Object} meta - { staff: { name, role } }
 * @returns {{ allowed: boolean, message?: string }}
 */
function checkPermission(toolName, meta = {}) {
  const staff = meta?.staff;
  // No staff info or owner role = full access
  if (!staff || staff.role === 'owner') return { allowed: true };

  if (OWNER_ONLY_TOOLS.has(toolName)) {
    return {
      allowed: false,
      message: `🔒 Sorry ${staff.name}, only the owner can access ${toolName.replace(/_/g, ' ')}. Ask the boss for this info!`,
    };
  }

  return { allowed: true };
}

/**
 * Execute a single tool call.
 * @param {string} toolName
 * @param {Object} args - Tool arguments from the LLM
 * @param {Object} meta - { staff: { name, role } }
 * @returns {Promise<Object>}
 */
export async function executeTool(toolName, args = {}, meta = {}) {
  // Check permission first
  const perm = checkPermission(toolName, meta);
  if (!perm.allowed) {
    return { success: false, error: perm.message };
  }

  const storage = getStorage();
  const loggedBy = meta?.staff?.name || 'System';

  logger.info(`Executing tool: ${toolName} by ${loggedBy} | args: ${JSON.stringify(args)}`);

  try {
    switch (toolName) {
      // ─── Stock ────────────────────────────────
      case 'add_stock': {
        const result = await storage.addStock(args.product, args.quantity, args.buy_price || 0, loggedBy);
        return { success: true, ...result };
      }

      case 'check_stock': {
        const product = await storage.getProduct(args.product);
        if (!product) return { success: false, error: `Product "${args.product}" not found` };

        const result = {
          success: true,
          name: product.name,
          sku: product.sku,
          category: product.category,
          current_stock: product.current_stock,
          unit: product.unit,
          min_stock: product.min_stock,
          is_low: product.current_stock < product.min_stock,
          sell_price: product.sell_price,
          stock_value: product.current_stock * product.buy_price,
        };

        // Only include buy_price for owners
        if (meta?.staff?.role === 'owner' || !meta?.staff) {
          result.buy_price = product.buy_price;
        }

        return result;
      }

      case 'adjust_stock': {
        const product = await storage.getProduct(args.product);
        if (!product) return { success: false, error: `Product "${args.product}" not found` };

        const diff = args.new_quantity - product.current_stock;
        await storage.updateProduct(product.sku || product.name, { current_stock: args.new_quantity });
        return {
          success: true, name: product.name,
          previous_stock: product.current_stock, new_stock: args.new_quantity, difference: diff,
        };
      }

      case 'get_low_stock': {
        const items = await storage.getLowStock();
        return {
          success: true, count: items.length,
          items: items.map(i => ({
            name: i.name, sku: i.sku, current_stock: i.current_stock, min_stock: i.min_stock, unit: i.unit,
          })),
        };
      }

      // ─── Sales ────────────────────────────────
      case 'record_sale': {
        const result = await storage.recordSale(
          args.product, args.quantity, args.customer || null, args.sell_price || 0, loggedBy
        );
        return { success: true, ...result };
      }

      case 'get_sales_today': {
        const result = await storage.getSalesToday();
        return { success: true, ...result };
      }

      case 'get_sales_range': {
        const result = await storage.getSalesRange(args.start_date, args.end_date);
        return { success: true, ...result };
      }

      // ─── Products ─────────────────────────────
      case 'add_product': {
        const result = await storage.addProduct({
          name: args.name, sku: args.sku || '', category: args.category || 'General',
          unit: args.unit || 'piece', buy_price: args.buy_price || 0, sell_price: args.sell_price || 0,
          min_stock: args.min_stock || 0, current_stock: args.current_stock || 0,
        });
        return { success: true, ...result };
      }

      case 'update_product': {
        const updateData = {};
        if (args.name) updateData.name = args.name;
        if (args.buy_price !== undefined) updateData.buy_price = args.buy_price;
        if (args.sell_price !== undefined) updateData.sell_price = args.sell_price;
        if (args.min_stock !== undefined) updateData.min_stock = args.min_stock;
        if (args.category) updateData.category = args.category;

        const result = await storage.updateProduct(args.product, updateData);
        return { success: true, ...result };
      }

      case 'search_product': {
        const product = await storage.getProduct(args.query);
        if (!product) return { success: false, error: `No product found matching "${args.query}"` };

        const result = { success: true, ...product };
        // Hide buy_price from staff
        if (meta?.staff?.role === 'staff') {
          delete result.buy_price;
        }
        return result;
      }

      // ─── Customers ────────────────────────────
      case 'get_customer_history': {
        const result = await storage.getCustomerHistory(args.customer_name);
        return { success: true, ...result };
      }

      // ─── Reports ──────────────────────────────
      case 'daily_summary': {
        const result = await storage.getDailySummary();
        return { success: true, ...result };
      }

      case 'weekly_report': {
        const result = await storage.getWeeklyReport();
        return { success: true, ...result };
      }

      // ─── Staff & Insights ─────────────────────
      case 'get_staff_activity': {
        const result = await storage.getStaffActivity(args.staff_name, args.date || null);
        return { success: true, ...result };
      }

      case 'get_reorder_suggestions': {
        const velocity = await storage.getSalesVelocity();
        // Filter to items that need attention
        const suggestions = velocity
          .filter(p => p.avg_daily_sales > 0) // Only items that actually sell
          .map(p => ({
            name: p.name,
            sku: p.sku,
            current_stock: p.current_stock,
            min_stock: p.min_stock,
            unit: p.unit,
            avg_daily_sales: p.avg_daily_sales,
            days_until_stockout: p.days_until_stockout,
            urgency: p.days_until_stockout <= 3 ? 'URGENT'
              : p.days_until_stockout <= 7 ? 'SOON'
              : p.days_until_stockout <= 14 ? 'PLAN'
              : 'OK',
            suggested_order_qty: Math.max(
              Math.ceil(p.avg_daily_sales * 14) - p.current_stock, // 2-week supply
              0
            ),
            estimated_cost: Math.max(Math.ceil(p.avg_daily_sales * 14) - p.current_stock, 0) * p.buy_price,
          }))
          .filter(p => p.urgency !== 'OK');

        return {
          success: true,
          total_items_to_reorder: suggestions.length,
          total_estimated_cost: suggestions.reduce((s, p) => s + p.estimated_cost, 0),
          suggestions,
        };
      }

      case 'get_staff_performance': {
        const performance = await storage.getStaffPerformance();
        return {
          success: true,
          period: 'Last 7 days',
          staff: performance,
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    logger.error(`Tool ${toolName} failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Execute multiple tool calls in sequence.
 * @param {Array<{name: string, arguments: Object}>} toolCalls
 * @param {Object} meta - Metadata including staff info
 */
export async function executeToolCalls(toolCalls, meta = {}) {
  const results = [];
  for (const call of toolCalls) {
    const result = await executeTool(call.name, call.arguments || {}, meta);
    results.push({ tool_call_id: call.id || call.name, name: call.name, result });
  }
  return results;
}

export default { executeTool, executeToolCalls };
