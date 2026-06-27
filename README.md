# MyFinance — Personal NZ Finance Tracker

A mobile-first PWA for tracking Westpac transactions, P&L, mortgage, net worth and investments. Data syncs privately to your own Google Drive.

---

## Features

- Import Westpac CSV exports (everyday + credit card)
- Auto-categorise transactions with keyword rules
- Monthly P&L statement
- Cash flow charts (last 6 months)
- Mortgage calculator (interest/principal split, payoff timeline)
- Net worth tracker (property, savings, investments)
- Investment portfolio (shares, ETFs, KiwiSaver)
- Google Drive sync — your data, your account, no server
- Installable PWA — add to home screen on iPhone or Android

---

## Quick start (no Drive, local only)

1. Open `index.html` in any browser
2. Tap "Use without Google Drive"
3. Go to Settings → "Load sample data" to explore
4. Import your Westpac CSVs when ready

Data saves to your browser's local storage. Works offline.

---

## Host on GitHub Pages (free, always-on)

1. Create a free account at github.com
2. New repository → name it `myfinance` (or anything)
3. Upload all files in this folder to the repo
4. Go to Settings → Pages → Source: "Deploy from branch" → main → / (root)
5. Your app is live at `https://yourusername.github.io/myfinance`

Takes about 5 minutes. Free forever.

---

## Set up Google Drive sync

This lets your data sync across all your devices — phone, laptop, tablet.

### Step 1 — Create a Google Cloud project (free)

1. Go to https://console.cloud.google.com
2. Click "New Project" → name it "MyFinance" → Create
3. Go to "APIs & Services" → "Enable APIs"
4. Search "Google Drive API" → Enable it

### Step 2 — Create OAuth credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the consent screen first:
   - User type: External
   - App name: MyFinance
   - Add your email as a test user
   - Scopes: add `https://www.googleapis.com/auth/drive.file`
4. Back to Create OAuth client ID:
   - Application type: Web application
   - Name: MyFinance
   - Authorised JavaScript origins: add your GitHub Pages URL (e.g. `https://yourusername.github.io`)
   - Also add `http://localhost:3000` for local testing
5. Click Create → copy the **Client ID**

### Step 3 — Add your Client ID to the app

Open `index.html` and find this line near the top of the `<script>` section:

```javascript
const GDRIVE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
```

Replace `YOUR_GOOGLE_CLIENT_ID` with your actual Client ID (looks like `1234567890-abc123.apps.googleusercontent.com`).

Save and re-upload to GitHub Pages.

### Step 4 — Use it

Open the app → "Continue with Google" → approve access → done.

Your data saves as `myfinance-data.json` in your Google Drive. Only your account can access it. Open the app on any device and sign in with the same Google account to sync.

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
└── README.md
```

---

## Privacy

- No server, no database, no analytics
- Transactions never leave your device (except to your own Google Drive if you connect it)
- Google Drive access is scoped to `drive.file` — the app can only see files it created, not your entire Drive
- You can disconnect Drive at any time in Settings

---

## Add app icons

The app needs icon files at:
- `icons/icon-192.png` (192×192px)
- `icons/icon-512.png` (512×512px)

You can create simple ones at https://favicon.io or use any image editor. A green background with a $ symbol works well.
