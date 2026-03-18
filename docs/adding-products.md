# Adding & Managing Products

## Method 1: YAML Config (Recommended for Setup)

Edit `config/business.yaml` to define your product catalog:

```yaml
categories:
  - name: "Building Materials"
    products:
      - name: "Cement (50kg bag)"
        sku: "CEM-50"
        unit: "bag"
        buy_price: 32000      # Your cost price
        sell_price: 38000     # Selling price
        min_stock: 20         # Alert when below this
        current_stock: 85     # Starting stock
```

Products from YAML are seeded into the database on first run (when the DB is empty).

### Product Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Product name (used for matching) |
| `sku` | No | Stock Keeping Unit code |
| `unit` | No | Unit of measure (bag, piece, kg, tin, etc.) |
| `buy_price` | No | Your purchase/cost price |
| `sell_price` | No | Your selling price |
| `min_stock` | No | Minimum stock level for alerts |
| `current_stock` | No | Starting stock quantity |

## Method 2: CSV Import

For bulk imports, use a CSV file:

```bash
node src/utils/csv-import.js config/products.csv
```

CSV format:
```csv
name,sku,category,unit,buy_price,sell_price,min_stock,current_stock
"Cement (50kg bag)",CEM-50,Building Materials,bag,32000,38000,20,85
"Iron Sheets (30 gauge)",IRS-30,Building Materials,piece,25000,32000,50,120
```

### Tips for CSV Import
- First row must be headers
- Product names should be descriptive (used for fuzzy matching)
- SKU must be unique (duplicates will update existing products)
- Prices are in your configured currency (UGX by default)

## Method 3: Web API

Add products via the REST API:

```bash
# Check current stock
curl http://localhost:3000/api/stock

# Use the chat endpoint to add stock
curl -X POST http://localhost:3000/api/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Received 50 bags of cement"}'
```

## Product Matching

The agent uses fuzzy matching to find products:

- "cement" → matches "Cement (50kg bag)"
- "sheets" → matches "Iron Sheets (30 gauge)"
- "emulsion" → matches "Plascon Emulsion (20L)"
- SKU codes also work: "CEM-50"

Keep product names descriptive and unique for best matching results.
