import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'

import { createConfigSandbox, removeConfigSandbox } from '../core/config-sandbox.mjs'
import { copyFixtureInput } from '../core/audio/fixture-input-boundary.mjs'
import { openFixtureTaskCatalog, TASK_CATALOG_ERRORS } from '../core/audio/task-catalog.mjs'
import { runExistingFixtureTaskOnce } from '../core/audio/task-fixture-engine-internal.mjs'
import { openFixtureTaskOwner, TASK_OWNER_ERRORS, TASK_OWNER_SCHEMA_VERSION } from '../core/audio/task-owner.mjs'
import * as storeModule from '../core/audio/fixture-task-store-internal.mjs'

const OWNER_FILE = 'audio-task-owner-v1.json'
const CATALOG_FILE = 'audio-task-catalog-v1.json'
const MARKER_FILE = '.whale-voice-sandbox.json'
const NOW = '2026-10-27T00:00:00.000Z'
const BASE = new URL('../core/audio/', import.meta.url).href

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function example(heading) {
  const doc = fs.readFileSync('docs/TASK_FIXTURE_RUNNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function docExample(heading) {
  const doc = fs.readFileSync('docs/TASK_OWNER_OFFLINE.md', 'utf8')
  const at = doc.indexOf(heading)
  assert.ok(at >= 0, heading)
  const fence = doc.indexOf('```json', at)
  const close = doc.indexOf('```', fence + 7)
  return JSON.parse(doc.slice(fence + 7, close).trim())
}

function filePath(sandbox, name) {
  return path.join(sandbox.root, name)
}

function readJson(sandbox, name) {
  return JSON.parse(fs.readFileSync(filePath(sandbox, name), 'utf8'))
}

function ownerBytes(sandbox) {
  try {
    return fs.readFileSync(filePath(sandbox, OWNER_FILE))
  } catch {
    return null
  }
}

function catalogBytes(sandbox) {
  return fs.readFileSync(filePath(sandbox, CATALOG_FILE))
}

async function withSandbox(fn) {
  const sandbox = createConfigSandbox()
  try {
    return await fn(sandbox)
  } finally {
    removeConfigSandbox(sandbox)
  }
}

async function birth(sandbox, ex, key, mutateDraft) {
  const opened = await openFixtureTaskCatalog({ sandbox })
  assert.equal(opened.ok, true)
  const binding = ex.sourceInput.voiceBinding
  const draft = clone(binding.taskDraft)
  delete draft.taskId
  if (mutateDraft) mutateDraft(draft)
  const reserved = await opened.value.reserve({
    schemaVersion: 1,
    scopeId: binding.expectation.scopeId,
    idempotencyKey: key,
    draft,
    observedAt: NOW,
  })
  assert.equal(reserved.ok, true, reserved.ok ? '' : reserved.errors[0].code)
  const snapshot = readJson(sandbox, CATALOG_FILE)
  const entry = snapshot.entries[snapshot.entries.length - 1]
  const input = clone(ex)
  input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
  input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
  return { scopeId: binding.expectation.scopeId, taskId: entry.record.taskId, input, record: entry.record, handle: opened.value }
}

function runFrame(b) {
  return { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: b.input }
}

function getFrame(b) {
  return { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }
}

function expectOwnerError(result, key, errorPath) {
  assert.equal(result.ok, false, JSON.stringify(result))
  assert.equal(result.errors[0].code, TASK_OWNER_ERRORS[key])
  if (errorPath !== undefined) assert.equal(result.errors[0].path, errorPath)
}

/* ---------------------------------------------------------------- worker */

/* One VM module graph shares one store instance for the catalog facade and the owner: the same
 * WeakMap state, the same serial queue, the same per-file digests and the same unknown lock. The
 * fs proxy injects faults at the real call site (never before the call) and supports phase
 * predicates, so "after the real claim rename" / "after the real FINAL rename" are real phases. */
const OWNER_WORKER = (base) => `
import vm from 'node:vm'
import fsReal from 'node:fs'
import pathReal from 'node:path'
import cryptoReal from 'node:crypto'

const base = ${JSON.stringify(base)}
const scenario = JSON.parse(process.env.OWNER_SCENARIO)
const counts = { engine: 0, imports: 0, fsFaults: 0, ownerRenames: 0, renames: { owner: { attempt: 0, success: 0 }, artifact: { attempt: 0, success: 0 } } }
let birthsDone = false
let hits = 0
let faultAt = null
let legalBirthValid = null
const getterCalls = { count: 0 }
let lastBirthPayload = null
let root = ''
const fdPaths = new Map()

function readText(file) {
  try { return fsReal.readFileSync(file, 'utf8') } catch { return null }
}

function ownerPhase() {
  const text = readText(root + '/audio-task-owner-v1.json')
  if (text === null) return 'MISSING'
  if (text.length === 0) return 'EMPTY'
  if (text.includes('"phase":"FINAL"')) return 'FINAL'
  if (text.includes('"phase":"CLAIMED"')) return 'CLAIMED'
  return 'OTHER'
}

function legalBirthAdd() {
  const file = root + '/audio-task-catalog-v1.json'
  const snapshot = JSON.parse(fsReal.readFileSync(file, 'utf8'))
  const copy = JSON.parse(JSON.stringify(snapshot.entries[0]))
  const n = snapshot.entries.length
  copy.record.taskId = 'task:fixture-' + (n + 1).toString(16).padStart(32, '0')
  copy.idempotencyKey = 'key:fixture-extra-' + n
  snapshot.entries.push(copy)
  snapshot.revision = snapshot.entries.length
  fsReal.writeFileSync(file, JSON.stringify(snapshot))
}

function legalBirthChange() {
  const file = root + '/audio-task-catalog-v1.json'
  const snapshot = JSON.parse(fsReal.readFileSync(file, 'utf8'))
  snapshot.entries[0].record.observedAt = '2026-10-27T01:02:03.000Z'
  fsReal.writeFileSync(file, JSON.stringify(snapshot))
  let valid = false
  try {
    real.store.parseCatalogSnapshot(fsReal.readFileSync(file))
    valid = true
  } catch {
    valid = false
  }
  legalBirthValid = valid
  return valid
}

function foreignOwnerBytes() {
  const file = root + '/audio-task-owner-v1.json'
  const source = fsReal.readFileSync(file, 'utf8')
  const replaced = source.replace(/[0-9a-f]{64}/, (hash) => {
    const last = hash[hash.length - 1]
    return hash.slice(0, -1) + (last === '0' ? '1' : '0')
  })
  return Buffer.from(replaced, 'utf8')
}

function foreignArtifactBytes() {
  const file = root + '/audio-artifacts-v1.json'
  const source = fsReal.readFileSync(file, 'utf8')
  const replaced = source.replace(
    /"createdAt":"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})[.]([0-9]{3})Z"/,
    (all, head, ms) => all.replace('.' + ms + 'Z', '.' + (ms === '000' ? '001' : '000') + 'Z'),
  )
  if (replaced === source) throw new Error('AF_NO_CHANGE')
  return Buffer.from(replaced, 'utf8')
}

function whenMatches(when) {
  if (!when || when === 'always') return true
  if (when === 'engine0') return counts.engine === 0
  if (when === 'afterBirth') return birthsDone
  if (when === 'engineDone') return counts.engine >= 1
  if (when === 'claimOnDisk') return counts.engine === 0 && ownerPhase() === 'CLAIMED'
  if (when === 'diskClaimed') return ownerPhase() === 'CLAIMED'
  if (when === 'diskFinal') return ownerPhase() === 'FINAL'
  return false
}

function applyFileAction(fault) {
  if (fault.action === 'corrupt-birth') {
    fsReal.writeFileSync(root + '/audio-task-catalog-v1.json', '{bad')
    return true
  }
  if (fault.action === 'legal-birth-add') {
    legalBirthAdd()
    return true
  }
  if (fault.action === 'legal-birth-change') {
    legalBirthChange()
    return true
  }
  return false
}

const fsProxy = new Proxy({}, {
  get(_target, prop) {
    const original = fsReal[prop]
    if (typeof original !== 'function') return original
    return function (...args) {
      const fdTarget = typeof args[0] === 'number' ? (fdPaths.get(args[0]) || '') : ''
      const file = typeof args[0] === 'string' ? args[0] : fdTarget
      if (prop === 'renameSync' && (scenario.saveLstatFault || scenario.saveJointFault)) {
        const renameBase = String(args[1] || '').split(String.fromCharCode(92)).join('/').split('/').pop()
        if (renameBase === 'audio-task-owner-v1.json') counts.finalRenames = (counts.finalRenames || 0) + 1
      }
      if (prop === 'lstatSync' && (scenario.saveLstatFault || scenario.saveJointFault)) {
        const lstatName = String(args[0] || '').split(String.fromCharCode(92)).join('/').split('/').pop()
        const result = original.apply(fsReal, args)
        if (lstatName === 'audio-task-owner-v1.json' && (counts.finalRenames || 0) >= 2) {
          counts.finalOwnerLstats = (counts.finalOwnerLstats || 0) + 1
          if (scenario.saveLstatFault && counts.finalOwnerLstats === scenario.saveLstatFault.occurrence) {
            counts.fsFaults += 1
            const error = new Error('EIO')
            error.code = 'EIO'
            throw error
          }
          if (scenario.saveJointFault && scenario.saveJointFault.kind === 'owner' && counts.finalOwnerLstats === scenario.saveJointFault.occurrence) {
            fsReal.writeFileSync(root + '/audio-task-owner-v1.json', foreignOwnerBytes())
            counts.fsFaults += 1
          }
        }
        if (lstatName === 'audio-task-owner-v1.json' && counts.finalOwnerLstats === 3) {
          counts.jointTaskRead = true
        }
        if (lstatName === 'audio-artifacts-v1.json' && scenario.saveJointFault && scenario.saveJointFault.kind === 'artifact' && counts.jointTaskRead) {
          counts.finalArtifactLstats = (counts.finalArtifactLstats || 0) + 1
          if (counts.finalArtifactLstats === scenario.saveJointFault.occurrence) {
            fsReal.writeFileSync(root + '/audio-artifacts-v1.json', foreignArtifactBytes())
            counts.fsFaults += 1
          }
        }
        return result
      }
      if (prop === 'fsyncSync' && scenario.saveFsyncFault) {
        const fsyncPath = fdPaths.get(args[0]) || ''
        const fsyncName = fsyncPath.split(String.fromCharCode(92)).join('/').split('/').pop()
        if (/^audio-task-owner-v1\.[0-9a-f]+\.tmp$/.test(fsyncName)) {
          counts.ownerFsyncs = (counts.ownerFsyncs || 0) + 1
          const result = original.apply(fsReal, args)
          if (counts.ownerFsyncs === scenario.saveFsyncFault.occurrence) {
            const foreign =
              scenario.saveFsyncFault.action === 'AF'
                ? foreignArtifactBytes()
                : foreignOwnerBytes()
            const name = scenario.saveFsyncFault.action === 'AF' ? 'audio-artifacts-v1.json' : 'audio-task-owner-v1.json'
            fsReal.writeFileSync(root + '/' + name, foreign)
            counts.fsFaults += 1
          }
          return result
        }
      }
      if (prop === 'renameSync' && scenario.saveRenameFault) {
        const parts = String(args[1] || '').split(String.fromCharCode(92)).join('/').split('/')
        const renameName = parts[parts.length - 1]
        const kind =
          renameName === 'audio-task-owner-v1.json'
            ? 'owner'
            : renameName === 'audio-artifacts-v1.json'
              ? 'artifact'
              : null
        if (kind) {
          const record = counts.renames[kind]
          record.attempt += 1
          const saveFault = scenario.saveRenameFault
          const isFault = saveFault.kind === kind && record.attempt === saveFault.occurrence
          const result = original.apply(fsReal, args)
          record.success += 1
          if (isFault) {
            counts.fsFaults += 1
            const error = new Error('EIO')
            error.code = 'EIO'
            throw error
          }
          return result
        }
      }
      const fault = scenario.fsFault
      if (fault && prop === fault.call && file.includes(fault.match) && whenMatches(fault.when)) {
        hits += 1
        if (counts.fsFaults === 0 && hits === (fault.skip || 0) + 1) {
          if (fault.after === true) {
            // The real call runs first and its real result is returned; only after a real success does
            // the injected action happen. A real failure propagates untouched (no second call, no mask).
            const real = original.apply(fsReal, args)
            counts.fsFaults += 1
            faultAt = {
              call: prop,
              engine: counts.engine,
              ownerPhase: ownerPhase(),
              ownerRenames: counts.ownerRenames,
              afterRealCall: true,
              realCallOk: true,
              args0: String(args[0]).slice(-24),
            }
            applyFileAction(fault)
            if (prop === 'openSync' && typeof real === 'number') fdPaths.set(real, String(args[0]))
            return real
          }
          counts.fsFaults += 1
          faultAt = {
            call: prop,
            engine: counts.engine,
            ownerPhase: ownerPhase(),
            ownerRenames: counts.ownerRenames,
            afterRealCall: false,
            args0: String(args[0]).slice(-24),
          }
          if (applyFileAction(fault)) return original.apply(fsReal, args)
          const error = new Error('injected fs fault')
          error.code = 'EIO'
          throw error
        }
      }
      const result = original.apply(fsReal, args)
      if (prop === 'openSync' && typeof result === 'number') fdPaths.set(result, String(args[0]))
      if (prop === 'closeSync') fdPaths.delete(args[0])
      if (prop === 'renameSync' && String(args[1]).includes('audio-task-owner-v1.json')) counts.ownerRenames += 1
      return result
    }
  },
})

const real = {
  engine: await import(new URL('task-fixture-engine-internal.mjs', base).href),
  sandbox: await import(new URL('../config-sandbox.mjs', base).href),
  store: await import(new URL('fixture-task-store-internal.mjs', base).href),
}

const synth = (url, ns) => new vm.SyntheticModule(Object.keys(ns), function () {
  for (const key of Object.keys(ns)) this.setExport(key, ns[key])
}, { identifier: url })

const engineUrl = new URL('task-fixture-engine-internal.mjs', base).href
const storeUrl = new URL('fixture-task-store-internal.mjs', base).href
const catalogUrl = new URL('task-catalog.mjs', base).href
const ownerUrl = new URL('task-owner.mjs', base).href

const wrappedEngine = (frame) => {
  counts.engine += 1
  const out = real.engine.runExistingFixtureTaskOnce(frame)
  const fault = scenario.engineFault
  if (!fault || counts.engine !== 1) return out
  if (fault === 'throw') throw new Error('injected engine throw')
  if (fault === 'null') return { record: null, result: out.result }
  const copy = JSON.parse(JSON.stringify(out))
  if (fault === 'identity') copy.record.taskId = 'task:fixture-' + 'f'.repeat(32)
  else if (fault === 'phase') copy.result.value.phase = 'WEIRD'
  else if (fault === 'projection') copy.result.value.task.state = 'CANCELLED'
  else if (fault === 'flag') copy.result.value.realOperationAllowed = true
  else if (fault === 'submit-flag') copy.result.value.submitAllowed = true
  else if (fault === 'missing-field') delete copy.result.value.submitAllowed
  else if (fault === 'schema-version') copy.result.value.schemaVersion = 2
  else if (fault === 'states') copy.result.value.states = [copy.result.value.states[0]]
  else if (fault === 'accessor') Object.defineProperty(copy.result.value, 'task', {
    enumerable: true,
    configurable: true,
    get() { throw new Error('injected accessor') },
  })
  else if (fault === 'task-getter') Object.defineProperty(copy.result.value.task, 'state', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls.count += 1
      return out.result.value.task.state
    },
  })
  else if (fault === 'task-hidden') Object.defineProperty(copy.result.value.task, 'hiddenNote', {
    enumerable: false,
    configurable: true,
    value: 'hidden',
  })
  else if (fault === 'task-symbol') copy.result.value.task[Symbol('secret')] = 'symbol'
  else if (fault === 'root-extra') copy.extra = 1
  else if (fault === 'result-extra') copy.result.extra = true
  return copy
}
const engineModule = new vm.SyntheticModule(
  [
    'TASK_FIXTURE_ERRORS',
    'TASK_FIXTURE_SCHEMA_VERSION',
    'runExistingFixtureTaskOnce',
    'runExistingFixtureTaskBytesOnce',
  ],
  function () {
    this.setExport('TASK_FIXTURE_ERRORS', real.engine.TASK_FIXTURE_ERRORS)
    this.setExport('TASK_FIXTURE_SCHEMA_VERSION', real.engine.TASK_FIXTURE_SCHEMA_VERSION)
    this.setExport('runExistingFixtureTaskOnce', wrappedEngine)
    // Plan 08-E-C: the real bytes entry is forwarded unchanged; the legacy fault wrapper above keeps
    // its own original scope and never becomes a fake success for the save path.
    this.setExport('runExistingFixtureTaskBytesOnce', (bytesFrame) => {
      counts.engine += 1
      const out = real.engine.runExistingFixtureTaskBytesOnce(bytesFrame)
      const fault = scenario.bytesFault
      if (!fault || counts.engine !== 1) return out
      // Keep the real production bytes carrier; only the single target field is replaced.
      const production = { ...out.production, inspection: { ...out.production.inspection } }
      const value = { ...out.result.value }
      if (fault === 'channels') production.inspection.channels = 3
      else if (fault === 'peak') production.inspection.peak = 2
      else if (fault === 'flags') production.realOperationAllowed = true
      else if (fault === 'execution') value.execution = 'not-an-object'
      else if (fault === 'states-getter') {
        const states = value.states.slice()
        Object.defineProperty(states, states.length - 1, {
          enumerable: true,
          get() {
            getterCalls.count += 1
            return 'PROCESSING'
          },
        })
        value.states = states
      } else if (fault === 'shadow') {
        const bytes = out.production.bytes
        Object.defineProperty(bytes, 'length', { get() { getterCalls.count += 1; return 0 } })
        Object.defineProperty(bytes, 'byteLength', { get() { getterCalls.count += 1; return 0 } })
        Object.defineProperty(bytes, Symbol.toStringTag, { get() { getterCalls.count += 1; return 'NotBytes' } })
        production.bytes = bytes
      } else if (fault === 'resizable') {
        const bytes = out.production.bytes
        const buffer = new ArrayBuffer(bytes.length, { maxByteLength: bytes.length * 2 })
        new Uint8Array(buffer).set(bytes)
        production.bytes = new Uint8Array(buffer)
      }
      if (fault === 'missing-production') return { record: out.record, result: { ok: true, value } }
      if (fault === 'clone') return { record: out.record, result: { ok: true, value }, production }
      return { record: out.record, result: { ok: true, value }, production }
    })
  },
  { identifier: engineUrl },
)

const baseUrl = new URL('fixture-store-base-internal.mjs', base).href
const baseSource = fsReal.readFileSync(new URL(baseUrl), 'utf8')
const baseModule = new vm.SourceTextModule(baseSource, { identifier: baseUrl })
await baseModule.link(async (specifier) => {
  if (specifier === 'node:fs') return synth('node:fs', { default: fsProxy })
  if (specifier === 'node:crypto') return synth('node:crypto', { default: cryptoReal })
  const url = new URL(specifier, baseUrl).href
  return synth(url, await import(url))
})
await baseModule.evaluate()

const artifactUrl = new URL('fixture-artifact-store-internal.mjs', base).href
const artifactModule = new vm.SourceTextModule(fsReal.readFileSync(new URL(artifactUrl), 'utf8'), {
  identifier: artifactUrl,
})
await artifactModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === baseUrl) return baseModule
  if (specifier === 'node:fs') return synth('node:fs', { default: fsProxy })
  if (specifier === 'node:path') return synth('node:path', { default: pathReal })
  if (specifier === 'node:crypto') return synth('node:crypto', { default: cryptoReal })
  return synth(url, await import(url))
})
await artifactModule.evaluate()

const storeSource = fsReal.readFileSync(new URL(storeUrl), 'utf8')
const storeModule = new vm.SourceTextModule(storeSource, { identifier: storeUrl })
await storeModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === engineUrl) return engineModule
  if (url === baseUrl) return baseModule
  if (url === artifactUrl) return artifactModule
  if (specifier === 'node:fs') return synth('node:fs', { default: fsProxy })
  if (specifier === 'node:path') return synth('node:path', { default: pathReal })
  if (specifier === 'node:crypto') return synth('node:crypto', { default: cryptoReal })
  return synth(url, await import(url))
})
await storeModule.evaluate()

const libraryUrl = new URL('artifact-library.mjs', base).href
const libraryModule = new vm.SourceTextModule(fsReal.readFileSync(new URL(libraryUrl), 'utf8'), {
  identifier: libraryUrl,
})
await libraryModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === storeUrl) return storeModule
  if (url === artifactUrl) return artifactModule
  if (specifier === 'node:fs') return synth('node:fs', { default: fsProxy })
  if (specifier === 'node:path') return synth('node:path', { default: pathReal })
  if (specifier === 'node:crypto') return synth('node:crypto', { default: cryptoReal })
  return synth(url, await import(url))
})
await libraryModule.evaluate()

// The owner must see the same library instance; only the counting wrapper is added here.
const libraryNamespace = libraryModule.namespace
const ownerLibraryModule = new vm.SyntheticModule(
  [
    'ARTIFACT_LIBRARY_SCHEMA_VERSION',
    'ARTIFACT_LIBRARY_LIMITS',
    'ARTIFACT_LIBRARY_ERRORS',
    'openFixtureArtifactLibrary',
    'importInQueue',
  ],
  function () {
    this.setExport('ARTIFACT_LIBRARY_SCHEMA_VERSION', libraryNamespace.ARTIFACT_LIBRARY_SCHEMA_VERSION)
    this.setExport('ARTIFACT_LIBRARY_LIMITS', libraryNamespace.ARTIFACT_LIBRARY_LIMITS)
    this.setExport('ARTIFACT_LIBRARY_ERRORS', libraryNamespace.ARTIFACT_LIBRARY_ERRORS)
    this.setExport('openFixtureArtifactLibrary', libraryNamespace.openFixtureArtifactLibrary)
    this.setExport('importInQueue', (state, input) => {
      counts.imports += 1
      return libraryNamespace.importInQueue(state, input)
    })
  },
  { identifier: libraryUrl },
)

const catalogSource = fsReal.readFileSync(new URL(catalogUrl), 'utf8')
const catalogModule = new vm.SourceTextModule(catalogSource, { identifier: catalogUrl })
await catalogModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === storeUrl) return storeModule
  return synth(url, await import(url))
})
await catalogModule.evaluate()

const storeNamespace = storeModule.namespace
const storeNames = Object.keys(storeNamespace)
const ownerStoreModule = new vm.SyntheticModule(storeNames, function () {
  for (const name of storeNames) {
    if (name === 'openOwnerFile') continue
    this.setExport(name, storeNamespace[name])
  }
  this.setExport('openOwnerFile', (state) => {
    const file = storeNamespace.openOwnerFile(state)
    return Object.freeze({
      name: file.name,
      read: file.read,
      readVerified: file.readVerified,
      write: (bytes, baseDigest, revision, proof) => {
        if (proof && scenario.badProof) {
          const tampered = {
            ...proof,
            artifact: { ...proof.artifact, artifactRef: 'artifact:fixture-bytes-' + 'f'.repeat(32) },
          }
          return file.write(bytes, baseDigest, revision, tampered)
        }
        return file.write(bytes, baseDigest, revision, proof)
      },
    })
  })
}, { identifier: storeUrl })

const ownerSource = fsReal.readFileSync(new URL(ownerUrl), 'utf8')
const ownerModule = new vm.SourceTextModule(ownerSource, { identifier: ownerUrl })
await ownerModule.link(async (specifier, referencing) => {
  const url = new URL(specifier, referencing.identifier).href
  if (url === storeUrl) return ownerStoreModule
  if (url === engineUrl) return engineModule
  if (url === artifactUrl) return artifactModule
  if (url === libraryUrl) return ownerLibraryModule
  return synth(url, await import(url))
})
await ownerModule.evaluate()

const sandbox = real.sandbox.createConfigSandbox()
root = sandbox.root
try {
  const ex = (heading) => {
    const doc = fsReal.readFileSync(new URL('../../docs/TASK_FIXTURE_RUNNER_OFFLINE.md', base), 'utf8')
    const at = doc.indexOf(heading)
    const fenceMark = String.fromCharCode(96, 96, 96)
    const fence = doc.indexOf(fenceMark + 'json', at)
    const close = doc.indexOf(fenceMark, fence + 7)
    return JSON.parse(doc.slice(fence + 7, close).trim())
  }
  const source = ex(scenario.example || '## 7.')
  const binding = source.sourceInput.voiceBinding
  const catalog = await catalogModule.namespace.openFixtureTaskCatalog({ sandbox })

  const birthFrom = async (heading, key, mutateDraft) => {
    const src = heading ? ex(heading) : source
    const bind = src.sourceInput.voiceBinding
    const draft = JSON.parse(JSON.stringify(bind.taskDraft))
    delete draft.taskId
    if (mutateDraft) mutateDraft(draft)
    const payload = {
      schemaVersion: 1,
      scopeId: bind.expectation.scopeId,
      idempotencyKey: key,
      draft,
      observedAt: '2026-10-27T00:00:00.000Z',
    }
    const reserved = await catalog.value.reserve(payload)
    if (!reserved.ok) throw new Error('birth failed: ' + reserved.errors[0].code)
    lastBirthPayload = payload
    const snapshot = JSON.parse(fsReal.readFileSync(root + '/audio-task-catalog-v1.json', 'utf8'))
    const entry = snapshot.entries[snapshot.entries.length - 1]
    const input = JSON.parse(JSON.stringify(src))
    input.sourceInput.voiceBinding.taskDraft.taskId = entry.record.taskId
    input.sourceInput.voiceBinding.taskDraft.source.ref = entry.record.source.ref
    if (scenario.context) input.context.scenario = scenario.context
    return { scopeId: bind.expectation.scopeId, taskId: entry.record.taskId, input }
  }
  const birthOne = (key) => birthFrom(null, key)

  const mode = scenario.mode || 'single'
  const firstBirth = await birthOne(scenario.key || 'key:fixture-worker')
  const secondBirth = mode === 'twoTasks' ? await birthOne(scenario.key2 || 'key:fixture-worker-b') : null
  const catalogBefore = fsReal.readFileSync(root + '/audio-task-catalog-v1.json', 'utf8')
  birthsDone = true

  const results = []
  const record = (label, result) => { results.push({ label, result }) }
  const frame = { schemaVersion: 1, scopeId: firstBirth.scopeId, taskId: firstBirth.taskId, input: firstBirth.input }
  const owner = () => ownerModule.namespace.openFixtureTaskOwner({ sandbox })

  if (mode === 'baseProxy') {
    record('base-sandbox', await owner())
  } else if (mode === 'mixed') {
    const first = await owner()
    const second = await owner()
    const outcomes = await Promise.all([
      first.value.run(frame),
      second.value.run(frame),
      catalog.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }),
    ])
    record('owner-a', outcomes[0])
    record('owner-b', outcomes[1])
    record('catalog-get', outcomes[2])
  } else if (mode === 'double') {
    const opened = await owner()
    const outcomes = await Promise.all([opened.value.run(frame), opened.value.run(frame)])
    record('double-1', outcomes[0])
    record('double-2', outcomes[1])
  } else if (mode === 'retrySameCap') {
    const opened = await owner()
    record('first', await opened.value.run(frame))
    const again = await owner()
    if (!again.ok) record('second-open', again)
    else record('second', await again.value.run(frame))
  } else if (mode === 'save') {
    const opened = await owner()
    if (!opened.ok) {
      record('open', opened)
    } else {
      const saveFrame = {
        schemaVersion: 1,
        scopeId: frame.scopeId,
        taskId: frame.taskId,
        requestKey: scenario.requestKey || 'save:fixture-worker-1',
        now: '2026-10-27T00:00:01.000Z',
        expiresAt: '2026-10-28T00:00:00.000Z',
        rights: { state: 'GRANTED', proofRef: 'fixture-rights:worker-1' },
        input: frame.input,
      }
      record('save', await opened.value.save(saveFrame))
      if (scenario.afterMutate) {
        const name = scenario.afterMutate === 'AF' ? 'audio-artifacts-v1.json' : 'audio-task-owner-v1.json'
        const foreign = scenario.afterMutate === 'AF' ? foreignArtifactBytes() : foreignOwnerBytes()
        fsReal.writeFileSync(root + '/' + name, foreign)
        counts.fsFaults += 1
      }
      record('get', await opened.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
      record('status', await opened.value.artifactStatus({
        schemaVersion: 1,
        scopeId: frame.scopeId,
        taskId: frame.taskId,
        now: '2026-10-27T00:00:02.000Z',
        rights: saveFrame.rights,
      }))
    }
  } else if (mode === 'twoTasks') {
    const opened = await owner()
    record('task-a', await opened.value.run(frame))
    const secondFrame = { schemaVersion: 1, scopeId: secondBirth.scopeId, taskId: secondBirth.taskId, input: secondBirth.input }
    record('task-b', await opened.value.run(secondFrame))
    record('task-a-get', await opened.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
  } else if (mode === 'finalFaultHandles') {
    // Two owner handles and one catalog handle are obtained and proven usable *before* the fault.
    const first = await owner()
    const second = await owner()
    const preGet = await catalog.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId })
    const preReserve = await catalog.value.reserve(JSON.parse(JSON.stringify(lastBirthPayload)))
    record('pre', {
      ok: true,
      value: {
        ownerHandles: first.ok && second.ok,
        catalogGet: preGet.ok,
        reserveOutcome: preReserve.ok ? preReserve.value.outcome : 'ERR:' + preReserve.errors[0].code,
      },
    })
    record('run', await first.value.run(frame))
    const ownerBytesAfterFault = readText(root + '/audio-task-owner-v1.json')
    const catalogBytesAfterFault = readText(root + '/audio-task-catalog-v1.json')
    const engineAfterFault = counts.engine
    const renamesAfterFault = counts.ownerRenames
    record('post-owner-1-run', await first.value.run(frame))
    record('post-owner-1-get', await first.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
    record('post-owner-2-run', await second.value.run(frame))
    record('post-owner-2-get', await second.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
    record('post-catalog-get', await catalog.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
    record('post-catalog-reserve', await catalog.value.reserve(JSON.parse(JSON.stringify(lastBirthPayload))))
    record('post-new-catalog', await catalogModule.namespace.openFixtureTaskCatalog({ sandbox }))
    record('post-new-owner', await ownerModule.namespace.openFixtureTaskOwner({ sandbox }))
    const ownerTextAfter = readText(root + '/audio-task-owner-v1.json')
    const catalogTextAfter = readText(root + '/audio-task-catalog-v1.json')
    record('invariants', {
      ok: true,
      value: {
        ownerBytesSame: ownerBytesAfterFault === ownerTextAfter,
        catalogBytesSame: catalogBytesAfterFault === catalogTextAfter,
        catalogEntries: JSON.parse(catalogTextAfter).entries.length,
        ownerRevision: JSON.parse(ownerTextAfter).revision,
        ownerEntryPhase: JSON.parse(ownerTextAfter).entries[0].phase,
        engine: counts.engine,
        engineUnchanged: counts.engine === engineAfterFault,
        ownerRenames: counts.ownerRenames,
        renamesUnchanged: counts.ownerRenames === renamesAfterFault,
      },
    })
  } else if (mode === 'sweep') {
    const sweep = []
    const sweepRun = async (label, b, input) => {
      const manager = await owner()
      const engineBefore = counts.engine
      const bytesBefore = readText(root + '/audio-task-owner-v1.json')
      const first = await manager.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input })
      const engineAfterFirst = counts.engine
      const bytesAfterFirst = readText(root + '/audio-task-owner-v1.json')
      const modified = JSON.parse(JSON.stringify(input))
      if (modified.context) modified.context.requestId = 'request:fixture-repeat'
      const second = await manager.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: modified })
      const bytesAfterSecond = readText(root + '/audio-task-owner-v1.json')
      sweep.push({
        label,
        outcome: first.ok ? first.value.outcome : 'ERR:' + first.errors[0].code,
        ownerState: first.ok ? first.value.ownerState : 'ERR',
        reason: first.ok ? first.value.reason : 'ERR',
        secondOutcome: second.ok ? second.value.outcome : 'ERR:' + second.errors[0].code,
        engineBefore,
        engineAfterFirst,
        engineAfterSecond: counts.engine,
        bytesStable: bytesAfterFirst !== null && bytesAfterFirst === bytesAfterSecond,
      })
    }
    for (const name of ['SUCCESS', 'OFFLINE', 'MODEL_MISSING', 'TIMEOUT', 'CANCEL_REQUESTED', 'CANCEL_CONFIRMED', 'UNKNOWN']) {
      const b = await birthOne('key:fixture-sweep-' + name.toLowerCase())
      const input = JSON.parse(JSON.stringify(b.input))
      input.context.scenario = name
      await sweepRun(name, b, input)
    }
    const rightsBirth = await birthFrom(null, 'key:fixture-sweep-rights', (draft) => {
      draft.rights.state = 'UNVERIFIED'
    })
    const rightsInput = JSON.parse(JSON.stringify(rightsBirth.input))
    rightsInput.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
    await sweepRun('BLOCK_RIGHTS', rightsBirth, rightsInput)
    const missingBirth = await birthOne('key:fixture-sweep-missing')
    const missingInput = JSON.parse(JSON.stringify(missingBirth.input))
    missingInput.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    await sweepRun('BLOCK_SOURCE', missingBirth, missingInput)
    const readinessBirth = await birthOne('key:fixture-sweep-readiness')
    const readinessInput = JSON.parse(JSON.stringify(readinessBirth.input))
    readinessInput.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    await sweepRun('BLOCK_READINESS', readinessBirth, readinessInput)
    const ttsBirth = await birthFrom('## 8.', 'key:fixture-sweep-tts')
    await sweepRun('BLOCK_TTS', ttsBirth, JSON.parse(JSON.stringify(ttsBirth.input)))
    record('sweep', { ok: true, value: { sweep } })
  } else if (mode === 'twoInputs') {
    const opened = await owner()
    const blocked = JSON.parse(JSON.stringify(firstBirth.input))
    blocked.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    record('blocked', await opened.value.run({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId, input: blocked }))
    const engineAfterBlocked = counts.engine
    const bytesAfterBlocked = readText(root + '/audio-task-owner-v1.json')
    const executable = JSON.parse(JSON.stringify(firstBirth.input))
    executable.sourceInput.artifactLibrary.artifacts[0].availability = 'PRESENT'
    record('executable', await opened.value.run({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId, input: executable }))
    const bytesAfterExecutable = readText(root + '/audio-task-owner-v1.json')
    record('counts', { ok: true, value: { engineAfterBlocked, engineAfterExecutable: counts.engine, stored: bytesAfterBlocked !== null, bytesStable: bytesAfterBlocked !== null && bytesAfterBlocked === bytesAfterExecutable } })
    const again = await owner()
    record('reread', again.ok ? await again.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }) : again)
  } else {
    const opened = await owner()
    if (!opened.ok) {
      record('open', opened)
    } else {
      record('run', await opened.value.run(frame))
      if (mode === 'get') record('get', await opened.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
      if (mode === 'reopen') {
        const again = await owner()
        record('reopen-run', again.ok ? await again.value.run(frame) : again)
      }
      if (scenario.followUp) {
        const again = await owner()
        if (!again.ok) {
          record('followup-open', again)
        } else {
          record('followup-run', await again.value.run(frame))
          record('followup-get', await again.value.get({ schemaVersion: 1, scopeId: frame.scopeId, taskId: frame.taskId }))
        }
      }
    }
  }

  const ownerText = readText(root + '/audio-task-owner-v1.json')
  let ownerRaw = null
  if (ownerText !== null) {
    try { ownerRaw = JSON.parse(ownerText) } catch { ownerRaw = { corrupt: true } }
  }
  const catalogAfter = fsReal.readFileSync(root + '/audio-task-catalog-v1.json', 'utf8')
  let catalogEntries = -1
  try { catalogEntries = JSON.parse(catalogAfter).entries.length } catch { catalogEntries = -1 }
  console.log(JSON.stringify({
    counts,
    faultAt,
    hits,
    legalBirthValid,
    getterCalls: getterCalls.count,
    results,
    ownerRaw,
    ownerPhase: ownerPhase(),
    ownerPresent: ownerText !== null,
    catalogUnchanged: catalogAfter === catalogBefore,
    catalogEntries,
    taskId: firstBirth.taskId,
    files: fsReal.readdirSync(root).sort(),
  }))
} finally {
  real.sandbox.removeConfigSandbox(sandbox)
}
`

function runOwnerWorker(scenario) {
  const script = OWNER_WORKER(BASE)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whale-owner-worker-'))
  const file = path.join(dir, 'worker.mjs')
  fs.writeFileSync(file, script)
  try {
    const output = execFileSync(process.execPath, ['--experimental-vm-modules', file], {
      env: { ...process.env, OWNER_SCENARIO: JSON.stringify(scenario) },
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    })
    return JSON.parse(output.trim())
  } catch (error) {
    throw new Error('owner worker failed: ' + String(error.stderr || error.message).slice(0, 3000))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function workerResult(worker, label) {
  const entry = worker.results.find((item) => item.label === label)
  assert.ok(entry, 'missing worker result: ' + label)
  return entry.result
}

/* ------------------------------------------------------------------ C01 */

test('C01 one accepted attempt: real birth, one engine run, FINAL persisted, catalog untouched', async () => {
  const worker = runOwnerWorker({ key: 'key:fixture-c01', mode: 'get' })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.fsFaults, 0)
  assert.equal(worker.catalogEntries, 1)
  assert.equal(worker.catalogUnchanged, true)
  const run = workerResult(worker, 'run')
  assert.equal(run.ok, true, JSON.stringify(run))
  assert.equal(run.value.outcome, 'RECORDED')
  assert.equal(run.value.ownerState, 'SIMULATED')
  assert.equal(run.value.reason, null)
  assert.equal(run.value.revision, 2)
  assert.equal(run.value.task.taskId, worker.taskId)
  assert.equal(run.value.task.state, 'ARTIFACT_READY')
  assert.deepEqual(Object.keys(run.value), [
    'schemaVersion', 'outcome', 'revision', 'ownerState', 'reason', 'task',
    'userMessageZh', 'mockOnly', 'realOperationAllowed', 'submitAllowed', 'automaticRetryAllowed',
  ])
  const read = workerResult(worker, 'get')
  assert.equal(read.value.outcome, 'FOUND')
  assert.equal(read.value.task.taskId, worker.taskId)
  assert.equal(worker.ownerPhase, 'FINAL')
  assert.equal(worker.ownerRaw.revision, 2)
  assert.equal(worker.ownerRaw.entries.length, 1)
  assert.equal(worker.ownerRaw.entries[0].phase, 'FINAL')
  assert.equal(worker.ownerRaw.entries[0].completion.kind, 'SIMULATED')
  assert.equal(Object.keys(worker.ownerRaw.entries[0].record).length, 16)
  assert.equal(worker.ownerRaw.entries[0].record.observedAt, NOW)
  assert.equal(JSON.stringify(worker.ownerRaw).includes('sourceInput'), false)
  assert.deepEqual(worker.files, [MARKER_FILE, OWNER_FILE, CATALOG_FILE].sort())
})

/* ------------------------------------------------------------------ C02 */

test('C02 same task: concurrent, repeated, reopened and wrong-scope calls never run the engine twice', async () => {
  const double = runOwnerWorker({ key: 'key:fixture-c02-double', mode: 'double' })
  assert.equal(double.counts.engine, 1)
  const states = [workerResult(double, 'double-1'), workerResult(double, 'double-2')].map((r) => r.value.ownerState).sort()
  assert.deepEqual(states, ['SIMULATED', 'SIMULATED'])
  const outcomes = [workerResult(double, 'double-1'), workerResult(double, 'double-2')].map((r) => r.value.outcome).sort()
  assert.deepEqual(outcomes, ['EXISTING', 'RECORDED'])
  assert.equal(double.ownerRaw.revision, 2)

  const reopen = runOwnerWorker({ key: 'key:fixture-c02-reopen', mode: 'reopen' })
  assert.equal(reopen.counts.engine, 1)
  assert.equal(workerResult(reopen, 'run').value.outcome, 'RECORDED')
  assert.equal(workerResult(reopen, 'reopen-run').value.outcome, 'EXISTING')
  assert.equal(workerResult(reopen, 'reopen-run').value.revision, 2)

  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-c02-native')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    const missing = await owner.value.run({
      schemaVersion: 1,
      scopeId: b.scopeId,
      taskId: 'task:fixture-' + 'a'.repeat(32),
      input: b.input,
    })
    expectOwnerError(missing, 'NOT_FOUND', '$')
    const wrongScope = await owner.value.get({ schemaVersion: 1, scopeId: 'scope:fixture-other', taskId: b.taskId })
    expectOwnerError(wrongScope, 'NOT_FOUND', '$')
    assert.equal(ownerBytes(sandbox), null)
    const first = await owner.value.run(runFrame(b))
    assert.equal(first.value.outcome, 'RECORDED')
    const second = await owner.value.run(runFrame(b))
    assert.equal(second.value.outcome, 'EXISTING')
    const after = ownerBytes(sandbox)
    assert.equal(JSON.parse(after).revision, 2)
  })
})

