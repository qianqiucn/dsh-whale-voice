/* Test-only isolated Host assembly for the settings page's generation storage draft.
 *
 * The browser page talks to the production bridge contract (`window.__WHALE_SETUP__`
 * get/saveGenerationStorageDraft from index.js `bridgeScript`); this file serves the real 144 Host
 * routes through the harness HTTP server. The draft store lives in a fresh temporary sandbox, so the
 * flow uses the real isolated Host config context and never starts a generation service, worker or
 * model.
 */

import { installHostBridge } from '../../index.js'
import { createConfigSandbox, removeConfigSandbox } from '../../core/config-sandbox.mjs'
import { openGenerationSettingsDraft } from '../../core/settings-draft.mjs'

const TOKEN = 'host-settings-draft-ui-token'

function json(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(value))
}

export async function createHostSettingsDraftAssembly() {
  let sandbox = null
  let host = null
  let routes = []

  function open() {
    routes = []
    sandbox = createConfigSandbox({ prefix: 'wv-ui-settings-draft-' })
    const scope = {
      webServer: {
        register(route) { routes.push(route); return () => {} },
      },
      get() { return { requestRejection() { return null } } },
      on() { return () => {} },
    }
    host = installHostBridge(scope, {
      token: TOKEN,
      settingsDraft: openGenerationSettingsDraft({ sandbox }),
    })
  }

  async function reset() {
    if (host) host.dispose()
    if (sandbox) removeConfigSandbox(sandbox)
    host = null
    sandbox = null
    open()
  }

  async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (!url.pathname.startsWith('/whale-voice/setup/settings/')) return false
    const route = routes.find((item) => item.path === url.pathname)
    if (!route) {
      json(res, 404, { ok: false, error: 'not_found' })
      return true
    }
    await route.handler(req, res)
    return true
  }

  async function close() {
    if (host) host.dispose()
    if (sandbox) removeConfigSandbox(sandbox)
    host = null
    sandbox = null
    routes = []
  }

  open()
  return { handle, close, reset, token: TOKEN }
}
