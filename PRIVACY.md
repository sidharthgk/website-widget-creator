# Privacy Policy — Widget Preview Injector

Last updated: 2026-05-07

## What this extension does

Widget Preview Injector lets you load any website in a new browser tab and inject a JavaScript "widget" script you specify, so you can preview how that widget will look and behave on that website.

## What data the extension collects

**None.** The extension does not collect, transmit, sell, or share any personal data, browsing history, or analytics.

## What data the extension stores

The extension uses Chrome's local `chrome.storage.local` API to remember:

- The last website URL you typed into the popup.
- The last widget script URL you typed into the popup.
- Whether the "Block existing widgets" toggle was on or off.

This data lives only in your browser. It is never transmitted off your device. Uninstalling the extension deletes it.

## What permissions the extension uses and why

- **storage** — to save the values listed above.
- **tabs** — to open the new preview tab and watch for it to finish loading.
- **scripting** — to inject your widget script into the new tab.
- **declarativeNetRequest** — to remove `Content-Security-Policy` and `X-Frame-Options` response headers from the launched tab (so your widget can load), and optionally to block requests to known chat-widget vendor domains on the launched tab.
- **host_permissions: `<all_urls>`** — because you choose which website to preview the widget on, the extension needs permission to read and modify any URL you enter. The extension only acts on tabs you explicitly launch via the popup.

## Third-party services

The extension does not use any third-party services, analytics, or tracking. Your widget script, when injected, may itself contact its vendor's servers — that is governed by your widget vendor's privacy policy, not this extension's.

## Changes to this policy

Updates will be posted to this page and the extension's GitHub repository.

## Contact

Source code and issues: https://github.com/sidharthgk/website-widget-creator
