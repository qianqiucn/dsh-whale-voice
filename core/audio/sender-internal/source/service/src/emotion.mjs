/**
 * 情绪枚举（适配层内部字段）。
 *
 * 重要：Qwen3-TTS Base + voice clone prompt 目前**没有**原生 emotion 参数。
 * 第一版只接受并校验这个字段，合成时仍然使用固定的 whale-v1 克隆音色；
 * 不允许为了“听起来像某种情绪”而偷偷切换参考音频或模型。
 */
export const EMOTIONS = Object.freeze(['neutral', 'gentle', 'happy', 'shy', 'playful', 'sad'])

/** @returns {string} 归一化后的情绪；非法值抛错（调用方决定如何上报）。 */
export function normalizeEmotion(value) {
  if (value === undefined || value === null || value === '') return 'neutral'
  const emotion = String(value).trim().toLowerCase()
  if (!EMOTIONS.includes(emotion)) throw new Error(`qwen_emotion_invalid:${emotion}`)
  return emotion
}
