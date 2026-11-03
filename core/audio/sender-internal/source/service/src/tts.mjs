import { DeepSeekWebProvider } from './providers/deepseek-web.mjs'
import { QwenLocalProvider } from './providers/qwen-local.mjs'

export const PROVIDERS = Object.freeze(['qwen-local', 'deepseek-web'])

/**
 * Provider 选择：
 *  - 生产配置必须显式写 `tts.provider`（当前为 qwen-local）；
 *  - 只有测试/历史配置没有 `tts` 时才回落到旧的 DeepSeekWebProvider；
 *  - 不实现自动 fallback。`tts.fallbackProvider` 非 null 时在启动阶段直接报错。
 */
export function selectProvider(config) {
  const requested = String(config.tts?.provider ?? '').trim()
  if (requested !== '') {
    if (!PROVIDERS.includes(requested)) throw new Error(`tts_provider_unknown:${requested}`)
    return requested
  }
  return config.dsTts ? 'deepseek-web' : 'qwen-local'
}

/**
 * Queue 只依赖这一个入口：
 *   synthesize({text, voice, emotion}) -> {wav, seconds, bytes, cached, ms, voice}
 */
export class TtsAdapter {
  constructor({ config, fetchImpl = globalThis.fetch, dshHome, cacheDir = null }) {
    this.config = config
    this.provider = selectProvider(config)
    const options = { config, fetchImpl, dshHome, cacheDir }
    this.impl =
      this.provider === 'qwen-local' ? new QwenLocalProvider(options) : new DeepSeekWebProvider(options)
  }

  get baseUrl() {
    return this.impl.baseUrl
  }

  get voice() {
    return this.impl.voice
  }

  get fake() {
    return this.impl.fake
  }

  synthesize(args) {
    return this.impl.synthesize(args)
  }

  health() {
    return this.impl.health()
  }
}
