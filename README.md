# Inventory Manager Agent

A WhatsApp/Telegram-based AI agent that helps small businesses track stock, record sales, get low-stock alerts, and generate inventory reports — all through simple chat messages. No app to install, no complex software to learn.

## Problem

Most small shops, pharmacies, and market vendors in East Africa track inventory mentally or in notebooks. Stock-outs mean lost sales. Overstocking ties up cash. Existing inventory software is too complex, too expensive, or requires smartphones/computers they don't have. But everyone has WhatsApp.

## Solution

A chat-based inventory agent that:
- Tracks stock levels via simple WhatsApp messages ("Added 50 bags of cement")
- Records sales ("Sold 3 bags cement to John")
- Sends low-stock alerts automatically via WhatsApp and email
- Generates daily/weekly stock and sales reports
- Handles multiple product categories
- Works with basic phones (text-based, no app needed)
- **v2:** Google Sheets integration, LLM function calling, email notifications

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Inventory Manager Agent v2                    │
├──────────────────────────────────────────────────────────┤
│  Channels        │  Agent Brain (Function Calling)        │
│  ├─ WhatsApp 📱  │  ├─ LLM Provider (OpenAI/Anthropic/   │
│  │  (Baileys)    │  │   Google/Ollama)                    │
│  ├─ Email 📧     │  ├─ 13 Tool Definitions                │
│  │  (Brevo SMTP) │  ├─ Tool Executor                      │
│  └─ Web Dashboard│  └─ System Prompt Builder              │
│                  │                                        │
│  Storage Layer   │  Supporting Modules                    │
│  ├─ SQLite       │  ├─ Alert Engine                       │
│  ├─ Google Sheets│  ├─ Report Generator                   │
│  └─ Hybrid (both)│  └─ Background Sync (both mode)        │
│                  │                                        │
│  Config          │  Notifications → WhatsApp + Email       │
│  └─ business.yaml│                                        │
└──────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime:** Node.js (ES Modules)
- **LLM:** OpenAI, Anthropic, Google Gemini, or Ollama (with function calling)
- **Channels:** Baileys (WhatsApp), Nodemailer/Brevo (Email), Express (Web)
- **Storage:** SQLite (local) and/or Google Sheets (cloud)
- **Other:** node-cron, winston, googleapis

## Channels

### 📱 WhatsApp (Primary)
The business owner scans a QR code with their personal WhatsApp number. That number becomes the agent — customers message it and AI responds. The owner can still use WhatsApp normally on their phone.

- **QR code** shown in terminal AND on the web dashboard
- **Session persistence** — auth state saved to disk, auto-reconnects
- **Message filtering** — respond to all numbers, or only configured authorized users
- Set `WHATSAPP_ENABLED=true` in `.env` and scan the QR on first run

### 📧 Email (Brevo SMTP)
Outbound-only notifications: daily summaries, low stock alerts, weekly reports. Not conversational. Uses Brevo's free SMTP relay (300 emails/day, no credit card).

See [docs/email-setup.md](docs/email-setup.md) for setup.

### 🌐 Web Dashboard
REST API + HTML dashboard with:
- Chat interface (talk to the agent)
- WhatsApp QR code display (for easy scanning)
- Stock levels table with low-stock indicators
- Sales stats

### 📱 Telegram
Planned for a future release. Placeholder file exists.

## Quick Start

```bash
git clone https://github.com/AiStudioUg/inventory-manager-agent.git
cd inventory-manager-agent
npm install
cp .env.example .env
cp config/business.yaml.example config/business.yaml
# Edit .env with your LLM API key
# Edit config/business.yaml with your products
npm start
```

The web dashboard will be available at `http://localhost:3000`.

See [docs/setup.md](docs/setup.md) for detailed setup instructions.

## Storage Options

### SQLite (Default)
Fast, local, works offline. All data in `./data/inventory.db`.

### Google Sheets
Store everything in a Google Spreadsheet with 5 auto-created tabs:
- **Products** — Master product catalog
- **Transactions** — Every stock movement
- **Customers** — Customer directory
- **Daily Summaries** — End-of-day reports
- **Alerts Log** — Low stock and other alerts

Great for team visibility — share the spreadsheet with employees for read-only access. See [Google Sheets Setup Guide](docs/google-sheets-setup.md).

### Hybrid ("both")
Best of both worlds:
- **SQLite** handles all reads/writes (fast, reliable, offline-capable)
- **Google Sheets** receives background syncs every 15 minutes (dashboard + backup)
- If Sheets is unavailable, the agent keeps working via SQLite

