import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

// Conservative markers observed when UTF-8 Chinese text is decoded as a legacy
// codepage. Normal English/Chinese prose may use some of these characters
// individually, so a line is only flagged by a high-confidence sequence or by
// several suspicious characters together. This is a regression guard, not a
// general-purpose encoding detector.
const suspicious = new Set([...'鈥鈫鍙鍘鎴鐨鏄锛銆鈩锟鍐鍒鐢鏈鏁纭璁涓浠瀹绛鍚杩'])
const sequences = [
  /鈥\?/,
  /鈫\?/,
  /鍙戦/,
  /鍘熺/,
  /鎸夐/,
  /鑷姩/,
  /鈥滃/,
  /鈥滅/,
]

function markdownFiles(dir) {
  const result = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.artifacts') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...markdownFiles(full))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) result.push(full)
  }
  return result
}

test('Markdown files are UTF-8 and contain no known mojibake/PUA patterns', () => {
  const failures = []
  for (const file of markdownFiles(root)) {
    const relative = path.relative(root, file).split(path.sep).join('/')
    const bytes = fs.readFileSync(file)
    const text = bytes.toString('utf8')
    if (!Buffer.from(text, 'utf8').equals(bytes)) {
      failures.push(relative + ': not valid UTF-8')
      continue
    }
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      const where = relative + ':' + (index + 1)
      const reasons = []
      if (line.includes('\uFFFD')) reasons.push('U+FFFD replacement character')
      if (/[\uE000-\uF8FF]/.test(line)) reasons.push('private-use character')
      if (sequences.some((pattern) => pattern.test(line))) reasons.push('known mojibake sequence')
      const count = [...line].filter((char) => suspicious.has(char)).length
      if (count >= 3) reasons.push('multiple mojibake characters (' + count + ')')
      if (/(?<=[A-Za-z0-9] )路(?= )/.test(line)) reasons.push('corrupted middle dot')
      if (reasons.length) failures.push(where + ': ' + reasons.join('; '))
    })
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})
