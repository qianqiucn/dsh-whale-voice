/* Whale Voice — SVC candidate registry (design only).
 *
 * SVC engines are intentionally NOT in the ordinary TTS Provider Registry. Every candidate is
 * unverified, not implemented and not selectable. No model, checkpoint or default voice is
 * declared here.
 */

const CANDIDATES = [
  {
    id: 'seed-vc',
    name: 'Seed-VC',
    kind: 'SVC',
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Voice/singing conversion candidate; license, checkpoint provenance, consent and CPU/GPU requirements are unverified.',
  },
  {
    id: 'rvc',
    name: 'RVC',
    kind: 'SVC',
    role: 'CANDIDATE',
    integrationStatus: 'NOT_IMPLEMENTED',
    selectable: false,
    notes: 'Voice conversion candidate; model/reference-audio consent, license and runtime compatibility are unverified.',
  },
]

export const SVC_CANDIDATES = Object.freeze(CANDIDATES.map((candidate) => Object.freeze({ ...candidate })))

export function listSvcCandidates() {
  return SVC_CANDIDATES.map((candidate) => ({ ...candidate }))
}

export function getSvcCandidate(id) {
  return SVC_CANDIDATES.find((candidate) => candidate.id === id) || null
}

export function getSvcRegistryView() {
  return {
    schemaVersion: 1,
    engineType: 'SVC',
    status: 'DESIGN_ONLY',
    candidates: SVC_CANDIDATES.map((candidate) => ({ ...candidate })),
    selectable: [],
    implemented: [],
    defaultVoiceId: null,
    note: 'SVC candidates are separate from TTS providers and are not implemented or selectable.',
  }
}

export function selectSvcCandidate(id) {
  const candidate = getSvcCandidate(id)
  if (!candidate) return { ok: false, code: 'SVC_ENGINE_UNKNOWN', candidate: null }
  return { ok: false, code: 'NOT_IMPLEMENTED', candidate: { ...candidate } }
}
