/* Whale Voice — isolated persistent task catalog (Plan 08-D-A, OFFLINE / FIXTURE_ONLY).
 *
 * A minimal, isolated catalog that persists only the initial AudioTask v1 record
 * (CREATED / BLOCKED_RIGHTS), issues owner task ids and prevents duplicate creation. It reuses
 * the existing trusted temporary sandbox capability, the existing AudioTask create/validate/
 * project functions and the existing shared Fixture input boundary. It never runs a provider or
 * the 08-C runner, never advances a task, never saves audio or creates delivery/Relay candidates.
 *
 * Since Plan 08-D-C the verified filesystem transaction machinery lives in the private shared
 * `fixture-task-store-internal.mjs` module, which is also used by the 08-D-C task owner. This module
 * keeps its original three public exports, 15 error codes, schema, budget and behaviour.
 */

import { copyFixtureInput, deepFreezeFixtureValue } from './fixture-input-boundary.mjs'
import crypto from 'node:crypto'
import { isTrustedSandbox } from '../config-sandbox.mjs'
import {
  createAudioTaskRecord,
  projectAudioTask,
  validateAudioTaskRecord,
} from './task-contract.mjs'
import {
  checkSandbox,
  enqueue,
  getStoreState,
  hasOwn,
  identityHashOf,
  isPlainObject,
  isStoreFailure,
  keySurface,
  openCatalogFile,
  raiseStore,
  storeReason,
  MAX_CATALOG_ENTRIES,
  SCOPE_PATTERN,
  KEY_PATTERN,
  STORE_DOMAINS,
  TASK_ID_PATTERN,
} from './fixture-task-store-internal.mjs'

export const TASK_CATALOG_SCHEMA_VERSION = 1

const ERROR_KEYS = Object.freeze([
  'INVALID_INPUT',
  'RESOURCE_LIMIT',
  'UNSUPPORTED_VERSION',
  'SANDBOX_INVALID',
  'DRAFT_REJECTED',
  'STORE_INVALID',
  'STORE_CHANGED',
  'IDEMPOTENCY_CONFLICT',
  'ID_COLLISION',
  'NOT_FOUND',
  'WRITE_REJECTED',
  'WRITE_UNKNOWN',
  'CATALOG_UNKNOWN',
  'DEPENDENCY_FAILURE',
  'INTERNAL_FAILURE',
])

/** Fixed error protocol. Every value is `TASK_CATALOG_` plus the key itself. */
export const TASK_CATALOG_ERRORS = Object.freeze(
  Object.fromEntries(ERROR_KEYS.map((key) => [key, 'TASK_CATALOG_' + key])),
)

const PLACEHOLDER_TASK_ID = 'task:fixture-catalog-validation'

const RESERVE_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'idempotencyKey', 'draft', 'observedAt']))
const GET_KEYS = Object.freeze(new Set(['schemaVersion', 'scopeId', 'taskId']))
const DRAFT_KEYS = Object.freeze(
  new Set(['schemaVersion', 'feature', 'taskType', 'source', 'voiceProfileId', 'deliveryRequested', 'rights']),
)
const INITIAL_STATES = Object.freeze(new Set(['CREATED', 'BLOCKED_RIGHTS']))

function failure(key, errorPath) {
  const code = TASK_CATALOG_ERRORS[key] || TASK_CATALOG_ERRORS.INTERNAL_FAILURE
  return deepFreezeFixtureValue({
    ok: false,
    errors: [{ code, path: errorPath, reason: storeReason(key) }],
  })
}

function raise(key, errorPath) {
  raiseStore(key, errorPath)
}

function toFailure(error) {
  if (isStoreFailure(error) && TASK_CATALOG_ERRORS[error.key]) return failure(error.key, error.errorPath)
  return failure('INTERNAL_FAILURE', '$')
}

function readRootInput(input, allowed) {
  const copied = copyFixtureInput(input)
  if (!copied.ok) raise(copied.key, '$')
  const payload = copied.value
  if (!isPlainObject(payload)) raise('INVALID_INPUT', '$')
  const surface = keySurface(payload, allowed)
  if (surface === 'unknown') raise('INVALID_INPUT', '<unknown-key>')
  if (surface !== 'ok') raise('INVALID_INPUT', '$')
  if (payload.schemaVersion !== TASK_CATALOG_SCHEMA_VERSION) raise('UNSUPPORTED_VERSION', 'schemaVersion')
  return payload
}