/* ------------------------------------------------------------------ C03 */

test('C03 the seven RVC scenarios persist their real task state and survive reopening', async () => {
  const expected = {
    SUCCESS: ['ARTIFACT_READY', 'SIMULATED'],
    OFFLINE: ['FAILED', 'SIMULATED'],
    MODEL_MISSING: ['FAILED', 'SIMULATED'],
    TIMEOUT: ['UNKNOWN', 'SIMULATED'],
    CANCEL_REQUESTED: ['CANCEL_REQUESTED', 'SIMULATED'],
    CANCEL_CONFIRMED: ['CANCELLED', 'SIMULATED'],
    UNKNOWN: ['UNKNOWN', 'SIMULATED'],
  }
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    for (const [scenarioName, [state, ownerState]] of Object.entries(expected)) {
      const b = await birth(sandbox, svc, 'key:fixture-c03-' + scenarioName.toLowerCase())
      const input = clone(b.input)
      input.context.scenario = scenarioName
      const owner = await openFixtureTaskOwner({ sandbox })
      const first = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input })
      assert.equal(first.ok, true, scenarioName)
      assert.equal(first.value.task.state, state, scenarioName)
      assert.equal(first.value.ownerState, ownerState, scenarioName)
      const again = await openFixtureTaskOwner({ sandbox })
      const read = await again.value.get(getFrame(b))
      assert.equal(read.value.task.state, state, scenarioName)
      assert.equal(read.value.reason, null, scenarioName)
      const repeat = await again.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: clone(input) })
      assert.equal(repeat.value.outcome, 'EXISTING', scenarioName)
      assert.equal(repeat.value.task.state, state, scenarioName)
    }
  })
})

