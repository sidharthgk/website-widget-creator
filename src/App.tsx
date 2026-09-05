import { useState, useEffect, useRef } from 'react'

type Screen = 'input' | 'preview'

function App() {
  const params = new URLSearchParams(window.location.search)
  const paramSite = params.get('site') ?? ''
  const paramScript = params.get('script') ?? ''
  const { dx: shiftX, dy: shiftY } = parseShift(params)

  const [screen, setScreen] = useState<Screen>(() =>
    paramSite && paramScript ? 'preview' : 'input'
  )
  const [siteUrl, setSiteUrl] = useState(paramSite)
  const [scriptUrl, setScriptUrl] = useState(paramScript)
  const [submittedSite, setSubmittedSite] = useState(paramSite)
  const [submittedScript, setSubmittedScript] = useState(paramScript)
  const [urlError, setUrlError] = useState('')
  const [scriptError, setScriptError] = useState('')
  const [extInstalled, setExtInstalled] = useState(false)
  const scriptRef = useRef<HTMLScriptElement | null>(null)

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { wwc?: string } | null
      if (data && data.wwc === 'ext-ready') setExtInstalled(true)
    }
    window.addEventListener('message', onMsg)
    window.postMessage({ wwc: 'ping' }, '*')
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Inject / remove the widget script when entering/leaving preview
  useEffect(() => {
    let untrackShift: (() => void) | null = null

    if (screen === 'preview' && submittedScript) {
      const tag = document.createElement('script')
      tag.src = submittedScript
      tag.async = true
      if (shiftX || shiftY) untrackShift = trackWidgetShift(tag, shiftX, shiftY)
      document.body.appendChild(tag)
      scriptRef.current = tag
    }

    return () => {
      untrackShift?.()
      if (scriptRef.current) {
        scriptRef.current.remove()
        scriptRef.current = null
      }
    }
  }, [screen, submittedScript, shiftX, shiftY])

  function isValidUrl(val: string) {
    try {
      const u = new URL(val)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  // Accept a raw URL or a full <script src="..."> tag
  function parseScriptInput(val: string): string {
    const trimmed = val.trim()
    // Try to extract src="..." from a script tag
    const match = trimmed.match(/src=["']([^"']+)["']/i)
    if (match) return match[1]
    return trimmed
  }

  function handleLaunch(e: React.FormEvent) {
    e.preventDefault()
    let valid = true

    if (!isValidUrl(siteUrl)) {
      setUrlError('Please enter a valid URL (e.g. https://example.com)')
      valid = false
    } else {
      setUrlError('')
    }

    const resolvedScript = parseScriptInput(scriptUrl)
    if (!isValidUrl(resolvedScript)) {
      setScriptError('Please enter a valid script URL or paste the full <script> tag')
      valid = false
    } else {
      setScriptError('')
    }

    if (!valid) return

    const sp = new URLSearchParams({ site: siteUrl, script: resolvedScript })
    for (const key of SHIFT_PARAMS) {
      const val = params.get(key)
      if (val) sp.set(key, val)
    }
    history.replaceState({}, '', '?' + sp.toString())

    if (extInstalled) {
      window.postMessage({ wwc: 'launch', site: siteUrl, script: resolvedScript }, '*')
      return
    }

    setSubmittedSite(siteUrl)
    setSubmittedScript(resolvedScript)
    setScreen('preview')
  }

  if (screen === 'preview') {
    return <PreviewScreen siteUrl={submittedSite} scriptUrl={submittedScript} />
  }

  return (
    <InputScreen
      siteUrl={siteUrl}
      setSiteUrl={setSiteUrl}
      scriptUrl={scriptUrl}
      setScriptUrl={setScriptUrl}
      urlError={urlError}
      scriptError={scriptError}
      onSubmit={handleLaunch}
      extInstalled={extInstalled}
    />
  )
}

/* ────────────────────────────────────────────
   INPUT SCREEN
──────────────────────────────────────────── */
interface InputScreenProps {
  siteUrl: string
  setSiteUrl: (v: string) => void
  scriptUrl: string
  setScriptUrl: (v: string) => void
  urlError: string
  scriptError: string
  onSubmit: (e: React.FormEvent) => void
  extInstalled: boolean
}

function InputScreen({
  siteUrl, setSiteUrl,
  scriptUrl, setScriptUrl,
  urlError, scriptError,
  onSubmit,
  extInstalled,
}: InputScreenProps) {
  return (
    <div style={styles.inputPage}>
      {/* Animated gradient background orbs */}
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.orb3} />

      <div style={styles.card}>
        {/* Logo / brand area */}
        <div style={styles.brand}>
          <div style={styles.brandIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2H3a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7l2 3 2-3h7a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <span style={styles.brandName}>Widget Preview</span>
        </div>

        <h1 style={styles.heading}>Launch Your Widget</h1>
        <p style={styles.subheading}>
          Enter a website URL and your widget script — we'll open the site full-screen with your widget running live.
        </p>

        <form onSubmit={onSubmit} style={styles.form}>
          {/* Website URL */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              <span style={styles.labelIcon}>🌐</span> Website URL
            </label>
            <div style={styles.inputWrap}>
              <input
                type="text"
                value={siteUrl}
                onChange={e => setSiteUrl(e.target.value)}
                placeholder="https://example.com"
                style={{
                  ...styles.input,
                  ...(urlError ? styles.inputError : {}),
                }}
                autoFocus
                spellCheck={false}
              />
            </div>
            {urlError && <span style={styles.error}>{urlError}</span>}
          </div>

          {/* Script URL */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              <span style={styles.labelIcon}>⚡</span> Widget Script URL
            </label>
            <div style={styles.inputWrap}>
              <input
                type="text"
                value={scriptUrl}
                onChange={e => setScriptUrl(e.target.value)}
                placeholder="https://widget.example.com/script.js"
                style={{
                  ...styles.input,
                  ...(scriptError ? styles.inputError : {}),
                }}
                spellCheck={false}
              />
            </div>
            {scriptError && <span style={styles.error}>{scriptError}</span>}
          </div>

          <button type="submit" style={styles.launchBtn}>
            <span>Launch Preview</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>

        <p style={styles.hint}>
          {extInstalled
            ? 'Extension active — Launch will open the real site in a new tab with your widget injected.'
            : 'Without the extension we open the site through a proxy iframe (works on most sites). For Cloudflare-protected sites, install the extension below.'}
        </p>

        <div style={styles.extBadge}>
          {extInstalled ? (
            <span style={styles.extBadgeOk}>● Extension installed — works on every site</span>
          ) : (
            <details style={styles.extDetails}>
              <summary style={styles.extBadgeMissing}>○ Extension not installed — install for any-site support</summary>
              <ol style={styles.extInstructions}>
                <li>Open <code style={styles.code}>chrome://extensions</code> in a new tab.</li>
                <li>Toggle <strong>Developer mode</strong> (top right).</li>
                <li>Click <strong>Load unpacked</strong>.</li>
                <li>Select the <code style={styles.code}>extension/</code> folder from this repository.</li>
                <li>Reload this page — the badge will turn green.</li>
              </ol>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   PREVIEW SCREEN
──────────────────────────────────────────── */
function buildBookmarklet(scriptUrl: string): string {
  const safe = scriptUrl.replace(/'/g, "\\'")
  const code = `(()=>{const s=document.createElement('script');s.src='${safe}';s.async=true;document.body.appendChild(s);})();`
  return 'javascript:' + encodeURIComponent(code)
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildBookmarkletAnchorHtml(scriptUrl: string): string {
  const href = escapeAttr(buildBookmarklet(scriptUrl))
  const style = 'display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none;cursor:grab;box-shadow:0 4px 16px rgba(99,102,241,0.3);user-select:none;font-family:inherit;'
  return `<a href="${href}" style="${style}" onclick="event.preventDefault();return false;" draggable="true">⚡ Inject Widget</a>`
}

// ---- Widget position offset (?up= &down= &left= &right=, in pixels) ----

const SHIFT_PARAMS = ['up', 'down', 'left', 'right'] as const
const SHIFT_STYLE_ID = 'wwc-widget-shift'

// dx > 0 moves the widget right, dy > 0 moves it down.
function parseShift(params: URLSearchParams): { dx: number; dy: number } {
  const px = (key: string) => {
    const raw = params.get(key)
    if (raw === null) return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  return { dx: px('right') - px('left'), dy: px('down') - px('up') }
}

// The shift is expressed as margins rather than by rewriting the widget's own
// bottom/right, so it is idempotent (re-applying can never drift), survives the
// widget restyling itself, and doesn't fight any transform it animates with.
function ensureShiftStyle(dx: number, dy: number): HTMLStyleElement {
  let el = document.getElementById(SHIFT_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = SHIFT_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = [
    `.wwc-shift-b{margin-bottom:${-dy}px !important}`,
    `.wwc-shift-t{margin-top:${dy}px !important}`,
    `.wwc-shift-r{margin-right:${-dx}px !important}`,
    `.wwc-shift-l{margin-left:${dx}px !important}`,
  ].join('')
  return el
}

function shiftClassesFor(el: HTMLElement, dx: number, dy: number): string[] {
  const cs = getComputedStyle(el)
  const out: string[] = []
  if (dy) out.push(cs.bottom !== 'auto' ? 'wwc-shift-b' : cs.top !== 'auto' ? 'wwc-shift-t' : '')
  if (dx) out.push(cs.right !== 'auto' ? 'wwc-shift-r' : cs.left !== 'auto' ? 'wwc-shift-l' : '')
  return out.filter(Boolean)
}

// Widgets mount asynchronously and often re-mount when opened/closed, so watch
// the DOM instead of shifting once. Returns a cleanup that undoes everything.
function trackWidgetShift(skipNode: Node, dx: number, dy: number): () => void {
  const styleEl = ensureShiftStyle(dx, dy)
  const tracked = new Map<HTMLElement, string[]>()
  const observers: MutationObserver[] = []

  const isShiftable = (el: HTMLElement) => {
    if (getComputedStyle(el).position !== 'fixed') return false
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return false
    // Leave full-screen overlays and backdrops where they are.
    return !(r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9)
  }

  const track = (el: HTMLElement) => {
    if (tracked.has(el) || !isShiftable(el)) return
    const classes = shiftClassesFor(el, dx, dy)
    if (!classes.length) return
    tracked.set(el, classes)
    el.classList.add(...classes)
    // Re-add if the widget rewrites its own class list.
    const mo = new MutationObserver(() => {
      for (const c of classes) if (!el.classList.contains(c)) el.classList.add(c)
    })
    mo.observe(el, { attributes: true, attributeFilter: ['class'] })
    observers.push(mo)
  }

  const consider = (node: Node) => {
    if (!(node instanceof HTMLElement)) return
    if (node === skipNode || node.closest('#root')) return // our own UI, not the widget
    track(node)
    node.querySelectorAll<HTMLElement>('*').forEach(track)
  }

  const rescan = () => document.body.childNodes.forEach(consider)

  const bodyObserver = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(consider)
  })
  bodyObserver.observe(document.body, { childList: true, subtree: true })

  // Catches widgets that mount hidden or zero-sized and settle a moment later.
  const timers = [300, 1000, 3000].map((t) => window.setTimeout(rescan, t))
  rescan()

  return () => {
    timers.forEach(clearTimeout)
    bodyObserver.disconnect()
    observers.forEach((o) => o.disconnect())
    tracked.forEach((classes, el) => el.classList.remove(...classes))
    styleEl.remove()
  }
}

function PreviewScreen({ siteUrl, scriptUrl }: { siteUrl: string; scriptUrl: string }) {
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)
  const [blockReason, setBlockReason] = useState<string | null>(null)

  // Route through the serverless proxy (/api/fetch-site works on both Vite dev and Vercel)
  const proxiedSrc = `/api/fetch-site?url=${encodeURIComponent(siteUrl)}`

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { wwc?: string; reason?: string } | null
      if (data && data.wwc === 'blocked' && typeof data.reason === 'string') {
        setBlockReason(data.reason)
        setIframeError(true)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <div style={styles.previewPage}>

      {/* Iframe fills the rest — loads via proxy */}
      <div style={styles.iframeWrap}>
        {!iframeLoaded && !iframeError && (
          <div style={styles.loader}>
            <div style={styles.spinner} />
            <p style={{ color: '#888', marginTop: 16, fontSize: 14 }}>Loading {siteUrl}…</p>
          </div>
        )}

        {iframeError && (
          <div style={styles.loader}>
            <div style={styles.errorIcon}>⚠️</div>
            <p style={{ color: '#ff6b6b', marginTop: 12, fontSize: 15, fontWeight: 600 }}>
              {blockReason ? 'Site blocks our preview' : 'Could not load the site'}
            </p>
            <p style={{ color: '#888', marginTop: 8, fontSize: 13, maxWidth: 420, textAlign: 'center' }}>
              {blockReason
                ? `${blockReason}. Use the bookmarklet below to inject your widget on the real site instead.`
                : 'The proxy was unable to fetch this page. The site may be temporarily unreachable.'}
            </p>

            {blockReason && scriptUrl && (
              <div style={styles.bookmarkletBox}>
                <p style={styles.bookmarkletTitle}>One-time setup:</p>
                <ol style={styles.bookmarkletSteps}>
                  <li>Drag this button to your bookmarks bar:</li>
                  <li
                    style={{ marginTop: 10, marginBottom: 10, listStyle: 'none', marginLeft: -20 }}
                    dangerouslySetInnerHTML={{ __html: buildBookmarkletAnchorHtml(scriptUrl) }}
                  />
                  <li>Open <a href={siteUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#a5b4fc' }}>{siteUrl}</a> in a new tab.</li>
                  <li>Click the bookmarklet — your widget will load on the real page.</li>
                </ol>
              </div>
            )}

            <a href={siteUrl} target="_blank" rel="noopener noreferrer" style={styles.openTabBtn}>
              Open in new tab
            </a>
          </div>
        )}

        {!iframeError && (
          <iframe
            src={proxiedSrc}
            title="Website Preview"
            style={{
              ...styles.iframe,
              opacity: iframeLoaded ? 1 : 0,
            }}
            onLoad={() => setIframeLoaded(true)}
            onError={() => setIframeError(true)}
            allow="*"
          />
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   STYLES (object-based, no external deps)
──────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  /* Input page */
  inputPage: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at 20% 50%, #0d0d2b 0%, #0a0a0f 60%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  },
  orb1: {
    position: 'absolute',
    top: '-10%',
    left: '-5%',
    width: '500px',
    height: '500px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute',
    bottom: '-15%',
    right: '-5%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb3: {
    position: 'absolute',
    top: '40%',
    left: '60%',
    width: '350px',
    height: '350px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '24px',
    padding: '48px',
    width: '100%',
    maxWidth: '520px',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '32px',
  },
  brandIcon: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
  },
  brandName: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fff',
    letterSpacing: '-0.02em',
  },
  heading: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#fff',
    letterSpacing: '-0.03em',
    lineHeight: 1.2,
    marginBottom: '10px',
  },
  subheading: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 1.6,
    marginBottom: '36px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: '0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  labelIcon: {
    fontSize: '14px',
  },
  inputWrap: {
    position: 'relative',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '12px',
    padding: '14px 16px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s, background 0.2s',
    fontFamily: 'inherit',
  },
  inputError: {
    borderColor: 'rgba(239,68,68,0.6)',
    background: 'rgba(239,68,68,0.05)',
  },
  error: {
    fontSize: '12px',
    color: '#f87171',
  },
  launchBtn: {
    marginTop: '8px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '12px',
    padding: '16px 24px',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    letterSpacing: '-0.01em',
    boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
    transition: 'transform 0.15s, box-shadow 0.15s',
    fontFamily: 'inherit',
  },
  hint: {
    marginTop: '24px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 1.5,
  },

  /* Preview page */
  previewPage: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0a0a0f',
  },
  previewBar: {
    height: '48px',
    background: 'rgba(15,15,25,0.95)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    gap: '12px',
    flexShrink: 0,
    backdropFilter: 'blur(10px)',
  },
  backBtn: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  previewUrl: {
    flex: 1,
    fontSize: '13px',
    color: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },
  openExternal: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
  },
  iframeWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    transition: 'opacity 0.3s ease',
  },
  loader: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0f',
    zIndex: 10,
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(255,255,255,0.08)',
    borderTop: '3px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  errorIcon: {
    fontSize: '40px',
  },
  openTabBtn: {
    marginTop: '20px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    textDecoration: 'none',
    display: 'inline-block',
  },
  extBadge: {
    marginTop: 16,
    fontSize: 12,
    textAlign: 'center',
  },
  extBadgeOk: {
    color: '#34d399',
    fontWeight: 600,
  },
  extBadgeMissing: {
    color: 'rgba(255,255,255,0.55)',
    cursor: 'pointer',
    fontWeight: 600,
  },
  extDetails: {
    color: 'rgba(255,255,255,0.55)',
  },
  extInstructions: {
    textAlign: 'left',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.7,
    marginTop: 12,
    paddingLeft: 20,
  },
  extLink: {
    color: '#a5b4fc',
    textDecoration: 'none',
    fontWeight: 700,
  },
  code: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  bookmarkletBox: {
    marginTop: 24,
    padding: '20px 24px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 14,
    maxWidth: 460,
    width: '100%',
  },
  bookmarkletTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.85)',
    margin: 0,
    marginBottom: 10,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  bookmarkletSteps: {
    margin: 0,
    paddingLeft: 20,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.7,
  },
  bookmarkletDrag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none',
    cursor: 'grab',
    boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
    userSelect: 'none',
  },
}

/* CSS animation for spinner */
const styleTag = document.createElement('style')
styleTag.textContent = `
  @keyframes spin { to { transform: rotate(360deg); } }
  input:focus { border-color: rgba(99,102,241,0.7) !important; background: rgba(255,255,255,0.08) !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
  button[type=submit]:hover { transform: translateY(-1px); box-shadow: 0 12px 40px rgba(99,102,241,0.5) !important; }
`
document.head.appendChild(styleTag)

export default App
