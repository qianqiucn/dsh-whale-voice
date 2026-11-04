import { readJsonFile, writeJsonAtomic, nowIso } from './util.mjs'
import { copyFileSync } from 'node:fs'

const TERMINAL = new Set(['SENT_LOCAL', 'FAILED', 'UNKNOWN', 'CANCELLED'])
const MAX_JOBS = 200

/**
 * Durable job store. One JSON document, written atomically (tmp + rename) so a crash
 * cannot leave a half-written state file.
 */
export class Store {
  constructor(file) {
    this.file = file
    this.data = { version: 1, updatedAt: nowIso(), jobs: {} }
  }

  load() {
    let raw = readJsonFile(this.file, null)
    // A torn or truncated state file falls back to the previous good copy.
    if (!raw) raw = readJsonFile(`${this.file}.bak`, null)
    if (raw && typeof raw === 'object' && raw.jobs && typeof raw.jobs === 'object') {
      this.data = { version: raw.version ?? 1, updatedAt: raw.updatedAt ?? nowIso(), jobs: raw.jobs }
    }
    return this
  }

  save() {
    this.data.updatedAt = nowIso()
    this.#prune()
    writeJsonAtomic(this.file, this.data)
    try {
      copyFileSync(this.file, `${this.file}.bak`)
    } catch {
      /* the backup is best effort; the atomic rename above already prevents torn files */
    }
  }

  #prune() {
    const entries = Object.values(this.data.jobs)
    if (entries.length <= MAX_JOBS) return
    const terminal = entries.filter((j) => TERMINAL.has(j.state)).sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
    let remove = entries.length - MAX_JOBS
    for (const job of terminal) {
      if (remove <= 0) break
      delete this.data.jobs[job.requestId]
      remove -= 1
    }
  }

  get(requestId) {
    return this.data.jobs[requestId] ?? null
  }

  upsert(job) {
    this.data.jobs[job.requestId] = { ...job, updatedAt: nowIso() }
    return this.data.jobs[job.requestId]
  }

  list() {
    return Object.values(this.data.jobs).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  }

  countActive() {
    return this.list().filter((j) => !TERMINAL.has(j.state)).length
  }
}

export { TERMINAL }
