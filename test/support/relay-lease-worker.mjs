/* Test-only worker for the deterministic three-process lease race (PERSIST-02/LEASE).
 *
 * Parent creates the real deliveries, writes a dead lease and drives the interleaving; this worker
 * only calls the normal public relay API (`openUnifiedRelay` + `cancel`) in its own process. In mode
 * A it pauses *inside* the run after the store snapshot was read and before the commit, exactly the
 * window in which the parent moves the live lease aside. It never edits a relay record directly.
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
if (mode === 'A_RENAME') {
  // Pause after the commit reservation and after the temp file was written/fsynced, immediately
  // before the final temp → store rename (the after-fence window from the 0140 review).
  const storeFile = path.join(data.root, 'unified-relay-v1.json')
  const originalRename = fs.renameSync
  let paused = false
  fs.renameSync = function patchedRename(from, to) {
    if (!paused && typeof to === 'string' && path.resolve(to) === storeFile) {
      paused = true
      fs.writeFileSync(data.ready, 'ready')
      const deadline = Date.now() + 15000
      while (!fs.existsSync(data.release)) {
        if (Date.now() > deadline) throw new Error('A_RELEASE_TIMEOUT')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
    }
    return originalRename(from, to)
  }
}
if (mode === 'A') {
  const storeFile = path.join(data.root, 'unified-relay-v1.json')
  let seen = false
  const originalRead = fs.readFileSync
  fs.readFileSync = function patchedRead(file, ...args) {
    const bytes = originalRead.call(fs, file, ...args)
    if (!seen && typeof file === 'string' && path.resolve(file) === storeFile) {
      seen = true
      fs.writeFileSync(data.ready, 'ready')
      const deadline = Date.now() + 15000
      while (!fs.existsSync(data.release)) {
        if (Date.now() > deadline) throw new Error('A_WAIT_TIMEOUT')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      }
    }
    return bytes
  }
}
const result = await relay.cancel(mode === 'C' ? data.idB : data.idA)
fs.writeFileSync(resultFile, JSON.stringify(result))
