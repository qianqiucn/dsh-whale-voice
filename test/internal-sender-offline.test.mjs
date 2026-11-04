/* Plan 13-B — internal Sender offline unit (144-ABI/CANCEL/ONCE/BINDING/RESULT).
 *
 * The tests drive the delivered entry points only: the real archived Worker ABI, the trusted
 * request/cancel protocol, the backend's submit/status/cancel and the relay's persisted handoff.
 * Everything is synthetic Fixture data; no PowerShell/C#/process/device/WeChat/network is used. */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { createVoiceSavedTask, createSingingSavedTask, relayHandoff, readRelayStore } from './support/relay-authority.mjs'
import { openUnifiedRelay } from '../core/audio/relay-core-offline.mjs'
import {
  INTERNAL_SENDER_ERRORS,
  INTERNAL_SENDER_ID,
  INTERNAL_SENDER_SCRIPTS,
  INTERNAL_WORKER_ABI,
  buildInternalInvocation,
  buildSendRequest,
  createFixtureTransport,
  createInternalSenderOffline,
  readInternalSenderManifest,
  resolveInternalScript,
  verifyWorkerAbi,
} from '../core/audio/internal-sender-offline.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.join(HERE, '..', 'core', 'audio', 'sender-internal')
const SOURCE_DIR = path.join(PACKAGE_DIR, 'source')
const FACADE = path.join(HERE, '..', 'core', 'audio', 'internal-sender-offline.mjs')

const CHAT = 'fixture-chat-a'
const TARGET = {
  targetId: 'fixture-private-a', kind: 'PRIVATE', chat: CHAT, authorized: true, allowlisted: true,
  identityVerified: true, bridgeAllowed: true, workerAllowed: true,
}
const TARGET_B = { ...TARGET, targetId: 'fixture-private-b', chat: 'fixture-chat-b' }
/** The relay keeps its own directory; it never needs the worker chat label. */
const RELAY_TARGETS = [TARGET, TARGET_B].map(({ chat, ...rest }) => rest)
const NOW = '2026-11-04T00:00:00.000Z'
const VOICE_NOW = '2026-10-27T00:00:02.000Z'
const SHA = 'a'.repeat(64)
const ARTIFACT = { artifactRef: 'artifact:fixture-bytes-' + 'b'.repeat(32), sha256: SHA, byteLength: 4096, durationMs: 1000, format: 'WAV' }
const ARTIFACT_B = { ...ARTIFACT, sha256: 'd'.repeat(64) }
const DELIVERY = {
  deliveryId: 'delivery:' + 'c'.repeat(32), backendId: INTERNAL_SENDER_ID,
  targetId: TARGET.targetId, targetKind: TARGET.kind,
  artifactRef: ARTIFACT.artifactRef, artifactSha256: ARTIFACT.sha256,
  byteLength: ARTIFACT.byteLength, durationMs: ARTIFACT.durationMs,
}
const DELIVERY_B = { ...DELIVERY, deliveryId: 'delivery:' + 'd'.repeat(32), targetId: TARGET_B.targetId, targetKind: TARGET_B.kind }
const CALLER_TARGET = { targetId: TARGET.targetId, kind: TARGET.kind }
const CALLER_TARGET_B = { targetId: TARGET_B.targetId, kind: TARGET_B.kind }
const clock = () => NOW

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function backendWith(transport, extra = {}) {
  return createInternalSenderOffline({ targets: [TARGET, TARGET_B], transport, now: clock, ...extra })
}

