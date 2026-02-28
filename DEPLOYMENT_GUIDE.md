# 🚀 BlockBot AI — Complete Setup & Deployment Guide
## From Zero to Running in ~10 Minutes (All Free)

---

## 📋 What You'll Set Up
1. Telegram Bot (BotFather)
2. Groq AI API (free)
3. Supabase Database (free)
4. GitHub Repository
5. Railway Deployment (free)
6. UptimeRobot Keep-Alive (free)

---

## STEP 1: Create Your Telegram Bot (2 min)

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name: e.g. `My Blockchain Bot`
4. Choose a username: e.g. `myblockchain_bot` (must end in "bot")
5. BotFather gives you a **token** like: `7234567890:AAHdqTcvCH1vGWJxfSeofSs0K38W4rd1`
6. **Copy and save this token** — you'll need it soon

---

## STEP 2: Get Groq API Key (1 min)

1. Go to **https://console.groq.com**
2. Sign up with Google (free)
3. Go to **API Keys** → **Create API Key**
4. Copy the key (starts with `gsk_...`)

---

## STEP 3: Set Up Supabase Database (3 min)

1. Go to **https://supabase.com**
2. Click **Start your project** → Sign up with GitHub
3. Click **New Project**
   - Name: `blockbot`
   - Password: create a strong password (save it)
   - Region: choose closest to you
4. Wait ~2 minutes for it to initialize
5. Go to **Project Settings** → **API**
6. Copy two things:
   - **Project URL** (looks like `https://xyzabc.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### Set Up Database Tables:
1. In Supabase, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open the `schema.sql` file from this project
4. Copy all the SQL and paste it into the editor
5. Click **Run**
6. You should see "Success" — your tables are created!

---

## STEP 4: Upload Code to GitHub (2 min)

1. Go to **https://github.com** → Sign up or log in
2. Click **New Repository**
   - Name: `blockbot-ai`
   - Set to **Private**
   - Click **Create Repository**
3. Upload your files:
   - Click **uploading an existing file**
   - Upload ALL the project files (drag and drop the whole folder)
   - Click **Commit changes**

> **On mobile:** Use the GitHub mobile app or Replit to push code. In Replit, connect your GitHub account and push from there.

---

## STEP 5: Deploy on Railway (2 min)

1. Go to **https://railway.app**
2. Click **Sign in with GitHub** (no credit card needed)
3. Click **New Project** → **Deploy from GitHub repo**
4. Select your `blockbot-ai` repository
5. Railway will detect it's a Node.js app automatically
6. Click on your deployment → go to **Variables** tab
7. Add these environment variables one by one:

```
TELEGRAM_BOT_TOKEN = your_token_from_step_1
GROQ_API_KEY = your_key_from_step_2
SUPABASE_URL = your_url_from_step_3
SUPABASE_ANON_KEY = your_anon_key_from_step_3
ENCRYPTION_KEY = any_random_32_character_string_here
```

> For ENCRYPTION_KEY, just type any random string like: `MyS3cr3tK3y2024BlockBotIsAwesome!`

8. Click **Deploy** — Railway builds and launches your bot!
9. Wait ~1 minute. Check **Logs** tab — you should see:
   ```
   ✅ BlockBot AI is running!
   📱 Go to Telegram and start chatting with your bot
   ```

---

## STEP 6: Keep Bot Alive 24/7 with UptimeRobot (1 min)

Railway free tier needs a ping to stay awake.

1. Go to your Railway project → **Settings** tab
2. Copy your **Public Domain URL** (looks like `blockbot-production.up.railway.app`)
3. Go to **https://uptimerobot.com** → Sign up free
4. Click **Add New Monitor**
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `BlockBot`
   - URL: paste your Railway URL
   - Monitoring Interval: **5 minutes**
5. Click **Create Monitor**

Your bot now stays awake forever! ✅

---

## ✅ Test Your Bot

Go to Telegram → search your bot username → click **Start**

Try these commands:
- `/start` — welcome message
- "Create an EVM wallet" — creates a wallet
- "Create 3 Solana wallets" — creates multiple
- "Show my wallets" — lists all wallets
- "Check gas prices" — live gas data
- "Add a custom chain" — then paste RPC details
- "Tell me a story" — AI generates a crypto story
- Paste any testnet announcement — bot extracts tasks!

---

## 🔄 Updating Your Bot

When you want to add features or fix something:

1. Edit your code in Replit
2. Push to GitHub
3. Railway **auto-deploys** every time you push — no manual steps!

---

## 💡 Tips

**If bot doesn't respond:** Check Railway logs for errors. Usually a missing environment variable.

**If database errors:** Make sure you ran the schema.sql in Supabase correctly.

**If AI isn't working:** Double-check your GROQ_API_KEY is correct and has no spaces.

**To add more chains:** Just tell the bot "Add a custom chain" and paste the RPC details — no code needed!

**To schedule tasks:** Paste a testnet announcement → bot extracts tasks → say "Save as [name] and run daily"

---

## 📊 Free Tier Limits

| Service | Free Limit | Should Last |
|---------|-----------|-------------|
| Railway | $5/month credit | Whole month for light bot |
| Supabase | 500MB database | Thousands of wallets |
| Groq | ~14,400 requests/day | More than enough |
| UptimeRobot | 50 monitors | Just need 1 |
| Telegram | Unlimited | Always free |

---

## 🆘 Common Errors

**"Cannot read property of undefined"**
→ Check your .env variables are all set correctly in Railway

**"Invalid token"**
→ Your TELEGRAM_BOT_TOKEN is wrong. Copy it again from BotFather

**"relation does not exist"**
→ Run the schema.sql in Supabase SQL editor

**Bot responds but tasks fail**
→ Normal for some operations that need browser automation (coming in V2!)

---

## 🗺️ What's Coming in V2
- Browser automation (click dapp buttons automatically)
- Mini App dashboard in Telegram
- Multi-wallet parallel execution  
- Social media / Discord monitoring
- NFT minting, token swaps
- Captcha handling
- Wallet health scoring

---

*Built with ❤️ using Node.js, Telegraf, Groq, Ethers.js, Supabase*
