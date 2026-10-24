import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const artifactDir = path.join(here, '.artifacts')
const reactDir = path.join(here, 'node_modules', 'react', 'umd')
const reactDomDir = path.join(here, 'node_modules', 'react-dom', 'umd')

function failMissing(message) {
  console.error('\nUI harness setup is incomplete:\n' + message + '\n')
  process.exit(1)
}
if (!existsSync(path.join(reactDir, 'react.development.js')) || !existsSync(path.join(reactDomDir, 'react-dom.development.js'))) {
  failMissing('Install test-only dependencies with: npm install --prefix tests/ui')
}

const cliHome = process.env.PLAYWRIGHT_CLI_HOME || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@playwright', 'cli')
const playwrightEntry = path.join(cliHome, 'node_modules', 'playwright', 'index.mjs')
if (!existsSync(playwrightEntry)) {
  failMissing('Install the official Playwright CLI first: npm install -g @playwright/cli@latest')
}
const playwright = await import(pathToFileURL(playwrightEntry).href)

const files = new Map([
  ['/', [path.join(here, 'harness.html'), 'text/html; charset=utf-8']],
  ['/harness.js', [path.join(here, 'harness.js'), 'text/javascript; charset=utf-8']],
  ['/client.js', [path.join(repoRoot, 'client.js'), 'text/javascript; charset=utf-8']],
  ['/react.js', [path.join(reactDir, 'react.development.js'), 'text/javascript; charset=utf-8']],
  ['/react-dom.js', [path.join(reactDomDir, 'react-dom.development.js'), 'text/javascript; charset=utf-8']],
])

const server = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
  const entry = files.get(pathname)
  if (!entry) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  res.writeHead(200, {
    'content-type': entry[1],
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(readFileSync(entry[0]))
})

await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
const base = 'http://127.0.0.1:' + server.address().port
mkdirSync(artifactDir, { recursive: true })

const browser = await playwright.chromium.launch({ headless: true })
const results = []
const consoleMessages = []
const failedRequests = []

async function withPage(query, fn) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push({ scene: query, type: message.type(), text: message.text().slice(0, 300) })
    }
  })
  page.on('pageerror', (error) => {
    consoleMessages.push({ scene: query, type: 'pageerror', text: String(error && error.message || error).slice(0, 300) })
  })
  page.on('requestfailed', (request) => {
    const item = { scene: query, url: String(request.url()), failure: request.failure() && request.failure().errorText }
    failedRequests.push(item)
  })
  try {
    await page.goto(base + (query || ''), { waitUntil: 'load' })
    await page.waitForFunction(() => window.__WHALE_HARNESS_READY__ === true, null, { timeout: 10000 })
    await page.waitForTimeout(700)
    return await fn(page)
  } finally {
    await page.close()
  }
}

async function check(name, fn) {
  try {
    await fn()
    results.push({ name, result: 'PASS' })
    console.log('PASS ' + name)
  } catch (error) {
    results.push({ name, result: 'FAIL', error: String(error && error.message || error).slice(0, 500) })
    console.log('FAIL ' + name + ': ' + String(error && error.message || error))
  }
}

const normal = '?bridge=normal'
await check('normal page renders the real-config readout', async () => {
  await withPage(normal, async (page) => {
    await assert.doesNotReject(page.getByText('Whale Voice').first().waitFor({ timeout: 6000 }))
    const text = await page.locator('body').innerText()
    assert.match(text, /真实配置/)
    assert.match(text, /Bridge 已保存：关闭/)
    assert.match(text, /实际生效：未确认/)
    assert.match(text, /Worker 安全许可：开启/)
    assert.match(text, /qwen-local/)
    assert.match(text, /whale-v1/)
    assert.match(text, /私聊 2 \/ 群聊 1/)
    assert.match(text, /未运行/)
    assert.match(text, /生效状态未知/)
    assert.doesNotMatch(text, /配置来源不一致/)
    await page.screenshot({ path: path.join(artifactDir, 'overview-1440.png') })
  })
})

await check('all primary navigation surfaces render', async () => {
  await withPage(normal, async (page) => {
    for (const [name, marker] of [
      ['语音设置', /WHALE VOICE \/ SETTINGS/],
      ['权限管理', /WHALE VOICE \/ PERMISSIONS/],
      ['音色中心', /WHALE VOICE \/ STUDIO/],
      ['情绪系统', /WHALE VOICE \/ EMOTION/],
      ['任务与日志', /WHALE VOICE \/ ACTIVITY/],
      ['高级设置', /WHALE VOICE \/ ADVANCED/],
    ]) {
      const navName = name === '任务与日志' ? /^任务与日志/ : name
      await page.getByRole('button', { name: navName, exact: true }).click()
      await page.waitForTimeout(250)
      const text = await page.locator('body').innerText()
      assert.match(text, marker)
      if (['语音设置', '权限管理', '音色中心', '高级设置'].includes(name)) {
        assert.match(text, /Bridge 已保存：关闭/)
        assert.match(text, /Worker 安全许可：开启/)
        assert.doesNotMatch(text, /配置来源不一致/)
      }
    }
    await page.screenshot({ path: path.join(artifactDir, 'pages-1440.png') })
  })
})