/* ------------------------------------------------------------------ C04 */

test('C04 legal blocks save NO_EXECUTION with the fixed reason and never re-run', async () => {
  const svc = example('## 7.')
  const tts = example('## 8.')
  await withSandbox(async (sandbox) => {
    const cases = []
    const ttsBirth = await birth(sandbox, tts, 'key:fixture-c04-tts')
    cases.push([ttsBirth, clone(ttsBirth.input), 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH'])
    const brBirth = await birth(sandbox, svc, 'key:fixture-c04-br', (draft) => {
      draft.rights.state = 'UNVERIFIED'
    })
    const brInput = clone(brBirth.input)
    brInput.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
    cases.push([brBirth, brInput, 'TASK_FIXTURE_SOURCE_BLOCKED'])
    const missingBirth = await birth(sandbox, svc, 'key:fixture-c04-missing')
    const missingInput = clone(missingBirth.input)
    missingInput.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    cases.push([missingBirth, missingInput, 'TASK_FIXTURE_SOURCE_BLOCKED'])
    const readinessBirth = await birth(sandbox, svc, 'key:fixture-c04-readiness')
    const readinessInput = clone(readinessBirth.input)
    readinessInput.readiness.instances[0].resources.cpu = 'UNAVAILABLE'
    cases.push([readinessBirth, readinessInput, 'TASK_FIXTURE_READINESS_BLOCKED'])

    for (const [b, input, reason] of cases) {
      const owner = await openFixtureTaskOwner({ sandbox })
      const first = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input })
      assert.equal(first.ok, true)
      assert.equal(first.value.ownerState, 'NO_EXECUTION', reason)
      assert.equal(first.value.reason, reason)
      assert.equal(first.value.task.state, b.record.state)
      const repeat = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: clone(input) })
      assert.equal(repeat.value.outcome, 'EXISTING')
      assert.equal(repeat.value.reason, reason)
    }
  })
})