test('13-B source closure: manifest, provenance and the read-only facade boundary are intact', () => {
  const manifest = readInternalSenderManifest()
  assert.ok(manifest, 'manifest missing')
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.sourceCount, 26)
  assert.equal(manifest.files.length, 26)
  assert.equal(manifest.metadata.length, 2)
  assert.equal(manifest.preflight.sha256, 'a3056dea8965a85a880b0fe5c9a0752e86ce8ab94947ccb3ba77a4f07a595bf4')
  const forbiddenPath = /D:\\|C:\\Users|E:\\|\/Users\//
  const forbiddenSecret = /(?:\bBearer\s+[A-Za-z0-9._-]{12,}|api[_-]?key\s*[:=]|password\s*[:=]|secret\s*[:=]|token\s*[:=]\s*["'][A-Za-z0-9._-]{8,})/
  const bareImport = /(^|\n)\s*import\s+[^'"]*from\s+['"](?!node:|\.{1,2}\/)[^'"]+['"]/
  for (const entry of [...manifest.files, ...manifest.metadata]) {
    const file = path.join(SOURCE_DIR, ...entry.path.split('/'))
    assert.equal(fs.existsSync(file), true, 'missing ' + entry.path)
    const bytes = fs.readFileSync(file)
    assert.equal(bytes.length, entry.storedBytes, 'stored bytes ' + entry.path)
    assert.equal(sha256Bytes(bytes), entry.storedSha256, 'stored hash ' + entry.path)
    const text = /\.(ps1|cs|mjs|json|md)$/.test(entry.path) ? bytes.toString('utf8') : ''
    assert.doesNotMatch(text, forbiddenPath, 'machine path in ' + entry.path)
    if (!entry.path.endsWith('.md')) assert.doesNotMatch(text, forbiddenSecret, 'credential-shaped value in ' + entry.path)
    if (entry.path.endsWith('.mjs')) assert.doesNotMatch(text, bareImport, 'bare import in ' + entry.path)
  }
  const facade = fs.readFileSync(FACADE, 'utf8')
  assert.doesNotMatch(facade, /service\/src\/server\.mjs|from ['"]node:child_process['"]|from ['"]node:http['"]|from ['"]node:net['"]/)
  // NEVER_WRITE: the offline unit reads resources but never writes, creates or removes anything.
  assert.doesNotMatch(facade, /\b(writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|copyFileSync|createWriteStream)\b/)
  assert.match(facade, /from 'node:fs'/)
})

test('144-ABI: the declared worker ABI is re-derived from the archived source (no invented argv)', () => {
  const abi = verifyWorkerAbi()
  assert.equal(abi.ok, true, JSON.stringify(abi.mismatches))
  assert.equal(abi.abiVersion, 1)
  assert.equal(abi.serviceVersion, '0.1.0')
  const byId = new Map(abi.scripts.map((item) => [item.scriptId, item]))
  assert.deepEqual(byId.get('SEND').parameters, ['Request', 'JsonOut', 'ProgressFile', 'CancelFile', 'GlobalCancelFile'])
  assert.deepEqual(byId.get('RECOVER').parameters, ['Status', 'JsonOut'])
  assert.deepEqual(byId.get('WECHAT_STATUS').parameters, ['ExpectedProcessPath'])
  assert.deepEqual(byId.get('HOTKEY').parameters, ['SignalFile', 'StatusFile', 'LogFile', 'Accelerator', 'SelfTest'])
  // The old descriptor pointed CANCEL/PREFLIGHT at resources that were never packaged; they are gone.
  assert.equal(INTERNAL_SENDER_SCRIPTS.CANCEL, undefined)
  assert.equal(INTERNAL_SENDER_SCRIPTS.PREFLIGHT, undefined)
  assert.equal(INTERNAL_SENDER_SCRIPTS.SEND, 'voice-sender.ps1')
  assert.equal(buildInternalInvocation('CANCEL', { deliveryId: DELIVERY.deliveryId }).code, INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED)
  assert.equal(buildInternalInvocation('PREFLIGHT', {}).code, INTERNAL_SENDER_ERRORS.SCRIPT_NOT_ALLOWED)
  assert.equal(resolveInternalScript('CANCEL'), null)
})

test('144-ABI: one send maps trusted facts to the exact reviewed request/argv/cancel protocol', () => {
  const built = buildSendRequest({
    deliveryId: DELIVERY.deliveryId, artifact: ARTIFACT, target: TARGET, runRoot: path.join(SOURCE_DIR, 'run'), now: NOW,
  })
  assert.equal(built.ok, true, JSON.stringify(built))
  const { files, request } = built.value
  // The request JSON carries exactly the fields voice-sender.ps1 reads.
  assert.deepEqual(Object.keys(request).sort(), [...INTERNAL_WORKER_ABI.scripts.SEND.requestFields].sort())
  assert.equal(request.wav, files.wav)
  assert.equal(request.chat, CHAT)
  assert.equal(request.target.kind, 'private')
  assert.equal(request.target.identityVerified, true)
  assert.equal(request.cancel_file, files.cancel)
  assert.equal(request.global_cancel_file, files.globalCancel)
  // The allow-list is the one verified internal target, never a caller list.
  assert.deepEqual(request.voice_allowed_chats, [CHAT])
  for (const value of [files.request, files.result, files.progress, files.cancel, files.wav]) {
    assert.equal(path.dirname(value), path.join(SOURCE_DIR, 'run'))
  }
  const plan = buildInternalInvocation('SEND', {
    Request: files.request, JsonOut: files.result, ProgressFile: files.progress,
    CancelFile: files.cancel, GlobalCancelFile: files.globalCancel,
  })
  assert.equal(plan.ok, true, JSON.stringify(plan))
  assert.deepEqual(plan.value.argv, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', plan.value.script,
    '-Request', files.request, '-JsonOut', files.result, '-ProgressFile', files.progress,
    '-CancelFile', files.cancel, '-GlobalCancelFile', files.globalCancel,
  ])
  assert.equal(plan.value.shell, false)
  assert.equal(plan.value.interactive, false)
  // The caller still cannot smuggle a path/command: only the ABI parameter names are accepted, and
  // the internal temp-handle parameters must be absolute and traversal-free.
  assert.equal(buildInternalInvocation('SEND', { Request: 'x.json', JsonOut: 'C:\\b.json' }).ok, false)
  assert.equal(buildInternalInvocation('SEND', { Request: 'C:\\a\\..\\b.json', JsonOut: 'C:\\b.json' }).ok, false)
  assert.equal(buildInternalInvocation('SEND', { path: 'C:/x' }).ok, false)
  assert.equal(buildInternalInvocation('SEND', { Request: files.request }).ok, false)
  // A caller cannot supply its own worker chat label: the target directory is authoritative.
  assert.equal(buildSendRequest({
    deliveryId: DELIVERY.deliveryId, artifact: ARTIFACT, target: { ...TARGET, chat: 'C:\\evil' }, runRoot: path.join(SOURCE_DIR, 'run'), now: NOW,
  }).ok, false)
})

test('13-B Artifact-only backend still rejects smuggled facts and closed gates without invoking', async () => {
  const transport = createFixtureTransport()
  const backend = backendWith(transport)
  assert.equal(backend.realOperationAllowed, false)
  assert.equal(backend.health().realReady, false)
  const empty = createInternalSenderOffline({ targets: [], transport })
  assert.equal((await empty.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.TARGET_REJECTED)
  assert.equal((await backend.submit({ delivery: { ...DELIVERY, path: 'C:/tmp/x.wav' }, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.INPUT_INVALID)
  assert.equal((await backend.submit({ delivery: DELIVERY, artifact: { ...ARTIFACT, url: 'https://x' }, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.UNSUPPORTED_CAPABILITY)
  const revoked = createInternalSenderOffline({ targets: [{ ...TARGET, authorized: false }], transport: createFixtureTransport() })
  assert.equal((await revoked.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.TARGET_REJECTED)
  assert.equal(transport.invocations.length, 0)
})

test('144-ONCE: the same delivery id is invoked exactly once, even concurrently and after UNKNOWN', async () => {
  const transport = createFixtureTransport({ results: [{ status: 'SENT_LOCAL', delayMs: 10 }, { status: 'SENT_LOCAL' }] })
  const backend = backendWith(transport)
  const [first, second] = await Promise.all([
    backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET }),
    backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET }),
  ])
  assert.equal(transport.invocations.length, 1)
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(first.receiptId, second.receiptId)
  const again = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(again.existing, true)
  assert.equal(transport.invocations.length, 1)

  // First result UNKNOWN: a duplicate that was already queued must never run a second invocation.
  const unknownTransport = createFixtureTransport({ results: [{ status: 'UNKNOWN', reason: 'loss' }, { status: 'SENT_LOCAL' }] })
  const unknownBackend = backendWith(unknownTransport)
  const [u1, u2] = await Promise.all([
    unknownBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET }),
    unknownBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET }),
  ])
  assert.equal(unknownTransport.invocations.length, 1)
  assert.equal(u1.unknown, true)
  assert.equal(u2.unknown, true)
  const status = await unknownBackend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(status.value.state, 'UNKNOWN')
  assert.equal(status.value.resendAllowed, false)
  assert.equal((await unknownBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
  assert.equal(unknownTransport.invocations.length, 1)
})

test('144-BINDING: an existing delivery can never consume another artifact/target, and queued facts are frozen', async () => {
  const transport = createFixtureTransport({ results: [{ status: 'SENT_LOCAL', delayMs: 20 }, { status: 'SENT_LOCAL' }] })
  const backend = backendWith(transport)
  const queuedDelivery = { ...DELIVERY_B }
  const pending = backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  const queued = backend.submit({ delivery: queuedDelivery, artifact: ARTIFACT, target: CALLER_TARGET_B })
  // Mutating the caller's delivery object after submit must not reach the queued invocation.
  queuedDelivery.deliveryId = 'delivery:' + 'e'.repeat(32)
  queuedDelivery.targetId = 'unknown-target'
  const [first, second] = await Promise.all([pending, queued])
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(transport.invocations.length, 2)
  assert.equal(transport.invocations[1].request.chat, 'fixture-chat-b')
  assert.equal(transport.invocations[1].deliveryId, DELIVERY_B.deliveryId)

  // Same delivery id + another artifact hash / target: refused, zero extra invocation.
  const before = transport.invocations.length
  const conflictingArtifact = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT_B, target: CALLER_TARGET })
  assert.equal(conflictingArtifact.ok, false)
  assert.equal(conflictingArtifact.code, INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
  const conflictingTarget = await backend.submit({ delivery: { ...DELIVERY, targetId: TARGET_B.targetId }, artifact: ARTIFACT, target: CALLER_TARGET_B })
  assert.equal(conflictingTarget.ok, false)
  assert.equal(conflictingTarget.code, INTERNAL_SENDER_ERRORS.DELIVERY_CONFLICT)
  assert.equal(transport.invocations.length, before)
})

test('144-RESULT: missing/empty/thrown worker results are indeterminate, never "provably not sent"', async () => {
  for (const scripted of [{ missing: true }, {}, { status: 42 }, { throwError: true }, null]) {
    const transport = createFixtureTransport({ results: [scripted] })
    const backend = backendWith(transport)
    const result = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(result.ok, false, JSON.stringify(scripted))
    assert.equal(result.unknown, true, JSON.stringify(scripted))
    assert.equal(result.preSubmit, undefined, JSON.stringify(scripted))
    assert.equal(result.code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
    assert.equal(result.recoveryRequired, true)
    const status = await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal(status.value.state, 'UNKNOWN')
    assert.equal((await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
    assert.equal(transport.invocations.length, 1)
  }
  // Only a worker refusal that provably happened before the UI is a pre-submit failure.
  const rejected = createFixtureTransport({ results: [{ status: 'REJECTED', reason: 'chat_not_allowed' }] })
  const rejectedBackend = backendWith(rejected)
  const refused = await rejectedBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(refused.preSubmit, true)
  assert.equal(refused.unknown, undefined)
  // A FAILED result after the recording phase may already have sent: indeterminate again.
  const late = createFixtureTransport({ results: [{ status: 'FAILED', reason: 'microphone_lost', phases: ['RECORDING'] }] })
  const lateBackend = backendWith(late)
  const afterUi = await lateBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(afterUi.unknown, true)
})

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try { return await fn(sandbox) } finally { removeConfigSandbox(sandbox) }
}

test('144-CANCEL: request -> confirm / unconfirmed over the real per-job cancel signal', async () => {
  // (a) A cancel that arrives while the job is still queued is a pre-UI cancellation: no worker call.
  const queuedTransport = createFixtureTransport({ results: [{ status: 'SENT_LOCAL', delayMs: 20 }, { status: 'SENT_LOCAL' }] })
  const queuedBackend = backendWith(queuedTransport)
  const first = queuedBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  const second = queuedBackend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  const queuedCancel = await queuedBackend.cancel({ deliveryId: DELIVERY_B.deliveryId })
  assert.equal(queuedCancel.ok, true)
  assert.equal(queuedCancel.requested, true)
  assert.equal(queuedCancel.confirmed, true)
  assert.equal(queuedCancel.cancelStage, 'CANCELLED_BEFORE_UI')
  const [, secondResult] = await Promise.all([first, second])
  assert.equal(secondResult.cancelled, true)
  assert.equal(secondResult.cancelStage, 'CANCELLED_BEFORE_UI')
  assert.equal(queuedTransport.invocations.length, 1)
  assert.equal(queuedBackend.stats().cancelled, 1)

  // (b) A worker is running: the cancel writes the real per-job signal file and stays "requested"
  // until the worker's own observed result confirms it. The accepted receipt is never erased.
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true }] })
  const backend = backendWith(transport)
  const accepted = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.backendState, 'QUEUED')
  const requested = await backend.cancel({ deliveryId: DELIVERY.deliveryId })
  assert.equal(requested.ok, true)
  assert.equal(requested.requested, true)
  assert.equal(requested.confirmed, false)
  assert.equal(requested.state, 'CANCEL_REQUESTED')
  assert.equal(transport.cancelSignals.length, 1)
  assert.equal(transport.cancelSignals[0].cancelFile, transport.invocations[0].files.cancel)
  assert.equal(transport.cancelSignals[0].payload.reason, 'USER_CANCELLED')
  const confirmed = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(confirmed.value.state, 'CANCELLED')
  assert.equal(confirmed.value.cancel.requested, true)
  assert.equal(confirmed.value.cancel.confirmed, true)
  assert.equal(confirmed.value.cancel.stage, 'CANCELLED_CONFIRMED')
  assert.equal(confirmed.value.receiptId, accepted.receiptId)
  assert.equal(confirmed.value.accepted, true)
  const late = await backend.cancel({ deliveryId: DELIVERY.deliveryId })
  assert.equal(late.ok, false)
  assert.equal(late.code, INTERNAL_SENDER_ERRORS.CANCEL_TOO_LATE)
  assert.equal(transport.cancelSignals.length, 1)

  // (c) The worker cannot prove the cancellation: UNKNOWN, the accepted fact/receipt survives, and
  // the delivery is never resent.
  const unprovenTransport = createFixtureTransport({
    results: [{ dispatchOnly: true }],
    cancelResult: { status: 'CANCELLED', reason: 'USER_CANCELLED:cancel_unconfirmed', cancel_bubble_appeared: true },
  })
  const unproven = backendWith(unprovenTransport)
  const acceptedUnproven = await unproven.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  await unproven.cancel({ deliveryId: DELIVERY.deliveryId })
  const unknownStatus = await unproven.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(unknownStatus.value.state, 'UNKNOWN')
  assert.equal(unknownStatus.value.accepted, true)
  assert.equal(unknownStatus.value.receiptId, acceptedUnproven.receiptId)
  assert.equal(unknownStatus.value.cancel.confirmed, false)
  assert.equal(unknownStatus.value.recoveryRequired, true)
  assert.equal((await unproven.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
  assert.equal(unprovenTransport.invocations.length, 1)

  // (d) A cancel signal that cannot be delivered is recorded as requested but never confirmed.
  for (const option of [{ cancelThrows: true }, { cancelRejected: true }]) {
    const broken = createFixtureTransport({ results: [{ dispatchOnly: true }], ...option })
    const brokenBackend = backendWith(broken)
    await brokenBackend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    const result = await brokenBackend.cancel({ deliveryId: DELIVERY.deliveryId })
    assert.equal(result.ok, false)
    assert.equal(result.requested, true)
    assert.equal(result.confirmed, false)
    assert.equal(result.code, INTERNAL_SENDER_ERRORS.FIXTURE_REJECTED)
  }

  // (e) A cancel for an unknown delivery is an input error, not a silent success.
  const unknown = await backendWith(createFixtureTransport()).cancel({ deliveryId: DELIVERY.deliveryId })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.code, INTERNAL_SENDER_ERRORS.INPUT_INVALID)
})

