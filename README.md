# Inventory Manager Agent — Concept Note

## Overview
A WhatsApp/Telegram-based AI agent that helps small businesses track stock, record sales, get low-stock alerts, and generate inventory reports — all through simple chat messages. No app to install, no complex software to learn.

## Problem
Most small shops, pharmacies, and market vendors in East Africa track inventory mentally or in notebooks. Stock-outs mean lost sales. Overstocking ties up cash. Existing inventory software is too complex, too expensive, or requires smartphones/computers they don't have. But everyone has WhatsApp.

## Solution
A chat-based inventory agent that:
- Tracks stock levels via simple WhatsApp/Telegram messages ("Added 50 bags of cement")
- Records sales ("Sold 3 bags cement to John")
- Sends low-stock alerts automatically
- Generates daily/weekly stock and sales reports
- Handles multiple product categories
- Works with basic phones (text-based, no app needed)
- Supports barcode scanning (via camera in web/app version)

## Architecture
```
┌─────────────────────────────────────────────┐
│           Inventory Manager Agent             │
├─────────────────────────────────────────────┤
│  Channels        │  Core Engine              │
│  ├─ WhatsApp     │  ├─ LLM Provider (any)    │
│  ├─ Telegram     │  ├─ NLU Parser (intent)   │
│  ├─ USSD         │  ├─ Stock Engine           │
│  └─ Web Dashboard│  ├─ Sales Tracker          │
│                  │  ├─ Alert Engine           │
│  Config          │  └─ Report Generator      │
│  ├─ config.yaml  │                           │
│  └─ products.csv │  Integrations             │
│                  │  ├─ Mobile Money (payments)│
│                  │  └─ CSV/Excel export       │
└─────────────────────────────────────────────┘
```

## Tech Stack
- **Runtime:** Node.js
- **LLM:** Any provider (for natural language understanding of stock commands)
- **Channels:** Baileys (WhatsApp), Telegraf (Telegram), Express (Web)
- **Database:** SQLite (products, stock levels, transactions, alerts)
- **Reports:** Chart generation + PDF export
- **Barcode:** quagga2 (barcode scanning via web camera)

## Configuration
```bash
git clone https://github.com/AiStudioUg/inventory-manager-agent.git
cd inventory-manager-agent
cp .env.example .env
nano config/business.yaml
npm install && npm start
```

### config/business.yaml
```yaml
business:
  name: "Mukasa Hardware Store"
  type: "retail"  # retail | pharmacy | restaurant | warehouse
  currency: "UGX"

categories:
  - name: "Building Materials"
    products:
      - name: "Cement (50kg bag)"
        sku: "CEM-50"
        unit: "bag"
        buy_price: 32000
        sell_price: 38000
        min_stock: 20
        current_stock: 85
      - name: "Iron Sheets (30 gauge)"
        sku: "IRS-30"
        unit: "piece"
        buy_price: 25000
        sell_price: 32000
        min_stock: 50
        current_stock: 120
  - name: "Paint"
    products:
      - name: "Plascon Emulsion (20L)"
        sku: "PNT-E20"
        unit: "tin"
        buy_price: 180000
        sell_price: 220000
        min_stock: 10
        current_stock: 25

alerts:
  low_stock:
    enabled: true
    check_interval: "6h"
    notify_via: ["whatsapp", "telegram"]
  daily_summary:
    enabled: true
    time: "20:00"  # End of business day

reports:
  weekly: true
  monthly: true
  include: ["stock_levels", "sales_summary", "profit_margin", "top_sellers"]

llm:
  provider: "openai"
  model: "gpt-4o-mini"
  api_key: "${OPENAI_API_KEY}"
```

## Conversation Examples

### Adding Stock
```
User: Received 100 bags cement and 50 iron sheets
Agent: ✅ Stock updated:
       • Cement (50kg): +100 bags → 185 total
       • Iron Sheets (30g): +50 pcs → 170 total
```

### Recording Sales
```
User: Sold 5 bags cement and 10 iron sheets to Kato Builders
Agent: 💰 Sale recorded:
       • 5x Cement (50kg): UGX 190,000
       • 10x Iron Sheets (30g): UGX 320,000
       • Total: UGX 510,000
       • Customer: Kato Builders
       
       Stock remaining:
       • Cement: 180 bags
       • Iron Sheets: 160 pcs
```

### Checking Stock
```
User: How much cement do I have?
Agent: 📦 Cement (50kg bag)
       • In stock: 180 bags
       • Min level: 20 bags ✅
       • This week: -25 sold, +100 received
       • Value: UGX 5,760,000 (at cost)
```

### Low Stock Alert (Automatic)
```
Agent: ⚠️ LOW STOCK ALERT
       
       3 items below minimum level:
       • Plascon Emulsion (20L): 8 left (min: 10)
       • Nails (4 inch): 5 kg left (min: 15)
       • PVC Pipe (1/2 inch): 12 left (min: 20)
       
       Shall I generate a reorder list?
```

### Daily Summary (Automatic)
```
Agent: 📊 Daily Summary — March 18, 2026
       
       Sales: 23 transactions
       Revenue: UGX 2,450,000
       Profit: UGX 680,000 (est.)
       
       Top sellers:
       1. Cement — 45 bags
       2. Iron Sheets — 30 pcs
       3. Paint — 8 tins
       
       ⚠️ 2 items low on stock
       📦 Total items in store: 1,847 units
```

## Browser Extension / Web Dashboard
- Visual stock levels with charts
- Quick stock in/out buttons
- Sales history and analytics
- Barcode scanner (camera)
- Export to CSV/Excel
- Print stock reports

## File Structure
```
inventory-manager-agent/
├── README.md
├── LICENSE
├── .env.example
├── package.json
├── config/
│   ├── business.yaml.example
│   └── products.csv.example
├── src/
│   ├── index.js
│   ├── agent/
│   │   ├── core.js
│   │   ├── parser.js          # NLU for stock commands
│   │   ├── stock.js           # Stock management
│   │   ├── sales.js           # Sales tracking
│   │   └── reports.js         # Report generation
│   ├── alerts/
│   │   ├── engine.js
│   │   └── notifier.js
│   ├── channels/
│   │   ├── whatsapp.js
│   │   ├── telegram.js
│   │   └── web.js
│   ├── db/
│   │   ├── sqlite.js
│   │   └── migrations/
│   └── utils/
│       ├── csv-import.js      # Import products from CSV
│       └── barcode.js         # Barcode scanning
├── dashboard/                  # Web dashboard (optional)
│   ├── index.html
│   ├── charts.js
│   └── scanner.js
├── docs/
│   ├── setup.md
│   ├── adding-products.md
│   ├── stock-commands.md
│   ├── reports.md
│   └── csv-import.md
└── tests/
```

## Success Metrics
- Stock accuracy > 95% vs physical count
- Business owner spends < 10 min/day on inventory management
- 30% reduction in stock-outs
- Setup time < 30 minutes (with CSV import)

## Target Users
- Hardware shops
- Pharmacies and drug shops
- Market vendors
- Small grocery stores (dukas)
- Restaurants (ingredient tracking)
- Any small business with physical inventory
