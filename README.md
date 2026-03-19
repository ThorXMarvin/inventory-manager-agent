# 📦 Inventory Manager Agent

AI-powered inventory management for small businesses. Track stock, record sales, get alerts — all through WhatsApp, Email, or a web dashboard. No complex software to learn.

---

## 🚀 Quick Start — Download & Run (No Coding Required)

### 1. Download
Go to [**Releases**](../../releases) and download the file for your system:
- **Windows:** `inventory-manager-agent-v1.0.0-windows-x64.zip`
- **Linux:** `inventory-manager-agent-v1.0.0-linux-x64.tar.gz`

### 2. Extract & Run
- **Windows:** Unzip the folder → Double-click `inventory-manager-agent.exe`
- **Linux:** Extract → Run `./inventory-manager-agent` in terminal

**That's it.** Your browser opens automatically to the setup wizard.

### 3. Setup Wizard
Follow the on-screen wizard to:
- Enter your business details (name, currency)
- Add your products (or use a template for your business type)
- Connect an AI provider (OpenAI, Anthropic, Google, or free local Ollama)
- Enable WhatsApp and email alerts

### 4. Start Managing!
Chat with your inventory agent via the web dashboard or WhatsApp.

> 💡 **No Node.js required** when using the executable. Everything is bundled.

---

## 🛠️ Developer Setup (from source)

If you prefer running from source or want to modify the code:

### 1. Prerequisites
- [Node.js](https://nodejs.org) v18 or later

### 2. Install & Run
```bash
git clone https://github.com/ThorXMarvin/inventory-manager-agent.git
cd inventory-manager-agent
npm install
npm start
```

### 3. Build Executables
```bash
npm run build
# Outputs to dist/executables/
```

---

## 💬 What Can It Do?

Talk to it naturally — just like chatting with a shop assistant:

| You say... | It does... |
|---|---|
| "Added 50 bags cement" | Updates stock levels |
| "Sold 3 bags cement to Kato" | Records sale + updates stock |
| "How much cement do I have?" | Shows current stock |
| "Daily summary" | Revenue, profit, top sellers |
| "What's running low?" | Lists items below minimum stock |

## 📱 Channels

- **Web Dashboard** — Chat interface + stock table + sales stats
- **WhatsApp** — Manage inventory from your phone (scan QR to connect)
- **Email** — Automated daily reports and low-stock alerts

## 🎯 Perfect For

- 🔨 Hardware shops
- 💊 Pharmacies
- 🍽️ Restaurants
- 🛒 Grocery stores / dukas
- 👕 Clothing shops
- 📱 Electronics shops
- Any small business with physical inventory

---

<details>
<summary><h2>🛠️ Developer Documentation</h2></summary>

### Architecture

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

### Tech Stack

- **Runtime:** Node.js (ES Modules)
- **LLM:** OpenAI, Anthropic, Google Gemini, or Ollama (with function calling)
- **Channels:** Baileys (WhatsApp), Nodemailer/Brevo (Email), Express (Web)
- **Storage:** SQLite (local) and/or Google Sheets (cloud)
- **Other:** node-cron, winston, googleapis

### Dev Setup

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

### Storage Options

**SQLite (Default):** Fast, local, works offline. All data in `./data/inventory.db`.

**Google Sheets:** Store everything in a Google Spreadsheet. Great for team visibility. See [docs/google-sheets-setup.md](docs/google-sheets-setup.md).

**Hybrid ("both"):** SQLite handles reads/writes (fast), Google Sheets receives background syncs every 15 minutes.

### 13 Available Tools (Function Calling)

| Category | Tools |
|----------|-------|
| **Stock** | `add_stock`, `check_stock`, `adjust_stock`, `get_low_stock` |
| **Sales** | `record_sale`, `get_sales_today`, `get_sales_range` |
| **Products** | `add_product`, `update_product`, `search_product` |
| **Customers** | `get_customer_history` |
| **Reports** | `daily_summary`, `weekly_report` |

### File Structure

```
inventory-manager-agent/
├── README.md
├── start.sh / start.bat          # User-friendly start scripts
├── .env.example
├── package.json
├── config/
│   ├── business.yaml.example
│   └── products.csv.example
├── scripts/
│   └── package.sh                # Release packaging
├── src/
│   ├── index.js
│   ├── agent/                    # AI brain (function calling)
│   ├── storage/                  # SQLite + Google Sheets
│   ├── alerts/                   # Low stock alerts
│   ├── channels/                 # WhatsApp, Email, Web
│   ├── db/                       # Legacy SQLite
│   └── utils/                    # Config, CSV import, logging
├── docs/                         # Setup guides
└── data/                         # Created at runtime
```

### Building Releases

```bash
chmod +x scripts/package.sh
./scripts/package.sh
# Creates dist/inventory-manager-agent-v1.0.0-linux.tar.gz
# Creates dist/inventory-manager-agent-v1.0.0-windows.zip
```

</details>

---

## 📄 License

MIT — [AI Studio Uganda](https://github.com/AiStudioUg)
