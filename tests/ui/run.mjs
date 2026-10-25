import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const artifactDir = path.join(here, '.artifacts')
const reactDir = path.join(here, 'node_modules', 'react', 'umd')
const reactDomDir = path.join(here, 'node_modules', 'react-dom', 'umd')
const playwrightPackage = path.join(here, 'node_modules', 'playwright', 'package.json')

function failMissing(message) {
  console.error('\nUI harness setup is incomplete:\n' + message + '\n')
  process.exit(1)
}
if (!existsSync(path.join(reactDir, 'react.development.js')) || !existsSync(path.join(reactDomDir, 'react-dom.development.js'))) {
  failMissing('Install locked test-only dependencies with: npm.cmd run test:ui:setup')
}
if (!existsSync(playwrightPackage)) {
  failMissing('Playwright is not installed in tests/ui. Run: npm.cmd run test:ui:setup')
}
let playwright
try {
  playwright = await import('playwright')
} catch (error) {
  failMissing('Could not load the pinned Playwright package from tests/ui: ' + String(error && error.message || error))
}
const playwrightVersion = JSON.parse(readFileSync(playwrightPackage, 'utf8')).version

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
      ['发送与安全', /WHALE VOICE \/ SAFETY/],
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

await check('real Core panels and demo data are labeled separately', async () => {
  await withPage(normal, async (page) => {
    const text = await page.locator('body').innerText()
    assert.match(text, /真实配置只读 · 生产写入禁用/)
    assert.match(text, /部分演示/)
    assert.match(text, /真实配置 · 只读/)
    assert.match(text, /能力与授权摘要/)
    assert.match(text, /演示联系人/)
    assert.doesNotMatch(text, /所有服务状态、任务与参数均为前端演示数据/)
    assert.doesNotMatch(text, /不读取\/不写入生产配置/)
    const capabilityText = await page.locator('[data-testid="capability-summary"]').innerText()
    assert.doesNotMatch(capabilityText, /演示数据|Mock/)
  })
})

await check('refresh copy matches demo-vs-real behavior', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '刷新演示数据', exact: true }).click()
    await page.getByText(/演示数据已刷新/).waitFor({ timeout: 3000 })
    const toast = await page.getByText(/演示数据已刷新/).innerText()
    assert.match(toast, /真实 Core 状态与能力请在组件管理中重新检测/)

    await page.getByRole('button', { name: '组件管理', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await assert.doesNotReject(dialog.waitFor({ timeout: 3000 }))
    const dialogText = await dialog.innerText()
    assert.match(dialogText, /重新检测会刷新真实 Core 状态与能力数据/)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  })
})

await check('an older capability response cannot overwrite a newer refresh', async () => {
  await withPage('?bridge=capability-race', async (page) => {
    await page.getByRole('button', { name: '组件管理', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await assert.doesNotReject(dialog.waitFor({ timeout: 3000 }))
    await dialog.getByRole('button', { name: '重新检测', exact: true }).click()
    await page.waitForTimeout(400)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await page.waitForTimeout(2200)
    const text = await page.locator('body').innerText()
    assert.match(text, /Fresh Capability/)
    assert.doesNotMatch(text, /Stale Capability/)
  })
})

await check('changed version hides unverified reload conclusions and keeps writes disabled', async () => {
  await withPage('?bridge=capability-changed', async (page) => {
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    await page.waitForTimeout(300)
    const text = await page.locator('body').innerText()
    assert.match(text, /读取时机未知/)
    assert.match(text, /是否热更新未知/)
    assert.match(text, /是否需要重启未知/)
    assert.match(text, /组件版本与审计版本不同/)
    assert.doesNotMatch(text, /每次调用读取/)
    assert.doesNotMatch(text, /无需重启即可看到更新/)
    const panel = page.locator('[data-testid="capability-panel"]').first()
    assert.equal(await panel.getByRole('button', { name: /保存/ }).count(), 0)
  })
})

await check('capability summary separates support, authorization and write enablement', async () => {
  await withPage(normal, async (page) => {
    const summary = page.locator('[data-testid="capability-summary"]')
    await assert.doesNotReject(summary.waitFor({ timeout: 4000 }))
    const text = await summary.innerText()
    assert.match(text, /能力与授权摘要/)
    assert.match(text, /只读阶段/)
    assert.match(text, /配置面/)
    assert.match(text, /支持保存/)
    assert.match(text, /未授权写入/)
    assert.match(text, /可执行写入/)
    assert.match(text, /WeChatAgent/)
    assert.match(text, /需要授权/)
    assert.match(text, /Voice Sender/)
    assert.match(text, /未运行/)
    assert.doesNotMatch(text, /演示数据|Mock 数据|MOCK/)
    assert.doesNotMatch(text, /fixture-token|fixture-private|fixture-install-path/)
    const panel = page.locator('[data-testid="capability-panel"]').first()
    if (await panel.count()) {
      assert.equal(await panel.getByRole('button', { name: /保存/ }).count(), 0)
    }
  })
})

await check('settings/studio/safety expose surface-specific reload semantics', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    await page.waitForTimeout(250)
    let text = await page.locator('body').innerText()
    assert.match(text, /Bridge 用户开关 · 真实只读状态/)
    assert.match(text, /每次调用读取/)
    assert.match(text, /无需重启/)

    await page.getByRole('button', { name: '音色中心', exact: true }).click()
    await page.waitForTimeout(250)
    text = await page.locator('body').innerText()
    assert.match(text, /TTS 音色与提供方/)
    assert.match(text, /服务启动时读取/)
    assert.match(text, /不会热更新/)
    assert.match(text, /需要重启或重新加载/)

    await page.getByRole('button', { name: '发送与安全', exact: true }).click()
    await page.waitForTimeout(250)
    text = await page.locator('body').innerText()
    assert.match(text, /发送自动化设置/)
    assert.match(text, /运行时通过受支持接口更新/)
    assert.match(text, /Worker 最终安全许可/)
    assert.match(text, /每个任务启动时读取/)
    assert.match(text, /部分路径可热更新/)
  })
})

