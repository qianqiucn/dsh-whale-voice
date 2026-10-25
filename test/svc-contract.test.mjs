import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

import { SVC_ERRORS, normalizeSvcResult, validateSvcRequest } from '../core/svc/svc-contract.mjs'
import { getSvcCandidate, getSvcRegistryView, listSvcCandidates, selectSvcCandidate } from '../core/svc/svc-registry.mjs'
import { getProviderCandidate, getRegistryView } from '../core/tts/provider-registry.mjs'

const request = {
  sourceAudioRef: 'artifact:source-voice-1',
  targetVoiceId: 'shared-voice-a',
  pitchShift: 0,
  formantShift: 0,
  conversionStrength: 0.8,
  outputFormat: 'audio/wav',
}

test('SVC request requires source audio and a shared target voice', () => {
  const ok = validateSvcRequest(request)
  assert.equal(ok.ok, true)
  assert.equal(validateSvcRequest({ ...request, sourceAudioRef: '' }).ok, false)
  assert.equal(validateSvcRequest({ ...request, targetVoiceId: '' }).errors[0].code, SVC_ERRORS.UNSUPPORTED_VOICE)
  assert.equal(validateSvcRequest({ ...request, pitchShift: 25 }).ok, false)
  assert.equal(validateSvcRequest({ ...request, apiKey: 'not-allowed' }).ok, false)
  assert.equal(validateSvcRequest({ ...request, outputFormat: 'video/mp4' }).ok, false)
})

test('SVC result is pending the shared delivery router, never WeChat delivery', () => {
  const ok = normalizeSvcResult('seed-vc', {
    requestId: 'svc-1',
    targetVoiceId: 'shared-voice-a',
    artifactRef: 'artifact:converted-1',
    mime: 'audio/wav',
    sampleRate: 44100,
    durationMs: 2200,
  })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.result.delivery, { state: 'PENDING_ROUTER' })
  assert.equal(ok.result.engineId, 'seed-vc')
  assert.equal(normalizeSvcResult('seed-vc', {
    requestId: 'svc-2', targetVoiceId: 'shared-voice-a', artifactRef: 'a', mime: 'audio/wav', sampleRate: 44100, durationMs: 1,
    delivery: { state: 'SENT' },
  }).ok, false)
  assert.equal(normalizeSvcResult('seed-vc', {
    requestId: 'svc-3', targetVoiceId: 'shared-voice-a', artifactRef: 'a', mime: 'audio/wav', sampleRate: 44100, durationMs: 1,
    wechat: { target: 'demo' },
  }).ok, false)
  assert.equal(normalizeSvcResult('seed-vc', {
    requestId: 'svc-4', targetVoiceId: 'shared-voice-a', artifactRef: 'a', mime: 'audio/wav', sampleRate: 44100, durationMs: 1,
    token: 'not-allowed',
  }).ok, false)
})

test('SVC request rejects unknown target fields and returns only allow-listed fields', () => {
  for (const field of ['targetChatId', 'recipient', 'wechat', 'extraField']) {
    const result = validateSvcRequest({ ...request, [field]: 'not-allowed' })
    assert.equal(result.ok, false, field + ' must be rejected')
    assert.equal(result.errors[0].code, SVC_ERRORS.INVALID_REQUEST)
  }
  const ok = validateSvcRequest(request)
  assert.equal(ok.ok, true)
  assert.deepEqual(Object.keys(ok.request).sort(), ['conversionStrength', 'formantShift', 'outputFormat', 'pitchShift', 'sourceAudioRef', 'targetVoiceId'])
  const withFormat = validateSvcRequest({ ...request, outputFormat: 'audio/flac' })
  assert.equal(withFormat.ok, true)
  assert.equal(withFormat.request.outputFormat, 'audio/flac')
})

test('SVC candidates are separate from the TTS Provider Registry', () => {
  const svc = getSvcRegistryView()
  assert.equal(svc.status, 'DESIGN_ONLY')
  assert.equal(svc.engineType, 'SVC')
  assert.equal(svc.defaultVoiceId, null)
  assert.deepEqual(svc.selectable, [])
  assert.deepEqual(svc.implemented, [])
  assert.equal(listSvcCandidates().length, 2)
  assert.deepEqual(listSvcCandidates().map((candidate) => candidate.id).sort(), ['rvc', 'seed-vc'])
  assert.ok(listSvcCandidates().every((candidate) => candidate.integrationStatus === 'NOT_IMPLEMENTED' && candidate.selectable === false))
  assert.equal(selectSvcCandidate('seed-vc').ok, false)
  assert.equal(selectSvcCandidate('seed-vc').code, 'NOT_IMPLEMENTED')
  assert.equal(getSvcCandidate('rvc').kind, 'SVC')

  assert.equal(getProviderCandidate('seed-vc'), null)
  assert.equal(getProviderCandidate('rvc'), null)
  assert.equal(getRegistryView().candidates.some((candidate) => candidate.kind === 'SVC'), false)
  assert.equal(getSvcCandidate('qwen3-tts'), null)
})

test('SVC contract has no I/O or delivery side effects', async () => {
  const contract = await readFile(new URL('../core/svc/svc-contract.mjs', import.meta.url), 'utf8')
  const registry = await readFile(new URL('../core/svc/svc-registry.mjs', import.meta.url), 'utf8')
  for (const source of [contract, registry]) {
    assert.doesNotMatch(source, /node:fs|node:http|node:https|child_process|\bfetch\s*\(|writeFile|spawn\s*\(/)
    assert.doesNotMatch(source, /wechat\.send|sendWeChat|sendToWeChat|\bfunction\s+send\b|\.send\s*\(/)
  }
})
