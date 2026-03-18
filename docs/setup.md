# Getting Started

## Prerequisites

- **Node.js 18+** installed
- An LLM API key (OpenAI, Anthropic, or Google) — or Ollama running locally
- Optional: Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Optional: WhatsApp-linked phone for Baileys

## Quick Setup

### 1. Clone and install

```bash
git clone https://github.com/AiStudioUg/inventory-manager-agent.git
cd inventory-manager-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:
- `LLM_PROVIDER` — `openai`, `anthropic`, `google`, or `ollama`
- `LLM_API_KEY` — your API key
- `LLM_MODEL` — model name (e.g., `gpt-4o-mini`, `claude-3-haiku-20240307`)
- `WEB_ENABLED=true` — to start the web dashboard

### 3. Configure your business

```bash
cp config/business.yaml.example config/business.yaml
nano config/business.yaml
```

Update:
- Business name, currency, and location
- Product categories and items with prices and stock levels
- Alert preferences

### 4. Start the agent

```bash
npm start
```

The web dashboard will be available at `http://localhost:3000`.

## Importing Products from CSV

If you have a product list in CSV format:

```bash
cp config/products.csv.example config/products.csv
# Edit with your actual products
node src/utils/csv-import.js config/products.csv
```

CSV columns: `name, sku, category, unit, buy_price, sell_price, min_stock, current_stock`

## Enabling Channels

### Web Dashboard (default)
Set `WEB_ENABLED=true` in `.env`. Access at `http://localhost:3000`.

### Telegram
1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_ENABLED=true` and `TELEGRAM_BOT_TOKEN=your-token` in `.env`
3. Restart the agent
4. Message your bot on Telegram

### WhatsApp
1. Set `WHATSAPP_ENABLED=true` in `.env`
2. Restart the agent
3. Scan the QR code that appears in the terminal
4. Send a message to the connected WhatsApp number

## Data Storage

All data is stored in a local SQLite database at `./data/inventory.db` (configurable via `DB_PATH`). No external database required.

## Troubleshooting

- **"Database not initialized"** — Make sure the `data/` directory is writable
- **"LLM parse error"** — Check your API key and model name
- **WhatsApp QR won't scan** — Delete `data/whatsapp-auth/` and restart
- **Telegram not responding** — Verify your bot token is correct