function readDraft(payload) {
  if (!isPlainObject(payload)) raise('INVALID_INPUT', 'draft')
  for (const key of Reflect.ownKeys(payload)) {
    if (typeof key !== 'string' || !DRAFT_KEYS.has(key)) raise('INVALID_INPUT', 'draft')
  }
  for (const key of ['schemaVersion', 'feature', 'taskType', 'source', 'voiceProfileId', 'rights']) {
    if (!hasOwn(payload, key)) raise('INVALID_INPUT', 'draft')
  }
  const deliveryRequested = hasOwn(payload, 'deliveryRequested') ? payload.deliveryRequested : false
  return {
    schemaVersion: payload.schemaVersion,
    taskId: PLACEHOLDER_TASK_ID,
    feature: payload.feature,
    taskType: payload.taskType,
    source: payload.source,
    voiceProfileId: payload.voiceProfileId,
    deliveryRequested,
    rights: payload.rights,
  }
}

function draftFromRecord(record, taskId) {
  return {
    schemaVersion: record.schemaVersion,
    taskId,
    feature: record.feature,
    taskType: record.taskType,
    source: { kind: record.source.kind, ref: record.source.ref },
    voiceProfileId: record.voiceProfileId,
    deliveryRequested: record.deliveryRequested,
    rights: { state: record.rights.state },
  }
}

