#!/usr/bin/env node
/**
 * Probe Electron Chrome DevTools Protocol + Node inspector endpoints.
 * Usage: node scripts/cdp-status.mjs
 */
const CDP = 'http://127.0.0.1:9222'
const INSPECT = 'http://127.0.0.1:9229'

async function get(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function main() {
  const out = { ok: true, cdp: null, inspect: null, errors: [] }

  try {
    const version = await get(`${CDP}/json/version`)
    const list = await get(`${CDP}/json/list`)
    out.cdp = {
      Browser: version.Browser,
      webSocketDebuggerUrl: version.webSocketDebuggerUrl,
      targets: Array.isArray(list)
        ? list.map((t) => ({
            type: t.type,
            title: t.title,
            url: t.url,
            id: t.id,
            webSocketDebuggerUrl: t.webSocketDebuggerUrl,
          }))
        : list,
    }
  } catch (e) {
    out.ok = false
    out.errors.push(`CDP 9222: ${e instanceof Error ? e.message : e}`)
  }

  try {
    // Node inspector HTTP API
    const json = await get(`${INSPECT}/json`)
    out.inspect = json
  } catch (e) {
    out.ok = false
    out.errors.push(`inspect 9229: ${e instanceof Error ? e.message : e}`)
  }

  console.log(JSON.stringify(out, null, 2))
  process.exit(out.ok ? 0 : 1)
}

main()
