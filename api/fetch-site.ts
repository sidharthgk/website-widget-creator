import type { VercelRequest, VercelResponse } from '@vercel/node'
import { fetch as undiciFetch, Agent } from 'undici'

const BLOCKED_HEADERS = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'content-encoding',
    'transfer-encoding',
    'set-cookie', // handled separately so we can rewrite Domain
])

const h2Agent = new Agent({ allowH2: true })

const ANTI_FRAME_BUSTER = `<script>(function(){try{Object.defineProperty(window,'top',{get:function(){return window}});Object.defineProperty(window,'parent',{get:function(){return window}});Object.defineProperty(window,'self',{get:function(){return window}});Object.defineProperty(document,'domain',{get:function(){return location.hostname},set:function(){}});}catch(e){}})();</script>`

function detectBlock(html: string): string | null {
    const lower = html.toLowerCase()
    if (lower.includes('cf-error-code') || lower.includes('cf-wrapper') || lower.includes('sorry, you have been blocked') || lower.includes('attention required! | cloudflare')) {
        return 'Cloudflare bot challenge — site requires real browser'
    }
    if (lower.includes('please verify you are a human') || lower.includes('_pxhd')) {
        return 'PerimeterX bot challenge'
    }
    if (lower.includes('geo.captcha-delivery.com') || lower.includes('dd_cookie_test')) {
        return 'Datadome bot challenge'
    }
    if (/<title>[^<]*(access denied|403 forbidden|bot detected)[^<]*<\/title>/i.test(html)) {
        return 'Site returned access-denied page'
    }
    return null
}

function buildBlockedHtml(reason: string, targetUrl: string): string {
    const safeReason = reason.replace(/</g, '&lt;')
    const safeUrl = targetUrl.replace(/"/g, '&quot;')
    return `<!doctype html><html><head><meta charset="utf-8"><title>Site blocked</title></head><body><script>parent.postMessage({wwc:'blocked',reason:${JSON.stringify(reason)},url:${JSON.stringify(targetUrl)}},'*');</script><div style="font:14px system-ui;color:#888;padding:40px;text-align:center;">Site blocked: ${safeReason}. <a href="${safeUrl}" target="_blank" rel="noopener">Open in new tab</a></div></body></html>`
}

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

    const targetOrigin = `${target.protocol}//${target.host}`
    const proxyBase = `https://${req.headers.host ?? ''}`

    const upstreamHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'sec-ch-ua': '"Chromium";v="121", "Not(A:Brand";v="24", "Google Chrome";v="121"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        Referer: `${targetOrigin}/`,
    }
    const cookieHeader = req.headers.cookie
    if (cookieHeader) upstreamHeaders.cookie = cookieHeader

    try {
        const upstream = await undiciFetch(target.toString(), {
            headers: upstreamHeaders,
            redirect: 'follow',
            dispatcher: h2Agent,
        })

        upstream.headers.forEach((value, key) => {
            if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
                res.setHeader(key, value)
            }
        })
        res.setHeader('x-frame-options', 'ALLOWALL')
        res.setHeader('access-control-allow-origin', '*')

        const setCookie = upstream.headers.getSetCookie?.() ?? []
        if (setCookie.length) {
            const rewritten = setCookie.map(c => c
                .replace(/;\s*Domain=[^;]+/i, '')
                .replace(/;\s*SameSite=[^;]+/i, '; SameSite=None')
                .replace(/;\s*Secure/i, '; Secure')
            )
            res.setHeader('set-cookie', rewritten)
        }

        const contentType = upstream.headers.get('content-type') ?? ''
        if (contentType.includes('text/html')) {
            let html = await upstream.text()

            const blockReason = detectBlock(html)
            if (blockReason) {
                res.setHeader('content-type', 'text/html; charset=utf-8')
                res.removeHeader('content-length')
                return res.status(200).send(buildBlockedHtml(blockReason, target.toString()))
            }

            html = html.replace(/<meta\b[^>]*http-equiv=["']?(content-security-policy|x-frame-options|refresh)["']?[^>]*>/gi, '')
            html = html.replace(/\sintegrity=(["'])[^"']*\1/gi, '')

            // no-referrer: subresources (images/CSS/fonts) load directly from the
            // target origin via <base>, so the browser would attach this proxy's
            // origin as Referer — tripping Cloudflare/hotlink protection (403 ->
            // ERR_BLOCKED_BY_ORB). Sending no Referer passes those checks.
            html = html.replace(/(<head[^>]*>)/i, `$1\n<meta name="referrer" content="no-referrer" />\n<base href="${targetOrigin}/" />\n${ANTI_FRAME_BUSTER}`)

            const rewriteSameOrigin = (input: string, attrPattern: RegExp): string =>
                input.replace(attrPattern, (match, prefix, q1, href, q2) => {
                    if (!href || /^(#|javascript:|mailto:|tel:|data:)/i.test(href)) return match
                    try {
                        const abs = new URL(href, targetOrigin + target.pathname)
                        if (abs.origin === targetOrigin) {
                            return `${prefix}${q1}${proxyBase}/api/fetch-site?url=${encodeURIComponent(abs.toString())}${q2}`
                        }
                    } catch { /* malformed href */ }
                    return match
                })

            html = rewriteSameOrigin(html, /(<a\b[^>]*?\shref=)(["'])([^"']*)(["'])/gi)
            html = rewriteSameOrigin(html, /(<form\b[^>]*?\saction=)(["'])([^"']*)(["'])/gi)
            html = rewriteSameOrigin(html, /(<iframe\b[^>]*?\ssrc=)(["'])([^"']*)(["'])/gi)
            html = html.replace(/(<a\b[^>]*?\starget=)(["'])_top\2/gi, '$1$2_self$2')

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
