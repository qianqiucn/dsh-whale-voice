import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { normalizeEmotion } from '../emotion.mjs'
import { inspectWav } from '../wav.mjs'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const SAFE_VOICE = /^[A-Za-z0-9_-]{1,40}$/
const MODEL = 'Qwen3-TTS-12Hz-1.7B-Base'

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function contentUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

async function readAllLimited(res, maxBytes) {
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('qwen_audio_too_large')
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > maxBytes) throw new Error('qwen_audio_too_large')
    return buffer
  }
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        /* best effort */
      }
      throw new Error('qwen_audio_too_large')
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

/**
 * 本地 Qwen3-TTS provider。
 *
 * 协议（已核对 local_api.py）：
 *   POST /v1/synthesize  {text, voice_id}
 *   Authorization: Bearer <api-token.txt>
 *   200 audio/wav
 *
 * 这里不做“DeepSeek 网页朗读”的任何事情：没有 CDP、没有 message_id、没有 echo。
 */
export class QwenLocalProvider {
  constructor({ config, fetchImpl = globalThis.fetch, cacheDir = null }) {
    this.config = config
    this.fetch = fetchImpl
    this.cacheDir = cacheDir ?? resolve(process.cwd(), config.tts?.cacheDir ?? 'runtime/tts-cache')
    this.#assertConfig()
  }

  get provider() {
    return 'qwen-local'
  }

  get baseUrl() {
    return String(process.env.VOICE_QWEN_TTS_BASE ?? this.config.tts?.baseUrl ?? '').replace(/\/+$/, '')
  }

  get voice() {
    return String(this.config.tts?.voiceId ?? 'whale-v1')
  }

  get fake() {
    return this.config.tts?.fake === true
  }

  get maxTextChars() {
    return Number(this.config.tts?.maxTextChars ?? this.config.maxTextChars ?? 300)
  }

  get timeoutMs() {
    return Number(this.config.tts?.timeoutMs ?? 180000)
  }

  get tokenFile() {
    return String(this.config.tts?.tokenFile ?? '')
  }