await check('components dialog shows capability blockers and refreshes safely', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '组件管理', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await assert.doesNotReject(dialog.waitFor({ timeout: 3000 }))
    let text = await dialog.innerText()
    assert.match(text, /能力、授权与阻塞原因/)
    assert.match(text, /可保存/)
    assert.match(text, /未授权/)
    assert.match(text, /只能在微信助手控制台中由人工修改/)
    assert.match(text, /当前阶段仅只读/)
    await dialog.getByRole('button', { name: '重新检测', exact: true }).click()
    await page.waitForTimeout(600)
    text = await dialog.innerText()
    assert.match(text, /能力、授权与阻塞原因/)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  })
})

await check('invalid capability schema degrades without Mock capability data', async () => {
  await withPage('?bridge=capability-invalid', async (page) => {
    await page.waitForTimeout(600)
    const text = await page.locator('body').innerText()
    assert.match(text, /能力摘要不可用/)
    assert.doesNotMatch(text, /能力与授权摘要/)
    assert.doesNotMatch(text, /可执行写入/)
  })
})

await check('missing capability bridge degrades without Mock capability data', async () => {
  await withPage('?bridge=capability-missing', async (page) => {
    await page.waitForTimeout(600)
    const text = await page.locator('body').innerText()
    assert.match(text, /能力摘要不可用/)
    assert.doesNotMatch(text, /可执行写入/)
  })
})

await check('capability timeout degrades safely', async () => {
  await withPage('?bridge=capability-timeout', async (page) => {
    await page.waitForTimeout(5600)
    const text = await page.locator('body').innerText()
    assert.match(text, /能力摘要不可用/)
    assert.doesNotMatch(text, /可执行写入/)
  })
})

await check('capability summary stays usable at 780px', async () => {
  await withPage(normal, async (page) => {
    await page.setViewportSize({ width: 780, height: 900 })
    await page.waitForTimeout(300)
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      summary: document.querySelector('[data-testid="capability-summary"]')?.innerText || '',
    }))
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, 'capability narrow overflow')
    assert.match(metrics.summary, /能力与授权摘要/)
    await page.screenshot({ path: path.join(artifactDir, 'capability-780.png') })
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

await check('send & safety groups capabilities and keeps unsupported controls disabled', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '发送与安全', exact: true }).click()
    const text = await page.locator('body').innerText()
    assert.match(text, /紧急停止/)
    assert.match(text, /微信窗口管理/)
    assert.match(text, /游戏模式/)
    assert.match(text, /Ctrl \+ Shift \+ F12/)
    assert.match(text, /未注册|未执行|未知|未验证/)
    assert.match(text, /发现微信窗口 ≠ 已验证目标聊天/)
    assert.match(text, /游戏时暂停语音任务/)
    assert.match(text, /游戏时不抢微信焦点/)
    assert.doesNotMatch(text, /自动启动 Qwen/)
    assert.doesNotMatch(text, /Qwen 离线时改为文字/)
    assert.equal(await page.getByRole('button', { name: '注册快捷键', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '录制快捷键', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('switch', { name: '自动发现微信窗口', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('switch', { name: '允许自动聚焦微信窗口', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('switch', { name: '游戏时暂停语音任务', exact: true }).isDisabled(), true)
    await page.waitForTimeout(450)
    await page.screenshot({ path: path.join(artifactDir, 'safety-1440.png') })

    await page.setViewportSize({ width: 780, height: 900 })
    await page.waitForTimeout(250)
    const narrow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    assert.ok(narrow.scrollWidth <= narrow.clientWidth + 1, 'safety narrow overflow')
    await page.screenshot({ path: path.join(artifactDir, 'safety-780.png') })

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.waitForTimeout(250)
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    const settingsText = await page.locator('body').innerText()
    assert.match(settingsText, /故障降级/)
    assert.match(settingsText, /语音服务不可用时使用文字回复/)
    assert.doesNotMatch(settingsText, /游戏模式/)
    assert.doesNotMatch(settingsText, /Qwen 离线时/)
    assert.doesNotMatch(settingsText, /自动启动 Qwen/)
    await page.waitForTimeout(350)
    await page.screenshot({ path: path.join(artifactDir, 'settings-1440.png') })

    await page.getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '组件管理', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await assert.doesNotReject(dialog.waitFor({ timeout: 3000 }))
    const componentText = await dialog.innerText()
    assert.match(componentText, /自动启动本地 TTS 服务/)
    assert.equal(await dialog.getByRole('switch', { name: '自动启动本地 TTS 服务', exact: true }).isDisabled(), true)
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  })
})

await check('safety page stays disabled when Core is unavailable', async () => {
  await withPage('?bridge=none', async (page) => {
    await page.getByRole('button', { name: '发送与安全', exact: true }).click()
    const text = await page.locator('body').innerText()
    assert.match(text, /Core 未连接/)
    assert.match(text, /未支持/)
    assert.equal(await page.getByRole('button', { name: '注册快捷键', exact: true }).isDisabled(), true)
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
  playwrightVersion,
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
