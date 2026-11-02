/* Self-owned Fake Qwen worker for Plan10 10-A tests.
 *
 * Speaks the narrow NDJSON protocol over stdio. It never loads a model, never touches the network or
 * the filesystem, and produces deterministic synthetic WAV bytes. Fault modes are selected from argv
 * so the supervisor exercises the same process path for success and failure. Identity fields echo the
 * in-flight request by default; `--corrupt=requestId,model,...` deliberately breaks them so tests can
 * prove the adapter no longer relabels someone else's audio.
 */

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const argv = new Map(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.split('=')
  return [key.replace(/^--/, ''), rest.join('=')]
}))
const mode = argv.get('mode') || 'ok'
const backend = argv.get('backend') || 'custom-voice'
const model = argv.get('model') || (backend === 'base-clone'
  ? 'Qwen3-TTS-12Hz-1.7B-Base'
  : backend === 'voice-design'
    ? 'Qwen3-TTS-12Hz-1.7B-VoiceDesign'
    : 'Qwen3-TTS-12Hz-1.7B-CustomVoice')
const provider = argv.get('provider') || 'qwen-tts'
const workerProtocol = Number(argv.get('protocol') || 1)
const corrupt = new Set(String(argv.get('corrupt') || '').split(',').filter(Boolean))
const delayMs = Number(argv.get('delay') || (mode === 'late' ? 450 : mode === 'cancel-ack' ? 800 : 800))
const VOICES = [
  { id: 'demo-voice-a', name: '示例音色 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', name: '示例音色 B', languages: ['zh-CN', 'en-US'] },
]
const cancelled = new Set()
let ghostPayload = null
let lastSynth = null

function modeVoices() {
  if (mode === 'voice-language-conflict') {
    return [
      { id: 'demo-voice-a', name: '示例音色 A', languages: ['en-US'] },
      { id: 'demo-voice-b', name: '示例音色 B', languages: ['zh-CN'] },
    ]
  }
  return VOICES
}

function modeLanguages() {
  return mode === 'voice-language-conflict' ? ['zh-CN'] : ['zh-CN', 'en-US']
}

function modeLimits() {
  if (mode === 'tiny-limit') return { maxChars: 1, maxAudioSeconds: 20, timeoutMs: 120000 }
  if (mode === 'tiny-audio') return { maxChars: 200, maxAudioSeconds: 1, timeoutMs: 120000 }
  if (mode === 'tiny-timeout') return { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 100 }
  return { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 }
}

function readyPayload() {
  const base = {
    workerVersion: '0.1.0-fake',
    workerProtocol,
    qwenTtsVersion: '0.1.1',
    provider,
    backend,
    model,
    modelSize: '1b7',
    instructSupported: true,
    languages: modeLanguages(),
    voices: modeVoices(),
    limits: modeLimits(),
    loaded: false,
    state: 'ok',
  }
  if (mode === 'unrelated') return { ...base, provider: 'other-service', model: 'OtherTTS-1' }
  if (mode === 'version-mismatch') return { ...base, qwenTtsVersion: '9.9.9' }
  if (mode === 'no-voices') return { ...base, voices: [] }
  if (mode === 'voice-design') return { ...base, backend: 'voice-design', model: 'Qwen3-TTS-12Hz-1.7B-VoiceDesign' }
  if (mode === 'invented-model') return { ...base, model: 'Qwen3-TTS-NotAudited' }
  if (mode === 'wrong-provider') return { ...base, provider: 'unrelated-service' }
  if (mode === 'wrong-protocol') return { ...base, workerProtocol: 99 }
  if (mode === 'base-model-custom-backend') return { ...base, model: 'Qwen3-TTS-12Hz-1.7B-Base', backend: 'custom-voice' }
  return base
}

function syntheticBytes(message) {
  if (mode === 'bad-bytes') return { bytes: new Uint8Array(44), sampleRate: 24000, durationMs: 0 }
  if (mode === 'oversized') return { bytes: new Uint8Array(1_100_000), sampleRate: 24000, durationMs: 0 }
  const sampleRate = mode === 'bad-format' ? 16000 : 24000
  const ms = mode === 'tiny-audio' ? 2000 : Math.min(20000, 200 + String(message.text || '').length * 8)
  const frameCount = Math.round((sampleRate * ms) / 1000)
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate, channels: 1, frameCount, pattern: 'EDGE_SEQUENCE' })
  if (!produced || produced.ok !== true) return null
  return { bytes: produced.value.bytes, sampleRate, durationMs: Math.round((frameCount * 1000) / sampleRate) }
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function respond(id, payload) {
  send({ v: 1, id, type: 'result', payload })
}

