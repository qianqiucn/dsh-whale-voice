import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import vm from 'node:vm'

import { bridgeScript } from '../index.js'

const TOKEN = 'generation-read-failure-token'
const MISSING_TASK = 'task:fixture-' + '0'.repeat(32)

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
}

/** The exact production browser bridge script, with fetch resolving the page-relative URLs. */
function createBridge(base) {
  const window = {}
  vm.runInNewContext(bridgeScript(TOKEN), {
    window,
    fetch: (input, init) => globalThis.fetch(new URL(String(input), base), init),
    AbortController,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    JSON,
    Set,
    String,
    Number,
    console,
  })
  return window.__WHALE_SETUP__
}

// 160: the page must distinguish these two real failure forms of the formal client from "not
// enabled" and from a still-pending read, so both are pinned here against the production bridge.
test('160 the formal client rejects a failed request and resolves a server failure object', async () => {
  const failing = http.createServer((req, res) => {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('failed')
  })
  await listen(failing)
  const bridge = createBridge('http://127.0.0.1:' + failing.address().port)

  // A response that is not a JSON object becomes the fixed failure object the page reads.
  const catalogFailure = await bridge.getGenerationCatalog()
  assert.equal(catalogFailure.ok, false)
  assert.equal(catalogFailure.error, 'core_http_500')
  const statusFailure = await bridge.getGenerationStatus(MISSING_TASK)
  assert.equal(statusFailure.ok, false)
  assert.equal(statusFailure.error, 'core_http_500')

  // A network failure (or timeout) rejects the bridge call; it never becomes a success or a
  // fabricated failure object the page could mistake for "not enabled".
  failing.closeAllConnections()
  await new Promise((resolve) => failing.close(resolve))
  await assert.rejects(bridge.getGenerationCatalog())
  await assert.rejects(bridge.getGenerationStatus(MISSING_TASK))
})