test('13-B recovery: the reviewed recover tool is exposed as a static ABI descriptor, never executed', () => {
  const backend = backendWith(createFixtureTransport())
  const status = backend.recover({ action: 'status' })
  assert.equal(status.ok, true)
  assert.equal(status.value.executed, false)
  assert.equal(status.value.realReady, false)
  assert.deepEqual(status.value.argv.slice(0, 5), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', status.value.script])
  assert.equal(status.value.argv.includes('-Status'), true)
  assert.equal(status.value.argv.includes('-JsonOut'), true)
  const restore = backend.recover({ action: 'restore' })
  assert.equal(restore.value.argv.includes('-Status'), false)
  assert.equal(restore.value.argv.includes('-JsonOut'), true)
  assert.equal(backend.recover({ action: 'reinstall' }).code, INTERNAL_SENDER_ERRORS.INPUT_INVALID)
})

test('13-B Voice: a trusted SAVED artifact reaches the internal backend through the relay exactly once', async () => {
  await withSandbox(async (sandbox) => {
    const voice = await createVoiceSavedTask(sandbox, {
      now: '2026-10-27T00:00:00.000Z', saveNow: '2026-10-27T00:00:01.000Z',
      expiresAt: '2026-10-28T00:00:00.000Z', proofRef: 'fixture-rights:relay-demo',
    })
    const transport = createFixtureTransport()
    const internal = createInternalSenderOffline({ targets: [TARGET], transport, now: () => VOICE_NOW })
    const relay = await openUnifiedRelay({ sandbox, backend: internal, targets: RELAY_TARGETS, now: () => VOICE_NOW })
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
    assert.equal(transport.invocations[0].request.wav.endsWith('.wav'), true)
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
    const internal = createInternalSenderOffline({ targets: [TARGET], transport, now: () => '2026-11-01T00:00:02.000Z' })
    const relay = await openUnifiedRelay({ sandbox, backend: internal, targets: RELAY_TARGETS, now: () => '2026-11-01T00:00:02.000Z' })
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

test('145-ASYNC-TERMINAL: a verdict that arrives while invoke is awaiting is final', async () => {
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true, delayMs: 30 }] })
  const backend = backendWith(transport)
  const pending = backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  await new Promise((resolve) => setTimeout(resolve, 5))
  // The worker's terminal verdict is observed before the dispatch acknowledgement resolves.
  transport.resolveLater(DELIVERY.deliveryId, { status: 'UNKNOWN', reason: 'result_file_lost' })
  const observed = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(observed.value.state, 'UNKNOWN')
  const submitted = await pending
  assert.equal(submitted.unknown, true)
  assert.equal(submitted.preSubmit, undefined)
  const after = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(after.value.state, 'UNKNOWN', 'a late dispatch acknowledgement must not reopen ACCEPTED')
  assert.equal(after.value.accepted, false)
  assert.equal(after.value.receiptId, null)
  assert.equal(transport.invocations.length, 1)
})

test('145-ASYNC-TERMINAL: a settled verdict is never rewritten by concurrent or later observations', async () => {
  const transport = createFixtureTransport({
    results: [{ dispatchOnly: true }],
    cancelResult: { status: 'CANCELLED', reason: 'USER_CANCELLED:CANCELLED_CONFIRMED', cancel_stage: 'CANCELLED_CONFIRMED', cancel_bubble_appeared: false },
  })
  const backend = backendWith(transport)
  const accepted = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  await backend.cancel({ deliveryId: DELIVERY.deliveryId })
  const [first, second] = await Promise.all([
    backend.status({ deliveryId: DELIVERY.deliveryId }),
    backend.status({ deliveryId: DELIVERY.deliveryId }),
  ])
  assert.equal(first.value.state, 'CANCELLED')
  assert.equal(first.value.cancel.confirmed, true)
  assert.equal(second.value.state, 'CANCELLED')
  assert.equal(second.value.receiptId, accepted.receiptId)
  // A contradictory late result may not rewrite the terminal state or its flags.
  transport.resolveLater(DELIVERY.deliveryId, { status: 'SENT_LOCAL' })
  const late = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(late.value.state, 'CANCELLED')
  assert.equal(late.value.cancel.confirmed, true)
  assert.equal(late.value.receiptId, accepted.receiptId)
  transport.resolveLater(DELIVERY.deliveryId, { status: 'UNKNOWN', reason: 'late' })
  const later = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(later.value.state, 'CANCELLED')
  assert.equal(later.value.cancel.stage, 'CANCELLED_CONFIRMED')
})

test('145-QUEUED-OBSERVE: a delivery that was never invoked cannot consume a worker result', async () => {
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true }, { status: 'SENT_LOCAL' }] })
  const backend = backendWith(transport)
  const first = backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  await first
  // The second delivery is still queued behind the held slot; a pre-set "old" result must not leak.
  transport.resolveLater(DELIVERY_B.deliveryId, { status: 'SENT_LOCAL' })
  const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  const queuedStatus = await backend.status({ deliveryId: DELIVERY_B.deliveryId })
  assert.equal(queuedStatus.value.state, 'QUEUED')
  assert.equal(queuedStatus.value.sentLocal, false)
  assert.equal(transport.invocations.length, 1, 'the queued delivery must not be invoked while the slot is held')
  transport.resolveLater(DELIVERY.deliveryId, { status: 'SENT_LOCAL' })
  const settledFirst = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(settledFirst.value.state, 'SENT_LOCAL')
  // A query-observed verdict is logical only: without trusted exit/recovery the slot stays held.
  assert.equal(settledFirst.value.leaseReleased, false)
  assert.equal(settledFirst.value.occupancy, 'HELD')
  assert.equal(transport.invocations.length, 1)
  transport.release(DELIVERY.deliveryId)
  const releasedFirst = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(releasedFirst.value.leaseReleased, true)
  assert.equal(releasedFirst.value.occupancy, 'RELEASED')
  const secondResult = await second
  assert.equal(secondResult.sentLocal, true)
  assert.equal(transport.invocations.length, 2)
  assert.equal(transport.invocations.filter((item) => item.deliveryId === DELIVERY_B.deliveryId).length, 1)
})

