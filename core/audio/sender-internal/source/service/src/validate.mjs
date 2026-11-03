import { HttpError } from './util.mjs'
import { normalizeEmotion } from './emotion.mjs'

/** Only these top-level fields are accepted; anything else is rejected on purpose. */
const ALLOWED_FIELDS = new Set(['requestId', 'trustedSessionId', 'trustedTargetId', 'text', 'voice', 'emotion', 'createdAt'])

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

function requireString(value, field, max) {
  if (typeof value !== 'string') throw new HttpError(400, `${field}_must_be_string`, `field_${field}`)
  const v = value.trim()
  if (v === '') throw new HttpError(400, `${field}_empty`, `field_${field}`)
  if (v.length > max) throw new HttpError(400, `${field}_too_long`, `field_${field}`)
  if (CONTROL_CHARS.test(v)) throw new HttpError(400, `${field}_has_control_chars`, `field_${field}`)
  return v
}

/**
 * Normalizes an untrusted request body into a job input.
 * Never accepts an audio path, a file name, a shell fragment or a target chosen by the model:
 * the chat is derived from the trusted target table, and the wav path is derived from the TTS result.
 */
export function validateRequest(body, config) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'body_must_be_object', 'body')
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(key)) {
      throw new HttpError(400, `field_not_allowed:${key}`, 'field_not_allowed')
    }
  }

  const requestId = requireString(body.requestId, 'requestId', 64)
  if (!REQUEST_ID.test(requestId)) throw new HttpError(400, 'requestId_invalid', 'requestId_invalid')

  const trustedSessionId = requireString(body.trustedSessionId, 'trustedSessionId', 128)
  const trustedTargetId = requireString(body.trustedTargetId, 'trustedTargetId', 128)

  const text = requireString(body.text, 'text', config.maxTextChars ?? 500)

  const voice = body.voice === undefined || body.voice === '' ? (config.tts?.voiceId ?? config.dsTts?.voice ?? 'whale-v1') : requireString(body.voice, 'voice', 32)
  const allowedVoices = Array.isArray(config.allowedVoices) && config.allowedVoices.length > 0 ? config.allowedVoices : [config.tts?.voiceId ?? 'whale-v1']
  if (!allowedVoices.includes(voice)) throw new HttpError(400, `voice_not_allowed:${voice}`, 'voice_not_allowed')

  let emotion = 'neutral'
  try {
    emotion = normalizeEmotion(body.emotion)
  } catch {
    throw new HttpError(400, `emotion_invalid:${String(body.emotion)}`, 'emotion_invalid')
  }

  const chat = resolveTarget(trustedTargetId, config)
  const target = resolveTargetRecord(trustedTargetId, config)
  const automation = {
    mode: config.automation?.mode ?? 'manual',
    autoFindWindow: config.automation?.autoFindWindow !== false,
    autoOpenChat: config.automation?.autoOpenChat === true,
    autoRestoreMinimized: config.automation?.autoRestoreMinimized !== false,
    pauseWhenFullscreen: config.automation?.pauseWhenFullscreen !== false,
    focusFailure: config.automation?.focusFailure ?? 'text_fallback',
  }

  return { requestId, trustedSessionId, trustedTargetId, chat, target, automation, text, voice, emotion }
}

/**
 * Binds a trusted target id to a verified target record.
 * Refuses unknown, disabled and ambiguous targets: we never "pick the first match".
 */
export function resolveTargetRecord(trustedTargetId, config) {
  const table = config.__targets?.targets
  if (!Array.isArray(table)) throw new HttpError(500, 'targets_table_missing', 'targets_table_missing')

  const rows = table.filter((t) => t && t.trustedTargetId === trustedTargetId)
  if (rows.length === 0) throw new HttpError(403, `target_unknown:${trustedTargetId}`, 'target_unknown')
  if (rows.length > 1) throw new HttpError(409, `target_duplicated:${trustedTargetId}`, 'target_duplicated')

  const target = rows[0]
  if (target.enabled !== true) throw new HttpError(403, `target_disabled:${trustedTargetId}`, 'target_disabled')

  const uiName = typeof target.uiName === 'string' ? target.uiName.trim() : ''
  if (uiName === '') throw new HttpError(500, `target_has_no_ui_name:${trustedTargetId}`, 'target_has_no_ui_name')

  const allowedChats = Array.isArray(config.allowedChats) ? config.allowedChats : []
  if (allowedChats.length > 0 && !allowedChats.includes(uiName)) {
    throw new HttpError(403, `chat_not_allowed:${uiName}`, 'chat_not_allowed')
  }

  // Name collision guard: if several enabled targets resolve to the same WeChat title,
  // the UI cannot tell them apart, so we refuse instead of guessing.
  const sameName = table.filter((t) => t && t.enabled === true && typeof t.uiName === 'string' && t.uiName.trim() === uiName)
  if (sameName.length > 1) {
    throw new HttpError(409, `ambiguous_target:${uiName}`, 'ambiguous_target')
  }

  const kind = target.kind === 'group' ? 'group' : 'private'
  if (kind === 'group') {
    // The current WeChat UIA exposes only display names, not a stable group id. Until a real
    // identity-mapping verifier is added, group UI sending is not opened at all.
    throw new HttpError(403, `group_ui_identity_unverified:${trustedTargetId}`, 'group_ui_identity_unverified')
  }

  return {
    trustedTargetId,
    uiName,
    kind,
    identityVerified: target.identityVerified === true,
    realId: target.realId ?? null,
  }
}

export function resolveTarget(trustedTargetId, config) {
  return resolveTargetRecord(trustedTargetId, config).uiName
}
