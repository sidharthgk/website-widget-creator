# Website Widget Creator

Preview any third-party widget on any website without permission from the site owner.

Two parts:

1. **Web app** (this repo, deployed on Vercel) — paste a website URL + your widget script URL, see them together in an iframe via a server-side proxy. Works on most sites that use only header-based blocks (XFO/CSP).
2. **Chrome extension** (`extension/` folder) — for sites the proxy can't reach (Cloudflare bot detection, etc.). Opens the real site in a new tab, strips CSP, injects your widget. Works on every site because it uses your real browser.

## Install the Chrome extension (free, takes 30 seconds)

1. **Download** the latest `widget-preview-extension.zip` from the [Releases](https://github.com/sidharthgk/website-widget-creator/releases) page.
2. **Unzip** anywhere (e.g. Desktop).
3. Open `chrome://extensions` in Chrome (or Edge).
4. Toggle **Developer mode** ON (top-right).
5. Click **Load unpacked** and pick the unzipped `extension/` folder.
6. Pin the extension (puzzle icon → pushpin next to "Widget Preview Injector").

To use:
1. Click the **W** icon in the toolbar.
2. Site URL auto-fills with the current tab. Paste your widget script URL.
3. Click **Launch Preview**.
4. New tab opens with the site + your widget injected.

The "Block existing widgets on the site" toggle hides chat widgets from 50+ known vendors (Intercom, Drift, Tawk, Zendesk, etc.) so yours is the only one visible.

## Run the web app

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Deploy the web app

Push to GitHub, connect to Vercel. The proxy at `api/fetch-site.ts` runs as a Vercel serverless function automatically.

## How it works

See `CLAUDE.md` for architecture notes.
