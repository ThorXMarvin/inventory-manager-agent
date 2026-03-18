# Reports

The inventory agent generates several types of reports, available on-demand or automatically.

## Daily Summary

**Trigger:** Type "daily summary" or wait for the automatic end-of-day report.

Includes:
- Total sales transactions for the day
- Revenue and estimated profit
- Top selling products
- Low stock warnings
- Total items in store

**Example:**
```
📊 Daily Summary — Monday, March 18, 2026

💰 Sales: 23 transactions
💵 Revenue: UGX 2,450,000
📈 Est. Profit: UGX 680,000

🏆 Top Sellers Today:
  1. Cement — 45 bags
  2. Iron Sheets — 30 pcs
  3. Paint — 8 tins

⚠️ 2 items low on stock
📦 Total items in store: 1,847 units
```

## Stock Report

**Trigger:** Type "stock report"

Shows all products grouped by category with:
- Current stock levels
- Status indicators (🟢 OK / 🔴 LOW)
- Total stock value at cost

## Weekly Report

**Trigger:** Type "weekly report"

Covers the last 7 days:
- Total transactions and revenue
- Estimated profit and margin
- Top 10 sellers for the week
- Items below minimum stock

## Profit Report

**Trigger:** Type "profit report"

Shows financial performance:
- This week: revenue, cost, profit, margin %
- This month: revenue, cost, profit, margin %

## Automatic Reports

Configure in `config/business.yaml`:

```yaml
alerts:
  daily_summary:
    enabled: true
    time: "20:00"    # Sent at 8 PM daily
```

Automatic reports are sent through all active channels (WhatsApp, Telegram).

## API Access

Reports are also available via the web API:

```bash
# Daily summary
curl http://localhost:3000/api/reports/daily

# Stock report
curl http://localhost:3000/api/reports/stock

# Profit report
curl http://localhost:3000/api/reports/profit

# Weekly sales data
curl http://localhost:3000/api/sales/weekly
```
