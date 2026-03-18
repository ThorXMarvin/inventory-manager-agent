# Email Notifications Setup (Brevo SMTP)

The Inventory Manager Agent can send daily summaries, low stock alerts, and weekly reports to your email. This guide walks you through setting up **Brevo** (formerly Sendinblue) as your free SMTP provider.

## Why Brevo?

- **Free tier**: 300 emails/day — more than enough for daily/weekly reports
- **No credit card required** for free plan
- **Reliable delivery** with good inbox placement
- **Easy setup** — takes ~5 minutes

## Step-by-Step Setup

### 1. Create a Brevo Account

1. Go to [https://app.brevo.com](https://app.brevo.com)
2. Click **Sign Up Free**
3. Enter your email and create a password
4. Verify your email address (check your inbox for the confirmation link)
5. Complete the short onboarding questionnaire

### 2. Get Your SMTP Credentials

1. Log in to your Brevo dashboard
2. Click on your **profile icon** (top right) → **SMTP & API**
   - Or navigate directly to: **Settings** → **SMTP & API** → **SMTP**
3. You'll see your SMTP settings:
   - **SMTP Server**: `smtp-relay.brevo.com`
   - **Port**: `587` (recommended) or `465` (SSL)
   - **Login**: Your Brevo account email
4. Click **"Generate a new SMTP key"**
5. Give it a name (e.g., "Inventory Manager")
6. **Copy the SMTP key** — this is your password. Save it securely!

> ⚠️ **Important**: The SMTP key is only shown once. Copy it immediately!

### 3. Verify Your Sender Email

1. Go to **Settings** → **Senders, Domains & Dedicated IPs** → **Senders**
2. Click **"Add a Sender"**
3. Enter:
   - **From Name**: `Inventory Manager` (or your business name)
   - **From Email**: Your email address (e.g., `shop@yourdomain.com` or your personal email)
4. Verify the sender email (check inbox for verification link)

> 💡 **Tip**: You can use your existing email address as the sender. Brevo just needs to verify you own it.

### 4. Configure the Agent

Add the SMTP credentials to your `config/business.yaml`:

```yaml
channels:
  email:
    enabled: true
    smtp_host: "smtp-relay.brevo.com"
    smtp_port: 587
    smtp_user: "your-brevo-login@email.com"   # Your Brevo account email
    smtp_pass: "xsmtpsib-xxxxxxxxxxxx"          # The SMTP key you generated
    from_name: "Inventory Manager"
    from_email: "your-verified@email.com"       # Must be verified in Brevo
    owner_email: "owner@email.com"              # Where reports go
```

Or use environment variables in your `.env` file:

```env
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp-relay.brevo.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-brevo-login@email.com
EMAIL_SMTP_PASS=xsmtpsib-xxxxxxxxxxxx
EMAIL_FROM_NAME=Inventory Manager
EMAIL_FROM_EMAIL=your-verified@email.com
EMAIL_OWNER_EMAIL=owner@email.com
```

### 5. Test It

Restart the agent. On startup, you should see:

```
✅ Email channel connected via smtp-relay.brevo.com:587
```

If you see an error, double-check:
- SMTP key is correct (not your Brevo password — the generated SMTP key)
- Sender email is verified in Brevo
- Port 587 is not blocked by your network/firewall

## What Gets Emailed?

| Report | Frequency | Trigger |
|--------|-----------|---------|
| **Daily Summary** | Every day at configured time (default 8 PM) | Automatic (cron) |
| **Low Stock Alert** | Every 6 hours (if items are low) | Automatic (cron) |
| **Weekly Report** | When requested by owner | Manual (via chat) |

## Free Tier Limits

- **300 emails/day** on the free plan
- With daily summaries + low stock checks, you'll use ~5-10 emails/day max
- More than enough for a single business

## Troubleshooting

### "Email connection failed"
- Verify your SMTP key (not your Brevo account password)
- Check if port 587 is accessible from your server
- Try port 465 with `smtp_port: 465`

### "Email not configured — skipping notification"
- Make sure `enabled: true` is set in your config
- All required fields must be filled (smtp_user, smtp_pass, from_email, owner_email)

### Emails going to spam
- Verify your sender domain in Brevo (Settings → Domains)
- Use a custom domain email instead of Gmail/Yahoo as sender
- Brevo's free tier has decent deliverability, but domain verification helps

## Alternative SMTP Providers

If Brevo doesn't work for you, any SMTP provider works. Just change the host/port:

| Provider | Host | Port | Free Tier |
|----------|------|------|-----------|
| Brevo | smtp-relay.brevo.com | 587 | 300/day |
| Mailgun | smtp.mailgun.org | 587 | 100/day (trial) |
| SendGrid | smtp.sendgrid.net | 587 | 100/day |
| Gmail | smtp.gmail.com | 587 | 500/day (app password) |

---

*Need help? Open an issue on the GitHub repo or ask the agent: "How do I set up email?"*