/* ------------------------------------------------------------------ C05 */

test('C05 a confirmed-uncommitted claim write is a plain WRITE_REJECTED and the same cap may retry', async () => {
  const faulted = runOwnerWorker({
    key: 'key:fixture-c05',
    mode: 'retrySameCap',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 0 },
  })
  assert.equal(faulted.counts.fsFaults, 1)
  assert.equal(faulted.faultAt.engine, 0)
  assert.equal(faulted.catalogEntries, 1)
  assert.equal(faulted.faultAt.call, 'fsyncSync')
  // No owner file existed when the claim write failed: the fault hit a real call, before any commit.
  assert.equal(faulted.faultAt.ownerPhase, 'MISSING')
  expectOwnerError(workerResult(faulted, 'first'), 'WRITE_REJECTED', '$')
  // Same capability, same sandbox, same Task: a new handle after clearing the one-shot fault runs.
  const retried = workerResult(faulted, 'second')
  assert.equal(retried.ok, true, JSON.stringify(retried))
  assert.equal(retried.value.outcome, 'RECORDED')
  assert.equal(faulted.counts.engine, 1)
  assert.equal(faulted.ownerPhase, 'FINAL')
})

/* ------------------------------------------------------------------ C06 */

test('C06 after a confirmed claim an unusable engine result is the fixed EXECUTION_UNKNOWN tombstone', async () => {
  const faults = [
    'throw', 'null', 'identity', 'phase', 'projection', 'flag', 'submit-flag',
    'missing-field', 'schema-version', 'states', 'accessor', 'root-extra', 'result-extra',
  ]
  for (const engineFault of faults) {
    const worker = runOwnerWorker({ key: 'key:fixture-c06-' + engineFault, engineFault, followUp: true })
    assert.equal(worker.counts.engine, 1, engineFault)
    const first = workerResult(worker, 'run')
    expectOwnerError(first, 'EXECUTION_UNKNOWN', '$')
    assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED', engineFault)
    assert.equal(worker.ownerRaw.revision, 1, engineFault)
    const later = workerResult(worker, 'followup-run')
    assert.equal(later.ok, true, engineFault)
    assert.equal(later.value.outcome, 'EXISTING', engineFault)
    assert.equal(later.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(later.value.reason, TASK_OWNER_ERRORS.EXECUTION_UNKNOWN, engineFault)
    assert.equal(later.value.revision, 1, engineFault)
    assert.match(later.value.userMessageZh, /无法确认/, engineFault)
    const read = workerResult(worker, 'followup-get')
    assert.equal(read.value.outcome, 'FOUND', engineFault)
    assert.equal(read.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(worker.counts.engine, 1, engineFault)
  }

  // The final ordinary write failure before its rename keeps the claim as a tombstone.
  const finalReject = runOwnerWorker({
    key: 'key:fixture-c06-final-reject',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 1 },
    followUp: true,
  })
  assert.equal(finalReject.counts.engine, 1)
  expectOwnerError(workerResult(finalReject, 'run'), 'EXECUTION_UNKNOWN', '$')
  assert.equal(finalReject.ownerRaw.entries[0].phase, 'CLAIMED')
  assert.equal(finalReject.ownerRaw.revision, 1)
  assert.equal(workerResult(finalReject, 'followup-run').value.ownerState, 'UNKNOWN')
  assert.equal(finalReject.counts.engine, 1)
})

/* ------------------------------------------------------------------ C07 */

test('C07 a corrupted or externally changed owner store is rejected without repair or reuse', async () => {
  const svc = example('## 7.')
  const variants = [
    ['empty', ''],
    ['bad-json', '{not json'],
    ['bad-version', JSON.stringify({ schemaVersion: 2, revision: 0, entries: [] })],
    ['bad-revision', JSON.stringify({ schemaVersion: 1, revision: 3, entries: [] })],
    ['bad-root-key', JSON.stringify({ schemaVersion: 1, revision: 0, entries: [], extra: 1 })],
  ]
  for (const [name, content] of variants) {
    await withSandbox(async (sandbox) => {
      const b = await birth(sandbox, svc, 'key:fixture-c07-' + name)
      fs.writeFileSync(filePath(sandbox, OWNER_FILE), content, 'utf8')
      const before = fs.readFileSync(filePath(sandbox, OWNER_FILE))
      const owner = await openFixtureTaskOwner({ sandbox })
      if (owner.ok) {
        const run = await owner.value.run(runFrame(b))
        assert.equal(run.ok, false, name)
        assert.equal(run.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID, name)
      } else {
        assert.equal(owner.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID, name)
      }
      assert.equal(fs.readFileSync(filePath(sandbox, OWNER_FILE)).equals(before), true, name)
    })
  }

  // External replacement after a confirmed digest is STORE_INVALID (corrupt) without repair.
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-c07-change')
    const owner = await openFixtureTaskOwner({ sandbox })
    const first = await owner.value.run(runFrame(b))
    assert.equal(first.value.outcome, 'RECORDED')
    fs.writeFileSync(filePath(sandbox, OWNER_FILE), '{bad', 'utf8')
    const after = ownerBytes(sandbox)
    const reopened = await openFixtureTaskOwner({ sandbox })
    assert.equal(reopened.ok, false)
    assert.equal(reopened.errors[0].code, TASK_OWNER_ERRORS.STORE_INVALID)
    assert.equal(ownerBytes(sandbox).equals(after), true)
  })
})

/* ------------------------------------------------------------------ C08 */

test('C08 public surface, descriptors and input boundaries stay safe and frozen', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-c08')
    const owner = await openFixtureTaskOwner({ sandbox })
    assert.equal(owner.ok, true)
    assert.deepEqual(Object.keys(owner.value).sort(), ['artifactStatus', 'get', 'run', 'save'])
    assert.equal(Object.isFrozen(owner.value), true)

    expectOwnerError(await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }), 'INVALID_INPUT', '$')
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: b.input, record: b.record }),
      'INVALID_INPUT',
      '<unknown-key>',
    )
    expectOwnerError(await owner.value.get({ schemaVersion: 2, scopeId: b.scopeId, taskId: b.taskId }), 'UNSUPPORTED_VERSION', 'schemaVersion')
    expectOwnerError(await owner.value.get({ schemaVersion: 1, scopeId: 'bad-scope', taskId: b.taskId }), 'INVALID_INPUT', 'scopeId')

    const getterFrame = { schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId }
    Object.defineProperty(getterFrame, 'input', { get() { throw new Error('getter') }, enumerable: true })
    let getterCalls = 0
    Object.defineProperty(getterFrame, 'taskId', {
      enumerable: true,
      get() {
        getterCalls += 1
        return b.taskId
      },
    })
    const beforeJson = JSON.stringify(b.input)
    expectOwnerError(await owner.value.run(getterFrame), 'INVALID_INPUT', '$')
    assert.equal(getterCalls, 0)

    expectOwnerError(await openFixtureTaskOwner({ sandbox, extra: 1 }), 'INVALID_INPUT', '<unknown-key>')
    expectOwnerError(await openFixtureTaskOwner({ sandbox: 'not-a-cap' }), 'SANDBOX_INVALID', '$')

    const run = await owner.value.run(runFrame(b))
    assert.equal(run.ok, true)
    assert.equal(JSON.stringify(b.input), beforeJson)
    assert.equal(Object.isFrozen(run), true)
    const deepFrozen = new Set()
    const walk = (value) => {
      if (value === null || typeof value !== 'object' || deepFrozen.has(value)) return
      deepFrozen.add(value)
      assert.equal(Object.isFrozen(value), true)
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        walk(descriptor.value)
      }
    }
    walk(run)
    const text = JSON.stringify(run)
    for (const marker of ['observedAt', 'sourceInput', 'artifactLibrary', 'voiceBinding', 'birthIdentityHash', OWNER_FILE]) {
      assert.equal(text.includes(marker), false, marker)
    }
    assert.equal(text.includes(sandbox.root), false)

    assert.equal(TASK_OWNER_SCHEMA_VERSION, 1)
    assert.equal(Object.keys(TASK_OWNER_ERRORS).length, 22)
    for (const [key, code] of Object.entries(TASK_OWNER_ERRORS)) {
      assert.equal(code, 'TASK_OWNER_' + key)
    }
  })
})