test('145-PENDING-SERIAL: the single execution slot covers the whole worker holding period', async () => {
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true }, { status: 'SENT_LOCAL' }] })
  const backend = backendWith(transport)
  const first = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(first.accepted, true)
  assert.equal(first.pending, true)
  const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(transport.invocations.length, 1, 'no second worker may start while the first has no terminal')
  assert.equal(backend.stats().invocations, 1)
  // A logical UNKNOWN is not proof that the worker/device resources were released.
  transport.resolveLater(DELIVERY.deliveryId, { status: 'UNKNOWN', reason: 'worker_lost' })
  const settled = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(settled.value.state, 'UNKNOWN')
  assert.equal(settled.value.leaseReleased, false)
  assert.equal(settled.value.occupancy, 'HELD')
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(transport.invocations.length, 1, 'an UNKNOWN verdict alone must not start the next worker')
  // Trusted offline exit/recovery evidence finally releases the single slot.
  transport.release(DELIVERY.deliveryId)
  const released = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(released.value.occupancy, 'RELEASED')
  const secondResult = await second
  assert.equal(secondResult.sentLocal, true)
  assert.equal(transport.invocations.length, 2)
})

test('145-RESULT-BAD-EVIDENCE: malformed or contradictory evidence is indeterminate, never a clean verdict', async () => {
  const cases = [
    [{ status: 'CANCELLED', cancel_stage: 'UNKNOWN' }, 'UNKNOWN stage is not a confirmed cancel'],
    [{ status: 'CANCELLED', cancel_stage: 42 }, 'bad stage type'],
    [{ status: 'CANCELLED', cancel_stage: 'SOMETHING_ELSE' }, 'unrecognized stage'],
    [{ status: 'CANCELLED', cancel_bubble_appeared: 'yes' }, 'bad bubble type'],
    [{ status: 'CANCELLED', reasons: 1, reason: 42 }, 'bad reason type'],
    [{ status: 'CANCELLED', cancel_stage: 'CANCELLED_CONFIRMED', timeline: [42] }, 'bad timeline entry'],
    [{ status: 'REJECTED', reason: 'nope', phases: ['SENDING'] }, 'rejection after the UI'],
    [{ status: 'REJECTED', reason: 'nope', timeline: [{ text: 'right Alt released (send)' }] }, 'rejection after the release'],
    [{ status: 'FAILED', reason: 'x', phases: 'RECORDING' }, 'bad phases container'],
    [{ status: 'FAILED', reason: 'x', timeline: {} }, 'bad timeline container'],
    [{ status: 'FAILED', reason: 'x', phases: ['RECORDING'] }, 'failure after recording'],
    [{ status: 42 }, 'no usable status'],
  ]
  for (const [scripted, label] of cases) {
    const transport = createFixtureTransport({ results: [scripted] })
    const backend = backendWith(transport)
    const result = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(result.ok, false, label)
    assert.equal(result.unknown, true, label)
    assert.equal(result.preSubmit, undefined, label)
    const status = await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal(status.value.state, 'UNKNOWN', label)
    assert.equal(status.value.cancel.confirmed, false, label)
    assert.equal(transport.invocations.length, 1, label)
  }
  // Well-formed pre-UI evidence is still a deterministic pre-submit refusal.
  for (const scripted of [
    { status: 'REJECTED', reason: 'chat_not_allowed' },
    { status: 'FAILED', reason: 'wav_missing', phases: ['TARGET_VERIFIED'] },
    { status: 'FAILED', reason: 'busy', timeline: ['   20ms preflight failed'] },
  ]) {
    const transport = createFixtureTransport({ results: [scripted] })
    const backend = backendWith(transport)
    const result = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(result.preSubmit, true, JSON.stringify(scripted))
    assert.equal(result.unknown, undefined, JSON.stringify(scripted))
  }
})

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }

