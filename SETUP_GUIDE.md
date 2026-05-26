# 🧵 Stitch & Smile Studio — Complete Setup Guide

Welcome! This guide walks you through getting your shop live on the internet, step by step.
No coding experience needed — just follow each step in order.

---

## What You'll Need to Create (All Free)

| Account | Why | Sign Up |
|---|---|---|
| **GitHub** | Stores your website code | github.com |
| **Railway** | Hosts your website online | railway.app |
| **Stripe** | Takes payments from customers | stripe.com |
| **SendGrid** | Sends download emails to customers | sendgrid.com |

---

## STEP 1 — Install Node.js on Your Computer

Node.js lets you run the website locally to test it before going live.

1. Go to **nodejs.org**
2. Click the big green **"LTS"** button to download
3. Run the installer — click Next through everything
4. When done, open **Terminal** (Mac) or **Command Prompt** (Windows) and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0` — that means it worked!

---

## STEP 2 — Set Up Your Stripe Account

Stripe is how customers pay you. It's free to set up — you only pay a small fee (2.9% + 30¢) when you make a sale.

1. Go to **stripe.com** and click **"Start now"** — sign up for free
2. After signing in, click **Developers** in the top menu, then **API keys**
3. You'll see two keys — copy both:
   - **Publishable key** — starts with `pk_test_`
   - **Secret key** — starts with `sk_test_`
4. Keep these somewhere safe (like a notes app) — you'll need them in Step 5

> **Note:** When you're ready to accept REAL money (not just test payments), go back to Stripe and toggle from "Test" to "Live" to get your live keys. The shop works exactly the same — just swap the keys.

---

## STEP 3 — Set Up Your SendGrid Account

SendGrid sends the download email to customers after they purchase.

1. Go to **sendgrid.com** and click **"Start for Free"**
2. Sign up and verify your email
3. When asked **"How do you want to send email?"** choose **"SMTP Relay"** or **"Web API"** — either is fine
4. Go to **Settings → API Keys → Create API Key**
5. Name it "Stitch and Smile Studio", choose **Full Access**, and click **Create & View**
6. **Copy the key** (starts with `SG.`) — you can only see it once!
7. Next, verify your sender email:
   - Go to **Settings → Sender Authentication → Verify a Single Sender**
   - Enter your email address (the one you want to send FROM)
   - SendGrid will email you — click the confirmation link

---

## STEP 4 — Set Up GitHub (Code Storage)

GitHub stores your website files so Railway can deploy them.

1. Go to **github.com** and create a free account
2. Click **"New"** (the green button) to create a new repository
3. Name it `stitch-and-smile-studio`
4. Leave everything else as default, click **Create repository**
5. Follow the instructions to upload your files. The easiest way:
   - Download **GitHub Desktop** from **desktop.github.com**
   - Sign in, clone your new repository to your computer
   - Copy all the files from the `stitch-and-smile` folder into the repository folder
   - In GitHub Desktop, type a commit message like "Initial upload" and click **Commit to main**
   - Click **Push origin**

---

## STEP 5 — Create Your .env File

The `.env` file holds your secret keys. **Never share this file with anyone.**

1. Open the `stitch-and-smile` folder on your computer
2. Find the file called `.env.example`
3. Make a copy of it and rename the copy to exactly `.env` (no .example)
4. Open `.env` in any text editor (Notepad works fine) and fill in your values:

```
PORT=3000
SITE_URL=https://your-app.railway.app    ← fill in after Step 6

JWT_SECRET=    ← type any long random string, like: xK9mP2qR7nL4wT8vY1cD6bF3hJ0eA5sU
STRIPE_SECRET_KEY=sk_test_xxxx           ← your Stripe secret key from Step 2
STRIPE_PUBLISHABLE_KEY=pk_test_xxxx      ← your Stripe publishable key from Step 2
STRIPE_WEBHOOK_SECRET=                   ← fill in after Step 7

SENDGRID_API_KEY=SG.xxxx                 ← your SendGrid API key from Step 3
SHOP_EMAIL=you@youremail.com             ← the email you verified in SendGrid

