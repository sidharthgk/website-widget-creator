import { useState, useEffect, useRef } from 'react'

type Screen = 'input' | 'preview'

function App() {
  const [screen, setScreen] = useState<Screen>('input')
  const [siteUrl, setSiteUrl] = useState('')
  const [scriptUrl, setScriptUrl] = useState('')
  const [submittedSite, setSubmittedSite] = useState('')
  const [submittedScript, setSubmittedScript] = useState('')
  const [urlError, setUrlError] = useState('')
  const [scriptError, setScriptError] = useState('')
  const scriptRef = useRef<HTMLScriptElement | null>(null)

  // Inject / remove the widget script when entering/leaving preview
  useEffect(() => {
    if (screen === 'preview' && submittedScript) {
      const tag = document.createElement('script')
      tag.src = submittedScript
      tag.async = true
      document.body.appendChild(tag)
      scriptRef.current = tag
    }

    return () => {
      if (scriptRef.current) {
        scriptRef.current.remove()
        scriptRef.current = null
      }
    }
  }, [screen, submittedScript])

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

    setSubmittedSite(siteUrl)
    setSubmittedScript(parseScriptInput(scriptUrl))
    setScreen('preview')
  }

  function handleBack() {
    setScreen('input')
  }

  if (screen === 'preview') {
    return <PreviewScreen siteUrl={submittedSite} onBack={handleBack} />
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
}

function InputScreen({
  siteUrl, setSiteUrl,
  scriptUrl, setScriptUrl,
  urlError, scriptError,
  onSubmit,
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
          The website will open full-screen and your widget script will be injected automatically.
        </p>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────
   PREVIEW SCREEN
──────────────────────────────────────────── */
function PreviewScreen({ siteUrl, onBack }: { siteUrl: string; onBack: () => void }) {
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [iframeError, setIframeError] = useState(false)

  // Route through our server-side proxy so X-Frame-Options / CSP are stripped
  const proxiedSrc = `/fetch-site?url=${encodeURIComponent(siteUrl)}`

  return (
    <div style={styles.previewPage}>
      {/* Thin top bar */}
      <div style={styles.previewBar}>
        <button onClick={onBack} style={styles.backBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span style={styles.previewUrl}>{siteUrl}</span>
        <a href={siteUrl} target="_blank" rel="noopener noreferrer" style={styles.openExternal}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Open in tab
        </a>
      </div>

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
              Could not load the site
            </p>
            <p style={{ color: '#888', marginTop: 8, fontSize: 13, maxWidth: 380, textAlign: 'center' }}>
              The proxy was unable to fetch this page. The site may be temporarily unreachable.
            </p>
            <a href={siteUrl} target="_blank" rel="noopener noreferrer" style={styles.openTabBtn}>
              Open in new tab instead
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