test('147-UNKNOWN-LEASE: a logical UNKNOWN keeps the single execution slot until trusted exit/recovery', async () => {
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true }, { status: 'SENT_LOCAL' }] })
  const backend = backendWith(transport)
  const first = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(first.pending, true)
  const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  transport.resolveLater(DELIVERY.deliveryId, { status: 'UNKNOWN', reason: 'result_file_lost' })
  const unknown = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(unknown.value.state, 'UNKNOWN')
  assert.equal(unknown.value.recoveryRequired, true)
  assert.equal(unknown.value.occupancy, 'HELD')
  assert.equal(unknown.value.leaseReleased, false)
  // A static recovery descriptor is not proof of exit/recovery and must not free the slot.
  const descriptor = backend.recover({ action: 'restore' })
  assert.equal(descriptor.ok, true)
  assert.equal(descriptor.value.executed, false)
  await sleep(10)
  assert.equal(transport.invocations.length, 1, 'the next worker must not start on a logical UNKNOWN')
  // The same delivery is still terminal and never resent.
  assert.equal((await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })).code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
  assert.equal(transport.invocations.length, 1)
  transport.release(DELIVERY.deliveryId)
  const released = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(released.value.state, 'UNKNOWN')
  assert.equal(released.value.occupancy, 'RELEASED')
  const secondResult = await second
  assert.equal(secondResult.sentLocal, true)
  assert.equal(transport.invocations.length, 2)
})