SHOP_NAME=Stitch & Smile Studio
DRIVE_SHIP_COST=4.99
```

5. Save the file

> **Important:** The `.env` file is in `.gitignore` so it will NOT be uploaded to GitHub — your secrets stay private on your computer and on Railway.

---

## STEP 6 — Deploy to Railway

Railway hosts your website on the internet for free.

1. Go to **railway.app** and sign up with your GitHub account
2. Click **"New Project"** → **"Deploy from GitHub Repo"**
3. Select your `stitch-and-smile-studio` repository
4. Railway will automatically detect it's a Node.js app and start building
5. When it's running, click your project, then **Settings → Domains → Generate Domain**
6. You'll get a URL like `https://stitch-and-smile-studio-production.up.railway.app` — that's your shop!

### Add Your Environment Variables to Railway:
1. In Railway, click your project → **Variables** tab
2. Click **"Add Variable"** for each line in your `.env` file
3. Copy/paste each key and value
4. For `SITE_URL`, use the Railway URL you got above
5. Railway will restart automatically

### Add Your Stripe Publishable Key to the Frontend:
1. Open `stitch-and-smile/public/index.html` in a text editor
2. Find this line near the top of the `<script>` section:
   ```javascript
   const STRIPE_PUBLISHABLE_KEY = window.STRIPE_PK || 'pk_test_placeholder';
   ```
3. Replace `pk_test_placeholder` with your actual publishable key:
   ```javascript
   const STRIPE_PUBLISHABLE_KEY = window.STRIPE_PK || 'pk_test_YOUR_REAL_KEY_HERE';
   ```
4. Save the file, commit it to GitHub (via GitHub Desktop), and Railway will redeploy automatically

---

## STEP 7 — Set Up the Stripe Webhook

Webhooks tell your server when a payment succeeds, as a backup safety net.

1. Go to your **Stripe Dashboard → Developers → Webhooks**
2. Click **"Add endpoint"**
3. For the URL, enter: `https://your-railway-url.railway.app/api/webhook`
4. For events, click **"+ Select events"** and choose: `payment_intent.succeeded`
5. Click **Add endpoint**
6. Click your new webhook, then **"Reveal"** next to **Signing secret**
7. Copy that value (starts with `whsec_`)
8. Add it to Railway's Variables as `STRIPE_WEBHOOK_SECRET`

---

## STEP 8 — Test Everything!

1. Visit your Railway URL in a browser — you should see your shop!
2. Create a test customer account
3. Browse the sample designs
4. Add one to cart and checkout using Stripe's test card:
   - Card number: **4242 4242 4242 4242**
   - Expiry: any future date (like 12/34)
   - CVC: any 3 digits (like 123)
5. Check that a confirmation email arrives
6. Log in to your account and test the download button

---

## STEP 9 — Log In as Admin & Add Your Real Designs

Your default admin account is:
- **Email:** `admin@stitchandsmile.com`
- **Password:** `Admin1!stitch`

**Change the password right away!** Go to My Account → Profile after logging in.

As admin, you'll see an **⚙️ Admin** button in the navigation. Click it to:
- **Add categories** — just type a name and pick an emoji, click Add
- **Add designs** — fill in the details and upload your actual design file (ZIP, PES, DST, etc.)
- **Set featured** — mark your best designs to appear on the homepage

---

## How the Shop Works (Day to Day)

**When a customer buys a download:**
1. They pay via Stripe on your site
2. Your server confirms the payment with Stripe
3. SendGrid automatically emails them a link to download their file
4. They can also log in and download from their account page anytime

**When a customer orders a USB Drive:**
1. They pay the design price + your shipping fee
2. You get notified (you'll see it in your Stripe dashboard)
3. Copy their shipping address from your order list
4. Mail them a USB drive with the files + a printed color preview

---

## Going Live (Accepting Real Money)

When you're ready to start selling for real:

1. In Stripe, click the **"Activate your account"** button and complete their verification (they need your name, address, and bank account to send you money)
2. Toggle from **Test mode** to **Live mode** in Stripe
3. Get your **live** Publishable Key and Secret Key
4. Update both in Railway's Variables (and the frontend HTML)
5. Set up a new webhook in Stripe for your live keys
6. You're live! 🎉

---

## Need Help?

If something isn't working, here's what to check:
- **Site won't load:** Check Railway's deployment logs for errors
- **Payments failing:** Make sure you're using the right test/live keys
- **Emails not sending:** Verify your sender email in SendGrid and check your spam folder
- **Files not downloading:** Make sure you uploaded the design file via the Admin panel (look for the 📎 indicator next to each design)

---

*Made with 💖 for Stitch & Smile Studio*