function fail(id, code, message) {
  send({ v: 1, id, type: 'error', payload: { code, message } })
}

function outputIdentity(payload) {
  return {
    requestId: corrupt.has('requestId') ? 'other-request' : payload.requestId,
    model: corrupt.has('model') ? 'Qwen3-TTS-12Hz-0.6B-Base' : model,
    backend: corrupt.has('backend') ? 'base-clone' : backend,
    voiceId: corrupt.has('voiceId') ? 'other-voice' : (payload.voiceId || null),
  }
}

function synthesize(id, payload) {
  if (mode === 'hang') return
  if (mode === 'error') {
    fail(id, 'QWEN_PROVIDER_NOT_READY', 'fixture failure')
    return
  }
  if (mode === 'unknown-error') {
    fail(id, 'QWEN_UNKNOWN_RESULT', 'fixture unknown result')
    return
  }
  if (mode === 'crash') {
    process.exit(7)
    return
  }
  if (mode === 'deep') {
    const nested = '['.repeat(20000) + '0' + ']'.repeat(20000)
    process.stdout.write('{"v":1,"id":"' + id + '","type":"result","payload":{"state":"ok","requestId":"' +
      String(payload.requestId || '') + '","model":"' + model + '","backend":"' + backend +
      '","voiceId":"' + String(payload.voiceId || '') + '","warnings":' + nested + '}}\n')
    return
  }
  if (mode === 'event-result') {
    send({
      v: 1,
      id,
      type: 'event',
      payload: { requestId: payload.requestId, state: 'progress', message: 'not a synthesis result' },
    })
    return
  }
  if (mode === 'unknown-state') {
    respond(id, { state: 'unknown', requestId: payload.requestId, model, backend, voiceId: payload.voiceId || null })
    return
  }
  if (mode === 'cancelled') {
    respond(id, { state: 'cancelled', requestId: payload.requestId, model, backend, voiceId: payload.voiceId || null })
    return
  }
  if (mode === 'ghost-error' || mode === 'ghost-result') {
    ghostPayload = payload
    lastSynth = { id, payload }
    return
  }
  if (mode === 'late-progress-then-cancel') {
    lastSynth = { id, payload }
    return
  }
  if (mode === 'wrong-then-correct') {
    const builtWrong = syntheticBytes(payload)
    setTimeout(() => respond(id, {
      state: 'ok',
      mime: 'audio/wav',
      sampleRate: builtWrong.sampleRate,
      channels: 1,
      durationMs: builtWrong.durationMs,
      bytesBase64: Buffer.from(builtWrong.bytes).toString('base64'),
      requestId: 'different-request',
      model,
      backend,
      voiceId: payload.voiceId || null,
    }), 50)
    setTimeout(() => respond(id, {
      state: 'ok',
      mime: 'audio/wav',
      sampleRate: builtWrong.sampleRate,
      channels: 1,
      durationMs: builtWrong.durationMs,
      bytesBase64: Buffer.from(builtWrong.bytes).toString('base64'),
      requestId: payload.requestId,
      model,
      backend,
      voiceId: payload.voiceId || null,
    }), 250)
    return
  }
  if (mode === 'unknown-terminal') {
    setTimeout(() => respond(id, {
      state: 'unknown',
      requestId: payload.requestId,
      model,
      backend,
      voiceId: payload.voiceId || null,
    }), 100)
    return
  }
  const built = syntheticBytes(payload)
  if (!built) {
    fail(id, 'QWEN_OUTPUT_INVALID', 'fixture could not produce bytes')
    return
  }
  if (mode === 'wrong-identity') {
    setTimeout(() => respond(id, {
      state: 'ok',
      mime: 'audio/wav',
      sampleRate: built.sampleRate,
      channels: 1,
      durationMs: built.durationMs,
      bytesBase64: Buffer.from(built.bytes).toString('base64'),
      requestId: 'different-request',
      model,
      backend,
      voiceId: payload.voiceId || null,
    }), 100)
    return
  }
  const answer = () => {
    if (cancelled.has(payload.requestId) && !['late', 'cancel-ack', 'cancel-reject', 'cancel-reject-claimed', 'progress-ack', 'wrong-ack-id', 'cancel-ignore'].includes(mode)) return
    respond(id, {
      state: 'ok',
      mime: 'audio/wav',
      sampleRate: built.sampleRate,
      channels: 1,
      durationMs: built.durationMs,
      bytesBase64: Buffer.from(built.bytes).toString('base64'),
      ...outputIdentity(payload),
    })
    if (mode === 'garbage') process.stdout.write('this is not json\n')
  }
  if (['late', 'cancel-ack', 'cancel-reject', 'cancel-reject-claimed', 'progress-ack', 'wrong-ack-id', 'cancel-ignore', 'tiny-timeout'].includes(mode)) setTimeout(answer, delayMs)
  else answer()
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index = buffer.indexOf('\n')
  while (index >= 0) {
    const line = buffer.slice(0, index)
    buffer = buffer.slice(index + 1)
    if (line.trim()) handle(line)
    index = buffer.indexOf('\n')
  }
})
process.stdin.on('end', () => process.exit(0))