test('147-UNKNOWN-LEASE: invoke-side missing/empty/throw results also retain the lease', async () => {
  for (const scripted of [{ missing: true }, {}, { throwError: true }, null]) {
    const transport = createFixtureTransport({ results: [scripted, { status: 'SENT_LOCAL' }] })
    const backend = backendWith(transport)
    const first = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(first.unknown, true, JSON.stringify(scripted))
    const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
    await sleep(10)
    assert.equal(transport.invocations.length, 1, 'no second worker before exit/recovery: ' + JSON.stringify(scripted))
    const status = await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal(status.value.occupancy, 'HELD')
    transport.release(DELIVERY.deliveryId)
    await backend.status({ deliveryId: DELIVERY.deliveryId })
    const secondResult = await second
    assert.equal(secondResult.sentLocal, true)
    assert.equal(transport.invocations.length, 2)
  }
})

test('147-UNKNOWN-LEASE: an unconfirmed cancellation and a failed device restore both hold the slot', async () => {
  // (a) query-observed CANCELLED with an UNKNOWN stage is not a confirmed cancel and holds the slot.
  {
    const transport = createFixtureTransport({
      results: [{ dispatchOnly: true }, { status: 'SENT_LOCAL' }],
      cancelResult: { status: 'CANCELLED', reason: 'USER_CANCELLED:cancel_unconfirmed', cancel_stage: 'UNKNOWN', cancel_bubble_appeared: false },
    })
    const backend = backendWith(transport)
    await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
    await backend.cancel({ deliveryId: DELIVERY.deliveryId })
    const unknown = await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal(unknown.value.state, 'UNKNOWN')
    assert.equal(unknown.value.cancel.confirmed, false)
    assert.equal(unknown.value.occupancy, 'HELD')
    await sleep(10)
    assert.equal(transport.invocations.length, 1)
    transport.release(DELIVERY.deliveryId)
    await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal((await second).sentLocal, true)
  }
  // (b) an invoke-returned SENT_LOCAL that reports a failed device restore is a logical success but
  // the resource unit is not proven recovered, so the slot stays occupied until release evidence.
  {
    const transport = createFixtureTransport({ results: [{ status: 'SENT_LOCAL', reason: 'bubble:fixture', restore_ok: false }, { status: 'SENT_LOCAL' }] })
    const backend = backendWith(transport)
    const first = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(first.sentLocal, true)
    const status = await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal(status.value.state, 'SENT_LOCAL')
    assert.equal(status.value.occupancy, 'HELD')
    const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
    await sleep(10)
    assert.equal(transport.invocations.length, 1)
    transport.release(DELIVERY.deliveryId)
    await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal((await second).sentLocal, true)
    assert.equal(transport.invocations.length, 2)
  }
})

