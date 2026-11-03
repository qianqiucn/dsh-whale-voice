/* Plan 13-B — internal Sender offline unit: provenance, fixed invocation, Artifact-only backend,
 * single queue, NEVER_WRITE and both Core paths into the one internal delivery module. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { createVoiceSavedTask, createSingingSavedTask, mutableClock, relayHandoff, readRelayStore } from './support/relay-authority.mjs'
import { createFakeDeliveryBackend, openUnifiedRelay } from '../core/audio/relay-core-offline.mjs'
import {
  INTERNAL_SENDER_ERRORS,
  INTERNAL_SENDER_ID,
  INTERNAL_SENDER_SCRIPTS,
  buildInternalInvocation,
  createFixtureTransport,
  createInternalSenderOffline,
  readInternalSenderManifest,
  resolveInternalScript,
} from '../core/audio/internal-sender-offline.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.join(HERE, '..', 'core', 'audio', 'sender-internal')
const SOURCE_DIR = path.join(PACKAGE_DIR, 'source')
const FACADE = path.join(HERE, '..', 'core', 'audio', 'internal-sender-offline.mjs')

const TARGET = {
  targetId: 'fixture-private-a', kind: 'PRIVATE', authorized: true, allowlisted: true,
  identityVerified: true, bridgeAllowed: true, workerAllowed: true,
}
const TARGET_B = { ...TARGET, targetId: 'fixture-private-b' }
const NOW = '2026-10-27T00:00:02.000Z'
const SHA = 'a'.repeat(64)
const ARTIFACT = { artifactRef: 'artifact:fixture-bytes-' + 'b'.repeat(32), sha256: SHA, byteLength: 4096, durationMs: 1000, format: 'WAV' }
const DELIVERY = { deliveryId: 'delivery:' + 'c'.repeat(32), backendId: INTERNAL_SENDER_ID, targetId: TARGET.targetId, targetKind: TARGET.kind }

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

test('13-B source closure: manifest hashes match the copied resources and no dev paths/secrets leak', () => {
  const manifest = readInternalSenderManifest()
  assert.ok(manifest, 'manifest missing')
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.sourceCount, 26)
  assert.equal(manifest.files.length, 26)
  assert.equal(manifest.metadata.length, 2)
  assert.equal(manifest.preflight.sha256, 'a3056dea8965a85a880b0fe5c9a0752e86ce8ab94947ccb3ba77a4f07a595bf4')
  // Only machine paths and real credential-shaped values are refused; documentation words such as
  // "bearer token (generated on first start)" are not credentials.
  const forbiddenPath = /D:\\|C:\\Users|E:\\|\/Users\//
  const forbiddenSecret = /(?:\bBearer\s+[A-Za-z0-9._-]{12,}|api[_-]?key\s*[:=]|password\s*[:=]|secret\s*[:=]|token\s*[:=]\s*["'][A-Za-z0-9._-]{8,})/
  const bareImport = /(^|\n)\s*import\s+[^'"]*from\s+['"](?!node:|\.{1,2}\/)[^'"]+['"]/
  for (const entry of [...manifest.files, ...manifest.metadata]) {
    const file = path.join(SOURCE_DIR, ...entry.path.split('/'))
    assert.equal(fs.existsSync(file), true, 'missing ' + entry.path)
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.length, entry.storedBytes, 'stored bytes ' + entry.path)
    assert.equal(sha256Bytes(bytes), entry.storedSha256, 'stored hash ' + entry.path)
    assert.equal(sha256Bytes(bytes), entry.sourceSha256 === entry.storedSha256 ? entry.sourceSha256 : sha256Bytes(bytes))
    const text = entry.path.endsWith('.ps1') || entry.path.endsWith('.cs') || entry.path.endsWith('.mjs') || entry.path.endsWith('.json') || entry.path.endsWith('.md')
      ? bytes.toString('utf8')
      : ''
    assert.doesNotMatch(text, forbiddenPath, 'machine path in ' + entry.path)
    if (!entry.path.endsWith('.md')) assert.doesNotMatch(text, forbiddenSecret, 'credential-shaped value in ' + entry.path)
    if (entry.path.endsWith('.mjs')) assert.doesNotMatch(text, bareImport, 'bare import in ' + entry.path)
  }
  // The facade never imports the original HTTP server (no top-level side effects) and never spawns/opens sockets.
  const facade = fs.readFileSync(FACADE, 'utf8')
  assert.doesNotMatch(facade, /service\/src\/server\.mjs|from ['"]node:child_process['"]|from ['"]node:http['"]|from ['"]node:net['"]/)
  assert.match(facade, /from 'node:fs'/)
})

test('13-B fixed invocation: only whitelisted script ids/keys, fixed argv, contained paths', () => {
  assert.equal(resolveInternalScript('SEND'), path.join(SOURCE_DIR, 'voice-sender.ps1'))
  assert.equal(resolveInternalScript('UNKNOWN'), null)
  const send = buildInternalInvocation('SEND', {
    deliveryId: DELIVERY.deliveryId, artifactRef: ARTIFACT.artifactRef, artifactSha256: ARTIFACT.sha256,
    byteLength: ARTIFACT.byteLength, durationMs: ARTIFACT.durationMs, targetId: TARGET.targetId, targetKind: TARGET.kind,
  })
  assert.equal(send.ok, true, JSON.stringify(send))
  assert.deepEqual(send.value.argv, [
    '-deliveryId', DELIVERY.deliveryId, '-artifactRef', ARTIFACT.artifactRef, '-artifactSha256', ARTIFACT.sha256,
    '-byteLength', '4096', '-durationMs', '1000', '-targetId', 'fixture-private-a', '-targetKind', 'PRIVATE',
  ])
  assert.equal(send.value.shell, false)
  assert.equal(buildInternalInvocation('SEND', { path: 'C:/x' }).ok, false)
  assert.equal(buildInternalInvocation('SEND', { deliveryId: 'x\ny' }).ok, false)
  assert.equal(buildInternalInvocation('NOPE', {}).code, INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED)
  assert.equal(buildInternalInvocation('SEND', { deliveryId: 'a'.repeat(201) }).ok, false)
  assert.equal(buildInternalInvocation('WECHAT_STATUS', {}).ok, true)
  assert.equal(buildInternalInvocation('WECHAT_STATUS', { targetId: 'x' }).ok, false)
})

test('13-B Artifact-only backend rejects paths/URLs/commands and its own directory gates', async () => {
  const transport = createFixtureTransport()
  const backend = createInternalSenderOffline({ targets: [TARGET], transport })
  assert.equal(backend.realOperationAllowed, false)
  assert.equal(backend.health().realReady, false)
  const empty = createInternalSenderOffline({ targets: [], transport })
  assert.equal((await empty.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: TARGET })).code, INTERNAL_SENDER_ERRORS.TARGET_REJECTED)
  assert.equal((await backend.submit({ delivery: { ...DELIVERY, path: 'C:/tmp/x.wav' }, artifact: ARTIFACT, target: TARGET })).code, INTERNAL_SENDER_ERRORS.INPUT_INVALID)
  assert.equal((await backend.submit({ delivery: DELIVERY, artifact: { ...ARTIFACT, url: 'https://x' }, target: TARGET })).code, INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
  const revoked = createInternalSenderOffline({ targets: [{ ...TARGET, authorized: false }], transport: createFixtureTransport() })
  assert.equal((await revoked.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: { ...TARGET } })).code, INTERNAL_SENDER_ERRORS.TARGET_REJECTED)
  assert.equal(transport.invocations.length, 0)
})

test('13-B single queue: serial invocations, one invocation per delivery, no retry', async () => {
  const transport = createFixtureTransport()
  const backend = createInternalSenderOffline({ targets: [TARGET, TARGET_B], transport })
  const second = { ...DELIVERY, deliveryId: 'delivery:' + 'd'.repeat(32), targetId: TARGET_B.targetId }
  const [first, other] = await Promise.all([
    backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: TARGET }),
    backend.submit({ delivery: second, artifact: ARTIFACT, target: TARGET_B }),
  ])
  assert.equal(first.ok, true)
  assert.equal(other.ok, true)
  assert.equal(transport.invocations.length, 2)
  const again = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: TARGET })
  assert.equal(again.existing, true)
  assert.equal(transport.invocations.length, 2)
  assert.equal(backend.stats().accepted, 2)
  assert.equal(backend.stats().invocations, 2)
})

test('13-B result mapping: cancel and UNKNOWN keep their semantics and never resend', async () => {
  const transport = createFixtureTransport({ results: [{ ok: true, cancelled: true }] })
  const backend = createInternalSenderOffline({ targets: [TARGET], transport })
  const cancelled = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: TARGET })
  assert.equal(cancelled.cancelled, true)
  assert.equal(cancelled.accepted, false)
  const unknownTransport = createFixtureTransport({ results: [{ unknown: true }] })
  const unknownBackend = createInternalSenderOffline({ targets: [TARGET], transport: unknownTransport })
  const unknown = await unknownBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: TARGET })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.unknown, true)
  const resend = await unknownBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: TARGET })
  assert.equal(resend.code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
  assert.equal(unknownTransport.invocations.length, 1)
})

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try { return await fn(sandbox) } finally { removeConfigSandbox(sandbox) }
}

test('13-B Voice: a trusted SAVED artifact reaches the internal backend through the relay exactly once', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z',
      expiresAt: '2026-10-28T00:00:00.000Z', proofRef: 'fixture-rights:relay-demo',
    })
    const transport = createFixtureTransport()
    const internal = createInternalSenderOffline({ targets: [TARGET], transport })
    const relay = await openUnifiedRelay({ sandbox, backend: internal, targets: [TARGET], now: () => NOW })
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: voice.scopeId, taskId: voice.taskId, artifactRef: voice.artifactRef,
      targetId: TARGET.targetId, requestKey: 'internal-voice', proofRef: 'fixture-rights:relay-demo',
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, 'ACCEPTED')
    assert.match(submitted.delivery.receiptId, /^fixture-internal/)
    assert.equal(transport.invocations.length, 1)
    assert.equal(transport.invocations[0].scriptId, 'SEND')
    assert.equal(internal.stats().accepted, 1)
    const store = readRelayStore(sandbox.root)
    assert.equal(store.deliveries[0].backendId, INTERNAL_SENDER_ID)
  })
})

test('13-B Singing: the same internal backend accepts a permitted Cover MASTER exactly once', async () => {
  await withSandbox(async (sandbox) => {
    const singing = await createSingingSavedTask(sandbox, {
      now: '2026-11-01T00:00:00.000Z', expiresAt: '2026-11-02T00:00:00.000Z', proofRef: 'fixture-rights:relay-singing',
    })
    const transport = createFixtureTransport()
    const internal = createInternalSenderOffline({ targets: [TARGET], transport })
    const relay = await openUnifiedRelay({ sandbox, backend: internal, targets: [TARGET], now: () => '2026-11-01T00:00:02.000Z' })
    const issued = await relay.issueDeliveryPermit({
      permit: {
        schemaVersion: 1, scopeId: singing.scopeId, taskId: singing.taskId, artifactRef: singing.artifactRef,
        targetId: TARGET.targetId, rights: { state: 'GRANTED', proofRef: 'fixture-rights:relay-singing' },
      },
    })
    assert.equal(issued.ok, true, JSON.stringify(issued))
    const ensured = await relay.ensureDelivery(relayHandoff({
      scopeId: singing.scopeId, taskId: singing.taskId, artifactRef: singing.artifactRef,
      targetId: TARGET.targetId, requestKey: 'internal-singing', proofRef: 'fixture-rights:relay-singing',
      overrides: { permitId: issued.permit.permitId },
    }))
    assert.equal(ensured.ok, true, JSON.stringify(ensured))
    const submitted = await relay.submit(ensured.delivery.deliveryId)
    assert.equal(submitted.ok, true, JSON.stringify(submitted))
    assert.equal(submitted.delivery.state, 'ACCEPTED')
    assert.equal(transport.invocations.length, 1)
    assert.equal(internal.stats().accepted, 1)
  })
})