await check('components dialog opens with config and closes', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '组件管理', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await assert.doesNotReject(dialog.waitFor({ timeout: 3000 }))
    const text = await dialog.innerText()
    assert.match(text, /真实配置/)
    assert.match(text, /Whale Voice Core/)
    assert.match(text, /WeChatAgent/)
    assert.match(text, /Voice Sender/)
    assert.match(text, /TTS Provider/)
    await page.screenshot({ path: path.join(artifactDir, 'components-1440.png') })
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await assert.rejects(dialog.waitFor({ state: 'visible', timeout: 700 }))
  })
})

await check('wizard is reachable and closes', async () => {
  await withPage('?wizard=1', async (page) => {
    const dialog = page.getByRole('dialog')
    await assert.doesNotReject(dialog.waitFor({ timeout: 4000 }))
    const text = await dialog.innerText()
    assert.match(text, /首次安装向导|还有步骤需要完成/)
    await page.screenshot({ path: path.join(artifactDir, 'wizard-1440.png') })
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await assert.rejects(dialog.waitFor({ state: 'visible', timeout: 700 }))
  })
})

await check('No-Core shows an unavailable state without Mock success', async () => {
  await withPage('?bridge=none', async (page) => {
    await page.waitForTimeout(500)
    const text = await page.locator('body').innerText()
    assert.match(text, /Whale Voice Core|无法连接|等待 Whale Voice Core/)
    assert.doesNotMatch(text, /Core 已读取/)
    assert.doesNotMatch(text, /配置来源不一致/)
  })
})

await check('invalid Core schema degrades safely', async () => {
  await withPage('?bridge=invalid', async (page) => {
    await page.waitForTimeout(500)
    const text = await page.locator('body').innerText()
    assert.match(text, /Whale Voice Core|无法连接|等待 Whale Voice Core/)
    assert.doesNotMatch(text, /Core 已读取/)
  })
})

await check('Core timeout degrades safely', async () => {
  await withPage('?bridge=timeout', async (page) => {
    await page.waitForTimeout(5600)
    const text = await page.locator('body').innerText()
    assert.match(text, /Whale Voice Core|无法连接|等待 Whale Voice Core/)
    assert.doesNotMatch(text, /Core 已读取/)
  })
})

await check('layout has glass/rounded structure and no horizontal overflow', async () => {
  await withPage(normal, async (page) => {
    const metrics = await page.evaluate(() => {
      const root = document.querySelector('.wv-root') || document.body
      const card = document.querySelector('.wv-card')
      const rootStyle = getComputedStyle(root)
      const shell = document.querySelector('.wv-shell') || root
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        rootRadius: rootStyle.borderRadius,
        cardRadius: card ? getComputedStyle(card).borderRadius : '',
        backdrop: rootStyle.backdropFilter || rootStyle.webkitBackdropFilter || getComputedStyle(shell).backdropFilter,
        logo: Boolean(document.querySelector('svg, img')),
        bodyText: document.body.innerText.slice(0, 4000),
      }
    })
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, 'horizontal overflow: ' + metrics.scrollWidth + ' > ' + metrics.clientWidth)
    assert.ok(metrics.rootRadius || metrics.cardRadius, 'missing rounded structure')
    assert.ok(metrics.backdrop && metrics.backdrop !== 'none', 'missing backdrop-filter: ' + JSON.stringify(metrics))
    assert.equal(metrics.logo, true)
    await page.screenshot({ path: path.join(artifactDir, 'layout-1440.png') })
  })
})

await check('narrow viewport remains usable', async () => {
  await withPage(normal, async (page) => {
    await page.setViewportSize({ width: 780, height: 900 })
    await page.waitForTimeout(300)
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText,
    }))
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, 'narrow overflow: ' + metrics.scrollWidth + ' > ' + metrics.clientWidth)
    assert.match(metrics.text, /真实配置/)
    await page.screenshot({ path: path.join(artifactDir, 'layout-780.png') })
  })
})

await check('no console errors or failed resources', async () => {
  const errors = consoleMessages.filter((item) => item.type === 'error' || item.type === 'pageerror')
  assert.deepEqual(errors, [])
  assert.deepEqual(failedRequests, [])
})

const report = {
  generatedAt: new Date().toISOString(),
  base,
  playwright: playwright.chromium.name(),
  results,
  consoleMessages,
  failedRequests,
}
writeFileSync(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8')
console.log('\n' + results.filter((item) => item.result === 'PASS').length + '/' + results.length + ' UI checks passed')
console.log('Artifacts: ' + artifactDir)
await browser.close()
await new Promise((resolve) => server.close(resolve))
if (results.some((item) => item.result !== 'PASS')) process.exitCode = 1