function handle(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (!message || message.v !== 1 || typeof message.id !== 'string') return
  const { id, type, payload = {} } = message
  if (type === 'hello') {
    send({ v: 1, id, type: 'ready', payload: readyPayload() })
    return
  }
  if (type === 'health') {
    if (mode === 'health-degraded') respond(id, { state: 'degraded', model, backend, loaded: false })
    else respond(id, { state: 'ok', model, backend, loaded: false })
    return
  }
  if (type === 'discover') {
    respond(id, {
      model,
      backend,
      models: mode === 'empty-models' ? [] : [model],
      voices: mode === 'no-voices' ? [] : modeVoices(),
      languages: mode === 'empty-languages' ? [] : modeLanguages(),
      limits: mode === 'no-limits' ? undefined : modeLimits(),
    })
    return
  }
  if (type === 'synthesize') {
    synthesize(id, payload)
    return
  }
  if (type === 'cancel') {
    cancelled.add(payload.requestId)
    if (mode === 'cancel-ignore') return
    if (mode === 'cancel-reject') {
      fail(id, 'QWEN_PROVIDER_NOT_READY', 'fixture cancel rejected')
      return
    }
    if (mode === 'cancel-reject-claimed') {
      send({
        v: 1,
        id,
        type: 'error',
        payload: { code: 'QWEN_PROVIDER_NOT_READY', message: 'fixture cancel rejected with a claimed request id', requestId: payload.requestId },
      })
      return
    }
    if (mode === 'progress-ack') {
      send({ v: 1, id, type: 'event', payload: { requestId: payload.requestId, state: 'progress' } })
      return
    }
    if (mode === 'wrong-ack-id') {
      send({ v: 1, id, type: 'event', payload: { requestId: 'other-request', state: 'cancelled' } })
      return
    }
    send({ v: 1, id, type: 'event', payload: { requestId: payload.requestId, state: 'cancelled' } })
    if (mode === 'late-progress-then-cancel' && lastSynth) {
      setTimeout(() => {
        send({ v: 1, id: lastSynth.id, type: 'event', payload: { requestId: lastSynth.payload.requestId, state: 'progress' } })
        respond(lastSynth.id, {
          state: 'cancelled',
          requestId: lastSynth.payload.requestId,
          model,
          backend,
          voiceId: lastSynth.payload.voiceId || null,
        })
      }, 40)
    }
    if (mode === 'ghost-error' && ghostPayload) {
      setTimeout(() => fail('ghost-999', 'QWEN_UNKNOWN_RESULT', 'ghost error from a never-issued message id'), 40)
    }
    if (mode === 'ghost-result' && ghostPayload) {
      setTimeout(() => respond('ghost-999', {
        state: 'unknown',
        requestId: ghostPayload.requestId,
        model,
        backend,
        voiceId: ghostPayload.voiceId || null,
      }), 40)
    }
    return
  }
  if (type === 'shutdown') {
    send({ v: 1, id, type: 'event', payload: { state: 'closing', closing: true } })
    setTimeout(() => process.exit(0), 10)
  }
}
