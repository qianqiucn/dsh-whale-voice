/* Self-owned Fake Qwen worker for Plan10 10-A tests.
 *
 * Speaks the narrow NDJSON protocol over stdio. It never loads a model, never touches the network or
 * the filesystem, and produces deterministic synthetic WAV bytes. Fault modes are selected from argv
 * so the supervisor exercises the same process path for success and failure.
 */

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const argv = new Map(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.split('=')
  return [key.replace(/^--/, ''), rest.join('=')]
}))
const mode = argv.get('mode') || 'ok'
const backend = argv.get('backend') || 'custom-voice'
const delayMs = Number(argv.get('delay') || 800)
const MODEL = 'Qwen3-TTS-12Hz-1.7B-Base'
const VOICES = [
  { id: 'demo-voice-a', name: '示例音色 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', name: '示例音色 B', languages: ['zh-CN', 'en-US'] },
]
let cancelled = new Set()

function readyPayload() {
  const base = {
    workerVersion: '0.1.0-fake',
    workerProtocol: 1,
    qwenTtsVersion: '0.1.1',
    provider: 'qwen-tts',
    backend,
    model: MODEL,
    languages: ['zh-CN', 'en-US'],
    voices: VOICES,
  }
  if (mode === 'unrelated') return { ...base, provider: 'other-service', model: 'OtherTTS-1' }
  if (mode === 'version-mismatch') return { ...base, qwenTtsVersion: '9.9.9' }
  if (mode === 'no-voices') return { ...base, voices: [] }
  if (mode === 'voice-design') return { ...base, backend: 'voice-design' }
  return base
}

function syntheticBytes(message) {
  if (mode === 'bad-bytes') return { bytes: new Uint8Array(44), sampleRate: 24000, durationMs: 0 }
  if (mode === 'oversized') return { bytes: new Uint8Array(1_100_000), sampleRate: 24000, durationMs: 0 }
  const sampleRate = mode === 'bad-format' ? 16000 : 24000
  const ms = Math.min(20000, 200 + String(message.text || '').length * 8)
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

function synthesize(id, payload) {
  if (mode === 'error' || mode === 'hang') {
    if (mode === 'hang') return
    fail(id, 'QWEN_PROVIDER_NOT_READY', 'fixture failure')
    return
  }
  if (mode === 'crash') {
    process.exit(7)
    return
  }
  const built = syntheticBytes(payload)
  if (!built) {
    fail(id, 'QWEN_OUTPUT_INVALID', 'fixture could not produce bytes')
    return
  }
  const answer = () => {
    if (cancelled.has(payload.requestId) && mode !== 'late') return
    respond(id, {
      state: 'ok',
      mime: 'audio/wav',
      sampleRate: built.sampleRate,
      channels: 1,
      durationMs: built.durationMs,
      bytesBase64: Buffer.from(built.bytes).toString('base64'),
      model: MODEL,
      backend,
      voiceId: payload.voiceId || null,
    })
    if (mode === 'garbage') process.stdout.write('this is not json\n')
  }
  if (mode === 'late') setTimeout(answer, delayMs)
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
    if (mode === 'health-degraded') respond(id, { state: 'degraded', model: 'Qwen3-TTS-12Hz-1.7B-Base', loaded: false })
    else respond(id, { state: 'ok', model: MODEL, loaded: false })
    return
  }
  if (type === 'discover') {
    respond(id, {
      models: [MODEL],
      voices: mode === 'no-voices' ? [] : VOICES,
      languages: ['zh-CN', 'en-US'],
      limits: { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 },
    })
    return
  }
  if (type === 'synthesize') {
    synthesize(id, payload)
    return
  }
  if (type === 'cancel') {
    cancelled.add(payload.requestId)
    send({ v: 1, id, type: 'event', payload: { requestId: payload.requestId, state: 'cancelled' } })
    return
  }
  if (type === 'shutdown') {
    send({ v: 1, id, type: 'event', payload: { state: 'closing' } })
    setTimeout(() => process.exit(0), 10)
  }
}
