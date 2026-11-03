/* Self-owned Fake Qwen worker that ignores shutdown, for supervisor lifecycle tests.
 *
 * It answers hello/health/discover/synthesize like the normal Fake but never acknowledges
 * `shutdown` and never exits on its own. Tests combine it with an injected `spawnProcess` whose
 * `kill` is denied, so they can prove that an unconfirmed stop is reported as a failure instead of a
 * green `ok`, and that an `error` event is not treated as an exit. This file is never used by
 * production code.
 */

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'

const argv = new Map(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.split('=')
  return [key.replace(/^--/, ''), rest.join('=')]
}))
const helloDelay = Number(argv.get('hello-delay') || 0)
const backend = 'custom-voice'
const model = 'Qwen3-TTS-12Hz-1.7B-CustomVoice'
const VOICES = [
  { id: 'demo-voice-a', name: '示例音色 A', languages: ['zh-CN'] },
  { id: 'demo-voice-b', name: '示例音色 B', languages: ['zh-CN', 'en-US'] },
]

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

function respond(id, payload) {
  send({ v: 1, id, type: 'result', payload })
}

function synthesize(id, payload) {
  const frameCount = 2400
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount, pattern: 'EDGE_SEQUENCE' })
  if (!produced || produced.ok !== true) return
  respond(id, {
    state: 'ok',
    mime: 'audio/wav',
    sampleRate: 24000,
    channels: 1,
    durationMs: 100,
    bytesBase64: Buffer.from(produced.value.bytes).toString('base64'),
    requestId: payload.requestId,
    model,
    backend,
    voiceId: payload.voiceId || null,
  })
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
    const ready = {
      v: 1,
      id,
      type: 'ready',
      payload: {
        provider: 'qwen-tts',
        workerVersion: '0.1.0-fake',
        workerProtocol: 1,
        qwenTtsVersion: '0.1.1',
        backend,
        model,
        modelSize: '1b7',
        instructSupported: true,
        languages: ['zh-CN', 'en-US'],
        voices: VOICES,
        limits: { maxChars: 200, maxAudioSeconds: 20, timeoutMs: 120000 },
        loaded: false,
        state: 'ok',
      },
    }
    if (helloDelay > 0) setTimeout(() => send(ready), Math.min(helloDelay, 10000))
    else send(ready)
    return
  }
  if (type === 'health') {
    respond(id, { state: 'ok', model, backend, loaded: false })
    return
  }
  if (type === 'discover') {
    respond(id, {
      model,
      backend,
      models: [model],
      voices: VOICES,
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
    send({ v: 1, id, type: 'event', payload: { requestId: payload.requestId, state: 'cancelled' } })
    return
  }
  /* `shutdown` is deliberately ignored: only a real process kill can stop this worker. */
}
