import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const setup = readFileSync(new URL('../setup.js', import.meta.url), 'utf8')
const template = readFileSync(new URL('../client.template.js', import.meta.url), 'utf8')

test('setup UI has no shell, installer or fetch execution path', () => {
  assert.equal(/\bchild_process\b/.test(setup), false)
  assert.equal(/\bexec\s*\(/.test(setup), false)
  assert.equal(/\bspawn\s*\(/.test(setup), false)
  assert.equal(/\bfetch\s*\(/.test(setup), false)
  assert.equal(/window\.open\s*\(\s*(?!'https:\/\/github\.com\/sourcepro5\/WeChatAgent')/.test(setup), false)
})

test('demo data cannot become authoritative completion', () => {
  assert.match(setup, /const MOCK_SETUP = \{[\s\S]*?demo: true,[\s\S]*?completed: false,/)
  assert.match(setup, /const data = demo \? MOCK_SETUP : realData/)
  assert.match(setup, /data\.demo !== true/)
  assert.match(setup, /deriveSetupView/)
  assert.match(setup, /view\.complete/)
  assert.equal(/localStorage/.test(setup), false)
})

test('core status is validated, bounded and stale-safe', () => {
  assert.match(setup, /data\.schemaVersion !== 1/)
  assert.match(setup, /core_timeout/)
  assert.match(setup, /core_invalid_response/)
  assert.match(template, /setupRequestSeq/)
  assert.match(template, /seq !== setupRequestSeq\.current/)
})

test('safety copy and bridge contract remain present', () => {
  assert.match(setup, /尚未检测到 WeChatAgent/)
  assert.match(setup, /检测不会读取或修改/)
  assert.equal(/voice\.enabled=false/.test(setup), false)
  assert.match(setup, /window\.__WHALE_SETUP__/)
  assert.match(setup, /由 Core 凭据管理/)
})
