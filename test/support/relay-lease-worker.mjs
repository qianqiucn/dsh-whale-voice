/* Test-only worker for the deterministic three-process commit races (PERSIST-02).
 *
 * Parent creates the real deliveries, writes a dead lease and drives the interleaving; this worker
 * only calls the normal public relay API (`openUnifiedRelay` + `cancel`) in its own process. Mode `A`
 * pauses inside the run after the store snapshot was read and before the commit; mode `A_PUBLISH`
 * pauses after the temp revision file was fully written/fsynced and immediately before the immutable
 * revision file is published (the after-fence window). It never edits a relay record directly.
 */
import fs from 'node:fs'
import path from 'node:path'

import { createFakeDeliveryBackend, openUnifiedRelay } from '../../core/audio/relay-core-offline.mjs'

const [mode, payloadFile] = process.argv.slice(2)
// The node test runner also loads every file under `test/`; outside the race probe this file is inert.
if (!mode || !payloadFile) process.exit(0)
const data = JSON.parse(fs.readFileSync(payloadFile, 'utf8'))
const resultFile = path.join(data.outDir, 'worker-' + mode + '-result.json')
const sandbox = { root: data.root }
const target = data.target
const relay = await openUnifiedRelay({
  sandbox,
  backend: createFakeDeliveryBackend({ targets: [target] }),
  targets: [target],
  now: () => data.now,
})
if (!relay.ok) {
  fs.writeFileSync(resultFile, JSON.stringify({ ok: false, code: relay.code }))
  process.exit(0)
}
const REVISION_FILE = /^unified-relay-v1\.r[0-9]+\.json$/

function pause() {
  fs.writeFileSync(data.ready, 'ready')
  const deadline = Date.now() + 15000
  while (!fs.existsSync(data.release)) {
    if (Date.now() > deadline) throw new Error('A_WAIT_TIMEOUT')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
  }
}

if (mode === 'A_PUBLISH') {
  // Pause immediately before the atomic create of the next immutable revision file.
  const originalLink = fs.linkSync
  let paused = false
  fs.linkSync = function patchedLink(from, to) {
    if (!paused && typeof to === 'string' && REVISION_FILE.test(path.basename(to))) {
      paused = true
      pause()
    }
    return originalLink(from, to)
  }
}
if (mode === 'A') {
  let seen = false
  const originalRead = fs.readFileSync
  fs.readFileSync = function patchedRead(file, ...args) {
    const bytes = originalRead.call(fs, file, ...args)
    if (!seen && typeof file === 'string' && REVISION_FILE.test(path.basename(file))) {
      seen = true
      pause()
    }
    return bytes
  }
}
const result = await relay.cancel(mode === 'C' ? data.idB : data.idA)
fs.writeFileSync(resultFile, JSON.stringify(result))
