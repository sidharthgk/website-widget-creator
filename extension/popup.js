const siteEl = document.getElementById('site')
const scriptEl = document.getElementById('script')
const hideEl = document.getElementById('hideOthers')
const errEl = document.getElementById('err')
const btn = document.getElementById('launch')

chrome.storage.local.get(['lastSite', 'lastScript', 'hideOthers'], (data) => {
  if (data.lastScript) scriptEl.value = data.lastScript
  if (typeof data.hideOthers === 'boolean') hideEl.checked = data.hideOthers

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs && tabs[0] && tabs[0].url
    if (url && /^https?:\/\//i.test(url)) {
      siteEl.value = url
    } else if (data.lastSite) {
      siteEl.value = data.lastSite
    }
  })
})

function isValidUrl(v) {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch { return false }
}

function parseScript(v) {
  const t = v.trim()
  const m = t.match(/src=["']([^"']+)["']/i)
  return m ? m[1] : t
}

btn.addEventListener('click', () => {
  const site = siteEl.value.trim()
  const script = parseScript(scriptEl.value)
  const hideOthers = !!hideEl.checked

  if (!isValidUrl(site)) { errEl.textContent = 'Enter a valid website URL.'; return }
  if (!isValidUrl(script)) { errEl.textContent = 'Enter a valid widget script URL or <script> tag.'; return }
  errEl.textContent = ''
  btn.disabled = true
  btn.textContent = 'Launching…'

  chrome.storage.local.set({ lastSite: site, lastScript: script, hideOthers })

  chrome.runtime.sendMessage({ type: 'wwc-launch', site, script, hideOthers }, (resp) => {
    if (resp && resp.ok) {
      window.close()
    } else {
      btn.disabled = false
      btn.textContent = 'Launch Preview'
      errEl.textContent = (resp && resp.error) || 'Launch failed. Try again.'
    }
  })
})

;[siteEl, scriptEl].forEach(el => {
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click() })
})