/* ------------------------------------------------------------------ C10 */

test('C10 both documented owner examples run as written against a real temporary sandbox', async () => {
  const reserveExample = docExample('## 7. 前置reserve示例')
  const successExample = docExample('## 8. 成功执行示例')
  const blockedExample = docExample('## 9. 权利阻断示例')
  const getExample = docExample('## 10. 读取示例')

  await withSandbox(async (sandbox) => {
    const catalog = await openFixtureTaskCatalog({ sandbox })
    const reserved = await catalog.value.reserve(reserveExample)
    assert.equal(reserved.ok, true)
    const taskId = reserved.value.task.taskId
    const owner = await openFixtureTaskOwner({ sandbox })

    const successRun = clone(successExample)
    successRun.taskId = taskId
    successRun.input.sourceInput.voiceBinding.taskDraft.taskId = taskId
    const success = await owner.value.run(successRun)
    assert.equal(success.ok, true)
    assert.equal(success.value.outcome, 'RECORDED')
    assert.equal(success.value.ownerState, 'SIMULATED')
    assert.equal(success.value.task.state, 'ARTIFACT_READY')

    const blockedDraft = clone(blockedExample.input.sourceInput.voiceBinding.taskDraft)
    delete blockedDraft.taskId
    const blockedBirth = await catalog.value.reserve({
      schemaVersion: 1,
      scopeId: reserveExample.scopeId,
      idempotencyKey: 'key:fixture-doc-br',
      draft: blockedDraft,
      observedAt: reserveExample.observedAt,
    })
    assert.equal(blockedBirth.ok, true, blockedBirth.ok ? '' : blockedBirth.errors[0].code)
    const blockedRun = clone(blockedExample)
    blockedRun.taskId = blockedBirth.value.task.taskId
    blockedRun.input.sourceInput.voiceBinding.taskDraft.taskId = blockedBirth.value.task.taskId
    const blocked = await owner.value.run(blockedRun)
    assert.equal(blocked.ok, true)
    assert.equal(blocked.value.ownerState, 'NO_EXECUTION')
    assert.equal(blocked.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')

    const get = await owner.value.get({ ...clone(getExample), taskId })
    assert.equal(get.ok, true)
    assert.equal(get.value.outcome, 'FOUND')
    assert.equal(get.value.task.state, 'ARTIFACT_READY')
  })
})

/* ------------------------------------------------------------------ T01 */

test('T01 fresh birth association: claim rename, engine boundary and FINAL confirm are real gates', async () => {
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-t01-control')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.value.outcome, 'RECORDED')
  })

  // (a) The claim was confirmed, then the birth file is corrupted: engine must stay 0. The first
  // catalog read after the claim rename is the store's own post-rename confirmation; the second is
  // the owner's post-claim gate, so `skip: 1` targets the confirmed-claim checkpoint.
  const corrupt = runOwnerWorker({
    key: 'key:fixture-t01-claim-corrupt',
    fsFault: { call: 'lstatSync', match: CATALOG_FILE, when: 'claimOnDisk', skip: 1, action: 'corrupt-birth' },
    followUp: true,
  })
  assert.equal(corrupt.counts.fsFaults, 1)
  assert.equal(corrupt.counts.engine, 0)
  assert.equal(corrupt.counts.ownerRenames, 1)
  assert.equal(corrupt.faultAt.ownerPhase, 'CLAIMED')
  assert.equal(corrupt.faultAt.engine, 0)
  expectOwnerError(workerResult(corrupt, 'run'), 'STORE_INVALID', '$')
  assert.equal(corrupt.ownerPhase, 'CLAIMED')
  assert.equal(corrupt.ownerRaw.entries[0].phase, 'CLAIMED')
  expectOwnerError(workerResult(corrupt, 'followup-open'), 'OWNER_UNKNOWN', '$')
  assert.equal(corrupt.counts.engine, 0)

  // (b) A legal external birth addition after the engine returned must not be committed over.
  const legalAdd = runOwnerWorker({
    key: 'key:fixture-t01-legal-add',
    fsFault: { call: 'lstatSync', match: CATALOG_FILE, when: 'engineDone', action: 'legal-birth-add' },
    followUp: true,
  })
  assert.equal(legalAdd.counts.engine, 1)
  assert.equal(legalAdd.counts.fsFaults, 1)
  assert.equal(legalAdd.faultAt.engine, 1)
  expectOwnerError(workerResult(legalAdd, 'run'), 'STORE_CHANGED', '$')
  assert.equal(legalAdd.ownerPhase, 'CLAIMED')
  assert.equal(legalAdd.catalogEntries, 2)
  expectOwnerError(workerResult(legalAdd, 'followup-open'), 'OWNER_UNKNOWN', '$')

  // (c) A failure after the real FINAL rename keeps the on-disk bytes and locks every handle.
  const finalUnknown = runOwnerWorker({
    key: 'key:fixture-t01-final-unknown',
    fsFault: { call: 'lstatSync', match: OWNER_FILE, when: 'diskFinal' },
    followUp: true,
  })
  assert.equal(finalUnknown.counts.engine, 1)
  assert.equal(finalUnknown.counts.fsFaults, 1)
  assert.equal(finalUnknown.faultAt.ownerPhase, 'FINAL')
  expectOwnerError(workerResult(finalUnknown, 'run'), 'WRITE_UNKNOWN', '$')
  assert.equal(finalUnknown.ownerPhase, 'FINAL')
  assert.equal(finalUnknown.ownerRaw.revision, 2)
  assert.equal(finalUnknown.ownerRaw.entries[0].phase, 'FINAL')
  expectOwnerError(workerResult(finalUnknown, 'followup-open'), 'OWNER_UNKNOWN', '$')
  assert.equal(finalUnknown.counts.engine, 1)

  // (d) The factory refuses to hand out a handle when an owner entry lost its birth association.
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const snapshot = baseSnapshot(buds)
    snapshot.entries[0].birthIdentityHash = 'a'.repeat(64)
    writeRawOwner(sandbox, snapshot)
    const opened = await openFixtureTaskOwner({ sandbox })
    expectOwnerError(opened, 'BIRTH_INVALID', '$')
  })
})

/* ------------------------------------------------------------------ T02 */

test('T02 trusted return: only the real projection plus the frozen envelope may become FINAL', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-t02-control')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.ok, true)
    assert.equal(run.value.revision, 2)
    const raw = readJson(sandbox, OWNER_FILE)
    assert.equal(raw.entries[0].phase, 'FINAL')
    assert.equal(raw.entries[0].completion.kind, 'SIMULATED')
  })

  for (const engineFault of ['projection', 'flag', 'submit-flag', 'missing-field', 'schema-version', 'states', 'accessor', 'root-extra', 'result-extra']) {
    const worker = runOwnerWorker({ key: 'key:fixture-t02-' + engineFault, engineFault, followUp: true })
    assert.equal(worker.counts.engine, 1, engineFault)
    expectOwnerError(workerResult(worker, 'run'), 'EXECUTION_UNKNOWN', '$')
    assert.equal(worker.ownerRaw.revision, 1, engineFault)
    assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED', engineFault)
    assert.equal(worker.ownerRaw.entries[0].completion, null, engineFault)
    const later = workerResult(worker, 'followup-run')
    assert.equal(later.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(later.value.revision, 1, engineFault)
    assert.equal(worker.counts.engine, 1, engineFault)
  }
})

/* ------------------------------------------------------------------ T03 */

test('T03 one shared queue and one shared lock across owner and catalog handles on one capability', async () => {
  // (a) Two owner handles plus a catalog handle, same Task, concurrently: one engine, no deadlock.
  const mixed = runOwnerWorker({ key: 'key:fixture-t03-mixed', mode: 'mixed' })
  assert.equal(mixed.counts.engine, 1)
  assert.equal(mixed.catalogUnchanged, true)
  assert.equal(mixed.ownerRaw.revision, 2)
  const ownerA = workerResult(mixed, 'owner-a')
  const ownerB = workerResult(mixed, 'owner-b')
  assert.deepEqual([ownerA.value.outcome, ownerB.value.outcome].sort(), ['EXISTING', 'RECORDED'])
  assert.equal(workerResult(mixed, 'catalog-get').value.task.taskId, mixed.taskId)

  // (b) The real claim rename succeeded and the post-rename read-back failed: shared lock, engine 0.
  const claimUnknown = runOwnerWorker({
    key: 'key:fixture-t03-claim-unknown',
    fsFault: { call: 'lstatSync', match: OWNER_FILE, when: 'diskClaimed' },
    followUp: true,
  })
  assert.equal(claimUnknown.counts.fsFaults, 1)
  assert.equal(claimUnknown.counts.engine, 0)
  assert.equal(claimUnknown.faultAt.ownerPhase, 'CLAIMED')
  expectOwnerError(workerResult(claimUnknown, 'run'), 'WRITE_UNKNOWN', '$')
  assert.equal(claimUnknown.ownerPhase, 'CLAIMED')
  expectOwnerError(workerResult(claimUnknown, 'followup-open'), 'OWNER_UNKNOWN', '$')

  // (c) An ordinary final failure only tombstones that Task; an unrelated Task still executes.
  const twoTasks = runOwnerWorker({
    key: 'key:fixture-t03-a',
    key2: 'key:fixture-t03-b',
    mode: 'twoTasks',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 1 },
  })
  assert.equal(twoTasks.counts.fsFaults, 1)
  assert.equal(twoTasks.counts.engine, 2)
  expectOwnerError(workerResult(twoTasks, 'task-a'), 'EXECUTION_UNKNOWN', '$')
  const taskB = workerResult(twoTasks, 'task-b')
  assert.equal(taskB.ok, true, JSON.stringify(taskB))
  assert.equal(taskB.value.outcome, 'RECORDED')
  const tombstone = workerResult(twoTasks, 'task-a-get')
  assert.equal(tombstone.value.ownerState, 'UNKNOWN')
  assert.equal(tombstone.value.outcome, 'FOUND')
  assert.equal(twoTasks.catalogEntries, 2)

  // (d) A real FINAL rename whose confirmation failed keeps the bytes and locks all handles.
  const finalUnknown = runOwnerWorker({
    key: 'key:fixture-t03-final',
    fsFault: { call: 'lstatSync', match: OWNER_FILE, when: 'diskFinal' },
    followUp: true,
  })
  expectOwnerError(workerResult(finalUnknown, 'run'), 'WRITE_UNKNOWN', '$')
  assert.equal(finalUnknown.ownerPhase, 'FINAL')
  assert.equal(finalUnknown.ownerRaw.entries[0].phase, 'FINAL')
  expectOwnerError(workerResult(finalUnknown, 'followup-open'), 'OWNER_UNKNOWN', '$')
  assert.equal(finalUnknown.counts.engine, 1)
})

/* ------------------------------------------------------------------ T04 */

test('T04 the private store exposes only the two fixed files: no third file, no caller parser', async () => {
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-t04')
    const owner = await openFixtureTaskOwner({ sandbox })
    const control = await owner.value.run(runFrame(b))
    assert.equal(control.ok, true)

    const state = storeModule.getStoreState(sandbox)
    assert.equal(typeof storeModule.openStoreFile, 'undefined')
    assert.equal(typeof storeModule.openCatalogFile, 'function')
    assert.equal(typeof storeModule.openOwnerFile, 'function')

    // A third file name, a self-made spec, a caller parser or a missing domain is rejected before
    // any I/O. The owner opener has no caller-selectable name/budget/parser at all.
    let parserCalls = 0
    const callerParser = () => {
      parserCalls += 1
      return { revision: 0, entries: [] }
    }
    const isInternalFailure = (error) => error && error.key === 'INTERNAL_FAILURE'
    assert.throws(() => storeModule.openCatalogFile(state, 'third'), isInternalFailure)
    assert.throws(
      () => storeModule.openCatalogFile(state, { name: 'audio-task-third.json', maxBytes: 1024, parse: callerParser }),
      isInternalFailure,
    )
    assert.throws(() => storeModule.openCatalogFile(state), isInternalFailure)
    assert.equal(parserCalls, 0)
    assert.equal(fs.existsSync(filePath(sandbox, 'audio-task-third.json')), false)
    assert.deepEqual(fs.readdirSync(sandbox.root).sort(), [MARKER_FILE, CATALOG_FILE, OWNER_FILE].sort())

    // The two fixed files keep working through their fixed domains; extra arguments cannot retarget
    // the owner file and its fixed parser is the only one used.
    const catalog = storeModule.openCatalogFile(state, storeModule.STORE_DOMAINS.CATALOG).read()
    assert.equal(catalog.entries.length, 1)
    const ownerFile = storeModule.openOwnerFile(state, { name: 'audio-task-third.json', parse: callerParser })
    assert.equal(ownerFile.name, OWNER_FILE)
    const ownerRead = ownerFile.read()
    assert.equal(ownerRead.revision, 2)
    assert.equal(ownerRead.entries[0].phase, 'FINAL')
    assert.equal(parserCalls, 0)
    assert.equal(fs.existsSync(filePath(sandbox, 'audio-task-third.json')), false)
    const birthEntry = storeModule.readBirthRecord(state, storeModule.STORE_DOMAINS.OWNER, b.scopeId, b.taskId)
    assert.equal(birthEntry.scopeId, b.scopeId)
    assert.equal(birthEntry.record.taskId, b.taskId)
  })
})