Configure in `config/business.yaml`:
```yaml
storage:
  mode: "both"           # sqlite | sheets | both
  sqlite:
    path: "./data/inventory.db"
  sheets:
    credentials_file: "./config/google-credentials.json"
    spreadsheet_id: ""   # auto-creates on first run
    spreadsheet_name: "{business_name} - Inventory"
```

## Agent Brain — Function Calling

The v2 agent uses proper LLM function calling instead of parsing JSON from text. This means:
- More reliable intent detection
- Support for complex multi-step operations
- The LLM can chain multiple tools in one request
- Better error handling and fallbacks

### 13 Available Tools

| Category | Tools |
|----------|-------|
| **Stock** | `add_stock`, `check_stock`, `adjust_stock`, `get_low_stock` |
| **Sales** | `record_sale`, `get_sales_today`, `get_sales_range` |
| **Products** | `add_product`, `update_product`, `search_product` |
| **Customers** | `get_customer_history` |
| **Reports** | `daily_summary`, `weekly_report` |

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
```

### Checking Stock
```
User: How much cement do I have?
Agent: 📦 Cement (50kg bag)
       • In stock: 180 bags ✅
       • Min level: 20 bags
       • Value: UGX 5,760,000 (at cost)
```

### Daily Summary
```
User: Daily summary
Agent: 📊 Daily Summary — March 18, 2026
       💰 Sales: 23 transactions
       💵 Revenue: UGX 2,450,000
       📈 Profit: UGX 680,000
       🏆 Top: Cement (45 bags), Iron Sheets (30 pcs)
       ⚠️ 2 items low on stock
```

## File Structure

```
inventory-manager-agent/
├── README.md
├── .env.example
├── package.json
├── config/
│   ├── business.yaml.example
│   └── products.csv.example
├── src/
│   ├── index.js                 # Main entry point
│   ├── agent/
│   │   ├── core.js              # Function calling loop (v2)
│   │   ├── tools.js             # 13 tool definitions
│   │   ├── executor.js          # Tool execution engine
│   │   ├── prompts.js           # System prompt builder
│   │   ├── parser.js            # Legacy NLU parser (v1)
│   │   ├── stock.js             # Stock management
│   │   ├── sales.js             # Sales tracking
│   │   └── reports.js           # Report generation
│   ├── storage/
│   │   ├── adapter.js           # Storage factory (sqlite/sheets/both)
│   │   ├── interface.js         # Interface documentation
│   │   ├── sync.js              # SQLite → Sheets background sync
│   │   ├── sqlite/
│   │   │   ├── index.js         # SQLite adapter
│   │   │   ├── client.js        # SQLite connection
│   │   │   ├── products.js
│   │   │   ├── transactions.js
│   │   │   ├── customers.js
│   │   │   ├── reports.js
│   │   │   └── alerts.js
│   │   └── sheets/
│   │       ├── index.js         # Google Sheets adapter
│   │       ├── client.js        # API auth + rate limiting
│   │       ├── setup.js         # Auto-create spreadsheet
│   │       ├── cache.js         # TTL cache for API calls
│   │       ├── products.js
│   │       ├── transactions.js
│   │       ├── customers.js
│   │       ├── reports.js
│   │       └── alerts.js
│   ├── alerts/
│   │   ├── engine.js
│   │   └── notifier.js
│   ├── channels/
│   │   ├── whatsapp.js          # Primary: Baileys + QR scan
│   │   ├── email.js             # Brevo SMTP outbound notifications
│   │   ├── telegram.js          # Placeholder (future)
│   │   └── web.js               # Dashboard + WhatsApp QR display
│   ├── db/
│   │   └── sqlite.js            # Legacy DB (backward compat)
│   └── utils/
│       ├── config.js
│       ├── csv-import.js
│       └── logger.js
├── docs/
│   ├── setup.md
│   ├── google-sheets-setup.md   # Sheets setup guide
│   ├── email-setup.md           # Brevo SMTP setup guide
│   ├── adding-products.md
│   ├── stock-commands.md
│   ├── reports.md
│   └── csv-import.md
└── data/                        # Created at runtime
    └── inventory.db
```

## Target Users

- Hardware shops
- Pharmacies and drug shops
- Market vendors
- Small grocery stores (dukas)
- Restaurants (ingredient tracking)
- Any small business with physical inventory

## License

MIT — AI Studio Uganda
