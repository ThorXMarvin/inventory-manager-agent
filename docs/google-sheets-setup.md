# Google Sheets Setup Guide

This guide shows you how to set up Google Sheets as a storage backend for the Inventory Manager Agent.

## Why Google Sheets?

- **Visual dashboard** — See your inventory in a familiar spreadsheet
- **Share access** — Give employees read-only access to stock levels
- **Mobile access** — Check inventory from the Google Sheets app on your phone
- **Backup** — Your data is backed up in Google's cloud
- **No extra cost** — Google Sheets is free with a Google account

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it something like "Inventory Manager"
4. Click "Create"

### 2. Enable the Google Sheets API

1. In your new project, go to **APIs & Services** → **Library**
2. Search for "Google Sheets API"
3. Click it and press **Enable**
4. Also search for and enable "Google Drive API"

### 3. Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **Service account**
3. Name: "inventory-bot" (or any name)
4. Click **Create and Continue**
5. Skip the optional role and users steps → **Done**

### 4. Download the JSON Key

1. Click on the service account you just created
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Click **Create** — a JSON file will download

### 5. Add the Key to Your Project

1. Rename the downloaded file to `google-credentials.json`
2. Move it to your project's `config/` directory:
   ```bash
   mv ~/Downloads/inventory-bot-xxxxx.json config/google-credentials.json
   ```

### 6. Configure the Agent

Edit `config/business.yaml`:

```yaml
storage:
  mode: "sheets"           # or "both" for hybrid SQLite + Sheets
  sheets:
    credentials_file: "./config/google-credentials.json"
    spreadsheet_id: ""     # leave empty — auto-creates on first run
    spreadsheet_name: "My Store - Inventory"
```

### 7. First Run

```bash
npm start
```

On first run, the agent will:
1. Create a new Google Spreadsheet with 5 tabs
2. Log the spreadsheet ID — **save this in your config** to avoid re-creating
3. Set up headers and formatting for all tabs

### 8. Share the Spreadsheet (Optional)

To view the spreadsheet:
1. Open [Google Sheets](https://sheets.google.com)
2. Find the spreadsheet (it's owned by the service account)
3. Or share it with your personal email:
   - The service account email looks like: `inventory-bot@your-project.iam.gserviceaccount.com`
   - Share the spreadsheet with your personal Google account

Alternatively, the service account can share it programmatically if you add your email to `authorized_users` in the config.

## Storage Modes

| Mode | Primary | Secondary | Best For |
|------|---------|-----------|----------|
| `sqlite` | SQLite (local) | — | Single-device, fast, offline-capable |
| `sheets` | Google Sheets | — | Cloud-first, team visibility |
| `both` | SQLite (local) | Sheets (synced) | Best of both worlds |

### Hybrid Mode ("both")

In hybrid mode:
- **SQLite** handles all reads and writes (fast, reliable)
- **Google Sheets** receives background syncs every 15 minutes
- If Sheets goes down, the agent keeps working via SQLite
- Sheets acts as a live dashboard and backup

## Troubleshooting

### "Google credentials file not found"
- Check that `config/google-credentials.json` exists
- Verify the path in `business.yaml` or `.env`

### "Insufficient permissions"
- Make sure both Google Sheets API and Google Drive API are enabled
- Check that the service account has the correct project

### "Quota exceeded"
- Google Sheets API has a limit of 100 requests per 100 seconds
- The agent has built-in rate limiting and caching
- If you hit limits, switch to "both" mode (SQLite handles reads, fewer Sheets calls)

### "Spreadsheet not found"
- If you deleted the auto-created spreadsheet, clear the `spreadsheet_id` in config
- The agent will create a new one on next start

## Security Notes

- **Never commit `google-credentials.json` to version control** — it's in `.gitignore`
- The service account only has access to spreadsheets it creates or that are shared with it
- For production, consider using Workload Identity Federation instead of JSON keys
