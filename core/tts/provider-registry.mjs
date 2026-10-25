/* Whale Voice — TTS Provider Registry (design-only candidate catalog).
 *
 * Every entry is a CANDIDATE. Nothing here is implemented, selectable or health-checked.
 * The registry deliberately contains no endpoint, credential, voice sample or default
 * provider. A future adapter must provide a validated manifest and an explicit selection.
 */

import { PROVIDER_KINDS } from './provider-contract.mjs'

const CANDIDATES = [
  {
    id: 'qwen3-tts',
    legacyAlias: 'qwen-local',
    name: 'Qwen3-TTS',
    kind: PROVIDER_KINDS.LOCAL,
    role: 'REFERENCE_IMPLEMENTATION',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Existing local Qwen service is a reference path; not a product default and not a registry adapter yet.',
  },
  {
    id: 'piper',
    name: 'Piper',
    kind: PROVIDER_KINDS.LOCAL,
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Lightweight local CPU candidate; voice/model packaging and license must be audited separately.',
  },
  {
    id: 'kokoro',
    name: 'Kokoro',
    kind: PROVIDER_KINDS.LOCAL,
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Local candidate; runtime, model format, language coverage and license are unverified.',
  },
  {
    id: 'sherpa-onnx',
    name: 'sherpa-onnx',
    kind: PROVIDER_KINDS.LOCAL,
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Local ONNX runtime candidate; model/voice pack compatibility must be verified per build.',
  },
  {
    id: 'azure-speech',
    name: 'Azure Speech',
    kind: PROVIDER_KINDS.CLOUD,
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Cloud candidate; credentials, region endpoint, retention and cost require separate review.',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    kind: PROVIDER_KINDS.CLOUD,
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Cloud candidate; API shape, voice cloning consent, retention and cost must be verified.',
  },
  {
    id: 'custom-http',
    name: 'Custom HTTP TTS',
    kind: PROVIDER_KINDS.CUSTOM,
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Self-hosted/custom API candidate; target validation, auth, rate limits and response-format verification are mandatory.',
  },
]

export const PROVIDER_CANDIDATES = Object.freeze(CANDIDATES.map((candidate) => Object.freeze({ ...candidate })))

export function listProviderCandidates(kind = null) {
  return PROVIDER_CANDIDATES
    .filter((candidate) => !kind || candidate.kind === kind)
    .map((candidate) => ({ ...candidate }))
}

export function getProviderCandidate(id) {
  return PROVIDER_CANDIDATES.find((candidate) => candidate.id === id || candidate.legacyAlias === id) || null
}

export function getRegistryView() {
  return {
    schemaVersion: 1,
    status: 'DESIGN_ONLY',
    candidates: PROVIDER_CANDIDATES.map((candidate) => ({ ...candidate })),
    selectable: [],
    implemented: [],
    defaultProviderId: null,
    note: 'All entries are candidates. No provider is implemented, selectable or health-checked by this registry.',
  }
}

/**
 * Selection always fails in TTS-A: a candidate is not an adapter. A future implementation
 * must add an explicit adapter and an audited manifest before this can succeed.
 */
export function selectProviderCandidate(id) {
  const candidate = getProviderCandidate(id)
  if (!candidate) return { ok: false, code: 'PROVIDER_UNKNOWN', candidate: null }
  return { ok: false, code: 'NOT_IMPLEMENTED', candidate: { ...candidate } }
}
