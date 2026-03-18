# Email Setup Guide (Brevo SMTP)

The Inventory Manager Agent can send email notifications for:
- 📊 Daily sales summary reports
- ⚠️ Low stock alerts
- 📊 Weekly business reports

Email is **outbound only** — it sends reports to you, not a conversational channel.

## Why Brevo?

[Brevo](https://www.brevo.com/) (formerly Sendinblue) offers a generous free tier:
- **300 emails per day** — more than enough for daily/weekly reports
- No credit card required
- Reliable SMTP delivery
- Works from any server (no IP restrictions)

## Setup Steps

### 1. Create a Brevo Account

1. Go to [https://app.brevo.com](https://app.brevo.com)
2. Sign up with your email (free)
3. Verify your email address

### 2. Get SMTP Credentials

1. After login, go to **Settings** (gear icon, bottom-left)
2. Click **SMTP & API** under the "API Keys" section
3. Click **SMTP** tab
4. You'll see:
   - **SMTP Server:** `smtp-relay.brevo.com`
   - **Port:** `587`
   - **Login:** your Brevo account email
5. Click **Generate a new SMTP key**
6. Copy the generated key (this is your SMTP password)

### 3. Add a Verified Sender

1. Go to **Settings** → **Senders, Domains & Dedicated IPs**
2. Click **Senders** tab → **Add a sender**
3. Add the email address you want to send FROM
4. Verify it via the confirmation email

### 4. Configure the Agent

**Option A: In `config/business.yaml`** (recommended)

```yaml
channels:
  email:
    enabled: true
    smtp_host: "smtp-relay.brevo.com"
    smtp_port: 587
    smtp_user: "your-brevo-login@email.com"
    smtp_pass: "xsmtpsib-your-smtp-key-here"
    from_name: "Mukasa Hardware Store"
    from_email: "your-verified-sender@email.com"
    owner_email: "owner@email.com"
```

**Option B: In `.env` file**

```bash
EMAIL_SMTP_HOST=smtp-relay.brevo.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-brevo-login@email.com
EMAIL_SMTP_PASS=xsmtpsib-your-smtp-key-here
EMAIL_FROM_NAME=Mukasa Hardware Store
EMAIL_FROM_EMAIL=your-verified-sender@email.com
EMAIL_OWNER_EMAIL=owner@email.com
```

### 5. Enable Email in Alerts

In `config/business.yaml`, add `email` to alert notification channels:

```yaml
alerts:
  low_stock:
    enabled: true
    notify_via:
      - "whatsapp"
      - "email"       # ← Add this
  daily_summary:
    enabled: true
    time: "20:00"
```

### 6. Restart the Agent

```bash
npm start
```

You should see: `✅ Email channel connected via smtp-relay.brevo.com:587`

## What Gets Sent

| Email | When | Content |
|-------|------|---------|
| Daily Summary | Every day at configured time (default 20:00) | Sales count, revenue, profit, top sellers, low stock |
| Low Stock Alert | Every 6 hours (if items below minimum) | List of items needing restock |
| Weekly Report | Weekly (if enabled) | Week's sales trends, top products |

## Email Format

Emails are sent as HTML with a clean, mobile-friendly design:
- Business name header
- Formatted content with emojis
- Plain text fallback for basic email clients

## Troubleshooting

### "Email connection failed"
- Double-check your SMTP credentials in Brevo
- Make sure port 587 is not blocked by your firewall
- Try port 465 if 587 doesn't work

### "Sender not verified"
- The `from_email` must be verified in Brevo → Settings → Senders
- Check your inbox (including spam) for the verification email

### "Message rejected"
- Brevo may block if the sender domain doesn't match
- Set up SPF/DKIM records for your domain (Brevo guides you through this)

### Emails going to spam
- Verify your sender domain in Brevo
- Add SPF and DKIM DNS records (Brevo provides these)
- Use a professional sender email, not a free Gmail/Yahoo address

## Security Notes

- **Never commit SMTP credentials to git** — use `.env` or `business.yaml` (both in `.gitignore`)
- The SMTP key is like a password — treat it as such
- Brevo's free tier has rate limits, but 300/day is generous for notifications