test('147-POST-INVOKE-EXCEPTION: a failure after the invoke boundary is UNKNOWN, never preSubmit', async () => {
  let calls = 0
  const nowFn = () => {
    calls += 1
    if (calls === 1) return NOW
    if (calls === 2) throw new Error('clock failure after invoke')
    return NOW
  }
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true }, { status: 'SENT_LOCAL' }] })
  const backend = createInternalSenderOffline({ targets: [TARGET, TARGET_B], transport, now: nowFn })
  const first = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(first.unknown, true, 'an exception after invoke is indeterminate')
  assert.equal(first.preSubmit, undefined)
  assert.equal(first.code, INTERNAL_SENDER_ERRORS.UNKNOWN_NO_RESEND)
  const status = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(status.value.state, 'UNKNOWN')
  assert.equal(status.value.occupancy, 'HELD')
  const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  await sleep(10)
  assert.equal(transport.invocations.length, 1)
  transport.release(DELIVERY.deliveryId)
  await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal((await second).sentLocal, true)
})

test('147-POST-INVOKE-EXCEPTION: a definite pre-invoke rejection stays preSubmit and frees the slot', async () => {
  let calls = 0
  const nowFn = () => {
    calls += 1
    if (calls === 1) throw new Error('clock unavailable before invoke')
    return NOW
  }
  const transport = createFixtureTransport({ results: [{ status: 'SENT_LOCAL' }] })
  const backend = createInternalSenderOffline({ targets: [TARGET, TARGET_B], transport, now: nowFn })
  const first = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  assert.equal(first.preSubmit, true)
  assert.equal(first.unknown, undefined)
  const second = await backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  assert.equal(second.sentLocal, true)
  assert.equal(transport.invocations.length, 1)
  assert.equal(transport.invocations[0].deliveryId, DELIVERY_B.deliveryId)
})

