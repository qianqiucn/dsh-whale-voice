import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'

import { produceFixtureWav } from '../core/audio/fixture-wav-producer.mjs'
import {
  CLOUD_HTTP_ERRORS,
  isPublicAddress,
  pinnedLookup,
  requestBuffer,
  validateCustomTarget,
} from '../core/tts/cloud-http-security.mjs'

function fixtureWav() {
  const produced = produceFixtureWav({ schemaVersion: 1, sampleRate: 24000, channels: 1, frameCount: 2400, pattern: 'SILENCE' })
  assert.equal(produced.ok, true)
  return produced.value.bytes
}

async function startServer(handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, port: server.address().port }
}

test('public address policy rejects loopback, private, link-local and IPv4-mapped forms', () => {
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('93.184.216.34'), true)
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true)
  assert.equal(isPublicAddress('127.0.0.1'), false)
  assert.equal(isPublicAddress('10.0.0.1'), false)
  assert.equal(isPublicAddress('172.16.0.1'), false)
  assert.equal(isPublicAddress('192.168.1.1'), false)
  assert.equal(isPublicAddress('169.254.169.254'), false)
  assert.equal(isPublicAddress('100.64.0.1'), false)
  assert.equal(isPublicAddress('::1'), false)
  assert.equal(isPublicAddress('fe80::1'), false)
  assert.equal(isPublicAddress('fc00::1'), false)
  assert.equal(isPublicAddress('::ffff:127.0.0.1'), false)
  assert.equal(isPublicAddress('not-an-ip'), false)
})

