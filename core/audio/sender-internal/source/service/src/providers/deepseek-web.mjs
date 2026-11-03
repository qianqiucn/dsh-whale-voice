import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { isInside, summarizeError } from '../util.mjs'

/**
 * 旧 DeepSeek 网页朗读 provider（回滚用，默认关闭）。
 * 保留原实现与错误语义；新 Qwen 后端失败时**不会**自动切到这里。
 */
export class DeepSeekWebProvider {
  constructor({ config, fetchImpl = globalThis.fetch, dshHome = process.env.DSH_HOME ?? defaultDshHome() }) {
    this.config = config
    this.fetch = fetchImpl
    this.dshHome = dshHome
  }

  get provider() {
    return 'deepseek-web'
  }

  get baseUrl() {
    return (process.env.VOICE_DS_TTS_BASE ?? this.config.dsTts?.baseUrl ?? '').replace(/\/+$/, '')
  }

  get voice() {
    return this.config.dsTts?.voice ?? 'mira'
  }

  get fake() {
    return this.config.dsTts?.fake === true
  }

  get cacheDir() {
    return join(this.dshHome, 'ds-tts', 'cache')
  }

  async #json(path, init = {}) {
    const url = `${this.baseUrl}${path}`
    const timeout = AbortSignal.timeout(this.config.dsTts?.timeoutMs ?? 180000)
    const res = await this.fetch(url, {
      ...init,
      signal: timeout,
      headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) },
    })
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
    if (!res.ok) {
      const code = body?.error?.code ?? body?.code ?? `http_${res.status}`
      throw new Error(`ds_tts_http_${res.status}:${code}`)
    }
    return body
  }

  async currentVoice() {
    const body = await this.#json('/api/ds-tts/voices')
    return body?.currentVoiceId ?? null
  }

  async ensureVoice(voice) {
    if (this.config.dsTts?.fake) return voice
    const current = await this.currentVoice()
    if (current === voice) return voice
    if (!this.config.allowVoiceAutoSwitch) {
      throw new Error(`voice_mismatch:account_voice=${current ?? 'unknown'},requested=${voice}`)
    }
    await this.#json('/api/ds-tts/voice', { method: 'POST', body: JSON.stringify({ voiceId: voice }) })
    const verify = await this.currentVoice()
    if (verify !== voice) throw new Error(`voice_switch_failed:${verify ?? 'unknown'}`)
    return voice
  }

  static normalize(text) {
    return String(text ?? '').replace(/\s+/g, '')
  }

  async health() {
    const body = await this.#json('/api/ds-tts/status')
    return {
      ok: body?.ok === true,
      provider: this.provider,
      baseUrl: this.baseUrl,
      voice: body?.config?.voice ?? this.voice,
      loggedIn: body?.ds?.loggedIn ?? null,
      raw: body,
    }
  }

  /**
   * @returns {Promise<{wav:string,seconds:number,bytes:number,cached:boolean,ms:number,voice:string}>}
   */
  async synthesize({ text, voice }) {
    if (this.config.dsTts?.fake) {
      const fakeWav = join(this.cacheDir, 'fake.wav')
      return { wav: fakeWav, seconds: 3.0, bytes: 0, cached: false, ms: 1, voice }
    }
    await this.ensureVoice(voice)

    const started = Date.now()
    const body = await this.#json('/api/ds-tts/synthesize', {
      method: 'POST',
      body: JSON.stringify({ text, voice, format: 'pcm' }),
    })
    const elapsed = Date.now() - started

    if (!body?.ok) throw new Error(`ds_tts_failed:${summarizeError(body?.error ?? body?.message ?? 'unknown')}`)
    if (body.voice !== voice) throw new Error(`tts_voice_mismatch:returned=${body.voice},requested=${voice}`)
    if (DeepSeekWebProvider.normalize(body.text) !== DeepSeekWebProvider.normalize(text)) {
      throw new Error('tts_echo_mismatch')
    }
    if (typeof body.id !== 'string' || !/^[0-9a-f]{8,32}$/.test(body.id)) throw new Error('tts_bad_id')
    const ext = typeof body.ext === 'string' ? body.ext : 'wav'
    const wav = resolve(join(this.cacheDir, `${body.id}.${ext}`))
    if (!isInside(wav, this.cacheDir)) throw new Error('tts_path_outside_cache')
    if (!existsSync(wav)) throw new Error(`tts_file_missing:${wav}`)

    return {
      wav,
      seconds: Number(body.seconds ?? 0),
      bytes: Number(body.bytes ?? 0),
      cached: Boolean(body.cached),
      ms: elapsed,
      voice: body.voice,
      provider: this.provider,
    }
  }
}

function defaultDshHome() {
  return process.env.USERPROFILE ? join(process.env.USERPROFILE, '.dsh') : '.'
}
