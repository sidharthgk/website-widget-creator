# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server (also serves the `/api/fetch-site` proxy via in-process middleware in `vite.config.ts`).
- `npm run build` — `tsc -b && vite build`. TypeScript project references compile first; build fails on type errors.
- `npm run lint` — ESLint (flat config in `eslint.config.js`, typescript-eslint + react-hooks + react-refresh).
- `npm run preview` — preview the built `dist/` locally. Note: this does NOT run the proxy; the proxy only exists in dev middleware or as the Vercel serverless function.

No test framework is configured.

## Architecture

Single-page React 19 + TS app (Vite 7) whose purpose is to load an arbitrary third-party website inside an iframe and inject a user-supplied `<script>` tag (a "widget") into the host page so it runs alongside the framed site.

Two screens, controlled by local state in `src/App.tsx`:
1. **Input** — collects a site URL and a widget script URL (or full `<script src="...">` tag, parsed via regex in `parseScriptInput`). On submit, both are pushed into the query string (`?site=&script=`) via `history.replaceState` so the preview is shareable/bookmarkable. App reads those params on initial load and skips straight to preview.
Optional URL params `up` / `down` / `left` / `right` (pixels) nudge the injected widget from wherever it places itself — see "Widget position offset" below.

2. **Preview** — full-screen iframe whose `src` points at `/api/fetch-site?url=<encoded>`. The widget script is injected into the **outer** document (not the iframe) by a `useEffect` that appends a `<script>` to `document.body` and removes it on unmount.

### The proxy is the core trick

Many sites set `X-Frame-Options` / CSP `frame-ancestors`, which blocks them from being framed. The proxy at `/api/fetch-site` works around this by fetching the target server-side and stripping framing-blocking headers before returning the response to the browser. Two implementations of the **same logic** exist and must be kept in sync:

- `api/fetch-site.ts` — Vercel serverless function (production). Uses `@vercel/node` types.
- `vite.config.ts` `proxy-middleware` plugin — dev-mode equivalent using raw Node `IncomingMessage`/`ServerResponse`.

Both do the same thing — when changing proxy behavior, edit **both files**, lockstep:

**Request hardening:**
- Use `undici` `fetch` with `Agent({ allowH2: true })` (HTTP/2 — many WAFs flag HTTP/1.1).
- `Accept-Encoding: identity` (Node's `fetch` auto-decompresses; forwarding upstream `content-encoding` would cause `ERR_CONTENT_DECODING_FAILED`).
- Full Chrome client-hint headers (`sec-ch-ua*`, `sec-fetch-*`, `upgrade-insecure-requests`).
- Synthetic `Referer: <targetOrigin>/`.
- Forward client `Cookie` upstream so site-issued challenge cookies survive.

**Response sanitization:**
- Strip `x-frame-options`, all CSP variants, COOP, COEP, `content-encoding`, `transfer-encoding`. Set `x-frame-options: ALLOWALL`.
- Rewrite `Set-Cookie`: drop `Domain=`, force `SameSite=None; Secure` so browser sends cookies back through proxy.
- For HTML responses:
  - Detect block pages (Cloudflare/PerimeterX/Datadome signatures) and replace with a `<script>parent.postMessage({wwc:'blocked',reason})</script>` stub that `PreviewScreen` listens for to flip its error state.
  - Strip `<meta http-equiv="content-security-policy|x-frame-options|refresh">` (CSP can also live in `<meta>`).
  - Strip `integrity=` SRI attrs (rewritten URLs break SRI).
  - Inject `<base href="targetOrigin/">` and the anti-frame-buster `<script>` (overrides `window.top`/`parent`/`self`/`document.domain`) as first children of `<head>`.
  - Rewrite same-origin `<a href>`, `<form action>`, `<iframe src>` → `/api/fetch-site?url=...`. Skip `#`/`javascript:`/`mailto:`/`tel:`/`data:`.
  - Rewrite `<a target="_top">` → `target="_self"`.
- Non-HTML (CSS/JS/images) piped through as buffer.

**Known limits (won't fix free):** Cloudflare Bot Management Pro / Turnstile / JS-challenge sites still fail because of TLS JA3 fingerprint and datacenter IP reputation — these need real browser (extension) or paid residential-IP cloud browser. Block-detection just gives a clean error there.

### Widget position offset

`?up=&down=&left=&right=` (pixels, any combination) shift the widget after it mounts. `parseShift` collapses them into `dx`/`dy` (positive = right/down); `trackWidgetShift` then MutationObserver-watches `document.body` for whatever the widget script mounts and tags each `position: fixed` element with a `wwc-shift-*` class.

The shift is applied as **margins**, not by rewriting the widget's own `bottom`/`right`: margins are idempotent (re-applying can't drift), survive the widget restyling itself, and don't clobber transforms it animates with. Bottom-anchored elements get `margin-bottom`, top-anchored get `margin-top`, likewise left/right.

Skipped: anything inside `#root` (our own UI) and near-fullscreen elements (overlays/backdrops). Elements that mount hidden or zero-sized are caught by rescans at 300ms/1s/3s. Params are preserved across a relaunch from the input screen; there is no UI for them, and the extension flow ignores them.

### Optional companion extension

`extension/` holds an MV3 Chrome extension (plain JS, no build step) that bypasses the proxy entirely for hard-blocked sites. When installed:

- `content-app.js` runs only on widget-creator origins (localhost, `*.vercel.app`). On load it `window.postMessage`s `{wwc:'ext-ready'}` so the page knows it's installed.
- App detects `ext-ready`, sets `extInstalled=true`, shows green badge, and changes Launch behavior: `postMessage({wwc:'launch',site,script})` → content-app forwards via `chrome.runtime.sendMessage` to background → background calls `chrome.tabs.create({url:site})` and stashes the script in `chrome.storage.session` keyed by the new tab id.
- `content-target.js` runs on `<all_urls>` at `document_idle`; asks background for any pending injection for its tab, appends `<script src=...>` to the body, clears the entry. One-shot per Launch.

When extension is absent, app falls back to the iframe-proxy flow (existing behavior). Install instructions for "load unpacked" are in the input screen `<details>` UI.

`content-app.js` matches list (`http://localhost*`, `https://*.vercel.app/*`) must be expanded in `manifest.json` for any other deployed origin.

### Styling

All styles live as inline `React.CSSProperties` objects in `src/App.tsx` (`styles` map at the bottom). One small `<style>` tag is appended to `document.head` at module load for `@keyframes spin` and `:focus`/`:hover` pseudo-classes that inline styles can't express. No CSS framework.
