# Stock Commands

The inventory agent understands natural language. Just type like you're texting a colleague.

## Adding Stock

When you receive new inventory:

```
Received 50 bags cement
Added 100 iron sheets and 20 tins paint
Got 30 bags of nails
Restocked 10 tins Plascon emulsion
```

**Response:**
```
✅ Stock Updated:
  • Cement (50kg bag): +50 bags → 135 total
```

## Recording Sales

When you sell items:

```
Sold 5 bags cement to Kato
Sale: 10 iron sheets, 2 tins paint
Kato bought 3 bags cement and 5 iron sheets
Sold 20 nails to Okello
```

**Response:**
```
💰 Sale Recorded:
  • 5x Cement (50kg bag): UGX 190,000
  💵 Total: UGX 190,000
  👤 Customer: Kato
  
  📦 Stock remaining:
  • Cement (50kg bag): 130 bags
```

## Checking Stock

Ask about specific products or everything:

```
How much cement do I have?
Check iron sheets
Stock level for paint
What do I have in stock?
Stock report
```

**Response:**
```
📦 Cement (50kg bag)
  🟢 In stock: 130 bags ✅ OK
  Min level: 20 bags
  This week: -25 sold, +50 received
  Value: UGX 4,160,000 (at cost)
```

## Reports

```
Daily summary
Weekly report
Profit report
Stock report
```

## Tips

- **Fuzzy matching works:** "cement" matches "Cement (50kg bag)", "sheets" matches "Iron Sheets"
- **Multiple items:** "Sold 5 cement and 10 sheets to Kato" works
- **Customer tracking:** Just mention their name and it's recorded
- **Units are flexible:** "bags", "pieces", "tins", "kg" — the agent figures it out
