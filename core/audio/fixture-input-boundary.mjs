/* Whale Voice — internal Fixture input boundary (shared by 06-B/06-C).
 *
 * One bounded structural copy + freeze policy for Fixture-only modules. This is an internal helper,
 * not a public product API: it performs no I/O, starts no process, reads no clock or randomness and
 * keeps no module-level mutable state.
 *
 * Policy (must stay identical to the original 06-B implementation):
 * - plain/null-prototype objects, finite numbers, strings, booleans, null and dense standard arrays;
 * - string enumerable data properties only: no getters/setters, Symbols, hidden keys or custom
 *   prototypes; no extra array properties or holes; no cycles;
 * - limits: 4096 values, depth 12, 32 object keys, 256 array items, 8192 string code units;
 * - malformed input → {ok:false,key:'INVALID_INPUT'}, over-limit → {ok:false,key:'RESOURCE_LIMIT'};
 * - caller accessors are never invoked; a throwing Proxy becomes the fixed INVALID_INPUT failure
 *   (the helper does not claim to sandbox the Proxy's own traps);
 * - the caller's original object is never mutated; shared non-cyclic objects are copied
 *   independently.
 */

const MAX_VALUES = 4096
const MAX_DEPTH = 12
const MAX_OBJECT_KEYS = 32
const MAX_ARRAY_ITEMS = 256
const MAX_STRING_LENGTH = 8192

/** Deep-freeze a newly built / already copied trusted value graph. Never freezes caller input. */
export function deepFreezeFixtureValue(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  Object.freeze(value)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreezeFixtureValue(descriptor.value, seen)
    }
  }
  return value
}

/**
 * Bounded structural copy used before any schema access. Returns a fresh value or a fixed error
 * key; it never returns the caller's original object.
 */
export function copyFixtureInput(root) {
  let values = 0
  const ancestors = new Set()

  function copy(value, depth) {
    values += 1
    if (values > MAX_VALUES) return { ok: false, key: 'RESOURCE_LIMIT' }
    if (depth > MAX_DEPTH) return { ok: false, key: 'RESOURCE_LIMIT' }

    if (value === null) return { ok: true, value: null }
    const type = typeof value
    if (type === 'string') {
      if (value.length > MAX_STRING_LENGTH) return { ok: false, key: 'RESOURCE_LIMIT' }
      return { ok: true, value }
    }
    if (type === 'boolean') return { ok: true, value }
    if (type === 'number') {
      if (!Number.isFinite(value)) return { ok: false, key: 'INVALID_INPUT' }
      return { ok: true, value }
    }
    if (type !== 'object') return { ok: false, key: 'INVALID_INPUT' }
    if (ancestors.has(value)) return { ok: false, key: 'INVALID_INPUT' }

    ancestors.add(value)
    let result
    try {
      result = Array.isArray(value) ? copyArray(value, depth) : copyObject(value, depth)
    } finally {
      ancestors.delete(value)
    }
    return result
  }

  function copyObject(value, depth) {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return { ok: false, key: 'INVALID_INPUT' }
    const keys = Reflect.ownKeys(value)
    if (keys.length > MAX_OBJECT_KEYS) return { ok: false, key: 'RESOURCE_LIMIT' }
    const output = {}
    for (const key of keys) {
      if (typeof key !== 'string') return { ok: false, key: 'INVALID_INPUT' }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const isData = descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      if (!isData || descriptor.enumerable !== true) return { ok: false, key: 'INVALID_INPUT' }
      const copied = copy(descriptor.value, depth + 1)
      if (!copied.ok) return copied
      Object.defineProperty(output, key, {
        value: copied.value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    return { ok: true, value: output }
  }

  function copyArray(value, depth) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return { ok: false, key: 'INVALID_INPUT' }
    const length = value.length
    if (!Number.isInteger(length) || length < 0 || length > MAX_ARRAY_ITEMS) {
      return { ok: false, key: 'RESOURCE_LIMIT' }
    }
    const output = []
    const seen = new Set()
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length') {
        const descriptor = Object.getOwnPropertyDescriptor(value, 'length')
        if (descriptor === undefined || descriptor.value !== length) return { ok: false, key: 'INVALID_INPUT' }
        continue
      }
      if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return { ok: false, key: 'INVALID_INPUT' }
      const index = Number(key)
      if (index >= length) return { ok: false, key: 'INVALID_INPUT' }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      const isData = descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      if (!isData || descriptor.enumerable !== true) return { ok: false, key: 'INVALID_INPUT' }
      seen.add(index)
    }
    if (seen.size !== length) return { ok: false, key: 'INVALID_INPUT' }
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (descriptor === undefined) return { ok: false, key: 'INVALID_INPUT' }
      const copied = copy(descriptor.value, depth + 1)
      if (!copied.ok) return copied
      output.push(copied.value)
    }
    return { ok: true, value: output }
  }

  try {
    return copy(root, 0)
  } catch {
    return { ok: false, key: 'INVALID_INPUT' }
  }
}