test('147-CANCEL-EVIDENCE-CONTRADICTION: a before-UI cancel carrying UI evidence is UNKNOWN', async () => {
  const contradictions = [
    { status: 'CANCELLED', cancel_stage: 'CANCELLED_BEFORE_UI', cancel_bubble_appeared: false, phases: ['RECORDING'] },
    { status: 'CANCELLED', cancel_stage: 'CANCELLED_BEFORE_UI', cancel_bubble_appeared: false, phases: ['SENDING'] },
    { status: 'CANCELLED', cancel_bubble_appeared: false, phases: ['RECORDING'] },
    { status: 'CANCELLED', cancel_stage: 'CANCELLED_BEFORE_UI', cancel_bubble_appeared: false, timeline: ['right Alt down'] },
  ]
  for (const scripted of contradictions) {
    const transport = createFixtureTransport({ results: [scripted] })
    const backend = backendWith(transport)
    const result = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(result.ok, false, JSON.stringify(scripted))
    assert.equal(result.unknown, true, JSON.stringify(scripted))
    assert.equal(result.cancelled, undefined, JSON.stringify(scripted))
    const status = await backend.status({ deliveryId: DELIVERY.deliveryId })
    assert.equal(status.value.state, 'UNKNOWN', JSON.stringify(scripted))
    assert.equal(status.value.cancel.confirmed, false, JSON.stringify(scripted))
    assert.equal(status.value.occupancy, 'HELD', JSON.stringify(scripted))
  }
  // A legal CANCELLED_CONFIRMED may carry recording evidence and is still a confirmed cancel.
  {
    const transport = createFixtureTransport({ results: [{ status: 'CANCELLED', cancel_stage: 'CANCELLED_CONFIRMED', cancel_bubble_appeared: false, phases: ['RECORDING'] }] })
    const backend = backendWith(transport)
    const result = await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
    assert.equal(result.cancelled, true)
    assert.equal(result.cancelStage, 'CANCELLED_CONFIRMED')
  }
})

test('147-QUEUED-CANCEL-PROMISE: a queued cancellation resolves its own submit promise at once', async () => {
  const transport = createFixtureTransport({ results: [{ dispatchOnly: true }, { status: 'SENT_LOCAL' }] })
  const backend = backendWith(transport)
  await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  const second = backend.submit({ delivery: DELIVERY_B, artifact: ARTIFACT, target: CALLER_TARGET_B })
  const cancelled = await backend.cancel({ deliveryId: DELIVERY_B.deliveryId })
  assert.equal(cancelled.confirmed, true)
  const secondResult = await Promise.race([second, sleep(120).then(() => 'TIMEOUT')])
  assert.notEqual(secondResult, 'TIMEOUT', 'the cancelled delivery must not wait for the other delivery')
  assert.equal(secondResult.cancelled, true)
  assert.equal(transport.invocations.length, 1)
  transport.release(DELIVERY.deliveryId)
  await backend.status({ deliveryId: DELIVERY.deliveryId })
  await sleep(10)
  assert.equal(transport.invocations.length, 1, 'a cancelled queued delivery is never invoked later')
})

test('147-CANCEL-ERROR-RETURN: a failed cancel write still reports a verdict that arrived meanwhile', async () => {
  const base = createFixtureTransport({ results: [{ dispatchOnly: true }] })
  let openGate = null
  const gate = new Promise((resolve) => { openGate = resolve })
  const transport = {
    ...base,
    async writeCancel(signal) {
      base.cancelSignals.push(signal)
      await gate
      throw new Error('cancel signal write failed')
    },
  }
  const backend = backendWith(transport)
  await backend.submit({ delivery: DELIVERY, artifact: ARTIFACT, target: CALLER_TARGET })
  const cancelPending = backend.cancel({ deliveryId: DELIVERY.deliveryId })
  transport.resolveLater(DELIVERY.deliveryId, { status: 'SENT_LOCAL' })
  const settled = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(settled.value.state, 'SENT_LOCAL')
  openGate()
  const cancelResult = await cancelPending
  assert.equal(cancelResult.state, 'SENT_LOCAL', 'the settled verdict wins over a stale CANCEL_REQUESTED')
  assert.equal(cancelResult.confirmed, false)
  assert.equal(transport.invocations.length, 1)
  const after = await backend.status({ deliveryId: DELIVERY.deliveryId })
  assert.equal(after.value.state, 'SENT_LOCAL')
})