test('custom target validation pins public DNS and rejects unsafe shapes', async () => {
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }]
  const ok = await validateCustomTarget('https://tts.example.test/v1/synthesize', { dnsLookup: publicDns })
  assert.equal(ok.ok, true)
  assert.equal(ok.pinnedAddress, '93.184.216.34')
  assert.equal(ok.hostname, 'tts.example.test')

  const loopback = await validateCustomTarget('http://127.0.0.1:8080/tts', { dnsLookup: publicDns })
  assert.equal(loopback.ok, true)
  assert.equal(loopback.isLoopback, true)
  assert.equal(loopback.pinnedAddress, '127.0.0.1')

  assert.equal((await validateCustomTarget('http://localhost:8080/tts', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_LOOPBACK_ONLY)
  assert.equal((await validateCustomTarget('http://93.184.216.34/tts', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_LOOPBACK_ONLY)
  assert.equal((await validateCustomTarget('https://user:pass@example.test/', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_CREDENTIALS)
  assert.equal((await validateCustomTarget('https://example.test/?x=1', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_CREDENTIALS)
  assert.equal((await validateCustomTarget('https://example.test/#x', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_CREDENTIALS)
  assert.equal((await validateCustomTarget('ftp://example.test/', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_SCHEME)
  assert.equal((await validateCustomTarget('https://2130706433/', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_PRIVATE)
  assert.equal((await validateCustomTarget('https://[::ffff:127.0.0.1]/', { dnsLookup: publicDns })).code, CLOUD_HTTP_ERRORS.TARGET_PRIVATE)
  assert.equal((await validateCustomTarget('https://example.test/', { dnsLookup: async () => [{ address: '10.0.0.1', family: 4 }] })).code, CLOUD_HTTP_ERRORS.TARGET_PRIVATE)
  assert.equal((await validateCustomTarget('https://example.test/', { dnsLookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] })).code, CLOUD_HTTP_ERRORS.TARGET_PRIVATE)
  assert.equal((await validateCustomTarget('https://example.test/', { dnsLookup: async () => [] })).code, CLOUD_HTTP_ERRORS.TARGET_DNS_EMPTY)
  assert.equal((await validateCustomTarget('https://example.test/', { dnsLookup: async () => { throw new Error('dns') } })).code, CLOUD_HTTP_ERRORS.TARGET_DNS_FAILED)
})

test('bounded request returns bytes, rejects redirects, content type and oversized bodies', async (t) => {
  const wav = fixtureWav()
  const { server, port } = await startServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: 'https://evil.example/' })
      res.end()
      return
    }
    if (req.url === '/wrong-type') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{}')
      return
    }
    if (req.url === '/large') {
      res.writeHead(200, { 'Content-Type': 'audio/wav' })
      res.end(Buffer.alloc(4096, 1))
      return
    }
    if (req.url === '/headers') {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'X-Fill': 'x'.repeat(20000) })
      res.end(wav)
      return
    }
    res.writeHead(200, { 'Content-Type': 'audio/wav' })
    res.end(wav)
  })
  t.after(() => server.close())

  const lookup = pinnedLookup('127.0.0.1', 4)
  const base = `http://127.0.0.1:${port}`
  const ok = await requestBuffer({ url: `${base}/ok`, expectedMime: 'audio/wav', lookup, timeoutMs: 5000 })
  assert.equal(ok.ok, true)
  assert.equal(ok.body.equals(Buffer.from(wav)), true)
  assert.equal((await requestBuffer({ url: `${base}/redirect`, lookup, timeoutMs: 5000 })).code, CLOUD_HTTP_ERRORS.REDIRECT_REJECTED)
  assert.equal((await requestBuffer({ url: `${base}/wrong-type`, expectedMime: 'audio/wav', lookup, timeoutMs: 5000 })).code, CLOUD_HTTP_ERRORS.CONTENT_TYPE)
  assert.equal((await requestBuffer({ url: `${base}/large`, expectedMime: 'audio/wav', lookup, timeoutMs: 5000, maxResponseBytes: 1024 })).code, CLOUD_HTTP_ERRORS.RESPONSE_TOO_LARGE)
  assert.equal((await requestBuffer({ url: `${base}/headers`, expectedMime: 'audio/wav', lookup, timeoutMs: 5000, maxHeaderBytes: 1024 })).code, CLOUD_HTTP_ERRORS.HEADER_LIMIT)
})

test('a pre-aborted signal creates no outbound request and returns CANCELLED sent=false', async (t) => {
  let requests = 0
  const { server, port } = await startServer((req, res) => {
    requests += 1
    res.writeHead(200, { 'Content-Type': 'audio/wav' })
    res.end(fixtureWav())
  })
  t.after(() => server.close())
  const controller = new AbortController()
  controller.abort()
  const result = await requestBuffer({
    url: `http://127.0.0.1:${port}/never`,
    expectedMime: 'audio/wav',
    lookup: pinnedLookup('127.0.0.1', 4),
    signal: controller.signal,
  })
  assert.equal(result.code, CLOUD_HTTP_ERRORS.CANCELLED)
  assert.equal(result.sent, false)
  assert.equal(requests, 0)
})

test('a non-2xx infinite error stream is destroyed promptly instead of drained', async (t) => {
  let closed = false
  let timer = null
  const { server, port } = await startServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    timer = setInterval(() => {
      try { res.write('error-body') } catch {}
    }, 10)
    res.on('close', () => {
      closed = true
      if (timer) clearInterval(timer)
    })
  })
  t.after(() => { if (timer) clearInterval(timer); server.close() })
  const started = Date.now()
  const result = await requestBuffer({
    url: `http://127.0.0.1:${port}/infinite-error`,
    lookup: pinnedLookup('127.0.0.1', 4),
    timeoutMs: 5000,
  })
  const elapsed = Date.now() - started
  assert.equal(result.code, CLOUD_HTTP_ERRORS.HTTP_STATUS)
  assert.equal(result.status, 500)
  assert.ok(elapsed < 1000)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(closed, true)
})

test('a broken response stream is a network error, not a partial success', async (t) => {
  const wav = fixtureWav()
  const { server, port } = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': String(wav.length) })
    res.write(wav.subarray(0, 100))
    setTimeout(() => res.destroy(), 20)
  })
  t.after(() => server.close())
  const result = await requestBuffer({
    url: `http://127.0.0.1:${port}/broken`,
    expectedMime: 'audio/wav',
    lookup: pinnedLookup('127.0.0.1', 4),
    timeoutMs: 5000,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, CLOUD_HTTP_ERRORS.NETWORK_ERROR)
})

test('timeout and abort destroy the request without retry', async (t) => {
  const wav = fixtureWav()
  const { server, port } = await startServer((req, res) => {
    if (req.url === '/slow') {
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'audio/wav' }); res.end(wav) }, 1600)
      return
    }
    res.writeHead(200, { 'Content-Type': 'audio/wav' })
    res.write(wav.subarray(0, 10))
    setTimeout(() => res.end(wav.subarray(10)), 1500)
  })
  t.after(() => server.close())
  const lookup = pinnedLookup('127.0.0.1', 4)
  const base = `http://127.0.0.1:${port}`
  const timedOut = await requestBuffer({ url: `${base}/slow`, expectedMime: 'audio/wav', lookup, timeoutMs: 1000 })
  assert.equal(timedOut.code, CLOUD_HTTP_ERRORS.TIMEOUT)
  const controller = new AbortController()
  const aborted = requestBuffer({ url: `${base}/stream`, expectedMime: 'audio/wav', lookup, timeoutMs: 5000, signal: controller.signal })
  setTimeout(() => controller.abort(), 40)
  const result = await aborted
  assert.equal(result.code, CLOUD_HTTP_ERRORS.CANCELLED)
})
