// Bridges widget-creator web page <-> extension background.
// Page sends window.postMessage({wwc:'launch',site,script}); we forward
// to background via chrome.runtime.sendMessage. Page also reads the
// 'ext-ready' announcement to detect the extension is installed.

(function () {
  try {
    window.postMessage({ wwc: 'ext-ready', version: chrome.runtime.getManifest().version }, '*')
  } catch (e) { /* ignore */ }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || typeof data !== 'object') return

    if (data.wwc === 'ping') {
      window.postMessage({ wwc: 'ext-ready', version: chrome.runtime.getManifest().version }, '*')
      return
    }

    if (data.wwc === 'launch' && typeof data.site === 'string' && typeof data.script === 'string') {
      chrome.runtime.sendMessage(
        { type: 'wwc-launch', site: data.site, script: data.script },
        (resp) => {
          window.postMessage({ wwc: 'launched', ok: !!(resp && resp.ok) }, '*')
        }
      )
    }
  })
})()