  get #limits() {
    return {
      maxBytes: Number(this.config.tts?.maxAudioBytes ?? 8 * 1024 * 1024),
      minSeconds: Number(this.config.tts?.minDurationSec ?? 0.2),
      maxSeconds: Number(this.config.tts?.maxDurationSec ?? 45),
      minSampleRate: Number(this.config.tts?.minSampleRate ?? 16000),
      maxSampleRate: Number(this.config.tts?.maxSampleRate ?? 48000),
    }
  }

  #assertConfig() {
    if (this.config.tts?.fallbackProvider !== null && this.config.tts?.fallbackProvider !== undefined) {
      throw new Error('tts_fallback_not_supported')
    }
    let url
    try {
      url = new URL(this.baseUrl)
    } catch {
      throw new Error('qwen_base_url_invalid')
    }
    if (url.protocol !== 'http:') throw new Error('qwen_base_url_invalid')
    if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error('qwen_base_url_not_loopback')
    if (!SAFE_VOICE.test(this.voice)) throw new Error('qwen_voice_invalid')
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 600000) {
      throw new Error('qwen_timeout_invalid')
    }
    if (!Number.isInteger(this.maxTextChars) || this.maxTextChars < 1 || this.maxTextChars > 2000) {
      throw new Error('qwen_max_text_invalid')
    }
  }

  #readToken() {
    if (this.tokenFile === '') throw new Error('qwen_token_missing')
    let token = ''
    try {
      token = readFileSync(this.tokenFile, 'utf8').trim()
    } catch {
      throw new Error('qwen_token_missing')
    }
    if (token.length < 16) throw new Error('qwen_token_missing')
    return token
  }

  #authHeaders() {
    return { authorization: `Bearer ${this.#readToken()}` }
  }

  /**
   * 校验 whale-v1 的参考文件没有被意外修改。文件很小，每次合成前都读一遍，
   * 避免进程常驻期间参考音色被替换而继续用旧 prompt。
   */
  #verifyReference() {
    const file = this.config.tts?.referenceFile
    if (!file) return null
    let bytes
    try {
      bytes = readFileSync(file)
    } catch {
      throw new Error('qwen_reference_missing')
    }
    const hash = sha256(bytes)
    const expected = String(this.config.tts?.referenceSha256 ?? '').toLowerCase()
    if (expected !== '' && hash !== expected) throw new Error(`qwen_reference_changed:${hash.slice(0, 12)}`)
    const textFile = this.config.tts?.referenceTextFile
    if (textFile) {
      const textHash = sha256(readFileSync(textFile))
      const expectedText = String(this.config.tts?.referenceTextSha256 ?? '').toLowerCase()
      if (expectedText !== '' && textHash !== expectedText) {
        throw new Error(`qwen_reference_text_changed:${textHash.slice(0, 12)}`)
      }
    }
    return { file, sha256: hash, bytes: bytes.length }
  }

  async health() {
    const res = await this.#request('/health', { method: 'GET' })
    if (!res.ok) throw await this.#httpError(res)
    const body = await this.#readJson(res)
    if (body?.ok !== true) throw new Error('qwen_health_failed')
    const reference = this.#verifyReference()
    return { ...body, reference, provider: this.provider, baseUrl: this.baseUrl }
  }

  async synthesize({ text, voice, emotion = 'neutral' }) {
    const cleanText = String(text ?? '').trim()
    if (cleanText === '') throw new Error('qwen_text_empty')
    if (cleanText.length > this.maxTextChars) throw new Error(`qwen_text_too_long:${cleanText.length}`)
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(cleanText)) throw new Error('qwen_text_control_chars')
    if (voice !== this.voice) throw new Error(`qwen_voice_not_allowed:${voice}`)
    const normalizedEmotion = normalizeEmotion(emotion)
    const reference = this.#verifyReference()

    if (this.fake) {
      return { wav: join(this.cacheDir, 'fake.wav'), seconds: 3, bytes: 0, cached: false, ms: 1, voice, emotion: normalizedEmotion, provider: this.provider }
    }

    mkdirSync(this.cacheDir, { recursive: true })
    const key = createHash('sha256')
      .update(`${MODEL}\n${voice}\n${normalizedEmotion}\n${reference?.sha256 ?? ''}\n${cleanText}`)
      .digest('hex')
      .slice(0, 32)
    const wavPath = join(this.cacheDir, `${key}.wav`)
    const started = Date.now()

    if (this.config.tts?.cacheEnabled !== false && existsSync(wavPath)) {
      try {
        const buffer = readFileSync(wavPath)
        const meta = inspectWav(buffer, this.#limits)
        return {
          wav: wavPath,
          seconds: meta.seconds,
          bytes: meta.bytes,
          cached: true,
          ms: Date.now() - started,
          voice,
          emotion: normalizedEmotion,
          provider: this.provider,
          sampleRate: meta.sampleRate,
          channels: meta.channels,
          bitsPerSample: meta.bitsPerSample,
          rtf: 0,
          referenceSha256: reference?.sha256 ?? null,
        }
      } catch {
        // 损坏的缓存不能复用；删除后重新合成。
        try {
          rmSync(wavPath, { force: true })
          rmSync(wavPath.replace(/\.wav$/, '.json'), { force: true })
        } catch {
          /* best effort */
        }
      }
    }

    let res
    try {
      res = await this.#request('/v1/synthesize', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ text: cleanText, voice_id: voice }),
      })
    } catch (error) {
      if (String(error?.message ?? '').startsWith('qwen_')) throw error
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('qwen_timeout')
      const cause = error?.cause?.code ?? error?.code ?? error?.name ?? 'error'
      throw new Error(`qwen_unreachable:${cause}`)
    }
    if (!res.ok) throw await this.#httpError(res)

    const contentType = String(res.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase()
    if (contentType !== 'audio/wav' && contentType !== 'audio/x-wav') {
      throw new Error(`qwen_bad_content_type:${contentType || 'missing'}`)
    }

    let buffer
    try {
      buffer = await readAllLimited(res, this.#limits.maxBytes)
    } catch (error) {
      if (String(error?.message ?? '').includes('qwen_audio_too_large')) throw new Error('qwen_audio_too_large')
      throw new Error(`qwen_read_failed:${error?.name ?? 'error'}`)
    }

    let meta
    try {
      meta = inspectWav(buffer, this.#limits)
    } catch (error) {
      throw new Error(`qwen_wav_invalid:${error?.code ?? 'bad_audio'}`)
    }

    this.#writeAtomic(wavPath, buffer)
    this.#writeSidecar(wavPath, {
      voice,
      engine: 'qwen3-tts',
      model: MODEL,
      language: 'Chinese',
      version: 1,
      emotion: normalizedEmotion,
      textSha256: sha256(Buffer.from(cleanText, 'utf8')),
      seconds: meta.seconds,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      bitsPerSample: meta.bitsPerSample,
      bytes: meta.bytes,
      referenceSha256: reference?.sha256 ?? null,
      createdAt: new Date().toISOString(),
    })

    const elapsed = Date.now() - started
    return {
      wav: wavPath,
      seconds: meta.seconds,
      bytes: meta.bytes,
      cached: false,
      ms: elapsed,
      voice,
      emotion: normalizedEmotion,
      provider: this.provider,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      bitsPerSample: meta.bitsPerSample,
      rtf: meta.seconds > 0 ? elapsed / 1000 / meta.seconds : null,
      referenceSha256: reference?.sha256 ?? null,
    }
  }

  #request(path, init) {
    const url = contentUrl(this.baseUrl, path)
    const headers = { ...(init.headers ?? {}), ...this.#authHeaders() }
    return this.fetch(url, { ...init, headers, signal: AbortSignal.timeout(this.timeoutMs) })
  }

  async #readJson(res) {
    try {
      const buffer = await readAllLimited(res, 64 * 1024)
      return JSON.parse(buffer.toString('utf8'))
    } catch {
      return null
    }
  }

  async #httpError(res) {
    const body = await this.#readJson(res)
    const code = String(body?.error ?? body?.code ?? '')
    if (res.status === 401 || res.status === 403) return new Error('qwen_unauthorized')
    if (res.status === 413) return new Error('qwen_request_too_large')
    if (res.status === 429) return new Error('qwen_busy')
    if (res.status === 400) return new Error(`qwen_bad_request:${code || 'invalid_request'}`)
    if (res.status === 503) {
      if (code === 'cuda_oom') return new Error('qwen_cuda_oom')
      if (code === 'busy') return new Error('qwen_busy')
      return new Error(`qwen_unavailable:${code || 'service_unavailable'}`)
    }
    if (res.status >= 500) {
      if (code === 'cuda_oom') return new Error('qwen_cuda_oom')
      return new Error(`qwen_synthesis_failed:${code || 'internal'}`)
    }
    return new Error(`qwen_http_${res.status}:${code || 'error'}`)
  }

  #writeAtomic(path, buffer) {
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`
    writeFileSync(tmp, buffer)
    try {
      if (existsSync(path)) rmSync(path, { force: true })
      renameSync(tmp, path)
    } catch (error) {
      try {
        rmSync(tmp, { force: true })
      } catch {
        /* best effort */
      }
      throw new Error(`qwen_cache_write_failed:${error?.code ?? 'error'}`)
    }
    if (statSync(path).size !== buffer.length) throw new Error('qwen_cache_write_incomplete')
  }

  #writeSidecar(path, value) {
    try {
      const sidecar = path.replace(/\.wav$/, '.json')
      writeFileSync(sidecar, JSON.stringify(value, null, 2), 'utf8')
    } catch {
      /* 诊断信息写失败不影响音频 */
    }
  }
}
