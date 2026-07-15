# MyFinance — Personal NZ Finance Tracker

A mobile-first PWA for tracking Westpac transactions, P&L, mortgage, net worth and investments. Data syncs privately to your account via Supabase.

---

## Features

- Import Westpac CSV exports (everyday + credit card)
- Auto-categorise transactions with keyword rules
- Monthly P&L statement
- Cash flow charts (last 6 months)
- Mortgage calculator (interest/principal split, payoff timeline)
- Net worth tracker (property, savings, investments)
- Investment portfolio (shares, ETFs, KiwiSaver)
- Account sync via Supabase — sign in, your household's data follows you across devices
- Installable PWA — add to home screen on iPhone or Android

---

## Quick start (no account, local only)

1. Open `index.html` in any browser
2. Tap "Use without an account"
3. Go to Settings → "Load sample data" to explore
4. Import your Westpac CSVs when ready

Data saves to your browser's local storage. Works offline.

---

## Host on GitHub Pages (free, always-on)

1. Create a free account at github.com
2. New repository → name it `myfinance` (or anything)
3. Upload the app files (`index.html`, `manifest.json`, `sw.js`, `icons/`, `.nojekyll`) to the repo
4. Go to Settings → Pages → Source: "Deploy from branch" → main → / (root)
5. Your app is live at `https://yourusername.github.io/myfinance`

Takes about 5 minutes. Free forever.

**Don't upload:** `myfinance-data.json`, Westpac CSV exports, or the budget `.xlsm` file. These contain real transaction data and aren't used by the app — they're local working files only. See `.gitignore`.

---

## Account sync (Supabase)

Signing in creates a "household" — your data is tied to your account, not the device. Sign in with the same account on another device (phone, laptop, tablet) to sync automatically.

- Households can invite additional members (e.g. a partner) to share the same data
- Billing (free/pro plans) is handled via Stripe, tied to the household
- The Supabase URL and anon key in `index.html` are not secrets — they're meant to be public in client-side apps. Access control is enforced server-side by Postgres Row Level Security (RLS) policies, scoped per household

---

## Install as an app (PWA)

### iPhone / iPad
1. Open the app URL in Safari
2. Tap the Share button (box with arrow)
3. Scroll down → "Add to Home Screen"
4. Tap Add

### Android
1. Open the app URL in Chrome
2. Tap the three-dot menu
3. "Add to Home Screen" or "Install app"

The app will appear on your home screen and open full-screen, just like a native app.

---

## Westpac CSV format

Download from Westpac Online Banking:
- Log in → Accounts → select account → "Export transactions" → CSV
- Do this for your Everyday account and Credit Card separately
- Import both in the app under Settings → Import

The app expects the standard Westpac CSV format:
```
Date,Description,Amount
01/06/2025,Countdown Supermarket,-89.50
03/06/2025,Salary - Employer,5400.00
```

---

## File structure

```
myfinance/
├── index.html      ← The entire app
├── manifest.json   ← PWA manifest (install as app)
├── sw.js           ← Service worker (offline support)
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
├── supabase/       ← Backend (migrations, Edge Functions) — deployed via Supabase, not GitHub Pages
└── README.md
```

---

## Privacy

- Local-only mode: no server, no account needed — data stays in your browser's storage
- Account mode: data is stored in Supabase (Postgres), scoped to your household via Row Level Security — other users cannot query your rows even with the public anon key
- Secrets (Stripe keys, Supabase service-role key) live server-side only, in Supabase Edge Function environment variables — never in client code
- You can use the app fully offline and locally without ever creating an account

---

## Add app icons

The app needs icon files at:
- `icons/icon-192.png` (192×192px)
- `icons/icon-512.png` (512×512px)

You can create simple ones at https://favicon.io or use any image editor. A green background with a $ symbol works well.