/* ------------------------------------------------------------------ T05 */

async function twoBirths(sandbox) {
  const svc = example('## 7.')
  const first = await birth(sandbox, svc, 'key:fixture-t05-a')
  const second = await birth(sandbox, svc, 'key:fixture-t05-b')
  const snapshot = readJson(sandbox, CATALOG_FILE)
  return { first, second, catalog: snapshot.entries }
}

function claimedEntry(catalogEntry) {
  return {
    scopeId: catalogEntry.scopeId,
    taskId: catalogEntry.record.taskId,
    birthIdentityHash: catalogEntry.identityHash,
    phase: 'CLAIMED',
    record: clone(catalogEntry.record),
    completion: null,
  }
}

function baseSnapshot(buds) {
  const entries = buds.catalog.map((entry) => claimedEntry(entry))
  return { schemaVersion: 1, revision: entries.length, entries }
}

function writeRawOwner(sandbox, snapshot, padTo) {
  const text = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot)
  const padded = padTo ? text + ' '.repeat(Math.max(0, padTo - text.length)) : text
  fs.writeFileSync(filePath(sandbox, OWNER_FILE), padded)
  return fs.readFileSync(filePath(sandbox, OWNER_FILE))
}

async function schemaCase(name, mutate, expected) {
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    writeRawOwner(sandbox, baseSnapshot(buds))
    const legalOpen = await openFixtureTaskOwner({ sandbox })
    assert.equal(legalOpen.ok, true, name + ' legal control')
    const read = await legalOpen.value.get(getFrame(buds.first))
    assert.equal(read.value.outcome, 'FOUND', name)
    assert.equal(read.value.ownerState, 'UNKNOWN', name)
    assert.equal(read.value.revision, 2, name)
  })
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const snapshot = baseSnapshot(buds)
    mutate(snapshot)
    const bytes = writeRawOwner(sandbox, snapshot)
    const result = await openFixtureTaskOwner({ sandbox })
    assert.equal(result.ok, false, name)
    assert.equal(result.errors[0].code, TASK_OWNER_ERRORS[expected], name + ' -> ' + (result.ok ? '' : result.errors[0].code))
    assert.equal(ownerBytes(sandbox).equals(bytes), true, name + ' must not be repaired')
  })
}

test('T05 owner schema and storage boundaries: legal control first, whole-snapshot rejection, no repair', async () => {
  // Legal control: a two-entry CLAIMED snapshot opens, reads and stays read-only.
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    writeRawOwner(sandbox, baseSnapshot(buds))
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, true)
    const read = await opened.value.get(getFrame(buds.first))
    assert.equal(read.value.outcome, 'FOUND')
    assert.equal(read.value.ownerState, 'UNKNOWN')
    assert.equal(read.value.revision, 2)
    const rerun = await opened.value.run(runFrame(buds.first))
    assert.equal(rerun.value.outcome, 'EXISTING')
    assert.equal(JSON.parse(ownerBytes(sandbox)).revision, 2)
  })

  await schemaCase(
    'duplicate same scope',
    (snapshot) => {
      snapshot.entries.push(clone(snapshot.entries[0]))
      snapshot.revision += 1
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'duplicate cross scope',
    (snapshot) => {
      const copy = clone(snapshot.entries[0])
      copy.scopeId = 'scope:fixture-other'
      snapshot.entries.push(copy)
      snapshot.revision += 1
    },
    'BIRTH_INVALID',
  )
  await schemaCase(
    'birth identity hash',
    (snapshot) => {
      snapshot.entries[0].birthIdentityHash = 'a'.repeat(64)
    },
    'BIRTH_INVALID',
  )
  await schemaCase(
    'illegal final state',
    (snapshot) => {
      snapshot.entries[0].phase = 'FINAL'
      snapshot.entries[0].completion = { kind: 'SIMULATED', reason: null }
      snapshot.revision += 1
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'illegal final reason',
    (snapshot) => {
      snapshot.entries[0].phase = 'FINAL'
      snapshot.entries[0].completion = { kind: 'NO_EXECUTION', reason: 'TASK_FIXTURE_NOT_A_REASON' }
      snapshot.revision += 1
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'weighted revision',
    (snapshot) => {
      snapshot.revision = 5
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'missing association',
    (snapshot) => {
      const copy = clone(snapshot.entries[0])
      copy.taskId = 'task:fixture-' + '1'.repeat(32)
      copy.record.taskId = copy.taskId
      copy.birthIdentityHash = 'b'.repeat(64)
      snapshot.entries.push(copy)
      snapshot.revision += 1
    },
    'BIRTH_INVALID',
  )
  await schemaCase(
    'unknown phase',
    (snapshot) => {
      snapshot.entries[0].phase = 'WEIRD'
    },
    'STORE_INVALID',
  )
  await schemaCase(
    'completion on claimed',
    (snapshot) => {
      snapshot.entries[0].completion = { kind: 'SIMULATED', reason: null }
    },
    'STORE_INVALID',
  )

  // Entry cap: 32 legal entries pass, a 33rd is refused by the entry cap (not by an invented birth).
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    for (let index = 0; index < 32; index += 1) {
      await birth(sandbox, svc, 'key:fixture-t05-cap-' + index)
    }
    const catalog = readJson(sandbox, CATALOG_FILE).entries
    assert.equal(catalog.length, 32)
    const snapshot = { schemaVersion: 1, revision: 32, entries: catalog.map((entry) => claimedEntry(entry)) }
    const bytes = writeRawOwner(sandbox, snapshot)
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, true, opened.ok ? '' : opened.errors[0].code)
    const read = await opened.value.get({ schemaVersion: 1, scopeId: catalog[0].scopeId, taskId: catalog[0].record.taskId })
    assert.equal(read.value.outcome, 'FOUND')
    assert.equal(read.value.revision, 32)
    assert.equal(ownerBytes(sandbox).equals(bytes), true)

    const over = clone(snapshot)
    const extra = clone(over.entries[0])
    extra.taskId = 'task:fixture-' + '2'.repeat(32)
    extra.record.taskId = extra.taskId
    over.entries.push(extra)
    over.revision = 33
    const overBytes = writeRawOwner(sandbox, over)
    const rejected = await openFixtureTaskOwner({ sandbox })
    assert.equal(rejected.ok, false)
    assert.equal(rejected.errors[0].code, TASK_OWNER_ERRORS.RESOURCE_LIMIT)
    assert.equal(ownerBytes(sandbox).equals(overBytes), true)
  })

  // Byte budget: exactly 128 KiB of legal JSON passes, 128 KiB + 1 is refused by the read budget.
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const text = JSON.stringify(baseSnapshot(buds))
    assert.ok(text.length < 128 * 1024)
    writeRawOwner(sandbox, text, 128 * 1024)
    assert.equal(ownerBytes(sandbox).length, 128 * 1024)
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, true, opened.ok ? '' : opened.errors[0].code)
    const read = await opened.value.get(getFrame(buds.first))
    assert.equal(read.value.outcome, 'FOUND')
  })
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const text = JSON.stringify(baseSnapshot(buds))
    writeRawOwner(sandbox, text, 128 * 1024 + 1)
    assert.equal(ownerBytes(sandbox).length, 128 * 1024 + 1)
    const opened = await openFixtureTaskOwner({ sandbox })
    assert.equal(opened.ok, false)
    assert.equal(opened.errors[0].code, TASK_OWNER_ERRORS.RESOURCE_LIMIT)
  })
})

/* ------------------------------------------------------------------ T06 */

function nest(count) {
  let value = 'leaf'
  for (let index = 0; index < count; index += 1) value = { a: value }
  return value
}

/* Same measurement as the original B12 control in test/task-fixture-record.test.mjs. */
function depthOf(value) {
  const seen = new Set()
  const walk = (current, depth) => {
    if (current === null || typeof current !== 'object' || seen.has(current)) return depth
    seen.add(current)
    let max = depth
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key)
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue
      const child = walk(descriptor.value, depth + 1)
      if (child > max) max = child
    }
    return max
  }
  return walk(value, 0)
}

test('T06 input boundary, no re-run after a stored conclusion and full graph isolation', async () => {
  // Depth boundary is the shared input boundary, proven at exactly depth 12 / 13.
  assert.equal(copyFixtureInput(nest(12)).ok, true)
  assert.equal(copyFixtureInput(nest(13)).ok, false)
  assert.equal(copyFixtureInput(nest(13)).key, 'RESOURCE_LIMIT')

  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const b = await birth(sandbox, svc, 'key:fixture-t06')
    const owner = await openFixtureTaskOwner({ sandbox })

    // A legal input is copied fine; a 13-deep probe and an over-wide array are refused before the
    // engine runs and leave no owner file behind.
    const deep = clone(b.input)
    assert.equal(copyFixtureInput(deep).ok, true)
    assert.ok(Object.keys(deep.sourceInput.artifactLibrary).length <= 30)
    deep.sourceInput.artifactLibrary.deepProbe = nest(10)
    assert.equal(copyFixtureInput(deep).key, 'RESOURCE_LIMIT')
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: deep }),
      'RESOURCE_LIMIT',
      'input',
    )
    const wide = clone(b.input)
    assert.ok(Object.keys(wide.sourceInput.artifactLibrary).length <= 30)
    wide.sourceInput.artifactLibrary.extraItems = new Array(257).fill(null)
    assert.equal(copyFixtureInput(wide).key, 'RESOURCE_LIMIT')
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: wide }),
      'RESOURCE_LIMIT',
      'input',
    )
    assert.equal(ownerBytes(sandbox), null)

    // Frozen caller input, unchanged, and never shared with the output graph.
    const frozen = clone(b.input)
    const freezeAll = (value) => {
      if (value === null || typeof value !== 'object') return
      Object.freeze(value)
      for (const key of Reflect.ownKeys(value)) freezeAll(value[key])
    }
    freezeAll(frozen)
    const before = JSON.stringify(frozen)
    const first = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: frozen })
    assert.equal(first.value.outcome, 'RECORDED')
    assert.equal(JSON.stringify(frozen), before)
    assert.equal(Object.isFrozen(frozen), true)
    const inputObjects = new Set()
    const collect = (value) => {
      if (value === null || typeof value !== 'object' || inputObjects.has(value)) return
      inputObjects.add(value)
      for (const key of Reflect.ownKeys(value)) collect(value[key])
    }
    collect(frozen)
    const outputObjects = new Set()
    const walkOutput = (value) => {
      if (value === null || typeof value !== 'object' || outputObjects.has(value)) return
      outputObjects.add(value)
      for (const key of Reflect.ownKeys(value)) walkOutput(value[key])
    }
    walkOutput(first)
    for (const value of outputObjects) assert.equal(inputObjects.has(value), false)

    const second = await owner.value.get(getFrame(b))
    assert.equal(second.value.outcome, 'FOUND')
    assert.notEqual(second, first)
    assert.notEqual(second.value, first.value)
    assert.notEqual(second.value.task, first.value.task)
  })

  // A stored NO_EXECUTION conclusion survives a later executable input: engine count stays 0 new.
  await withSandbox(async (sandbox) => {
    const svc = example('## 7.')
    const blocked = await birth(sandbox, svc, 'key:fixture-t06-blocked', (draft) => {
      draft.rights.state = 'UNVERIFIED'
    })
    const blockedInput = clone(blocked.input)
    blockedInput.sourceInput.voiceBinding.taskDraft.rights.state = 'UNVERIFIED'
    const owner = await openFixtureTaskOwner({ sandbox })
    const first = await owner.value.run({ schemaVersion: 1, scopeId: blocked.scopeId, taskId: blocked.taskId, input: blockedInput })
    assert.equal(first.value.ownerState, 'NO_EXECUTION')
    assert.equal(first.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')
    const bytesAfterFirst = ownerBytes(sandbox)
    const executable = clone(blockedInput)
    executable.sourceInput.voiceBinding.taskDraft.rights.state = 'VERIFIED'
    const repeat = await owner.value.run({ schemaVersion: 1, scopeId: blocked.scopeId, taskId: blocked.taskId, input: executable })
    assert.equal(repeat.value.outcome, 'EXISTING')
    assert.equal(repeat.value.ownerState, 'NO_EXECUTION')
    assert.equal(ownerBytes(sandbox).equals(bytesAfterFirst), true)
  })
})

/* ------------------------------------------------------------------ E01 */

