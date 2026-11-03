/* Plan10 10-B — IndexTTS-2.5 contract and narrow-protocol unit tests (offline, pure). */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INDEX_TTS_EMOTION_MODES,
  INDEX_TTS_EMOTION_VECTORS,
  INDEX_TTS_ERRORS,
  INDEX_TTS_LANGUAGES,
  INDEX_TTS_LIMITS,
  INDEX_TTS_MODEL,
  INDEX_TTS_PROVIDER_ID,
  INDEX_TTS_UPSTREAM,
  buildIndexManifest,
  checkIndexModality,
  indexEmotionVector,
  indexLicenseView,
  indexMetadataInventory,
} from '../core/tts/index-tts-contract.mjs'
import { validateProviderManifest } from '../core/tts/provider-contract.mjs'
import {
  INDEX_TTS_PROTOCOL_ERRORS,
  INDEX_TTS_PROTOCOL_MAX_BYTES,
  decodeResponse,
  encodeRequest,
} from '../core/tts/index-tts-worker-protocol.mjs'

const VOICES = [{
  id: 'demo-voice',
  name: '演示音色',
  kind: 'clone',
  referenceRef: 'binding:demo-1',
  languages: ['zh-CN', 'en-US'],
}]

function manifestInput(overrides = {}) {
  return {
    backend: 'clone-emotion',
    model: INDEX_TTS_MODEL,
    modelVersion: '2.5',
    voices: VOICES,
    languages: [...INDEX_TTS_LANGUAGES],
    limits: { maxChars: 200, maxAudioSeconds: 60, timeoutMs: 180000 },
    indexTtsVersion: '2.0.0',
    qwenEmoAvailable: true,
    ...overrides,
  }
}

