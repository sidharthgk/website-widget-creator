import type { VercelRequest, VercelResponse } from '@vercel/node'

const BLOCKED_HEADERS = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'content-encoding',   // Node fetch already decoded the body
    'transfer-encoding',  // not applicable to our response
])

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url

    if (!rawUrl) {
        return res.status(400).send('Missing ?url= parameter')
    }

    let target: URL
    try {
        target = new URL(rawUrl)
    } catch {
        return res.status(400).send('Invalid URL')
    }

    try {
        const upstream = await fetch(target.toString(), {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                Accept:
                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'identity', // prevent double-decompression
            },
            redirect: 'follow',
        })

        // Forward headers, stripping anything that blocks framing
        upstream.headers.forEach((value, key) => {
            if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
                res.setHeader(key, value)
            }
        })
        res.setHeader('x-frame-options', 'ALLOWALL')
        res.setHeader('access-control-allow-origin', '*')

        const contentType = upstream.headers.get('content-type') ?? ''
        if (contentType.includes('text/html')) {
            let html = await upstream.text()
            const targetOrigin = `${target.protocol}//${target.host}`
            const proxyBase = `https://${req.headers.host ?? ''}`

            // Inject <base> so relative resources (CSS/JS/images) resolve correctly
            html = html.replace(
                /(<head[^>]*>)/i,
                `$1\n<base href="${targetOrigin}/" />`
            )

            // Rewrite same-origin <a href> links so navigation stays proxied
            html = html.replace(
                /(<a\b[^>]*?\shref=)(["'])([^"']*)(["'])/gi,
                (_match, prefix, q1, href, q2) => {
                    if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) {
                        return _match
                    }
                    try {
                        const abs = new URL(href, targetOrigin + target.pathname)
                        if (abs.origin === targetOrigin) {
                            return `${prefix}${q1}${proxyBase}/api/fetch-site?url=${encodeURIComponent(abs.toString())}${q2}`
                        }
                    } catch {
                        // malformed href — leave untouched
                    }
                    return _match
                }
            )

            res.setHeader('content-type', 'text/html; charset=utf-8')
            res.removeHeader('content-length')
            return res.status(upstream.status).send(html)
        } else {
            const buffer = Buffer.from(await upstream.arrayBuffer())
            return res.status(upstream.status).send(buffer)
        }
    } catch (err) {
        console.error('[fetch-site] error:', err)
        return res.status(502).send(`Proxy error: ${(err as Error).message}`)
    }
}