test('E01 the owner write transaction re-checks the birth association before the FINAL rename', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-e01-control')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.value.outcome, 'RECORDED')
    assert.equal(readJson(sandbox, OWNER_FILE).revision, 2)
  })

  // The change happens *after* the FINAL temp file's real fsync returns successfully.
  const worker = runOwnerWorker({
    key: 'key:fixture-e01',
    fsFault: { call: 'fsyncSync', match: 'audio-task-owner-v1.', skip: 1, after: true, action: 'legal-birth-change' },
    followUp: true,
  })
  assert.equal(worker.counts.fsFaults, 1)
  assert.equal(worker.legalBirthValid, true)
  assert.equal(worker.faultAt.call, 'fsyncSync')
  assert.equal(worker.faultAt.afterRealCall, true)
  assert.equal(worker.faultAt.realCallOk, true)
  assert.equal(worker.faultAt.engine, 1)
  assert.equal(worker.faultAt.ownerPhase, 'CLAIMED')
  assert.equal(worker.faultAt.ownerRenames, 1)
  expectOwnerError(workerResult(worker, 'run'), 'STORE_CHANGED', '$')
  // The FINAL rename never happened, so the confirmed CLAIMED bytes stay untouched.
  assert.equal(worker.counts.ownerRenames, 1)
  assert.equal(worker.ownerPhase, 'CLAIMED')
  assert.equal(worker.ownerRaw.revision, 1)
  assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED')
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.catalogEntries, 1)
  expectOwnerError(workerResult(worker, 'followup-open'), 'OWNER_UNKNOWN', '$')
})

/* ------------------------------------------------------------------ E02 */

test('E02 an association failure locks the shared capability for owner and catalog handles', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const buds = await twoBirths(sandbox)
    const existingCatalog = buds.first.handle
    const catalogBefore = catalogBytes(sandbox)
    const snapshot = baseSnapshot(buds)
    snapshot.entries[0].birthIdentityHash = 'a'.repeat(64)
    const bytes = writeRawOwner(sandbox, snapshot)
    const opened = await openFixtureTaskOwner({ sandbox })
    expectOwnerError(opened, 'BIRTH_INVALID', '$')
    assert.equal(ownerBytes(sandbox).equals(bytes), true)
    // The failed factory read itself is the first owner read; later owner reads are locked too.
    expectOwnerError(await openFixtureTaskOwner({ sandbox }), 'OWNER_UNKNOWN', '$')
    // Existing catalog handle: no further read and no new id.
    const catalogGet = await existingCatalog.get({ schemaVersion: 1, scopeId: buds.first.scopeId, taskId: buds.first.taskId })
    assert.equal(catalogGet.ok, false)
    assert.equal(catalogGet.errors[0].code, TASK_CATALOG_ERRORS.CATALOG_UNKNOWN)
    const reserve = await existingCatalog.reserve({})
    assert.equal(reserve.ok, false)
    assert.equal(reserve.errors[0].code, TASK_CATALOG_ERRORS.CATALOG_UNKNOWN)
    // A brand new catalog and a brand new owner factory are locked too.
    const newCatalog = await openFixtureTaskCatalog({ sandbox })
    assert.equal(newCatalog.ok, false)
    assert.equal(newCatalog.errors[0].code, TASK_CATALOG_ERRORS.CATALOG_UNKNOWN)
    expectOwnerError(await openFixtureTaskOwner({ sandbox }), 'OWNER_UNKNOWN', '$')
    assert.equal(catalogBytes(sandbox).equals(catalogBefore), true)
    assert.equal(readJson(sandbox, CATALOG_FILE).entries.length, 2)
    assert.equal(ownerBytes(sandbox).equals(bytes), true)
  })

  // A legitimate NOT_FOUND must not lock the store.
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-e02-notfound')
    const owner = await openFixtureTaskOwner({ sandbox })
    expectOwnerError(await owner.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: 'task:fixture-' + 'a'.repeat(32) }), 'NOT_FOUND', '$')
    const catalog = await openFixtureTaskCatalog({ sandbox })
    assert.equal(catalog.ok, true)
    const read = await catalog.value.get({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId })
    assert.equal(read.ok, true)
    assert.equal(read.value.task.taskId, b.taskId)
  })
})

/* ------------------------------------------------------------------ E03 */

test('E03 the task projection sub-object is descriptor-guarded before comparison', async () => {
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-e03-control')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.ok, true)
    assert.equal(run.value.outcome, 'RECORDED')
    assert.equal(readJson(sandbox, OWNER_FILE).entries[0].completion.kind, 'SIMULATED')
  })

  for (const engineFault of ['task-getter', 'task-hidden', 'task-symbol']) {
    const worker = runOwnerWorker({ key: 'key:fixture-e03-' + engineFault, engineFault, followUp: true })
    assert.equal(worker.counts.engine, 1, engineFault)
    // The real projection getter is never invoked by the guard.
    assert.equal(worker.getterCalls, 0, engineFault)
    expectOwnerError(workerResult(worker, 'run'), 'EXECUTION_UNKNOWN', '$')
    assert.equal(worker.ownerRaw.entries[0].phase, 'CLAIMED', engineFault)
    assert.equal(worker.ownerRaw.revision, 1, engineFault)
    assert.equal(worker.ownerPhase, 'CLAIMED', engineFault)
    const later = workerResult(worker, 'followup-run')
    assert.equal(later.value.outcome, 'EXISTING', engineFault)
    assert.equal(later.value.ownerState, 'UNKNOWN', engineFault)
    assert.equal(worker.counts.engine, 1, engineFault)
  }
})

/* ------------------------------------------------------------------ E04 */

test('E04 a birth-registry failure after the real FINAL rename keeps the bytes and locks all existing and new handles', async () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-e04',
    mode: 'finalFaultHandles',
    fsFault: { call: 'lstatSync', match: CATALOG_FILE, when: 'diskFinal' },
  })
  assert.equal(worker.counts.fsFaults, 1)
  assert.equal(worker.faultAt.ownerPhase, 'FINAL')
  assert.equal(worker.faultAt.ownerRenames, 2)
  assert.equal(worker.faultAt.engine, 1)
  expectOwnerError(workerResult(worker, 'run'), 'WRITE_UNKNOWN', '$')

  // The handles were obtained and proven usable before the fault.
  const pre = workerResult(worker, 'pre').value
  assert.equal(pre.ownerHandles, true)
  assert.equal(pre.catalogGet, true)
  assert.equal(pre.reserveOutcome, 'EXISTING')

  // After the same fault, both existing owner handles are locked for run and get.
  for (const label of ['post-owner-1-run', 'post-owner-1-get', 'post-owner-2-run', 'post-owner-2-get']) {
    expectOwnerError(workerResult(worker, label), 'OWNER_UNKNOWN', '$')
  }
  // The existing catalog handle is locked for a legal get and for the same legal reserve request.
  const catalogGet = workerResult(worker, 'post-catalog-get')
  assert.equal(catalogGet.ok, false)
  assert.equal(catalogGet.errors[0].code, TASK_CATALOG_ERRORS.CATALOG_UNKNOWN)
  const catalogReserve = workerResult(worker, 'post-catalog-reserve')
  assert.equal(catalogReserve.ok, false)
  assert.equal(catalogReserve.errors[0].code, TASK_CATALOG_ERRORS.CATALOG_UNKNOWN)
  // New factories of both domains are locked too.
  const newCatalog = workerResult(worker, 'post-new-catalog')
  assert.equal(newCatalog.ok, false)
  assert.equal(newCatalog.errors[0].code, TASK_CATALOG_ERRORS.CATALOG_UNKNOWN)
  expectOwnerError(workerResult(worker, 'post-new-owner'), 'OWNER_UNKNOWN', '$')

  // Nothing was written, repaired or re-run: real FINAL bytes, one entry, one engine call, two renames.
  const invariants = workerResult(worker, 'invariants').value
  assert.equal(invariants.ownerBytesSame, true)
  assert.equal(invariants.catalogBytesSame, true)
  assert.equal(invariants.catalogEntries, 1)
  assert.equal(invariants.ownerRevision, 2)
  assert.equal(invariants.ownerEntryPhase, 'FINAL')
  assert.equal(invariants.engine, 1)
  assert.equal(invariants.engineUnchanged, true)
  assert.equal(invariants.ownerRenames, 2)
  assert.equal(invariants.renamesUnchanged, true)
  assert.equal(worker.ownerPhase, 'FINAL')
  assert.equal(worker.ownerRaw.revision, 2)
  assert.equal(worker.ownerRaw.entries[0].phase, 'FINAL')
})

/* ------------------------------------------------------------------ E05 */

test('E05 legal input changes never re-run, and the original seven scenarios/blocked cases stay at one engine call', async () => {
  // Independent control: the changed input really is executable through the real existing engine.
  const svc = example('## 7.')
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-e05-control')
    const blocked = clone(b.input)
    blocked.sourceInput.artifactLibrary.artifacts[0].availability = 'ABSENT'
    const blockedOut = runExistingFixtureTaskOnce({ scopeId: b.scopeId, record: b.record, input: blocked })
    assert.equal(blockedOut.result.ok, true)
    assert.equal(blockedOut.result.value.phase, 'BLOCKED')
    assert.equal(blockedOut.result.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')
    const executable = clone(b.input)
    executable.sourceInput.artifactLibrary.artifacts[0].availability = 'PRESENT'
    const executableOut = runExistingFixtureTaskOnce({ scopeId: b.scopeId, record: b.record, input: executable })
    assert.equal(executableOut.result.ok, true)
    assert.equal(executableOut.result.value.phase, 'SIMULATED')
    assert.equal(executableOut.record.state, 'ARTIFACT_READY')
  })

  // Same Task: the stored NO_EXECUTION survives the now-executable input, with zero new engine calls.
  const twoInputs = runOwnerWorker({ key: 'key:fixture-e05-twoinputs', mode: 'twoInputs' })
  const blockedRun = workerResult(twoInputs, 'blocked')
  assert.equal(blockedRun.value.ownerState, 'NO_EXECUTION')
  assert.equal(blockedRun.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')
  const counts = workerResult(twoInputs, 'counts').value
  assert.equal(counts.engineAfterBlocked, 1)
  assert.equal(counts.engineAfterExecutable, 1)
  assert.equal(counts.bytesStable, true)
  const executableRun = workerResult(twoInputs, 'executable')
  assert.equal(executableRun.value.outcome, 'EXISTING')
  assert.equal(executableRun.value.ownerState, 'NO_EXECUTION')
  assert.equal(executableRun.value.reason, 'TASK_FIXTURE_SOURCE_BLOCKED')
  const reread = workerResult(twoInputs, 'reread')
  assert.equal(reread.value.outcome, 'FOUND')
  assert.equal(reread.value.ownerState, 'NO_EXECUTION')

  // All seven RVC contexts plus the four legal blocked cases: one engine call each, repeats add 0.
  const sweepWorker = runOwnerWorker({ key: 'key:fixture-e05-sweep', mode: 'sweep' })
  const sweep = workerResult(sweepWorker, 'sweep').value.sweep
  assert.equal(sweep.length, 11)
  assert.equal(sweepWorker.counts.engine, 11)
  for (const item of sweep) {
    assert.equal(item.secondOutcome, 'EXISTING', item.label)
    assert.equal(item.engineAfterFirst, item.engineBefore + 1, item.label)
    assert.equal(item.engineAfterSecond, item.engineAfterFirst, item.label)
    assert.equal(item.bytesStable, true, item.label)
  }
  const byLabel = Object.fromEntries(sweep.map((item) => [item.label, item]))
  assert.deepEqual(
    Object.keys(byLabel).sort(),
    ['BLOCK_READINESS', 'BLOCK_RIGHTS', 'BLOCK_SOURCE', 'BLOCK_TTS', 'CANCEL_CONFIRMED', 'CANCEL_REQUESTED', 'MODEL_MISSING', 'OFFLINE', 'SUCCESS', 'TIMEOUT', 'UNKNOWN'],
  )
  for (const name of ['SUCCESS', 'OFFLINE', 'MODEL_MISSING', 'TIMEOUT', 'CANCEL_REQUESTED', 'CANCEL_CONFIRMED', 'UNKNOWN']) {
    assert.equal(byLabel[name].ownerState, 'SIMULATED', name)
  }
  assert.equal(byLabel.SUCCESS.reason, null)
  for (const blockedLabel of ['BLOCK_RIGHTS', 'BLOCK_SOURCE']) {
    assert.equal(byLabel[blockedLabel].ownerState, 'NO_EXECUTION', blockedLabel)
    assert.equal(byLabel[blockedLabel].reason, 'TASK_FIXTURE_SOURCE_BLOCKED', blockedLabel)
  }
  assert.equal(byLabel.BLOCK_TTS.ownerState, 'NO_EXECUTION')
  assert.equal(byLabel.BLOCK_TTS.reason, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')
  assert.equal(byLabel.BLOCK_READINESS.ownerState, 'NO_EXECUTION')
  assert.equal(byLabel.BLOCK_READINESS.reason, 'TASK_FIXTURE_READINESS_BLOCKED')

  // The original legal depth-12 TTS input (the existing B12 control) passes the owner wrapper
  // unchanged, while depth 13 is refused by the same shared copy budget before any engine call.
  await withSandbox(async (sandbox) => {
    const tts = example('## 8.')
    assert.equal(depthOf(tts), 12)
    const b = await birth(sandbox, tts, 'key:fixture-e05-depth12')
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run(runFrame(b))
    assert.equal(run.ok, true, JSON.stringify(run))
    assert.equal(run.value.ownerState, 'NO_EXECUTION')
    assert.equal(run.value.reason, 'PROVIDER_DISPATCH_UNSUPPORTED_DISPATCH')
    const deep = clone(b.input)
    deep.sourceInput.artifactLibrary.deepProbe = nest(10)
    assert.equal(depthOf(deep) > 12, true)
    expectOwnerError(
      await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: deep }),
      'RESOURCE_LIMIT',
      'input',
    )
  })

  // The caller's mutable input is neither frozen nor rewritten by a real owner run.
  await withSandbox(async (sandbox) => {
    const b = await birth(sandbox, svc, 'key:fixture-e05-mutable')
    const mutable = clone(b.input)
    const collect = (value, out) => {
      if (value === null || typeof value !== 'object' || out.includes(value)) return out
      out.push(value)
      for (const key of Reflect.ownKeys(value)) collect(value[key], out)
      return out
    }
    const objects = collect(mutable, [])
    const frozenBefore = objects.map((value) => Object.isFrozen(value))
    const jsonBefore = JSON.stringify(mutable)
    const owner = await openFixtureTaskOwner({ sandbox })
    const run = await owner.value.run({ schemaVersion: 1, scopeId: b.scopeId, taskId: b.taskId, input: mutable })
    assert.equal(run.value.outcome, 'RECORDED')
    assert.equal(JSON.stringify(mutable), jsonBefore)
    assert.deepEqual(objects.map((value) => Object.isFrozen(value)), frozenBefore)
    assert.equal(frozenBefore.includes(true), false)
  })
})