function createInitialRecord(draft, observedAt) {
  let created
  try {
    created = createAudioTaskRecord(draft, { observedAt })
  } catch {
    raise('DRAFT_REJECTED', 'draft')
  }
  if (!created || typeof created !== 'object' || typeof created.ok !== 'boolean') {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (created.ok === false) raise('DRAFT_REJECTED', 'draft')
  let validated
  try {
    validated = validateAudioTaskRecord(created.value)
  } catch {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (!validated || validated.ok !== true) raise('DRAFT_REJECTED', 'draft')
  if (!INITIAL_STATES.has(validated.value.state)) raise('DRAFT_REJECTED', 'draft')
  return validated.value
}

function successValue(outcome, revision, task) {
  return deepFreezeFixtureValue({
    ok: true,
    value: {
      schemaVersion: TASK_CATALOG_SCHEMA_VERSION,
      outcome,
      revision,
      task,
      mockOnly: true,
      realOperationAllowed: false,
      submitAllowed: false,
      automaticRetryAllowed: false,
    },
  })
}

function projectOrFail(record) {
  let projected
  try {
    projected = projectAudioTask(record)
  } catch {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (!projected || typeof projected !== 'object' || typeof projected.ok !== 'boolean') {
    raise('DEPENDENCY_FAILURE', '$')
  }
  if (projected.ok === false) raise('DEPENDENCY_FAILURE', '$')
  if (!isPlainObject(projected.value)) raise('DEPENDENCY_FAILURE', '$')
  return projected.value
}

function catalogFile(state) {
  return openCatalogFile(state, STORE_DOMAINS.CATALOG)
}

async function reserveOnce(state, input) {
  if (state.locked) return failure('CATALOG_UNKNOWN', '$')
  try {
    const payload = readRootInput(input, RESERVE_KEYS)
    if (typeof payload.scopeId !== 'string' || !SCOPE_PATTERN.test(payload.scopeId)) {
      raise('INVALID_INPUT', 'scopeId')
    }
    if (typeof payload.idempotencyKey !== 'string' || !KEY_PATTERN.test(payload.idempotencyKey)) {
      raise('INVALID_INPUT', 'idempotencyKey')
    }
    const draft = readDraft(payload.draft)
    const canonical = createInitialRecord(draft, payload.observedAt)
    const identityHash = identityHashOf(canonical)

    const file = catalogFile(state)
    const catalog = file.read()
    const existing = catalog.entries.find(
      (entry) => entry.scopeId === payload.scopeId && entry.idempotencyKey === payload.idempotencyKey,
    )
    if (existing) {
      if (existing.identityHash !== identityHash) raise('IDEMPOTENCY_CONFLICT', '$')
      return successValue('EXISTING', catalog.revision, projectOrFail(existing.record))
    }

    let taskId = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = 'task:fixture-' + cryptoRandomHex()
      if (!catalog.entries.some((entry) => entry.record.taskId === candidate)) {
        taskId = candidate
        break
      }
    }
    if (taskId === null) raise('ID_COLLISION', '$')

    const finalDraft = draftFromRecord(canonical, taskId)
    const finalRecord = createInitialRecord(finalDraft, payload.observedAt)
    if (!INITIAL_STATES.has(finalRecord.state)) raise('DEPENDENCY_FAILURE', '$')
    if (identityHashOf(finalRecord) !== identityHash) raise('DEPENDENCY_FAILURE', '$')

    const entry = {
      scopeId: payload.scopeId,
      idempotencyKey: payload.idempotencyKey,
      identityHash,
      record: finalRecord,
    }
    const nextSnapshot = {
      schemaVersion: TASK_CATALOG_SCHEMA_VERSION,
      revision: catalog.revision + 1,
      entries: [...catalog.entries, entry],
    }
    if (nextSnapshot.entries.length > MAX_CATALOG_ENTRIES) raise('RESOURCE_LIMIT', '$')
    const bytes = Buffer.from(JSON.stringify(nextSnapshot), 'utf8')
    const revision = file.write(bytes, catalog.digest, nextSnapshot.revision)
    return successValue('CREATED', revision, projectOrFail(finalRecord))
  } catch (error) {
    return toFailure(error)
  }
}

async function getOnce(state, input) {
  if (state.locked) return failure('CATALOG_UNKNOWN', '$')
  try {
    const payload = readRootInput(input, GET_KEYS)
    if (typeof payload.scopeId !== 'string' || !SCOPE_PATTERN.test(payload.scopeId)) {
      raise('INVALID_INPUT', 'scopeId')
    }
    if (typeof payload.taskId !== 'string' || !TASK_ID_PATTERN.test(payload.taskId)) {
      raise('INVALID_INPUT', 'taskId')
    }
    const catalog = catalogFile(state).read()
    const entry = catalog.entries.find(
      (item) => item.scopeId === payload.scopeId && item.record.taskId === payload.taskId,
    )
    if (!entry) raise('NOT_FOUND', '$')
    return successValue('FOUND', catalog.revision, projectOrFail(entry.record))
  } catch (error) {
    return toFailure(error)
  }
}

function readSandboxOption(options) {
  if (!isPlainObject(options)) raise('INVALID_INPUT', '$')
  const keys = Reflect.ownKeys(options)
  if (keys.length !== 1 || keys[0] !== 'sandbox') {
    raise('INVALID_INPUT', keys.length === 0 ? '$' : '<unknown-key>')
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, 'sandbox')
  if (!descriptor || !hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
    raise('INVALID_INPUT', '$')
  }
  if (!isTrustedSandbox(descriptor.value)) raise('SANDBOX_INVALID', '$')
  return descriptor.value
}

/**
 * Open one isolated persistent task catalog over a trusted temporary sandbox capability.
 * @param {{sandbox: object}} options
 * @returns {Promise<{ok:true,value:{reserve:Function,get:Function}}|{ok:false,errors:Array<object>}>}
 */
export async function openFixtureTaskCatalog(options) {
  let sandbox
  try {
    sandbox = readSandboxOption(options)
  } catch (error) {
    return toFailure(error)
  }
  const state = getStoreState(sandbox)
  try {
    return await enqueue(state, async () => {
      try {
        if (state.locked) return failure('CATALOG_UNKNOWN', '$')
        checkSandbox(state)
        catalogFile(state).read()
        const handle = Object.freeze({
          reserve: (input) => enqueue(state, () => reserveOnce(state, input)),
          get: (input) => enqueue(state, () => getOnce(state, input)),
        })
        return deepFreezeFixtureValue({ ok: true, value: handle })
      } catch (error) {
        return toFailure(error)
      }
    })
  } catch (error) {
    return toFailure(error)
  }
}

/* TaskId suffix generator kept private: the catalog stays the only id issuer. */
function cryptoRandomHex() {
  return crypto.randomBytes(16).toString('hex')
}
