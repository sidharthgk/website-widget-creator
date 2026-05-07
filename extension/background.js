// Strips CSP/XFO from tabs we open, optionally blocks common widget vendors,
// then injects user widget via chrome.scripting.

// Common chat/widget vendor domains. Blocked at network level when "Block
// existing widgets" is enabled. User's own widget host is excluded at runtime.
const WIDGET_VENDOR_DOMAINS = [
  'intercom.io', 'intercomcdn.com', 'intercom-mail.com',
  'driftt.com', 'drift.com',
  'tawk.to',
  'zopim.com', 'zdassets.com', 'zendesk.com',
  'freshchat.com', 'wchat.freshchat.com', 'freshworks.com',
  'crisp.chat', 'client.crisp.chat',
  'olark.com',
  'tidio.co', 'tidio.com', 'tidiochat.com',
  'livechatinc.com', 'livechat-static.com',
  'smartsupp.com',
  'helpcrunch.com',
  'chatra.io', 'chatra.com',
  'kommunicate.io',
  'liveperson.net', 'lpcdn.lpsnmedia.net',
  'jivochat.com', 'jivosite.com',
  'formilla.com',
  'hubspot.com', 'hs-scripts.com', 'hs-banner.com', 'hubspotusercontent-na1.net', 'hubspot.net',
  'usefomo.com',
  'salesforceliveagent.com',
  'pure-chat.com', 'purechat.com',
  'gist.build', 'getgist.com',
  'tars.co',
  'manychat.com',
  'getbeamer.com',
  'whatfix.com',
  'snapengage.com',
  'chatbot.com',
  'helpshift.com',
  'fcr.io',
  'kustomerapp.com', 'kustomer.com',
  'callbell.eu',
  'rocket.chat',
  'channel.io', 'channelio.io',
  'getbutton.io',
  'verloop.io',
  'wati.io',
  'engati.com',
  'gorgias.io',
  'gorgias.chat',
  'frontapp.com',
  'helpcrunch.io',
]

const BLOCK_RULE_ID_BASE = 100000 // tab.id is small int; offsets keep ids unique