/* ------------------------------------------------------------------ B01 */

test('B01 store-base extraction keeps one binding, one class and the real fs boundary', async () => {
  const base = await import('../core/audio/fixture-store-base-internal.mjs')
  const shared = [
    'StoreFailure',
    'storeReason',
    'raiseStore',
    'isStoreFailure',
    'isPlainObject',
    'keySurface',
    'hasOwn',
    'sha256',
    'stableStringify',
    'checkSandbox',
  ]
  assert.deepEqual(Object.keys(base).sort(), [
    'StoreFailure',
    'assertRegularStat',
    'checkSandbox',
    'hasOwn',
    'isInside',
    'isPlainObject',
    'isStoreFailure',
    'keySurface',
    'normalizePath',
    'raiseStore',
    'readBoundedPath',
    'sameIdentity',
    'sha256',
    'stableStringify',
    'storeReason',
  ])
  for (const name of shared) assert.equal(storeModule[name], base[name], 'same binding: ' + name)
  assert.equal(base.StoreFailure, storeModule.StoreFailure, 'one StoreFailure class')
  let thrown = null
  try {
    base.raiseStore('STORE_CHANGED', '$')
  } catch (error) {
    thrown = error
  }
  assert.ok(thrown instanceof base.StoreFailure)
  assert.ok(storeModule.isStoreFailure(thrown))
  assert.equal(base.storeReason('STORE_CHANGED'), 'store changed')
  assert.equal(base.isInside('/a', '/a/b'), true)
  assert.equal(base.isInside('/a/b', '/a'), false)
  assert.equal(typeof base.normalizePath('/a/./b'), 'string')

  const orderScript = [
    "import { createConfigSandbox, removeConfigSandbox } from '" + BASE + "../config-sandbox.mjs'",
    'const order = process.env.ORDER',
    'const names = order === "artifact-first"',
    '  ? ["fixture-artifact-store-internal.mjs", "fixture-task-store-internal.mjs"]',
    '  : ["fixture-task-store-internal.mjs", "fixture-artifact-store-internal.mjs"]',
    'for (const name of names) await import("' + BASE + '" + name)',
    'const { openFixtureTaskCatalog } = await import("' + BASE + 'task-catalog.mjs")',
    'const { openFixtureTaskOwner } = await import("' + BASE + 'task-owner.mjs")',
    'const { openFixtureArtifactLibrary } = await import("' + BASE + 'artifact-library.mjs")',
    'const sandbox = createConfigSandbox()',
    'try {',
    '  const draft = { schemaVersion: 1, feature: "singing", taskType: "SVC", source: { kind: "AUDIO_REF", ref: "artifact:fixture-source-1" }, voiceProfileId: "voice:demo-hero", deliveryRequested: false, rights: { state: "CONFIRMED_FIXTURE" } }',
    '  const catalog = await openFixtureTaskCatalog({ sandbox })',
    '  const reserved = await catalog.value.reserve({ schemaVersion: 1, scopeId: "scope:fixture-demo", idempotencyKey: "key:fixture-order", draft, observedAt: "2026-10-27T00:00:00.000Z" })',
    '  const owner = await openFixtureTaskOwner({ sandbox })',
    '  const library = await openFixtureArtifactLibrary({ sandbox })',
    '  console.log(JSON.stringify({ ok: reserved.ok && owner.ok && library.ok, outcome: reserved.ok ? reserved.value.outcome : reserved.errors[0].code }))',
    '} finally { removeConfigSandbox(sandbox) }',
  ].join('\n')
  for (const order of ['artifact-first', 'task-first']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', orderScript], {
      env: { ...process.env, ORDER: order },
      encoding: 'utf8',
    })
    const parsed = JSON.parse(output.trim())
    assert.equal(parsed.ok, true, order + ' import order must still work')
    assert.equal(parsed.outcome, 'CREATED')
  }

  const worker = runOwnerWorker({
    mode: 'baseProxy',
    fsFault: { call: 'lstatSync', match: MARKER_FILE, when: 'afterBirth' },
  })
  assert.equal(worker.counts.fsFaults, 1, 'the extracted base must still read through the fs proxy')
  const result = workerResult(worker, 'base-sandbox')
  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, TASK_OWNER_ERRORS.SANDBOX_INVALID)
  assert.equal(result.errors[0].path, '$')
})

/* ------------------------------------------------------------------ V01 */

test('V01 shared VM graph: one save runs one real engine and one real import, then reads back', () => {
  const worker = runOwnerWorker({ key: 'key:fixture-v01', mode: 'save' })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
  assert.equal(worker.counts.fsFaults, 0)
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.value.outcome, 'SAVED')
  assert.equal(saved.value.ownerState, 'SAVED')
  assert.equal(saved.value.revision, 2)
  assert.deepEqual(Object.keys(saved.value.artifact).sort(), ['artifactRef', 'byteLength', 'expiresAt', 'sha256'])
  const status = workerResult(worker, 'status')
  assert.equal(status.ok, true, JSON.stringify(status))
  assert.equal(status.value.state, 'READABLE')
  assert.equal(status.value.artifactRef, saved.value.artifact.artifactRef)
  const got = workerResult(worker, 'get')
  assert.equal(got.ok, true)
  assert.equal(got.value.ownerState, 'SAVED')
})


/* ------------------------------------------------------------------ V02 */

test('V02 the protocol representatives are SAVE_UNKNOWN with engine=1/import=0 and no getter', () => {
  for (const fault of ['channels', 'peak', 'flags', 'execution', 'states-getter', 'resizable', 'missing-production']) {
    const worker = runOwnerWorker({ key: 'key:fixture-v02-' + fault, mode: 'save', bytesFault: fault })
    assert.equal(worker.counts.engine, 1, fault + ' engine')
    assert.equal(worker.counts.imports, 0, fault + ' import')
    assert.equal(worker.getterCalls, 0, fault + ' getter')
    const saved = workerResult(worker, 'save')
    assert.equal(saved.ok, false, fault + ' ' + JSON.stringify(saved))
    assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_UNKNOWN, fault)
    const got = workerResult(worker, 'get')
    assert.equal(got.ok, true, fault)
    assert.equal(got.value.ownerState, 'UNKNOWN', fault)
  }
})

test('V03 a harmless field clone still saves once through the real engine and import', () => {
  const worker = runOwnerWorker({ key: 'key:fixture-v03', mode: 'save', bytesFault: 'clone' })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.value.ownerState, 'SAVED')
})

test('V04 harmless byte-view shadows are never read and the save still succeeds', () => {
  const worker = runOwnerWorker({ key: 'key:fixture-v04', mode: 'save', bytesFault: 'shadow' })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
  assert.equal(worker.getterCalls, 0)
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.value.ownerState, 'SAVED')
})

/* ------------------------------------------------------------------ V05 */

test('V05 claim rename unknown in the VM: SAVE_UNKNOWN, engine/import 0', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v05',
    mode: 'save',
    saveRenameFault: { kind: 'owner', occurrence: 1 },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, JSON.stringify(saved))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_UNKNOWN)
  assert.deepEqual(worker.counts.renames.owner, { attempt: 1, success: 1 })
  assert.deepEqual(worker.counts.renames.artifact, { attempt: 0, success: 0 })
  assert.equal(worker.counts.engine, 0)
  assert.equal(worker.counts.imports, 0)
})

test('V06 artifact rename unknown in the VM: SAVE_ARTIFACT_UNKNOWN with engine=1/import=1', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v06',
    mode: 'save',
    saveRenameFault: { kind: 'artifact', occurrence: 1 },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, JSON.stringify(saved))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_ARTIFACT_UNKNOWN)
  assert.deepEqual(worker.counts.renames.owner, { attempt: 1, success: 1 })
  assert.deepEqual(worker.counts.renames.artifact, { attempt: 1, success: 1 })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
})

test('V07 FINAL rename unknown in the VM: SAVE_UNKNOWN after the real FINAL commit', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v07',
    mode: 'save',
    saveRenameFault: { kind: 'owner', occurrence: 2 },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, JSON.stringify(saved))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_UNKNOWN)
  assert.deepEqual(worker.counts.renames.owner, { attempt: 2, success: 2 })
  assert.deepEqual(worker.counts.renames.artifact, { attempt: 1, success: 1 })
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
})


/* ------------------------------------------------------------------ V08 */

test('V08 a foreign Task write after the FINAL fsync is STORE_CHANGED with the claim on disk', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v08',
    mode: 'save',
    saveFsyncFault: { occurrence: 2, action: 'OF' },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, JSON.stringify(saved))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.STORE_CHANGED)
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
})

test('V10 an external Task change after a successful save fails only the next fresh read', () => {
  const worker = runOwnerWorker({ key: 'key:fixture-v10', mode: 'save', afterMutate: 'OF' })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, true, 'save ' + JSON.stringify(saved).slice(0, 160))
  const got = workerResult(worker, 'get')
  assert.equal(got.ok, false, 'get ' + JSON.stringify(got).slice(0, 160))
  assert.equal(got.errors[0].code, TASK_OWNER_ERRORS.STORE_CHANGED)
})
test('V09 a foreign Artifact write after the FINAL fsync is SAVE_ARTIFACT_REJECTED', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v09',
    mode: 'save',
    saveFsyncFault: { occurrence: 2, action: 'AF' },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, JSON.stringify(saved))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_ARTIFACT_REJECTED)
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
})

test('V11 an external Artifact change after a successful save fails only the next fresh status', () => {
  const worker = runOwnerWorker({ key: 'key:fixture-v11', mode: 'save', afterMutate: 'AF' })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, true, 'save ' + JSON.stringify(saved).slice(0, 120))
  const got = workerResult(worker, 'get')
  assert.equal(got.ok, true, 'get ' + JSON.stringify(got).slice(0, 120))
  assert.equal(got.value.ownerState, 'SAVED')
  const status = workerResult(worker, 'status')
  assert.equal(status.ok, false, 'status ' + JSON.stringify(status).slice(0, 160))
  assert.equal(status.errors[0].code, TASK_OWNER_ERRORS.STORE_CHANGED)
})

/* ------------------------------------------------------------------ V12 */

test('V12 a post-rename owner lstat failure is WRITE_UNKNOWN -> SAVE_UNKNOWN with the FINAL kept', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v12',
    mode: 'save',
    saveLstatFault: { occurrence: 1 },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, JSON.stringify(saved))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_UNKNOWN)
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
})

test('V13 a JOINT-phase Task overwrite is SAVE_UNKNOWN with a Task lock', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v13',
    mode: 'save',
    saveJointFault: { kind: 'owner', occurrence: 3 },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, 'save ' + JSON.stringify(saved).slice(0, 160))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_UNKNOWN)
})

test('V14 a JOINT-phase Artifact overwrite is SAVE_ARTIFACT_UNKNOWN with the artifact domain locked', () => {
  const worker = runOwnerWorker({
    key: 'key:fixture-v14',
    mode: 'save',
    saveJointFault: { kind: 'artifact', occurrence: 2 },
  })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, 'save ' + JSON.stringify(saved).slice(0, 200))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.SAVE_ARTIFACT_UNKNOWN)
})

test('V15 a bad proof injected into the real FINAL write is WRITE_REJECTED with the claim kept', () => {
  const worker = runOwnerWorker({ key: 'key:fixture-v15', mode: 'save', badProof: true })
  const saved = workerResult(worker, 'save')
  assert.equal(saved.ok, false, 'save ' + JSON.stringify(saved).slice(0, 200))
  assert.equal(saved.errors[0].code, TASK_OWNER_ERRORS.WRITE_REJECTED)
  assert.equal(worker.counts.engine, 1)
  assert.equal(worker.counts.imports, 1)
  const got = workerResult(worker, 'get')
  assert.equal(got.ok, true, 'get ' + JSON.stringify(got).slice(0, 160))
  assert.equal(got.value.ownerState, 'UNKNOWN')
})
