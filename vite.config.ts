import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'proxy-middleware',
      configureServer(server) {
        server.middlewares.use(
          '/api/fetch-site',
          async (req: IncomingMessage, res: ServerResponse) => {
            const rawUrl = new URL(req.url ?? '', 'http://localhost').searchParams.get('url')
            if (!rawUrl) {
              res.writeHead(400, { 'Content-Type': 'text/plain' })
              res.end('Missing ?url= parameter')
              return
            }

            try {
              const target = new URL(rawUrl)

              // Fetch with browser-like headers — explicitly NO Accept-Encoding
              // because Node's fetch() auto-decompresses the body, so if we
              // forward the upstream content-encoding header the browser will
              // try to decompress already-decoded bytes → ERR_CONTENT_DECODING_FAILED
              const upstream = await fetch(target.toString(), {
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                  Accept:
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.5',
                  'Accept-Encoding': 'identity', // ask for uncompressed content
                },
                redirect: 'follow',
              })

              // Copy status and headers — stripping anything that blocks framing
              // or relates to content encoding (Node already decoded the body)
              const BLOCKED_HEADERS = new Set([
                'x-frame-options',
                'content-security-policy',
                'content-security-policy-report-only',
                'cross-origin-opener-policy',
                'cross-origin-embedder-policy',
                'content-encoding',   // body is already decoded by Node fetch
                'transfer-encoding',  // chunked encoding doesn't apply to our response
              ])

              const responseHeaders: Record<string, string> = {}
              upstream.headers.forEach((value, key) => {
                if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
                  responseHeaders[key] = value
                }
              })

              // Allow framing from our own origin
              responseHeaders['x-frame-options'] = 'ALLOWALL'
              responseHeaders['access-control-allow-origin'] = '*'

              // Rewrite absolute URLs in HTML so relative resources still load from the target origin
              const contentType = upstream.headers.get('content-type') ?? ''
              if (contentType.includes('text/html')) {
                let html = await upstream.text()
                const targetOrigin = `${target.protocol}//${target.host}`
                const proxyBase = `http://${req.headers.host ?? 'localhost:5174'}`

                // Inject a <base> tag so relative resource paths (CSS/JS/images)
                // resolve correctly against the real origin
                html = html.replace(
                  /(<head[^>]*>)/i,
                  `$1\n<base href="${targetOrigin}/" />`
                )

                // Rewrite all same-origin <a href> links to route through our proxy
                // so that clicking links inside the iframe doesn't bypass the proxy
                html = html.replace(
                  /(<a\b[^>]*?\shref=)(["'])([^"']*)(["'])/gi,
                  (_match, prefix, q1, href, q2) => {
                    // Leave anchors, js, mailto, tel as-is
                    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) {
                      return _match
                    }
                    try {
                      const abs = new URL(href, targetOrigin + target.pathname)
                      if (abs.origin === targetOrigin) {
                        return `${prefix}${q1}${proxyBase}/fetch-site?url=${encodeURIComponent(abs.toString())}${q2}`
                      }
                    } catch {
                      // malformed href — leave untouched
                    }
                    return _match
                  }
                )

                responseHeaders['content-type'] = 'text/html; charset=utf-8'
                delete responseHeaders['content-length']
                res.writeHead(upstream.status, responseHeaders)
                res.end(html)
              } else {
                // For non-HTML (CSS, JS, images etc.) just pipe through
                const buffer = Buffer.from(await upstream.arrayBuffer())
                responseHeaders['content-length'] = String(buffer.byteLength)
                res.writeHead(upstream.status, responseHeaders)
                res.end(buffer)
              }
            } catch (err) {
              console.error('[proxy-middleware] error:', err)
              res.writeHead(502, { 'Content-Type': 'text/plain' })
              res.end(`Proxy error: ${(err as Error).message}`)
            }
          }
        )
      },
    },
  ],
})