test('fixed upstream metadata keeps the bilibili licence, not Apache or unrestricted distribution', () => {
  assert.equal(INDEX_TTS_UPSTREAM.codeCommit, 'd9e41aac89fd00b3d71497fddb287b7f24613712')
  assert.equal(INDEX_TTS_UPSTREAM.modelRevision, 'c39ce5ba981572cb187443877ff559dfb246ce63')
  assert.equal(INDEX_TTS_UPSTREAM.packageVersion, '2.0.0')
  assert.equal(INDEX_TTS_UPSTREAM.modelVersion, '2.5')
  const license = indexLicenseView()
  assert.equal(license.id, 'LicenseRef-Bilibili-IndexTTS')
  assert.equal(license.apache2, false)
  assert.equal(license.unrestrictedRedistribution, false)
  assert.match(license.commercialThreshold, /100,000,000/)
  const inventory = indexMetadataInventory()
  assert.equal(inventory.pythonPackage.installedStatus, 'UNKNOWN')
  assert.equal(inventory.model.localAvailabilityStatus, 'UNKNOWN')
  assert.equal(inventory.tokenizer.versionStatus, 'UNKNOWN')
  assert.equal(inventory.dependencies.every((item) => item.licenseStatus === 'UNKNOWN'), true)
  assert.equal(inventory.loadingBoundary.localFilesOnly, true)
  assert.deepEqual([...inventory.loadingBoundary.offlineEnvironment], ['HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'MODELSCOPE_OFFLINE'])
})

test('clone/emotion capability matrix and 8-float order match the fixed model card', () => {
  assert.deepEqual([...INDEX_TTS_LANGUAGES], ['zh-CN', 'en-US', 'ja-JP', 'es-ES', 'ar-SA'])
  assert.deepEqual([...INDEX_TTS_EMOTION_MODES], ['neutral', 'happy', 'angry', 'sad', 'afraid', 'disgusted', 'melancholic', 'surprised', 'calm'])
  assert.deepEqual([...INDEX_TTS_EMOTION_VECTORS.happy], [1, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual([...INDEX_TTS_EMOTION_VECTORS.calm], [0, 0, 0, 0, 0, 0, 0, 1])
  assert.deepEqual(indexEmotionVector('sad'), [0, 0, 1, 0, 0, 0, 0, 0])
  assert.equal(indexEmotionVector('not-a-mode'), null)
  assert.equal(INDEX_TTS_LIMITS.sampleRate, 22050)
})

test('the provider manifest validates, exposes clone/emotion and never advertises streaming/persistence', () => {
  const built = buildIndexManifest(manifestInput())
  assert.equal(built.ok, true, JSON.stringify(built))
  const validation = validateProviderManifest(built.manifest)
  assert.equal(validation.ok, true, JSON.stringify(validation.errors))
  const manifest = validation.manifest
  assert.equal(manifest.id, INDEX_TTS_PROVIDER_ID)
  assert.equal(manifest.kind, 'LOCAL')
  assert.equal(manifest.capabilities.clone.supported, true)
  assert.equal(manifest.capabilities.clone.requiresReferenceAudio, true)
  assert.equal(manifest.capabilities.streaming, false)
  assert.equal(manifest.capabilities.emotion.supported, true)
  assert.equal(manifest.capabilities.emotion.textSupported, true)
  assert.equal(manifest.capabilities.voices[0].kind, 'cloned')
  assert.equal(manifest.capabilities.formats[0].sampleRate, 22050)
  assert.equal(manifest.capabilities.retry.maxAttempts, 0)
  assert.equal(manifest.network.required, false)
  assert.equal(manifest.privacy.textLeavesDevice, false)
  assert.equal(manifest.resources.gpuRequired, true)
})

test('manifest construction fails closed for wrong backend/model/version/language/binding', () => {
  assert.equal(buildIndexManifest(manifestInput({ backend: 'preset' })).code, INDEX_TTS_ERRORS.UNKNOWN_BACKEND)
  assert.equal(buildIndexManifest(manifestInput({ model: 'IndexTTS-2' })).code, INDEX_TTS_ERRORS.MODEL_MISMATCH)
  assert.equal(buildIndexManifest(manifestInput({ modelVersion: '2.0' })).code, INDEX_TTS_ERRORS.MODEL_MISMATCH)
  assert.equal(buildIndexManifest(manifestInput({ indexTtsVersion: '2.0.1' })).code, INDEX_TTS_ERRORS.VERSION_MISMATCH)
  assert.equal(buildIndexManifest(manifestInput({ qwenEmoAvailable: 'yes' })).code, INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(buildIndexManifest(manifestInput({ voices: [] })).code, INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED)
  assert.equal(buildIndexManifest(manifestInput({ languages: ['fr-FR'] })).code, INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE)
  assert.equal(buildIndexManifest(manifestInput({ limits: { maxChars: 201, maxAudioSeconds: 60, timeoutMs: 180000 } })).code, INDEX_TTS_ERRORS.DISCOVERY_INCOMPLETE)
})

test('modality guard accepts exactly one trusted clone binding and rejects preset/design/mixing', () => {
  assert.equal(checkIndexModality({}, { kind: 'clone', voiceId: 'demo-voice' }).ok, true)
  assert.equal(checkIndexModality({ voiceId: 'preset' }, null).code, INDEX_TTS_ERRORS.CLONE_BINDING_REQUIRED)
  assert.equal(checkIndexModality({ voiceId: 'preset' }, { kind: 'clone', voiceId: 'demo-voice' }).code, INDEX_TTS_ERRORS.MIXED_MODALITY)
  assert.equal(checkIndexModality({ voicePrompt: '温柔' }, null).code, INDEX_TTS_ERRORS.UNSUPPORTED_MODALITY)
})

test('protocol encodes a bounded Index synthesis request and rejects extra/path fields', () => {
  const payload = {
    requestId: 'indextts-1',
    text: '你好，IndexTTS。',
    model: INDEX_TTS_MODEL,
    backend: 'clone-emotion',
    modality: 'clone',
    bindingRef: 'binding:demo-1',
    voiceId: 'demo-voice',
    language: 'zh-CN',
    emotion: 'happy',
    emotionVector: [1, 0, 0, 0, 0, 0, 0, 0],
    emotionAlpha: 0.8,
    format: { mime: 'audio/wav', sampleRate: 22050, channels: 1 },
    maxBytes: INDEX_TTS_LIMITS.maxBytes,
  }
  const encoded = encodeRequest({ v: 1, id: 'syn-1', type: 'synthesize', payload })
  assert.equal(encoded.ok, true, JSON.stringify(encoded))
  assert.equal(encoded.line.includes('IndexTTS-2.5'), true)
  const extra = encodeRequest({ v: 1, id: 'syn-1', type: 'synthesize', payload: { ...payload, path: '/tmp/a.wav' } })
  assert.equal(extra.ok, false)
  assert.equal(extra.code, INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD)
  const forbidden = encodeRequest({ v: 1, id: 'syn-1', type: 'hello', payload: { protocol: 1, token: 'secret' } })
  assert.equal(forbidden.ok, false)
})

test('protocol rejects hostile structure, oversized lines, mismatch types and invalid ready/result payloads', () => {
  const tooDeep = '{"v":1,"id":"x","type":"result","payload":' + '['.repeat(40) + ']'.repeat(40) + '}'
  assert.equal(decodeResponse(tooDeep).code, INDEX_TTS_PROTOCOL_ERRORS.TOO_DEEP)
  const oversized = 'x'.repeat(INDEX_TTS_PROTOCOL_MAX_BYTES + 1)
  assert.equal(decodeResponse(oversized).code, INDEX_TTS_PROTOCOL_ERRORS.OVERSIZED)
  const readyLine = JSON.stringify({
    v: 1, id: 'r1', type: 'ready', payload: {
      provider: 'index-tts-2.5', workerVersion: '0.1.0', workerProtocol: 1, indexTtsVersion: '2.0.0',
      backend: 'clone-emotion', model: 'IndexTTS-2.5', modelVersion: '2.5', languages: [...INDEX_TTS_LANGUAGES],
      voices: [], limits: { maxChars: 200, maxAudioSeconds: 60, timeoutMs: 180000 }, qwenEmoAvailable: true,
      loaded: false, networkBlocked: true, dependencies: { indextts: true }, snapshotCleanupPending: 0, state: 'ok',
    },
  })
  const ready = decodeResponse(readyLine, { expect: ['ready'] })
  assert.equal(ready.ok, true, JSON.stringify(ready))
  const mismatch = decodeResponse(readyLine, { expect: ['result'] })
  assert.equal(mismatch.code, INDEX_TTS_PROTOCOL_ERRORS.RESPONSE_TYPE_MISMATCH)
  const badResult = decodeResponse(JSON.stringify({ v: 1, id: 'r2', type: 'result', payload: { state: 'ok', requestId: 'x', model: 'IndexTTS-2.5', backend: 'clone-emotion', voiceId: 'demo-voice', bytesBase64: 'AA==', mime: 'audio/wav', sampleRate: 16000, channels: 1, durationMs: 10 } }))
  assert.equal(badResult.ok, true) // protocol proves shape, adapter rejects the 16 kHz semantic value
  const badReady = decodeResponse(JSON.stringify({ v: 1, id: 'r3', type: 'ready', payload: { provider: 'qwen-tts', model: 'IndexTTS-2.5', backend: 'clone-emotion', workerProtocol: 1 } }))
  assert.equal(badReady.code, INDEX_TTS_PROTOCOL_ERRORS.INVALID_PAYLOAD)
})
