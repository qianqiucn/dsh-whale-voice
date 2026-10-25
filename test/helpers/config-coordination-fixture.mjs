/* Test-only in-memory source adapter and fake runtime for the Phase 4B-2A protocol.
 *
 * This is not a production file adapter and does not claim atomic file writes. Production adapters
 * must use the owning component's supported API (or the existing ConfigStore/atomic primitives).
 */

import { createHash } from 'node:crypto'
import { canonicalize } from '../../core/config-schema.mjs'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function revisionOf(document) {
  return createHash('sha256').update(JSON.stringify(canonicalize(document))).digest('hex').slice(0, 32)
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function issue(code, path, reason) {
  return { code, path, reason }
}

const BRIDGE_FIELDS = ['enabled', 'mode', 'forGroup', 'autoProbability', 'defaultVoice']
const SENDER_FIELDS = ['tts', 'automation']
const TTS_FIELDS = ['provider', 'model', 'voice']

function validateBridge(current, set) {
  const errors = []
  const document = clone(current)
  const changes = []
  for (const key of Object.keys(set)) {
    if (!BRIDGE_FIELDS.includes(key)) {
      errors.push(issue('CONFIG_COORDINATION_UNKNOWN_FIELD', key, 'unknown Bridge field'))
      continue
    }
    const value = set[key]
    if (key === 'enabled' || key === 'forGroup') {
      if (typeof value !== 'boolean') errors.push(issue('CONFIG_COORDINATION_TYPE_INVALID', key, 'expected boolean'))
      else if (document[key] !== value) {
        document[key] = value
        changes.push({ path: key })
      }
    } else if (key === 'mode') {
      if (value !== 'explicit') errors.push(issue('CONFIG_COORDINATION_ENUM_INVALID', key, 'only explicit is supported'))
      else if (document[key] !== value) {
        document[key] = value
        changes.push({ path: key })
      }
    } else if (key === 'autoProbability') {
      if (!Number.isInteger(value) || value < 0 || value > 100) errors.push(issue('CONFIG_COORDINATION_RANGE_INVALID', key, 'expected 0..100 integer'))
      else if (document[key] !== value) {
        document[key] = value
        changes.push({ path: key })
      }
    } else if (key === 'defaultVoice') {
      if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
        errors.push(issue('CONFIG_COORDINATION_STRING_INVALID', key, 'invalid voice id'))
      } else if (document[key] !== value) {
        document[key] = value
        changes.push({ path: key })
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, document, changes }
}

function validateSender(current, set) {
  const errors = []
  const document = clone(current)
  const changes = []
  for (const key of Object.keys(set)) {
    if (!SENDER_FIELDS.includes(key)) {
      errors.push(issue('CONFIG_COORDINATION_UNKNOWN_FIELD', key, 'unknown Sender field'))
      continue
    }
    if (key === 'automation') {
      if (!['manual', 'auto', 'disabled'].includes(set.automation)) errors.push(issue('CONFIG_COORDINATION_ENUM_INVALID', key, 'invalid automation'))
      else if (document.automation !== set.automation) {
        document.automation = set.automation
        changes.push({ path: 'automation' })
      }
      continue
    }
    if (!isObject(set.tts)) {
      errors.push(issue('CONFIG_COORDINATION_TYPE_INVALID', 'tts', 'expected object'))
      continue
    }
    for (const ttsKey of Object.keys(set.tts)) {
      if (!TTS_FIELDS.includes(ttsKey)) {
        errors.push(issue('CONFIG_COORDINATION_UNKNOWN_FIELD', 'tts.' + ttsKey, 'unknown TTS field'))
        continue
      }
      const value = set.tts[ttsKey]
      if (ttsKey === 'provider' && !['qwen-local', 'cloud', 'custom'].includes(value)) {
        errors.push(issue('CONFIG_COORDINATION_ENUM_INVALID', 'tts.provider', 'invalid provider'))
      } else if (ttsKey === 'model' && value !== null && typeof value !== 'string') {
        errors.push(issue('CONFIG_COORDINATION_TYPE_INVALID', 'tts.model', 'expected string or null'))
      } else if (ttsKey === 'voice' && (typeof value !== 'string' || !value.trim())) {
        errors.push(issue('CONFIG_COORDINATION_STRING_INVALID', 'tts.voice', 'expected non-empty string'))
      } else if (document.tts[ttsKey] !== value) {
        document.tts[ttsKey] = value
        changes.push({ path: 'tts.' + ttsKey })
      }
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, document, changes }
}

function publicBridge(document) {
  return {
    enabled: document.enabled,
    mode: document.mode,
    forGroup: document.forGroup,
    autoProbability: document.autoProbability,
    defaultVoice: document.defaultVoice,
  }
}

function publicSender(document) {
  return {
    tts: {
      provider: document.tts?.provider ?? null,
      model: document.tts?.model ?? null,
      voice: document.tts?.voice ?? null,
    },
    automation: document.automation ?? null,
  }
}

export function createFixtureSource(id, options = {}) {
  let document = clone(options.document || {})
  let currentRevision = revisionOf(document)
  let readFailure = options.readFailure || null
  let saveFailure = options.saveFailure || null
  let rollbackFailure = options.rollbackFailure || null
  let saves = 0
  let rollbacks = 0
  const history = new Map([[currentRevision, clone(document)]])

  return {
    id,
    simulatedOnly: true,
    supportsRuntimeConfirmation: options.supportsRuntimeConfirmation === true,
    async read() {
      if (readFailure) throw Object.assign(new Error('fixture read failure'), { code: readFailure })
      return { ok: true, document: clone(document), revision: currentRevision }
    },
    async validateChange(current, set) {
      if (id === 'bridgeVoice') return validateBridge(current, set)
      if (id === 'senderService') return validateSender(current, set)
      return { ok: false, errors: [issue('CONFIG_COORDINATION_SOURCE_READ_ONLY', id, 'read-only fixture')] }
    },
    async save({ document: next, expectedRevision }) {
      saves += 1
      if (saveFailure) {
        throw Object.assign(new Error('fixture save failure'), {
          code: saveFailure,
          writeOutcome: options.saveFailureOutcome || 'NOT_WRITTEN',
        })
      }
      if (expectedRevision !== currentRevision) {
        return { ok: false, error: { code: 'CONFIG_COORDINATION_CONFLICT' } }
      }
      const previousRevision = currentRevision
      const previousDocument = clone(document)
      document = clone(next)
      currentRevision = revisionOf(document)
      history.set(currentRevision, clone(document))
      return { ok: true, revision: currentRevision, previousRevision, previousDocument }
    },
    async rollback({ toRevision, toDocument }) {
      rollbacks += 1
      if (rollbackFailure) {
        throw Object.assign(new Error('fixture rollback failure'), { code: rollbackFailure })
      }
      const restored = history.get(toRevision) || toDocument
      if (!restored) return { ok: false, error: { code: 'CONFIG_COORDINATION_ROLLBACK_UNAVAILABLE' } }
      document = clone(restored)
      currentRevision = toRevision || revisionOf(document)
      history.set(currentRevision, clone(document))
      return { ok: true, revision: currentRevision }
    },
    publicSettings(value) {
      if (id === 'bridgeVoice') return publicBridge(value)
      if (id === 'senderService') return publicSender(value)
      return null
    },
    externalWrite(value) {
      document = clone(value)
      currentRevision = revisionOf(document)
      history.set(currentRevision, clone(document))
      return currentRevision
    },
    get revision() { return currentRevision },
    get document() { return clone(document) },
    get saveCount() { return saves },
    get rollbackCount() { return rollbacks },
  }
}

export function createFakeRuntime(options = {}) {
  const mode = options.mode || 'confirm'
  const otherRevision = options.otherRevision || 'b'.repeat(32)
  let calls = 0
  let dispatchCalls = 0
  return {
    async apply({ savedRevision } = {}) {
      calls += 1
      if (mode === 'throw') throw new Error('fake runtime unavailable')
      if (mode === 'reject') return { ok: false, code: 'RUNTIME_REJECTED' }
      if (mode === 'unknown') return { ok: false, code: 'RUNTIME_UNKNOWN' }
      if (mode === 'mismatch') return { ok: true, loadedRevision: otherRevision, activeRevision: otherRevision }
      if (mode === 'old') return { ok: true, loadedRevision: 'c'.repeat(32), activeRevision: 'c'.repeat(32) }
      if (mode === 'empty') return { ok: true, loadedRevision: '', activeRevision: '' }
      if (mode === 'forged') return { ok: true, loadedRevision: 'not-a-revision', activeRevision: 'not-a-revision' }
      return { ok: true, loadedRevision: savedRevision, activeRevision: savedRevision }
    },
    dispatchVoice() {
      dispatchCalls += 1
    },
    get calls() { return calls },
    get dispatchCalls() { return dispatchCalls },
  }
}