async function launch(site, scriptUrl, hideOthers) {
  console.log('[wwc] launch', { site, scriptUrl, hideOthers })
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true })
  console.log('[wwc] tab created', tab.id)
  if (tab.id == null) throw new Error('no tab id')

  const userWidgetHost = (() => {
    try { return new URL(scriptUrl).hostname } catch { return null }
  })()

  const cspRule = {
    id: tab.id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'content-security-policy', operation: 'remove' },
        { header: 'content-security-policy-report-only', operation: 'remove' },
        { header: 'x-frame-options', operation: 'remove' },
      ],
    },
    condition: {
      tabIds: [tab.id],
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  }

  const rulesToAdd = [cspRule]

  if (hideOthers) {
    // Filter out user's own widget host (and any of its parents/subdomains)
    const blockDomains = WIDGET_VENDOR_DOMAINS.filter(d => {
      if (!userWidgetHost) return true
      return !(userWidgetHost === d || userWidgetHost.endsWith('.' + d))
    })

    rulesToAdd.push({
      id: BLOCK_RULE_ID_BASE + tab.id,
      priority: 2,
      action: { type: 'block' },
      condition: {
        tabIds: [tab.id],
        requestDomains: blockDomains,
        resourceTypes: ['script', 'sub_frame', 'xmlhttprequest', 'stylesheet', 'image', 'font', 'media', 'websocket'],
      },
    })
  }

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [tab.id, BLOCK_RULE_ID_BASE + tab.id],
      addRules: rulesToAdd,
    })
    console.log('[wwc] dNR rules installed', rulesToAdd.length)
  } catch (e) {
    console.error('[wwc] dNR rule install failed; continuing without CSP strip / vendor block', e)
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tab.id],
        addRules: [cspRule],
      })
      console.log('[wwc] dNR fallback (csp only) installed')
    } catch (e2) {
      console.error('[wwc] dNR fallback also failed', e2)
    }
  }

  await chrome.tabs.update(tab.id, { url: site })
  console.log('[wwc] tab.update sent')

  const waitForComplete = () => new Promise((resolve) => {
    const listener = (tabId, info, t) => {
      if (tabId !== tab.id) return
      if (info.status === 'complete' && t && t.url && !t.url.startsWith('about:')) {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })

  await waitForComplete()
  console.log('[wwc] page complete, injecting...')

  let injected = false
  for (let attempt = 1; attempt <= 5 && !injected; attempt++) {
    try {
      await new Promise(r => setTimeout(r, 200)) // settle
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
      world: 'MAIN',
      func: (src, hide) => {
        try {
          if (hide) {
            // ONLY specific vendor IDs / src-based iframe selectors. No broad
            // class/id substring matches — those false-positive user widgets.
            const css = `
              #intercom-frame,#intercom-container,.intercom-launcher,.intercom-launcher-frame,#intercom-positioner-tree,
              #crisp-chatbox,.crisp-client,
              #fc_frame,iframe[src*="freshchat"],iframe[src*="freshworks"],
              iframe[src*="livechatinc"],
              #tawk-tooltip-iframe-container,iframe[src*="tawk.to"],iframe[src*="embed.tawk"],
              iframe[src*="zopim"],iframe[src*="zendesk"],iframe[src*="zdassets"],
              #drift-frame-controller,#drift-frame-chat,iframe[src*="drift"],
              iframe[id*="hubspot-messages"],iframe[src*="hubspot"],
              #tidio-chat,iframe[id*="tidio-chat-iframe"],iframe[src*="tidio"],
              #smartsupp-widget-container,
              #helpcrunch-iframe,iframe[src*="helpcrunch"],
              iframe[src*="chatra"],iframe[src*="kommunicate"],
              iframe[src*="liveperson"],iframe[src*="jivochat"],iframe[src*="jivosite"],
              iframe[src*="formilla"],iframe[src*="purechat"],
              iframe[src*="snapengage"],iframe[src*="manychat"],
              iframe[src*="channel.io"],iframe[src*="getbutton"],iframe[src*="verloop"] {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
              }
            `
            const style = document.createElement('style')
            style.id = 'wwc-hide-others'
            style.textContent = css
            ;(document.head || document.documentElement).appendChild(style)

            // Snapshot existing floating elements that look like chat widgets.
            // Hide only those; anything created AFTER this point is treated as
            // user's widget (or unrelated lazy content) and left alone.
            const isFloatingChatLike = (el) => {
              const r = el.getBoundingClientRect()
              if (r.width === 0 || r.height === 0) return false
              const cs = getComputedStyle(el)
              if (cs.position !== 'fixed' && cs.position !== 'sticky') return false
              if (parseInt(cs.zIndex || '0', 10) < 50) return false
              if (r.bottom < window.innerHeight - 400) return false
              if (r.right < window.innerWidth - 400) return false
              if (r.width > 400 || r.height > 400) return false
              return true
            }

            // Capture existing floating elements NOW (before user's widget renders).
            // Re-hide same set later in case site re-asserts display on them.
            const preExisting = new Set()
            const all0 = document.body ? document.body.querySelectorAll('iframe, div, button, a') : []
            all0.forEach(el => {
              if (el.id === 'wwc-hide-others') return
              if (isFloatingChatLike(el)) preExisting.add(el)
            })
            const reapply = () => preExisting.forEach(el => {
              try { el.style.setProperty('display', 'none', 'important') } catch (e) { /* detached */ }
            })
            reapply()
            setTimeout(reapply, 500)
            setTimeout(reapply, 1500)
            setTimeout(reapply, 4000)
          }

          const s = document.createElement('script')
          s.src = src
          s.async = true
          ;(document.body || document.documentElement).appendChild(s)

          // After widget loads, force its containers above everything else.
          let userHost = ''
          try { userHost = new URL(src).hostname } catch { /* ignore */ }
          const MAX_Z = '2147483647'

          const boost = () => {
            if (!userHost) return
            const sel =
              'iframe[src*="' + userHost + '"],' +
              'script[src*="' + userHost + '"]'
            let nodes
            try { nodes = document.querySelectorAll(sel) } catch { return }
            nodes.forEach((n) => {
              n.style && n.style.setProperty && n.style.setProperty('z-index', MAX_Z, 'important')
              let p = n.parentElement
              while (p && p !== document.body) {
                const cs = getComputedStyle(p)
                if (cs.position === 'fixed' || cs.position === 'sticky' || cs.position === 'absolute' || cs.position === 'relative') {
                  p.style.setProperty('z-index', MAX_Z, 'important')
                  if (cs.position === 'static') p.style.setProperty('position', 'fixed', 'important')
                }
                p = p.parentElement
              }
            })
          }
          setTimeout(boost, 1000)
          setTimeout(boost, 2500)
          setTimeout(boost, 5000)
          setTimeout(boost, 9000)
        } catch (e) {
          console.error('[wwc] inject failed', e)
        }
      },
      args: [scriptUrl, !!hideOthers],
      })
      console.log('[wwc] executeScript ok (attempt ' + attempt + ')')
      injected = true
    } catch (e) {
      const msg = String(e && e.message || e)
      console.warn('[wwc] executeScript attempt ' + attempt + ' failed:', msg)
      if (msg.includes('Frame with ID 0 was removed') || msg.includes('No frame with id') || msg.includes('Cannot access')) {
        // Page navigated mid-inject. Wait for next complete + retry.
        try { await waitForComplete() } catch { /* ignore */ }
        continue
      }
      // Other error: stop retrying.
      console.error('[wwc] executeScript failed (non-retryable)', e)
      break
    }
  }

  if (!injected) console.error('[wwc] gave up after retries')
  return tab.id
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'wwc-launch') {
    launch(msg.site, msg.script, !!msg.hideOthers)
      .then((tabId) => sendResponse({ ok: true, tabId }))
      .catch((err) => {
        console.error('[wwc] launch failed', err)
        sendResponse({ ok: false, error: String(err) })
      })
    return true
  }

  if (msg.type === 'wwc-ping') {
    sendResponse({ pong: true, version: chrome.runtime.getManifest().version })
    return false
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.declarativeNetRequest
    .updateSessionRules({ removeRuleIds: [tabId, BLOCK_RULE_ID_BASE + tabId] })
    .catch(() => { })
})
