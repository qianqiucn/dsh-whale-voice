/**
 * WAV 安全校验。
 *
 * 只接受 Voice Sender 已经验证可播放的 PCM 16-bit 单声道 WAV；不做重采样、不做裁切。
 * 任何解析失败都抛 `AudioValidationError`，错误码用于队列/桥接判断，不把原始二进制
 * 或用户文本写进错误消息。
 */
export class AudioValidationError extends Error {
  constructor(code, detail = '') {
    super(`${code}${detail === '' ? '' : `:${detail}`}`)
    this.code = code
    this.detail = detail
  }
}

function fail(code, detail) {
  throw new AudioValidationError(code, detail)
}

/**
 * @param {Buffer|Uint8Array} input
 * @param {{maxBytes?:number,minSeconds?:number,maxSeconds?:number,minSampleRate?:number,maxSampleRate?:number}} limits
 */
export function inspectWav(input, limits = {}) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  const maxBytes = limits.maxBytes ?? 8 * 1024 * 1024
  if (buf.length > maxBytes) fail('audio_too_large', `${buf.length}>${maxBytes}`)
  if (buf.length < 44) fail('wav_too_short', String(buf.length))
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    fail('wav_bad_header')
  }
  const riffSize = buf.readUInt32LE(4)
  if (riffSize + 8 > buf.length) fail('wav_truncated', `riff=${riffSize}+8>${buf.length}`)

  let offset = 12
  let fmt = null
  let data = null
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4)
    const size = buf.readUInt32LE(offset + 4)
    const body = offset + 8
    if (body + size > buf.length) fail('wav_truncated_chunk', `${id}:${size}`)
    if (id === 'fmt ') {
      if (size < 16) fail('wav_bad_fmt', String(size))
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bitsPerSample: buf.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      data = { offset: body, bytes: size }
      if (fmt !== null) break
    }
    offset = body + size + (size % 2)
  }

  if (fmt === null) fail('wav_missing_fmt')
  if (data === null) fail('wav_missing_data')
  if (fmt.audioFormat !== 1) fail('wav_not_pcm', String(fmt.audioFormat))
  if (fmt.bitsPerSample !== 16) fail('wav_bad_bits', String(fmt.bitsPerSample))
  if (fmt.channels !== 1) fail('wav_bad_channels', String(fmt.channels))
  const minRate = limits.minSampleRate ?? 16000
  const maxRate = limits.maxSampleRate ?? 48000
  if (fmt.sampleRate < minRate || fmt.sampleRate > maxRate) fail('wav_bad_sample_rate', String(fmt.sampleRate))
  if (fmt.blockAlign !== fmt.channels * (fmt.bitsPerSample / 8)) fail('wav_bad_block_align', String(fmt.blockAlign))
  if (data.bytes <= 0 || data.bytes % 2 !== 0) fail('wav_empty_data', String(data.bytes))
  if (data.offset + data.bytes > buf.length) fail('wav_truncated_data')

  const frames = data.bytes / 2
  const seconds = frames / fmt.sampleRate
  if (seconds <= 0) fail('wav_zero_duration')
  const minSeconds = limits.minSeconds ?? 0.2
  const maxSeconds = limits.maxSeconds ?? 45
  if (seconds < minSeconds) fail('audio_too_short', seconds.toFixed(3))
  if (seconds > maxSeconds) fail('audio_too_long', seconds.toFixed(3))

  // 采样统计：只用于发现静音/明显削波，不修改音频。
  let peak = 0
  let clipped = 0
  let sumSquares = 0
  const count = data.bytes / 2
  for (let i = 0; i < count; i += 1) {
    const sample = buf.readInt16LE(data.offset + i * 2)
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
    if (abs >= 32760) clipped += 1
    sumSquares += sample * sample
  }
  const rms = Math.sqrt(sumSquares / count)
  if (peak < 200) fail('audio_silent', String(peak))
  if (clipped / count > 0.02) fail('audio_clipped', `${((clipped / count) * 100).toFixed(2)}%`)

  return {
    format: 'pcm_s16le',
    channels: fmt.channels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: fmt.bitsPerSample,
    dataBytes: data.bytes,
    frames,
    seconds,
    peak,
    rms,
    clippedRatio: clipped / count,
    bytes: buf.length,
  }
}
