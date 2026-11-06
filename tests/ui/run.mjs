import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import { createConfigCoordinator } from '../../core/config-coordinator.mjs'
import { createConfigSandbox } from '../../core/config-sandbox.mjs'
import { createFixtureSource } from '../../test/helpers/config-coordination-fixture.mjs'
import { createSingingBridge } from './singing-bridge.mjs'
import { createHostGenerationAssembly } from './host-generation-assembly.mjs'
import { createHostSettingsDraftAssembly } from './host-settings-draft-assembly.mjs'

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

const singingBridge = await createSingingBridge()
const hostGeneration = await createHostGenerationAssembly()
const hostSettings = await createHostSettingsDraftAssembly()

const server = createServer(async (req, res) => {
  if (await singingBridge.handle(req, res)) return
  if (await hostSettings.handle(req, res)) return
  if (await hostGeneration.handle(req, res)) return
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

async function withPage(query, fn, setupPage) {
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
    if (setupPage) await setupPage(page)
    const queryString = query || ''
    const separator = queryString.includes('?') ? '&' : '?'
    await page.goto(base + queryString + separator + 'hostToken=' + encodeURIComponent(hostGeneration.token)
      + '&settingsToken=' + encodeURIComponent(hostSettings.token), { waitUntil: 'load' })
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

/* The dependency wizard is now a modal root-layer dialog: its overlay really covers the navigation,
 * so a page switch is only possible after the dialog is dismissed (Escape/browse/acknowledge).
 * This helper performs that user step; it never hides a UI failure. */
async function closePlan09Wizard(page, { settle = 250 } = {}) {
  const wizard = page.locator('[data-testid="plan09-wizard"]')
  await page.waitForTimeout(settle)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await wizard.count() === 0) {
      // A capability/manifest change can open the wizard one render later; double-check before
      // handing the page back to the test.
      await page.waitForTimeout(120)
      if (await wizard.count() === 0) return
      continue
    }
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await wizard.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
  }
}

/** Geometry/containment/hit-test evidence for the dependency wizard dialog. */
async function measureWizard(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.wv-root')
    const layer = document.querySelector('[data-wv-overlay-layer]')
    const overlay = document.querySelector('.wv-overlay')
    const dialog = document.querySelector('.wv-dialog')
    const pageEl = document.querySelector('.wv-page')
    const rect = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }
    }
    const hitOf = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)))
    }
    const nav = document.querySelector('.wv-navitem')
    const navRect = nav.getBoundingClientRect()
    const navHit = document.elementFromPoint(navRect.left + navRect.width / 2, navRect.top + navRect.height / 2)
    const body = dialog.querySelector('.wv-dialog-body')
    const modeCards = Array.from(dialog.querySelectorAll('.wv-plan09-mode'))
    const modeColumns = modeCards.length >= 2
      ? new Set(modeCards.slice(0, 4).map((el) => Math.round(el.getBoundingClientRect().x))).size
      : modeCards.length
    const deps = Array.from(dialog.querySelectorAll('.wv-plan09-dep')).slice(0, 3)
    const depStacked = deps.length >= 2
      ? deps[0].getBoundingClientRect().bottom <= deps[1].getBoundingClientRect().top + 2
      : true
    return {
      layout: root.getAttribute('data-layout'),
      layerParentClass: layer ? layer.parentElement.className : null,
      overlayParentIsLayer: overlay ? overlay.parentElement === layer : false,
      dialogInPage: pageEl.contains(dialog),
      dialogInLayer: layer.contains(dialog),
      overlayPosition: getComputedStyle(overlay).position,
      layerZIndex: getComputedStyle(layer).zIndex,
      root: rect(root), overlay: rect(overlay), dialog: rect(dialog),
      footer: rect(dialog.querySelector('.wv-dialog-foot')),
      navBlocked: Boolean(navHit && navHit.classList.contains('wv-overlay')),
      navHitClass: navHit ? navHit.className : null,
      bodyScrollWidth: body.scrollWidth, bodyClientWidth: body.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth,
      headVisible: dialog.querySelector('.wv-dialog-head').getBoundingClientRect().height > 0,
      footerHit: hitOf(dialog.querySelector('.wv-dialog-foot')),
      ackHit: hitOf(dialog.querySelector('[data-testid="plan09-wizard-acknowledge"]')),
      modeColumns,
      depStacked,
    }
  })
}

async function hitTestSelector(page, selector) {
  const locator = page.locator(selector)
  if (await locator.count() === 0) return false
  await locator.first().scrollIntoViewIfNeeded()
  const handle = await locator.first().elementHandle()
  return page.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)))
  }, handle)
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

await check('demo-data explanation matches actual behavior', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '演示数据说明', exact: true }).click()
    await page.getByText(/标记为演示的服务指标/).waitFor({ timeout: 3000 })
    const toast = await page.getByText(/标记为演示的服务指标/).innerText()
    assert.match(toast, /不会刷新真实数据/)
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
    assert.match(text, /读取时机未知/)
    assert.match(text, /是否热更新未知/)
    assert.match(text, /本插件永不写入/)
  })
})

await check('studio preset generation saves the original task, downloads it and survives reload', async () => {
  const generationCalls = []
  const trackGeneration = (page) => {
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/whale-voice/setup/generation') {
        generationCalls.push(request.url())
      }
    })
  }
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '音色中心', exact: true }).click()
    await page.getByLabel('试听文本').waitFor({ timeout: 5000 })
    await page.waitForFunction(() => {
      const select = document.querySelector('select[aria-label="音色"]')
      return select && Array.from(select.options).some((option) => option.value === 'demo-voice-a')
    }, null, { timeout: 10000 })
    // 151: an untouched isolated config reports an honest empty saved-result list.
    await page.locator('[data-testid="studio-generation-results-empty"]').waitFor({ timeout: 10000 })
    await page.getByLabel('试听文本').fill('你好，这是隔离预设生成演示。')
    await page.getByLabel('音色').selectOption('demo-voice-a')
    await page.getByRole('button', { name: /生成并保存/ }).click()
    const state = page.locator('[data-testid="studio-generation-state"]')
    await state.waitFor({ timeout: 15000 })
    assert.equal(await state.innerText(), '原任务已保存')
    const taskId = await page.locator('[data-testid="studio-generation-task"]').innerText()
    const artifactRef = await page.locator('[data-testid="studio-generation-artifact"]').innerText()
    assert.match(taskId, /^task:fixture-[0-9a-f]{32}$/)
    assert.match(artifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    // 156: the page waits for the Host's declared effective limit instead of a fixed short timer.
    const waitLimit = await page.evaluate(() => window.__WHALE_GENERATION_TIMEOUT_MS__)
    assert.equal(Number.isInteger(waitLimit) && waitLimit >= 5000, true, 'generation wait limit: ' + String(waitLimit))
    // 162: the page states the run/result source honestly instead of claiming Fixture for sure.
    const pageText = await page.locator('body').innerText()
    assert.match(pageText, /来源未确认/)
    assert.match(pageText, /无法核实/)
    assert.match(pageText, /生产播放与微信发送未接入/)
    assert.doesNotMatch(pageText, /不加载真实模型|不运行真实模型|结果来自 Fixture/)
    await page.screenshot({ path: path.join(artifactDir, 'studio-generation-1440.png') })

    // 150: download the already-saved WAV bytes; the file must match the saved result facts.
    const firstSummary = await page.locator('[data-testid="studio-generation-result"]').innerText()
    const firstSha = /SHA-256 ([0-9a-f]{64})/.exec(firstSummary)
    const firstSize = /大小 (\d+) bytes/.exec(firstSummary)
    assert.ok(firstSha, firstSummary)
    assert.ok(firstSize, firstSummary)
    const firstDownloadPromise = page.waitForEvent('download')
    await page.getByTestId('studio-generation-download').click()
    const firstDownload = await firstDownloadPromise
    assert.match(firstDownload.suggestedFilename(), /^whale-voice-[0-9a-f]{32}\.wav$/)
    const firstBytes = readFileSync(await firstDownload.path())
    assert.equal(firstBytes.length, Number(firstSize[1]))
    assert.equal(createHash('sha256').update(firstBytes).digest('hex'), firstSha[1])

    // A second run mints a different original task: the state is not a fixed success value.
    await page.getByLabel('试听文本').fill('第二个隔离测试生成。')
    await page.getByRole('button', { name: /生成并保存/ }).click()
    await page.waitForFunction(
      (previous) => {
        const element = document.querySelector('[data-testid="studio-generation-task"]')
        return element && element.textContent && element.textContent !== previous
      },
      taskId,
      { timeout: 15000 },
    )
    const secondTaskId = await page.locator('[data-testid="studio-generation-task"]').innerText()
    const secondArtifactRef = await page.locator('[data-testid="studio-generation-artifact"]').innerText()
    assert.notEqual(secondTaskId, taskId)
    assert.match(secondTaskId, /^task:fixture-[0-9a-f]{32}$/)
    assert.match(secondArtifactRef, /^artifact:fixture-bytes-[0-9a-f]{32}$/)
    const secondSummary = await page.locator('[data-testid="studio-generation-result"]').innerText()
    const secondSha = /SHA-256 ([0-9a-f]{64})/.exec(secondSummary)
    assert.ok(secondSha, secondSummary)

    // 151: both saved results are listed from the same storage location and either one can be selected back.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="studio-generation-result-select"]').length === 2,
      null,
      { timeout: 10000 },
    )
    const listedIds = await page.locator('[data-testid="studio-generation-result-select"]').evaluateAll(
      (nodes) => nodes.map((node) => node.getAttribute('data-task-id')),
    )
    assert.deepEqual(listedIds, [taskId, secondTaskId])
    await page.locator('[data-testid="studio-generation-result-select"][data-task-id="' + taskId + '"]').click()
    await page.waitForFunction(
      (expected) => document.querySelector('[data-testid="studio-generation-task"]')?.textContent === expected,
      taskId,
    )
    assert.equal(await page.locator('[data-testid="studio-generation-artifact"]').innerText(), artifactRef)
    const selectedSummary = await page.locator('[data-testid="studio-generation-result"]').innerText()
    assert.match(selectedSummary, new RegExp('SHA-256 ' + firstSha[1]))
    const selectedDownloadPromise = page.waitForEvent('download')
    await page.getByTestId('studio-generation-download').click()
    const selectedBytes = readFileSync(await (await selectedDownloadPromise).path())
    assert.equal(createHash('sha256').update(selectedBytes).digest('hex'), firstSha[1])
    await page.locator('[data-testid="studio-generation-result-select"][data-task-id="' + secondTaskId + '"]').click()
    await page.waitForFunction(
      (expected) => document.querySelector('[data-testid="studio-generation-task"]')?.textContent === expected,
      secondTaskId,
    )
    const selectedSecondDownloadPromise = page.waitForEvent('download')
    await page.getByTestId('studio-generation-download').click()
    const selectedSecondBytes = readFileSync(await (await selectedSecondDownloadPromise).path())
    assert.equal(createHash('sha256').update(selectedSecondBytes).digest('hex'), secondSha[1])

    // Reload: the page queries the same saved result back and the same bytes remain downloadable.
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => window.__WHALE_HARNESS_READY__ === true, null, { timeout: 10000 })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: '音色中心', exact: true }).click()
    await page.locator('[data-testid="studio-generation-state"]').waitFor({ timeout: 5000 })
    assert.equal(await page.locator('[data-testid="studio-generation-state"]').innerText(), '原任务已保存')
    assert.equal(await page.locator('[data-testid="studio-generation-task"]').innerText(), secondTaskId)
    assert.equal(await page.locator('[data-testid="studio-generation-artifact"]').innerText(), secondArtifactRef)
    const reopenedSummary = await page.locator('[data-testid="studio-generation-result"]').innerText()
    const reopenedSha = /SHA-256 ([0-9a-f]{64})/.exec(reopenedSummary)
    assert.ok(reopenedSha, reopenedSummary)
    assert.equal(reopenedSha[1], secondSha[1])
    const secondDownloadPromise = page.waitForEvent('download')
    await page.getByTestId('studio-generation-download').click()
    const secondDownload = await secondDownloadPromise
    const secondBytes = readFileSync(await secondDownload.path())
    assert.equal(createHash('sha256').update(secondBytes).digest('hex'), secondSha[1])

    // 151: after the reload both saved results are still selectable and download their own original bytes.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="studio-generation-result-select"]').length === 2,
      null,
      { timeout: 10000 },
    )
    await page.locator('[data-testid="studio-generation-result-select"][data-task-id="' + taskId + '"]').click()
    await page.waitForFunction(
      (expected) => document.querySelector('[data-testid="studio-generation-task"]')?.textContent === expected,
      taskId,
    )
    const reopenedFirstDownloadPromise = page.waitForEvent('download')
    await page.getByTestId('studio-generation-download').click()
    const reopenedFirstBytes = readFileSync(await (await reopenedFirstDownloadPromise).path())
    assert.equal(createHash('sha256').update(reopenedFirstBytes).digest('hex'), firstSha[1])
    assert.equal(generationCalls.length, 2, 'listing, selecting and download must not trigger another generation')
  }, trackGeneration)
})

await check('studio reports generation not enabled when the Host runtime is absent', async () => {
  await hostGeneration.setGenerationEnabled(false)
  try {
    await withPage('?bridge=normal&generation=off', async (page) => {
      await page.getByRole('button', { name: '音色中心', exact: true }).click()
      await page.locator('[data-testid="studio-generation-disabled"]').waitFor({ timeout: 5000 })
      const text = await page.locator('body').innerText()
      assert.match(text, /生成未启用/)
      assert.match(text, /未配置生成运行对象/)
      assert.equal(await page.locator('[data-testid="studio-generation-result"]').count(), 0)
      assert.equal(await page.getByRole('button', { name: /生成并保存/ }).isDisabled(), true)
    })
  } finally {
    await hostGeneration.setGenerationEnabled(true)
  }
})

// 164 v1.2: a restored task's generation_not_enabled answer must not override the assembly state that
// is still pending; the page keeps its real waiting state until the Host says which state it is.
await check('studio keeps waiting when a restored task answers not enabled before the assembly state', async () => {
  const storedTask = 'task:fixture-' + '0'.repeat(32)
  await hostGeneration.setGenerationEnabled(false)
  const seedStoredTask = async (page) => {
    await page.addInitScript((taskId) => {
      try { window.localStorage.setItem('whale-voice:studio:last-task', taskId) } catch {}
    }, storedTask)
  }
  try {
    await withPage('?bridge=normal&generation=off', async (page) => {
      let release = () => {}
      const held = new Promise((resolve) => { release = resolve })
      await page.route('**/whale-voice/setup/generation/assembly*', async (route) => {
        await held
        await route.continue()
      })
      const statusAnswered = page.waitForResponse(
        (response) => response.url().includes('/generation/status') && response.status() === 503,
      )
      await page.getByRole('button', { name: '音色中心', exact: true }).click()
      await statusAnswered
      const pendingText = await page.locator('body').innerText()
      assert.match(pendingText, /正在检查生成能力/)
      assert.doesNotMatch(pendingText, /未配置生成运行对象|生成未能启动/)
      assert.equal(await page.locator('[data-testid="studio-generation-disabled"]').count(), 0)
      release()
      await page.locator('[data-testid="studio-generation-disabled"]').waitFor({ timeout: 5000 })
      assert.match(await page.locator('body').innerText(), /生成未启用/)
    }, seedStoredTask)
  } finally {
    await hostGeneration.setGenerationEnabled(true)
  }
})

// 164/164 v1.1: while the assembly answer is still pending the page must not claim "not configured"
// or a failure; when the real FAILED answer arrives, the generation page and the settings page must
// name the same known reason and the usable repair entry.
await check('studio waits for the assembly state and then names the real failure', async () => {
  const failure = {
    code: 'runtime_unavailable',
    messageZh: '生成运行对象未能启动：生成数据保存位置无法读取（保存位置或其内的存储入口无法打开或读取）。可在设置页修正后重新保存并应用，下次重开插件生效。',
  }
  hostGeneration.setGenerationFailure(failure)
  try {
    await withPage('?bridge=normal&generation=failed', async (page) => {
      let release = () => {}
      const held = new Promise((resolve) => { release = resolve })
      await page.route('**/whale-voice/setup/generation/assembly*', async (route) => {
        await held
        await route.continue()
      })
      await page.getByRole('button', { name: '音色中心', exact: true }).click()
      // While the assembly query is still unanswered the page keeps its real waiting state.
      await page.waitForFunction(() => document.body.innerText.includes('正在检查生成能力'), null, { timeout: 5000 })
      const pendingText = await page.locator('body').innerText()
      assert.doesNotMatch(pendingText, /未配置生成运行对象|生成未能启动|还没有生成结果/)
      assert.equal(await page.locator('[data-testid="studio-generation-disabled"]').count(), 0)
      release()
      const notice = page.locator('[data-testid="studio-generation-assembly-message"]')
      await notice.waitFor({ timeout: 5000 })
      const block = page.locator('[data-testid="studio-generation-assembly-error"]')
      await block.waitFor({ timeout: 5000 })
      // 167/U02: the page head and the generation card name the same state, and the disabled generate
      // button explains the startup failure instead of claiming generation is not enabled.
      assert.equal(await page.locator('.wv-pagehead-actions .wv-badge').first().innerText(), '启动失败')
      assert.equal(await page.locator('.wv-preview .wv-card-title .wv-badge').first().innerText(), '启动失败')
      const generateButton = page.getByRole('button', { name: /生成并保存/ })
      assert.equal(await generateButton.getAttribute('title'), '启动失败：生成不可用')
      assert.doesNotMatch(await page.locator('body').innerText(), /生成未启用/)
      const blockText = await block.innerText()
      assert.match(blockText, /生成未能启动/)
      assert.match(blockText, /生成数据保存位置无法读取/)
      assert.doesNotMatch(blockText, /任务记录|损坏|截断|Qwen 运行路径/)
      const body = await page.locator('body').innerText()
      assert.doesNotMatch(body, /未配置生成运行对象/)
      assert.doesNotMatch(body, /还没有生成结果/)
      assert.equal(await page.locator('[data-testid="studio-generation-disabled"]').count(), 0)
      assert.equal(await page.getByRole('button', { name: /生成并保存/ }).isDisabled(), true)
      await page.screenshot({ path: path.join(artifactDir, 'studio-generation-assembly-failed-1440.png') })

      // The settings page shows the same reason from the same Host state.
      await page.getByRole('button', { name: '语音设置', exact: true }).click()
      const settingsBlock = page.locator('[data-testid="generation-assembly-error"]')
      await settingsBlock.waitFor({ timeout: 5000 })
      const settingsText = await settingsBlock.innerText()
      assert.ok(settingsText.includes(failure.messageZh), settingsText)
      assert.match(settingsText, /设置页/)
    })
  } finally {
    hostGeneration.resetGeneration()
  }
})

// 160: while the capability request is still pending the page keeps the real waiting state.
await check('studio keeps a real waiting state while the capability request is pending', async () => {
  await withPage('?bridge=normal&generationFault=catalog-pending', async (page) => {
    await page.getByRole('button', { name: '音色中心', exact: true }).click()
    await page.waitForFunction(() => document.body.innerText.includes('正在检查生成能力'), null, { timeout: 5000 })
    const text = await page.locator('body').innerText()
    assert.match(text, /正在检查生成能力/)
    assert.equal(await page.locator('[data-testid="studio-generation-catalog-error"]').count(), 0)
    assert.equal(await page.locator('[data-testid="studio-generation-disabled"]').count(), 0)
    assert.equal(await page.getByRole('button', { name: /生成并保存/ }).isDisabled(), true)
  })
})

// 160: a rejected request and a server failure object are both a failed capability read, never
// "not enabled" and never an endless "checking" state.
await check('studio reports a failed capability read instead of not enabled or checking', async () => {
  for (const fault of ['catalog-reject', 'catalog-failed']) {
    await withPage('?bridge=normal&generationFault=' + fault, async (page) => {
      await page.getByRole('button', { name: '音色中心', exact: true }).click()
      await page.locator('[data-testid="studio-generation-catalog-error"]').waitFor({ timeout: 5000 })
      await page.locator('[data-testid="studio-generation-unavailable"]').waitFor({ timeout: 5000 })
      const text = await page.locator('body').innerText()
      assert.match(text, /无法读取生成能力/)
      assert.match(text, /这不代表未启用/)
      assert.match(text, /读取失败/)
      assert.doesNotMatch(text, /生成未启用/)
      assert.doesNotMatch(text, /未配置生成运行对象/)
      assert.doesNotMatch(text, /正在检查生成能力/)
      assert.doesNotMatch(text, /还没有生成结果/)
      assert.equal(await page.locator('[data-testid="studio-generation-disabled"]').count(), 0)
      assert.equal(await page.getByRole('button', { name: /生成并保存/ }).isDisabled(), true)
    })
  }
})

// 163: the Host explicitly answering "not in the current storage location" is a definite fact, not a
// retryable read failure; it stays accurate after a refresh and never claims the task never existed.
await check('studio says the current storage location has no such saved task', async () => {
  const storedTask = 'task:fixture-' + '0'.repeat(32)
  const seedStoredTask = async (page) => {
    await page.addInitScript((taskId) => {
      try { window.localStorage.setItem('whale-voice:studio:last-task', taskId) } catch {}
    }, storedTask)
  }
  const expectMissing = async (page) => {
    const block = page.locator('[data-testid="studio-generation-restore-missing"]')
    await block.waitFor({ timeout: 5000 })
    const text = await block.innerText()
    assert.match(text, /当前保存位置未找到这项任务/)
    assert.ok(text.includes(storedTask), text)
    assert.match(text, /这不代表它从未保存/)
    assert.match(text, /不代表其他保存位置没有/)
    assert.doesNotMatch(text, /请求失败或超时|刷新可重试/)
    const body = await page.locator('body').innerText()
    assert.doesNotMatch(body, /无法读取上次保存的结果|还没有生成结果/)
    assert.equal(await page.locator('[data-testid="studio-generation-restore-error"]').count(), 0)
    assert.equal(await page.locator('[data-testid="studio-generation-result"]').count(), 0)
    assert.equal(await page.locator('[data-testid="studio-generation-download"]').count(), 0)
  }
  await withPage('?bridge=normal', async (page) => {
    await page.getByRole('button', { name: '音色中心', exact: true }).click()
    await expectMissing(page)
    // Refresh: the same reference and the same Host answer keep the same definite wording.
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => window.__WHALE_HARNESS_READY__ === true, null, { timeout: 10000 })
    await page.getByRole('button', { name: '音色中心', exact: true }).click()
    await expectMissing(page)
  }, seedStoredTask)
})

// 160/163: a rejected request and a real read rejection stay read failures, not "no such task".
await check('studio keeps a failed saved-result read distinct from a missing task', async () => {
  const storedTask = 'task:fixture-' + '0'.repeat(32)
  const seedStoredTask = async (page) => {
    await page.addInitScript((taskId) => {
      try { window.localStorage.setItem('whale-voice:studio:last-task', taskId) } catch {}
    }, storedTask)
  }
  for (const fault of ['restore-reject', 'restore-read-failed']) {
    await withPage('?bridge=normal&generationFault=' + fault, async (page) => {
      await page.getByRole('button', { name: '音色中心', exact: true }).click()
      const block = page.locator('[data-testid="studio-generation-restore-error"]')
      await block.waitFor({ timeout: 5000 })
      const text = await block.innerText()
      assert.match(text, /无法读取上次保存的结果/)
      assert.ok(text.includes(storedTask), text)
      assert.match(text, /这不代表没有保存/)
      const body = await page.locator('body').innerText()
      assert.doesNotMatch(body, /还没有生成结果|当前保存位置未找到这项任务/)
      assert.equal(await page.locator('[data-testid="studio-generation-restore-missing"]').count(), 0)
      assert.equal(await page.locator('[data-testid="studio-generation-result"]').count(), 0)
      assert.equal(await page.locator('[data-testid="studio-generation-download"]').count(), 0)
    }, seedStoredTask)
  }
})

await check('Worker version unknown is displayed without claiming Service version', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '发送与安全', exact: true }).click()
    await page.waitForTimeout(300)
    const text = await page.locator('body').innerText()
    assert.match(text, /Worker 最终安全许可/)
    assert.match(text, /读取时机未知/)
    assert.match(text, /是否热更新未知/)
    assert.match(text, /本插件永不写入/)
    assert.doesNotMatch(text, /Worker 最终安全许可[^\n]*v0\.1\.0/)
    const panel = page.locator('[data-testid="capability-panel"]').first()
    assert.equal(await panel.getByRole('button', { name: /保存/ }).count(), 0)

    await page.getByRole('button', { name: '总览', exact: true }).click()
    await page.waitForTimeout(300)
    const workerComponent = await page.locator('[data-testid="capability-component-worker"]').innerText()
    assert.match(workerComponent, /版本未知/)
    assert.doesNotMatch(workerComponent, /v0\.1\.0/)
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

await check('generation storage location draft is saved, applied and survives a page reload', async () => {
  await hostSettings.reset()
  const target = path.join(os.tmpdir(), 'whale-voice-ui-settings-draft', 'generation-data')
  await withPage('?bridge=normal', async (page) => {
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    const input = page.getByTestId('generation-storage-input')
    await assert.doesNotReject(input.waitFor({ timeout: 4000 }))
    assert.equal(await input.inputValue(), '', 'a fresh isolated draft store has no saved value')
    await input.fill(target)
    await page.waitForFunction(
      (value) => document.querySelector('[data-testid="generation-storage-input"]')?.value === value,
      target,
      { timeout: 4000 },
    )
    await page.getByTestId('generation-storage-save').click()
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="generation-storage-status"]')?.innerText.includes('已保存草稿'),
        null,
        { timeout: 8000 },
      )
    } catch (error) {
      const status = await page.getByTestId('generation-storage-status').innerText().catch(() => '')
      const note = await page.getByTestId('generation-storage-error').innerText().catch(() => '')
      throw new Error(error.message + ' | status=' + status + ' | note=' + note)
    }
    const toast = await page.locator('.wv-toast').innerText()
    assert.match(toast, /草稿已保存，尚未应用/)
    const pageText = await page.locator('body').innerText()
    assert.match(pageText, /保存只写入草稿/)
    assert.match(pageText, /下次打开/)
    assert.match(pageText, /不会立即切换/)
    assert.match(pageText, /生成数据保存位置/)
    assert.match(await page.getByTestId('generation-storage-applied').innerText(), /尚未应用/)

    // Applying the saved draft records the persisted fact; the current runtime is not switched here.
    await page.getByTestId('generation-storage-apply').click()
    await page.waitForFunction(
      () => document.querySelector('[data-testid="generation-storage-applied"]')?.innerText.includes('已应用位置：'),
      null,
      { timeout: 8000 },
    )
    const appliedToast = await page.locator('.wv-toast').innerText()
    assert.match(appliedToast, /已应用，下次重开插件生效/)
    assert.equal(await page.getByTestId('generation-storage-applied').innerText(), '已应用位置：' + target)
    assert.match(await page.locator('body').innerText(), /不会立即切换当时正在运行的组件/)

    // Reload the page and reopen the settings page: the saved draft and the applied fact are read again.
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => window.__WHALE_HARNESS_READY__ === true, null, { timeout: 10000 })
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    await page.waitForFunction(
      (value) => document.querySelector('[data-testid="generation-storage-input"]')?.value === value,
      target,
      { timeout: 4000 },
    )
    const reopenedStatus = await page.getByTestId('generation-storage-status').innerText()
    assert.ok(reopenedStatus.includes(target), reopenedStatus)
    const reopenedApplied = await page.getByTestId('generation-storage-applied').innerText()
    assert.equal(reopenedApplied, '已应用位置：' + target)
    assert.doesNotMatch(reopenedApplied, /下次重开插件生效|当前运行仍用原位置/)
    assert.match(await page.locator('body').innerText(), /不会立即切换当时正在运行的组件/)
    await page.screenshot({ path: path.join(artifactDir, 'settings-generation-draft-1440.png') })
  })
})

await check('qwen runtime path draft is saved, applied and survives a page reload', async () => {
  await hostSettings.reset()
  const modelDirectory = path.join(os.tmpdir(), 'whale-voice-ui-qwen-model')
  const pythonPath = path.join(os.tmpdir(), 'whale-voice-ui-python', 'python.exe')
  await withPage('?bridge=normal', async (page) => {
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    const modelInput = page.getByTestId('qwen-runtime-model')
    const pythonInput = page.getByTestId('qwen-runtime-python')
    await assert.doesNotReject(modelInput.waitFor({ timeout: 4000 }))
    await modelInput.fill(modelDirectory)
    await pythonInput.fill(pythonPath)
    await page.getByTestId('qwen-runtime-save').click()
    try {
      await page.waitForFunction(
        () => document.querySelector('[data-testid="qwen-runtime-status"]')?.innerText.includes('已保存草稿'),
        null,
        { timeout: 8000 },
      )
    } catch (error) {
      const status = await page.getByTestId('qwen-runtime-status').innerText().catch(() => '')
      const note = await page.getByTestId('qwen-runtime-error').innerText().catch(() => '')
      throw new Error(error.message + ' | status=' + status + ' | note=' + note)
    }
    assert.match(await page.locator('.wv-toast').innerText(), /运行路径草稿已保存，尚未应用/)
    const pageText = await page.locator('body').innerText()
    assert.match(pageText, /Qwen 运行路径/)
    assert.match(pageText, /不会执行 Python 或读取模型/)
    assert.match(await page.getByTestId('qwen-runtime-applied').innerText(), /尚未应用/)

    // Applying the saved paths records the fact; the current runtime is not switched here.
    await page.getByTestId('qwen-runtime-apply').click()
    await page.waitForFunction(
      () => document.querySelector('[data-testid="qwen-runtime-applied"]')?.innerText.includes('已应用运行路径'),
      null,
      { timeout: 8000 },
    )
    assert.match(await page.locator('.wv-toast').innerText(), /已应用，下次重开插件生效/)
    const appliedText = await page.getByTestId('qwen-runtime-applied').innerText()
    assert.ok(appliedText.includes(modelDirectory), appliedText)
    assert.ok(appliedText.includes(pythonPath), appliedText)
    assert.match(await page.locator('body').innerText(), /不会立即切换当前运行/)

    // Reload the page and reopen the settings page: both saved paths and the applied fact are read back.
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => window.__WHALE_HARNESS_READY__ === true, null, { timeout: 10000 })
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    await page.waitForFunction(
      (value) => document.querySelector('[data-testid="qwen-runtime-model"]')?.value === value,
      modelDirectory,
      { timeout: 4000 },
    )
    assert.equal(await page.getByTestId('qwen-runtime-python').inputValue(), pythonPath)
    assert.match(await page.getByTestId('qwen-runtime-status').innerText(), /已保存草稿/)
    const reopenedApplied = await page.getByTestId('qwen-runtime-applied').innerText()
    assert.ok(reopenedApplied.includes(modelDirectory), reopenedApplied)
    assert.ok(reopenedApplied.includes(pythonPath), reopenedApplied)
    assert.match(reopenedApplied, /已应用运行路径/)
    await page.screenshot({ path: path.join(artifactDir, 'settings-qwen-runtime-draft-1440.png') })
  })
})

await check('settings page shows the real generation assembly failure', async () => {
  await withPage('?bridge=normal&assembly=failed', async (page) => {
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    const error = page.locator('[data-testid="generation-assembly-error"]')
    await error.waitFor({ timeout: 5000 })
    const text = await error.innerText()
    assert.match(text, /生成未能启动/)
    assert.match(text, /生成数据保存位置不可用/)
    assert.match(text, /保存并应用/)
    await page.screenshot({ path: path.join(artifactDir, 'settings-assembly-failed-1440.png') })
  })
})

await check('settings page reports an unreadable generation status instead of hiding it', async () => {
  await withPage('?bridge=normal&assembly=error', async (page) => {
    await page.getByRole('button', { name: '语音设置', exact: true }).click()
    const readError = page.locator('[data-testid="generation-assembly-read-error"]')
    await readError.waitFor({ timeout: 5000 })
    const text = await readError.innerText()
    assert.match(text, /无法读取生成运行状态/)
    assert.match(text, /不代表生成正常或未启用/)
    assert.equal(await page.locator('[data-testid="generation-assembly-error"]').count(), 0)
    await page.waitForFunction(
      () => {
        const status = document.querySelector('[data-testid="generation-storage-status"]')
        return status && !status.innerText.includes('正在读取')
      },
      null,
      { timeout: 8000 },
    )
    assert.equal(await page.getByTestId('generation-storage-input').isEditable(), true)
    await page.screenshot({ path: path.join(artifactDir, 'settings-assembly-read-error-1440.png') })
  })
})

await check('corrupt applied settings are visible and repairable in the settings page', async () => {
  await hostSettings.reset()
  hostSettings.corruptApplied('generation-settings-applied.json')
  hostSettings.corruptApplied('qwen-runtime-applied.json')
  const storageRoot = path.join(os.tmpdir(), 'whale-voice-ui-settings-recovered', 'generation')
  const modelDirectory = path.join(os.tmpdir(), 'whale-voice-ui-qwen-model-recovered')
  const pythonPath = path.join(os.tmpdir(), 'whale-voice-ui-python-recovered', 'python.exe')
  try {
    await withPage('?bridge=normal', async (page) => {
      await page.getByRole('button', { name: '语音设置', exact: true }).click()
      await page.locator('[data-testid="generation-storage-applied-error"]').waitFor({ timeout: 5000 })
      await page.locator('[data-testid="qwen-runtime-applied-error"]').waitFor({ timeout: 5000 })
      assert.match(await page.getByTestId('generation-storage-applied').innerText(), /记录损坏/)
      assert.match(await page.getByTestId('qwen-runtime-applied').innerText(), /记录损坏/)

      // Repair the storage location through the normal page actions.
      await page.getByTestId('generation-storage-input').fill(storageRoot)
      await page.getByTestId('generation-storage-save').click()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="generation-storage-status"]')?.innerText.includes('已保存草稿'),
        null,
        { timeout: 8000 },
      )
      await page.getByTestId('generation-storage-apply').click()
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="generation-storage-applied-error"]'),
        null,
        { timeout: 8000 },
      )
      assert.equal(await page.getByTestId('generation-storage-applied').innerText(), '已应用位置：' + storageRoot)

      // Repair the runtime paths the same way.
      await page.getByTestId('qwen-runtime-model').fill(modelDirectory)
      await page.getByTestId('qwen-runtime-python').fill(pythonPath)
      await page.getByTestId('qwen-runtime-save').click()
      await page.waitForFunction(
        () => document.querySelector('[data-testid="qwen-runtime-status"]')?.innerText.includes('已保存草稿'),
        null,
        { timeout: 8000 },
      )
      await page.getByTestId('qwen-runtime-apply').click()
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="qwen-runtime-applied-error"]'),
        null,
        { timeout: 8000 },
      )
      const appliedText = await page.getByTestId('qwen-runtime-applied').innerText()
      assert.ok(appliedText.includes(modelDirectory), appliedText)
      assert.ok(appliedText.includes(pythonPath), appliedText)
      await page.screenshot({ path: path.join(artifactDir, 'settings-applied-records-repaired-1440.png') })
    })
  } finally {
    await hostSettings.reset()
  }
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

await check('plan09 pages open without the config adapter and show a not-connected notice', async () => {
  await withPage('?bridge=normal&plan09=none', async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="page-voice-bubbles"]').waitFor({ timeout: 5000 })
    const voiceNotice = page.locator('[data-testid="plan09-config-adapter-missing"]')
    await voiceNotice.waitFor({ timeout: 5000 })
    assert.match(await voiceNotice.innerText(), /未接入配置适配器/)
    assert.equal(await page.getByTestId('plan09-prepare').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-wizard"]').count(), 0)
    await page.screenshot({ path: path.join(artifactDir, 'plan09-no-adapter-1440.png') })
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="page-singing"]').waitFor({ timeout: 5000 })
    assert.match(await page.locator('[data-testid="plan09-config-adapter-missing"]').innerText(), /未接入配置适配器/)
    assert.equal(await page.getByTestId('plan09-prepare').isDisabled(), true)
    await page.getByRole('button', { name: '总览', exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('h1')?.textContent || '').includes('小鲸鱼的声音'))
  })
})

await check('a manually opened plan09 wizard survives the delayed initial capability read without an adapter', async () => {
  await withPage('?bridge=capability-race&plan09=none&singing=none', async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    const missingAdapter = page.getByTestId('plan09-config-adapter-missing')
    await missingAdapter.waitFor({ timeout: 5000 })
    assert.equal(await page.locator('[data-testid="plan09-wizard"]').count(), 0)
    await page.getByTestId('plan09-reopen').click()
    await page.getByTestId('plan09-wizard').waitFor({ state: 'visible' })
    await page.waitForFunction(() => window.__WHALE_CAPABILITY_RACE_RESOLVED__ === true, null, { timeout: 8000 })
    await page.waitForTimeout(300)
    await page.getByTestId('plan09-wizard').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="plan09-wizard"]').count(), 1)
    assert.match(await missingAdapter.innerText(), /未接入配置适配器/)
    assert.equal(await page.getByTestId('plan09-prepare').isDisabled(), true)
    await page.getByTestId('plan09-wizard-browse').click()
    await page.getByTestId('plan09-wizard').waitFor({ state: 'hidden' })
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-wizard"]').count(), 0)
  })
})

await check('plan09 entries persist mode/browse and keep independent wizards', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-mode-cpu"]').click()
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-wizard"]').count(), 0)
    await page.locator('[data-testid="plan09-reopen"]').click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-intro-check"]').check()
    await page.locator('[data-testid="plan09-wizard-acknowledge"]').click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'hidden' })
    assert.match(await page.locator('[data-testid="plan09-mode-summary"]').innerText(), /仅 CPU/)
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
  })
})

await check('plan09 dependencies follow mode and install/verify lifecycle is shared', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="plan09-dep-rvc"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-dep-separation"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-dep-gpu"]').count(), 1)
    await page.locator('[data-testid="plan09-mode-cpu"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-gpu"]').count(), 0)
    await page.locator('[data-testid="plan09-mode-cloud"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-separation"]').count(), 0)
    assert.equal(await page.locator('[data-testid="plan09-dep-cloud"]').count(), 1)
    await page.locator('[data-testid="plan09-mode-local"]').click()
    await page.locator('[data-testid="plan09-failure-select"]').selectOption('NO_GPU')
    await page.locator('[data-testid="plan09-install-rvc"]').click()
    const reason = page.locator('[data-testid="plan09-dep-reason-rvc"]')
    await reason.waitFor({ state: 'visible' })
    assert.match(await reason.innerText(), /GPU/)
    await page.locator('[data-testid="plan09-retry-rvc"]').click()
    await page.locator('[data-testid="plan09-failure-select"]').selectOption('NONE')
    await page.locator('[data-testid="plan09-install-rvc"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-rvc"]')?.getAttribute('data-state') === 'installed')
    await page.locator('[data-testid="plan09-verify-rvc"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-rvc"]')?.getAttribute('data-state') === 'ready')
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-reopen"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-rvc"]')?.getAttribute('data-state') === 'ready')
    assert.equal(await page.locator('[data-testid="plan09-install-rvc"]').count(), 0)
  })
})

await check('plan09 voice draft drives the injected adapter transaction', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-preview"]').click()
    await page.locator('[data-testid="plan09-preview-result"]').waitFor()
    await page.locator('[data-testid="plan09-draft-engine"]').selectOption('cloud')
    await page.locator('[data-testid="plan09-preview"]').click()
    await page.locator('[data-testid="plan09-errors"]').waitFor()
    assert.match(await page.locator('[data-testid="plan09-errors"]').innerText(), /云端 Provider 尚未授权/)
    await page.locator('[data-testid="plan09-draft-engine"]').selectOption('local')
    await page.locator('[data-testid="plan09-draft-emotion"]').selectOption('happy')
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    assert.match(await page.locator('[data-testid="plan09-tx-panel"]').innerText(), /草稿未应用：情绪/)
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    await page.locator('[data-testid="plan09-apply-check"]').click()
    await page.waitForTimeout(500)
    const phase = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase')
    const calls = await page.evaluate(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).join(','))
    assert.equal(phase, 'PENDING_APPLY', calls)
    const recorded = await page.evaluate(() => window.__WHALE_PLAN09_ADAPTER_CALLS__ || [])
    assert.ok(recorded.includes('prepareChange') && recorded.includes('execute') && recorded.includes('apply'))
  })
})

await check('plan09 invalid draft is blocked and external revision change conflicts', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-draft-text"]').fill('')
    await page.locator('[data-testid="plan09-prepare"]').click()
    assert.match(await page.locator('[data-testid="plan09-errors"]').innerText(), /演示文本/)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'DIRTY')
    await page.locator('[data-testid="plan09-draft-text"]').fill('晚安，这是虚构演示。')
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.bumpRevision())
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'CONFLICT')
    assert.match(await page.locator('[data-testid="plan09-tx-panel"]').innerText(), /CONFIG_COORDINATION_CONFLICT/)
  })
})

await check('plan09 singing validates source, consent, mode and SVC limits', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-preview"]').click()
    const errors = page.locator('[data-testid="plan09-errors"]')
    assert.match(await errors.innerText(), /虚构引用/)
    await page.locator('[data-testid="plan09-draft-source"]').fill('fixture://demo-song-01')
    await page.locator('[data-testid="plan09-source-authorized"]').check()
    await page.locator('[data-testid="plan09-voice-consent"]').check()
    await page.locator('[data-testid="plan09-source-layout"]').selectOption('CLEAN_VOCAL')
    await page.locator('[data-testid="plan09-preview"]').click()
    await page.locator('[data-testid="plan09-preview-result"]').waitFor()
    await page.locator('[data-testid="plan09-draft-engine"]').selectOption('svc')
    await page.locator('[data-testid="plan09-preview"]').click()
    assert.match(await errors.innerText(), /SVC/)
    await page.locator('[data-testid="plan09-draft-engine"]').selectOption('rvc')
    await page.locator('[data-testid="plan09-page-mode-cloud"]').click()
    await page.locator('[data-testid="plan09-delivery"]').check()
    await page.locator('[data-testid="plan09-preview"]').click()
    assert.match(await errors.innerText(), /未授权微信投递/)
    assert.equal(await page.locator('[data-testid="plan09-unsupported"]').count(), 1)
  })
})

await check('plan12 real fixture bridge creates, saves and previews through Core', async () => {
  await singingBridge.reset()
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan12-singing-app"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-testid="plan12-task-id"]').innerText(), /尚未创建/)
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('task:fixture-'), null, { timeout: 15000 })
    const taskId = (await page.locator('[data-testid="plan12-task-id"]').innerText()).replace('任务：', '')
    await page.locator('[data-testid="plan12-execute"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('已保存'), null, { timeout: 15000 })
    assert.match(await page.locator('[data-testid="plan12-state"]').innerText(), /MASTER/)
    assert.match(await page.locator('[data-testid="plan12-state"]').innerText(), /SAVED ≠ SENT/)
    await page.locator('[data-testid="plan12-preview"]').click()
    await page.locator('[data-testid="plan12-preview-result"]').waitFor({ timeout: 5000 })
    const metrics = await fetch(base + '/singing-app/metrics').then((response) => response.json())
    assert.equal(metrics.taskId, taskId)
    assert.equal(metrics.state, 'SAVED')
    assert.equal(metrics.masterCount, 1)
    assert.ok(metrics.preview.byteLength > 0)
    assert.match(metrics.preview.sha256, /^[0-9a-f]{64}$/)
    assert.equal(metrics.preview.sha256, metrics.master.sha256)
    assert.match(await page.locator('[data-testid="plan12-preview-result"]').innerText(), new RegExp(metrics.preview.byteLength + 'B'))
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForTimeout(150)
    assert.equal(await page.locator('[data-testid="plan12-task-id"]').innerText(), '任务：' + taskId)
    const again = await fetch(base + '/singing-app/metrics').then((response) => response.json())
    assert.equal(again.taskId, taskId)
    assert.equal(again.masterCount, 1)
  })
})

await check('plan12 real bridge exposes status and confirmed cancel during a slow run', async () => {
  await singingBridge.reset()
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan12-singing-app"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('task:fixture-'), null, { timeout: 15000 })
    await page.locator('[data-testid="plan12-execute"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('执行中'), null, { timeout: 15000 })
    assert.equal(await page.locator('[data-testid="plan12-cancel"]').isDisabled(), false)
    assert.equal(await page.locator('[data-testid="plan12-status"]').isDisabled(), false)
    await page.locator('[data-testid="plan12-cancel"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('已取消'), null, { timeout: 15000 })
    const metrics = await fetch(base + '/singing-app/metrics').then((response) => response.json())
    assert.equal(metrics.state, 'CANCELLED')
    assert.equal(metrics.masterCount, 0)
    await page.locator('[data-testid="plan12-preview"]').click()
    await page.locator('[data-testid="plan12-error"]').waitFor({ timeout: 5000 })
    assert.match(await page.locator('[data-testid="plan12-error"]').innerText(), /SINGING_APP_NOT_SAVED/)
    assert.equal(await page.locator('[data-testid="plan12-preview-result"]').count(), 0)
  })
})

await check('plan12 without an injected adapter fails closed', async () => {
  await withPage('?bridge=normal&singing=none', async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan12-no-adapter"]').waitFor({ state: 'visible' })
    assert.match(await page.locator('[data-testid="plan12-no-adapter"]').innerText(), /未接入/)
    assert.equal(await page.locator('[data-testid="plan12-create"]').count(), 0)
  })
})

await check('plan12 a delayed A create cannot rebind after selecting B', async () => {
  await singingBridge.reset()
  await fetch(base + '/singing-app/hold-next-create', { method: 'POST' })
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan12-singing-app"]').waitFor({ state: 'visible' })
    const sourceA = await page.locator('[data-testid="plan12-source"] option').first().getAttribute('value')
    const sourceB = await page.locator('[data-testid="plan12-source"] option').nth(1).getAttribute('value')
    await page.locator('[data-testid="plan12-create"]').click()
    let held = null
    for (let attempt = 0; attempt < 30; attempt += 1) {
      held = await fetch(base + '/singing-app/metrics').then((response) => response.json())
      if (held.tasks && held.tasks.length === 1) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(held.tasks.length, 1)
    assert.equal(held.tasks[0].sourceRef, sourceA)
    const taskA = held.tasks[0].taskId
    await page.locator('[data-testid="plan12-source"]').selectOption(sourceB)
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('尚未创建'))
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('task:fixture-'), null, { timeout: 15000 })
    const taskB = (await page.locator('[data-testid="plan12-task-id"]').innerText()).replace('任务：', '')
    assert.notEqual(taskB, taskA)
    await fetch(base + '/singing-app/release-create', { method: 'POST' })
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan12-task-id"]').innerText(), '任务：' + taskB)
    await page.locator('[data-testid="plan12-execute"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('已保存'), null, { timeout: 15000 })
    const metrics = await fetch(base + '/singing-app/metrics').then((response) => response.json())
    assert.equal(metrics.taskId, taskB)
    assert.equal(metrics.sourceRef, sourceB)
    assert.equal(metrics.state, 'SAVED')
    assert.equal(metrics.masterCount, 1)
    const stale = metrics.tasks.find((item) => item.taskId === taskA)
    const current = metrics.tasks.find((item) => item.taskId === taskB)
    assert.equal(stale.state, 'NO_ATTEMPT')
    assert.equal(stale.master, null)
    assert.equal(current.state, 'SAVED')
    assert.equal(current.sourceRef, sourceB)
  })
})

await check('plan12 a late A rejection cannot replace the selected B state', async () => {
  await singingBridge.reset()
  await fetch(base + '/singing-app/hold-next-create', { method: 'POST' })
  await fetch(base + '/singing-app/fail-next-create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'SINGING_APP_REJECTED' }) })
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan12-singing-app"]').waitFor({ state: 'visible' })
    const sourceB = await page.locator('[data-testid="plan12-source"] option').nth(1).getAttribute('value')
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForTimeout(150)
    await page.locator('[data-testid="plan12-source"]').selectOption(sourceB)
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('尚未创建'))
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('task:fixture-'), null, { timeout: 15000 })
    const taskB = (await page.locator('[data-testid="plan12-task-id"]').innerText()).replace('任务：', '')
    await fetch(base + '/singing-app/release-create', { method: 'POST' })
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan12-error"]').count(), 0)
    assert.equal(await page.locator('[data-testid="plan12-task-id"]').innerText(), '任务：' + taskB)
    await page.locator('[data-testid="plan12-execute"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('已保存'), null, { timeout: 15000 })
    const metrics = await fetch(base + '/singing-app/metrics').then((response) => response.json())
    assert.equal(metrics.taskId, taskB)
    assert.equal(metrics.sourceRef, sourceB)
    assert.equal(metrics.masterCount, 1)
  })
})

await check('plan12 late task responses cannot overwrite a switched task', async () => {
  await singingBridge.reset()
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan12-singing-app"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('task:fixture-'), null, { timeout: 15000 })
    const firstTask = (await page.locator('[data-testid="plan12-task-id"]').innerText()).replace('任务：', '')
    await page.locator('[data-testid="plan12-execute"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('执行中'), null, { timeout: 15000 })
    await page.locator('[data-testid="plan12-source"]').selectOption({ index: 1 })
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('尚未创建'))
    await page.locator('[data-testid="plan12-create"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-task-id"]')?.innerText.includes('task:fixture-'), null, { timeout: 15000 })
    const secondTask = (await page.locator('[data-testid="plan12-task-id"]').innerText()).replace('任务：', '')
    assert.notEqual(secondTask, firstTask)
    // Core keeps one active Cover claim: let the switched-away slow task settle before starting B.
    await page.waitForTimeout(1800)
    await page.locator('[data-testid="plan12-execute"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan12-state"]')?.innerText.includes('已保存'), null, { timeout: 15000 })
    await page.waitForTimeout(700)
    assert.equal(await page.locator('[data-testid="plan12-task-id"]').innerText(), '任务：' + secondTask)
    assert.match(await page.locator('[data-testid="plan12-state"]').innerText(), /已保存/)
    const metrics = await fetch(base + '/singing-app/metrics').then((response) => response.json())
    assert.equal(metrics.taskId, secondTask)
    assert.equal(metrics.state, 'SAVED')
    assert.equal(metrics.masterCount, 1)
  })
})

await check('plan09 global setup priority and narrow layout', async () => {
  await withPage('?wizard=1', async (page) => {
    const dialogs = page.getByRole('dialog')
    await dialogs.first().waitFor()
    assert.equal(await dialogs.count(), 1)
    assert.match(await dialogs.first().innerText(), /首次安装向导/)
    assert.equal(await page.locator('[data-testid="plan09-wizard"]').count(), 0)
    await dialogs.first().getByRole('button', { name: '稍后继续', exact: true }).click()
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    assert.equal(await page.getByRole('dialog').count(), 1)
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.setViewportSize({ width: 780, height: 900 })
    await page.waitForTimeout(250)
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, 'plan09 narrow overflow: ' + metrics.scrollWidth + ' > ' + metrics.clientWidth)
    await page.screenshot({ path: path.join(artifactDir, 'plan09-780.png') })
  })
})

await check('dependency wizard is a plugin root-layer dialog: inside root, footer reachable, nav blocked', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    // The in-page entry animation (wv-pagein, `both`) must no longer capture the overlay.
    await page.waitForTimeout(320)
    const metrics = await measureWizard(page)
    const context = JSON.stringify({ root: metrics.root, overlay: metrics.overlay, dialog: metrics.dialog })
    assert.equal(metrics.layerParentClass, 'wv-root')
    assert.equal(metrics.overlayParentIsLayer, true)
    assert.equal(metrics.dialogInPage, false, context)
    assert.equal(metrics.dialogInLayer, true)
    assert.equal(metrics.overlayPosition, 'absolute')
    assert.ok(metrics.layerZIndex !== 'auto' && Number(metrics.layerZIndex) > 3, 'layer z-index ' + metrics.layerZIndex)
    assert.ok(metrics.overlay.w <= metrics.root.w + 1, context)
    assert.ok(metrics.overlay.h <= metrics.root.h + 1, context)
    assert.ok(metrics.dialog.x >= metrics.overlay.x - 1, context)
    assert.ok(metrics.dialog.y >= metrics.overlay.y - 1, context)
    assert.ok(metrics.dialog.right <= metrics.overlay.right + 1, context)
    assert.ok(metrics.dialog.bottom <= metrics.overlay.bottom + 1, context)
    assert.ok(metrics.footer.bottom <= metrics.overlay.bottom + 1, context)
    assert.equal(metrics.navBlocked, true, 'nav hit: ' + metrics.navHitClass)
    assert.ok(metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1, 'body overflow x: ' + metrics.bodyScrollWidth + ' > ' + metrics.bodyClientWidth)
    assert.ok(metrics.docScrollWidth <= metrics.docClientWidth + 1, 'document overflow x')
    assert.equal(metrics.headVisible, true)
    assert.equal(metrics.footerHit, true)
    assert.equal(metrics.ackHit, true)

    // Low height: the dependency list scrolls on its own body and the footer stays reachable.
    await page.setViewportSize({ width: 1440, height: 560 })
    await page.waitForTimeout(250)
    const low = await measureWizard(page)
    assert.ok(low.dialog.bottom <= low.overlay.bottom + 1, JSON.stringify({ dialog: low.dialog, overlay: low.overlay }))
    assert.ok(low.footer.bottom <= low.overlay.bottom + 1)
    const scrolled = await page.evaluate(() => {
      const body = document.querySelector('.wv-dialog-body')
      body.scrollTop = body.scrollHeight
      return { scrollTop: body.scrollTop, max: body.scrollHeight - body.clientHeight }
    })
    assert.ok(scrolled.max > 0, 'the low-height dialog body must scroll: ' + JSON.stringify(scrolled))
    assert.ok(scrolled.scrollTop > 0, 'dialog body did not scroll: ' + JSON.stringify(scrolled))
    assert.equal(await hitTestSelector(page, '[data-testid="plan09-wizard-browse"]'), true)
    assert.equal(await hitTestSelector(page, '[data-testid="plan09-wizard-acknowledge"]'), true)
    const lastInstall = page.locator('[data-testid^="plan09-install-"]').last()
    if (await lastInstall.count()) {
      await lastInstall.scrollIntoViewIfNeeded()
      const handle = await lastInstall.elementHandle()
      const hittable = await page.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)))
      }, handle)
      assert.equal(hittable, true, 'dependent install button not hittable after scrollIntoView')
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.waitForTimeout(250)

    // Close, scroll the page, reopen: the dialog is still a root-layer dialog.
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'hidden' })
    await page.evaluate(() => { const s = document.querySelector('.wv-scroll'); if (s) s.scrollTop = 420 })
    await page.locator('[data-testid="plan09-reopen"]').click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    const reopened = await measureWizard(page)
    assert.equal(reopened.dialogInLayer, true)
    assert.ok(reopened.dialog.bottom <= reopened.overlay.bottom + 1)
    assert.equal(reopened.navBlocked, true)

    // Escape closes and the focus returns to the opener (the dialog never stole it permanently).
    await page.keyboard.press('Escape')
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'hidden' })
    const focusAfter = await page.evaluate(() => {
      const el = document.activeElement
      return el ? { tag: el.tagName, testid: el.getAttribute('data-testid') } : null
    })
    assert.equal(focusAfter.testid, 'plan09-reopen', JSON.stringify(focusAfter))

    // Reduced-motion must not change the containing block of the root layer.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.waitForTimeout(120)
    const reduced = await measureWizard(page)
    assert.equal(reduced.dialogInPage, false)
    assert.equal(reduced.dialogInLayer, true)
    assert.ok(reduced.dialog.bottom <= reduced.overlay.bottom + 1)
    await page.screenshot({ path: path.join(artifactDir, 'wizard-root-layer-1440.png') })
  })
})

await check('dependency wizard fits a narrow simulated host panel and keeps every control reachable', async () => {
  await withPage(normal, async (page) => {
    await page.setViewportSize({ width: 780, height: 620 })
    // A simulated (non-real) host panel: offset, overflow clip, transform and filter ancestors.
    // `min-height:0` also clears the harness' own `min-height:100vh` so the fixture's bottom edge is a
    // real panel edge (RELAY-DEFER-UI-FIXTURE-139) instead of a viewport-height screenshot clip.
    await page.addStyleTag({ content: '#wv-harness-root{position:absolute;left:280px;top:40px;width:500px;height:560px;min-height:0;overflow:hidden;transform:translateZ(0);filter:brightness(1);}' })
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.waitForTimeout(320)
    const metrics = await measureWizard(page)
    const context = JSON.stringify({ layout: metrics.layout, root: metrics.root, overlay: metrics.overlay, dialog: metrics.dialog })
    assert.equal(metrics.layout, 'narrow', 'root width ' + metrics.root.w)
    assert.equal(metrics.dialogInPage, false, context)
    assert.equal(metrics.dialogInLayer, true)
    assert.ok(metrics.overlay.x >= metrics.root.x - 1 && metrics.overlay.right <= metrics.root.right + 1, context)
    assert.ok(metrics.dialog.x >= metrics.overlay.x - 1 && metrics.dialog.right <= metrics.overlay.right + 1, context)
    assert.ok(metrics.dialog.bottom <= metrics.overlay.bottom + 1, context)
    assert.ok(metrics.footer.bottom <= metrics.overlay.bottom + 1, context)
    assert.ok(metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1, 'narrow body overflow x: ' + metrics.bodyScrollWidth + ' > ' + metrics.bodyClientWidth)
    assert.equal(metrics.modeColumns, 1, 'mode cards should stack in the narrow panel, got ' + metrics.modeColumns)
    assert.equal(metrics.depStacked, true, 'dependency rows should stack in the narrow panel')
    assert.equal(metrics.footerHit, true)
    assert.equal(metrics.ackHit, true)
    assert.equal(await hitTestSelector(page, '[data-testid="plan09-wizard-browse"]'), true)
    const lastInstall = page.locator('[data-testid^="plan09-install-"]').last()
    await lastInstall.scrollIntoViewIfNeeded()
    const handle = await lastInstall.elementHandle()
    const hittable = await page.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return Boolean(hit && (hit === el || el.contains(hit) || hit.contains(el)))
    }, handle)
    assert.equal(hittable, true, 'install button not hittable in narrow panel')
    await page.screenshot({ path: path.join(artifactDir, 'wizard-narrow-host-780.png') })
  })
})

await check('dependency wizard keeps an opaque surface when a host theme token is missing', async () => {
  await withPage(normal, async (page) => {
    await page.addStyleTag({ content: ':root{--dsw-alias-bg-overlay:initial;}' })
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.waitForTimeout(200)
    const styles = await page.evaluate(() => {
      const root = document.querySelector('.wv-root')
      const dialog = document.querySelector('.wv-dialog')
      const overlay = document.querySelector('.wv-overlay')
      // Chromium may serialize a color-mix() result as `color(srgb ...)`, so the alpha is read from
      // either the legacy rgb()/rgba() form or the modern color() form.
      const alphaOf = (value) => {
        const rgba = /rgba?\(([^)]+)\)/.exec(value)
        if (rgba) {
          const parts = rgba[1].split(/[,/ ]+/).filter(Boolean).map(Number)
          return parts.length === 4 ? parts[3] : 1
        }
        const modern = /color\([^)]*\/\s*([0-9.]+)\s*\)/.exec(value)
        if (modern) return Number(modern[1])
        if (value === 'transparent') return 0
        return 1
      }
      const cs = getComputedStyle(dialog)
      const overlayCs = getComputedStyle(overlay)
      return {
        overlayToken: getComputedStyle(root).getPropertyValue('--wv-overlay').trim(),
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        dialogAlpha: alphaOf(cs.backgroundColor),
        overlayBackground: overlayCs.backgroundColor,
        overlayAlpha: alphaOf(overlayCs.backgroundColor),
      }
    })
    assert.ok(styles.overlayToken.length > 0, 'local overlay fallback missing: ' + JSON.stringify(styles))
    assert.ok(styles.backgroundColor !== '' && styles.backgroundColor !== 'transparent', 'dialog background is not resolved: ' + styles.backgroundColor)
    assert.equal(styles.dialogAlpha, 1, 'dialog surface must stay opaque: ' + styles.backgroundColor)
    assert.ok(styles.backgroundImage.includes('gradient'), 'expected the themed gradient layer')
    assert.ok(styles.overlayBackground !== '' && styles.overlayBackground !== 'transparent', 'overlay scrim is not resolved: ' + styles.overlayBackground)
    assert.ok(styles.overlayAlpha > 0, 'overlay scrim disappeared: ' + styles.overlayBackground)
  })
})

await check('plan09 scoped dependency evidence resets on context change and uses actual source layout', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-check-gpu"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-gpu"]')?.getAttribute('data-state') === 'ready')
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ profile: 'second-profile', capabilityRevision: 9, gpuAvailable: false }))
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-reopen"]').click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    assert.notEqual(await page.locator('[data-testid="plan09-dep-gpu"]').getAttribute('data-state'), 'ready')
    await page.locator('[data-testid="plan09-check-gpu"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-gpu"]')?.getAttribute('data-state') === 'unavailable')
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'hidden' })
    await page.locator('[data-testid="plan09-source-layout"]').selectOption('CLEAN_VOCAL')
    await page.locator('[data-testid="plan09-reopen"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-separation"]').count(), 0)
    assert.equal(await page.locator('[data-testid="plan09-dep-rvc"]').count(), 1)
  })
})

await check('plan09 keeps authority after UNKNOWN and edits', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.unknownNextExecute())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-unknown')
    await page.locator('[data-testid="plan09-draft-text"]').fill('编辑后的未知事务文本')
    await page.waitForTimeout(250)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true)
    await page.locator('[data-testid="plan09-read-status"]').click()
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-unknown')
  })
})

await check('plan09 late execute keeps authority and context change blocks confirm', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextExecute())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForTimeout(200)
    await page.locator('[data-testid="plan09-draft-text"]').fill('执行发出后再编辑')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseExecute())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    assert.notEqual(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '')
  })
})

await check('plan09 context change blocks a prepared plan', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 11 }))
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true)
  })
})

await check('plan09 adapter failures clear busy and keep transaction authority', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.nullNextPrepare())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForTimeout(800)
    const nullPhase = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase')
    const nullError = await page.locator('[data-testid="plan09-tx-error"]').count() ? await page.locator('[data-testid="plan09-tx-error"]').innerText() : ''
    assert.equal(nullPhase, 'FAILED', 'null prepare phase=' + nullPhase + ' err=' + nullError)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-busy'), '0')

    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.throwNextExecute())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-busy'), '0')
    assert.match(await page.locator('[data-testid="plan09-tx-panel"]').innerText(), /RESPONSE_LOST/)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '')
    assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), true)

    // The unresolved latch is local to this demo page and deliberately not clearable from the UI.
    await page.reload({ waitUntil: 'load' })
    await page.waitForFunction(() => window.__WHALE_HARNESS_READY__ === true, null, { timeout: 10000 })
    await page.waitForTimeout(700)
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    if (await page.locator('[data-testid="plan09-wizard"]').count()) await page.locator('[data-testid="plan09-wizard-browse"]').click()

    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    const txId = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx')
    assert.notEqual(txId, '')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.throwNextApply())
    await page.locator('[data-testid="plan09-apply-check"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), txId)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.throwNextRecover())
    await page.locator('[data-testid="plan09-read-status"]').click()
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), txId)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'UNKNOWN')
  })
})


await check('plan09 keeps an unresolved UNKNOWN across edits and manifest revisions', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.unknownNextExecute())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-unknown')
    await page.locator('[data-testid="plan09-draft-text"]').fill('编辑后仍然是未知事务')
    await page.waitForTimeout(250)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-unknown')
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), true)

    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ manifestRevision: 9 }))
    await page.waitForTimeout(350)
    if (await page.locator('[data-testid="plan09-wizard"]').count()) await page.locator('[data-testid="plan09-wizard-browse"]').click()
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'UNKNOWN', 'manifest switch must not clear the pending transaction')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-unknown')
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true)

    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ manifestRevision: 2 }))
    await page.waitForTimeout(350)
    if (await page.locator('[data-testid="plan09-wizard"]').count()) await page.locator('[data-testid="plan09-wizard-browse"]').click()
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-unknown')
  })
})

await check('plan09 does not accept an empty or ok-only save response as success', async () => {
  for (const kind of ['null', 'object', 'okonly']) {
    await withPage(normal, async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.evaluate((mode) => window.__WHALE_PLAN09_CONFIG__.emptyNextExecuteResponse(mode), kind)
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
      await page.locator('[data-testid="plan09-confirm-save"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
      assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '', kind)
      assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true, kind)
      assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), true, kind)
    })
  }
})

await check('plan09 keeps the in-flight mutex when the draft is edited during execute', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextExecute())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForTimeout(200)
    await page.locator('[data-testid="plan09-draft-text"]').fill('保存发出后立刻编辑')
    await page.waitForTimeout(250)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-busy'), '1')
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseExecute())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    assert.notEqual(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '')
  })
})

await check('plan09 discards a prepare that returns after the draft changed', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForTimeout(150)
    await page.locator('[data-testid="plan09-draft-text"]').fill('准备期间编辑过的文本')
    await page.waitForTimeout(120)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-busy'), '1')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releasePrepare())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'DIRTY')
    assert.match(await page.locator('[data-testid="plan09-tx-panel"]').innerText(), /STALE_PREPARE/)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
  })
})

await check('plan09 re-prepares a frozen plan after the draft changed across pages', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-draft-voice"]').selectOption('demo-voice-b')
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.waitForTimeout(350)
    assert.equal(await page.locator('[data-testid="plan09-tx-content-mismatch"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
  })
})

await check('plan09 ends a trusted not-written failure and prepares a new draft', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.failNextExecuteWithoutWrite())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'FAILED')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-failed')
    assert.equal(await page.locator('[data-testid="plan09-tx-no-write"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), false)

    await page.locator('[data-testid="plan09-read-status"]').click()
    await page.waitForTimeout(400)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'FAILED')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), 'fixture-tx-failed')
    assert.equal(await page.locator('[data-testid="plan09-tx-no-write"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), false)

    await page.locator('[data-testid="plan09-tx-reset"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'DIRTY')
    assert.equal(await page.locator('[data-testid="plan09-tx-history"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '')
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
  })
})

await check('plan09 re-prepares after the context changed during prepare', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('prepareChange'), null, { timeout: 8000 })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 11 }))
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releasePrepare())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 0)
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
  })
})

await check('plan09 cancels old-identity checks when the profile changes', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextCheck())
    await page.locator('[data-testid="plan09-check-core"]').click()
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('check:core'), null, { timeout: 8000 })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ profile: 'second-profile' }))
    await page.waitForTimeout(450)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseCheck({ ready: true }))
    await page.waitForTimeout(450)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ profile: 'fixture-profile' }))
    await page.waitForTimeout(450)
    if (await page.locator('[data-testid="plan09-wizard"]').count() === 0) await page.locator('[data-testid="plan09-reopen"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'cancelled')
    await page.waitForTimeout(300)
    assert.notEqual(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'ready')
  })
})

await check('plan09 cancels old-identity checks when the capability revision changes', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextCheck())
    await page.locator('[data-testid="plan09-check-gpu"]').click()
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('check:gpu'), null, { timeout: 8000 })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 12 }))
    await page.waitForTimeout(450)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseCheck({ ready: true }))
    await page.waitForTimeout(450)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 1 }))
    await page.waitForTimeout(450)
    if (await page.locator('[data-testid="plan09-wizard"]').count() === 0) await page.locator('[data-testid="plan09-reopen"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-gpu"]').getAttribute('data-state'), 'cancelled')
  })
})

await check('plan09 recovers a late prepare after returning from another page', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('prepareChange'), null, { timeout: 8000 })
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await closePlan09Wizard(page)
    await page.waitForTimeout(250)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 11 }))
    await page.waitForTimeout(350)
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await closePlan09Wizard(page)
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releasePrepare())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 0)
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
  })
})

await check('plan09 marks a late prepare stale for manifest and delivery variants', async () => {
  for (const patch of [{ manifestRevision: 9 }, { deliveryAuthorized: true }]) {
    await withPage(normal, async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('prepareChange'), null, { timeout: 8000 })
      await page.getByRole('button', { name: '唱歌', exact: true }).click()
      await closePlan09Wizard(page)
      await page.waitForTimeout(250)
      await page.evaluate((value) => window.__WHALE_PLAN09_CONFIG__.setContext(value), patch)
      await page.waitForTimeout(350)
      await closePlan09Wizard(page)
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.waitForTimeout(400)
      if (await page.locator('[data-testid="plan09-wizard"]').count()) await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releasePrepare())
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
      assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 1, JSON.stringify(patch))
      assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false, JSON.stringify(patch))
    })
  }
})

await check('plan09 keeps a valid confirmation when the context completes before return or reverts', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('prepareChange'), null, { timeout: 8000 })
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await closePlan09Wizard(page)
    await page.waitForTimeout(250)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 12 }))
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releasePrepare())
    await page.waitForTimeout(450)
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await closePlan09Wizard(page)
    await page.waitForTimeout(400)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'PREPARED')
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
  })
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('prepareChange'), null, { timeout: 8000 })
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await closePlan09Wizard(page)
    await page.waitForTimeout(250)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 13 }))
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 1 }))
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await closePlan09Wizard(page)
    await page.waitForTimeout(400)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releasePrepare())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    assert.equal(await page.locator('[data-testid="plan09-tx-stale"]').count(), 0)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), false)
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
  })
})

await check('plan09 recovers a late prepare failure or empty answer after unmount', async () => {
  for (const kind of ['throw', 'null', 'object']) {
    await withPage(normal, async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextPrepare())
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('prepareChange'), null, { timeout: 8000 })
      await page.getByRole('button', { name: '唱歌', exact: true }).click()
      await closePlan09Wizard(page)
      await page.waitForTimeout(250)
      await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ capabilityRevision: 14 }))
      await closePlan09Wizard(page)
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await closePlan09Wizard(page)
      await page.waitForTimeout(400)
      await page.evaluate((mode) => window.__WHALE_PLAN09_CONFIG__.releasePrepare(mode), kind)
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'FAILED', null, { timeout: 8000 })
      assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false, kind)
      assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true, kind)
    })
  }
})

await check('plan09 hides the no-write note once a status check is unknown', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.failNextExecuteWithoutWrite())
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'FAILED')
    assert.equal(await page.locator('[data-testid="plan09-tx-no-write"]').count(), 1)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.unknownNextRecover())
    await page.locator('[data-testid="plan09-read-status"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-tx-no-write"]').count(), 0)
    assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true)
  })
})

await check('plan09 cancels a pending shared check when the wizard closes', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextCheck())
    await page.locator('[data-testid="plan09-check-core"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-core"]')?.getAttribute('data-state') === 'checking')
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('check:core'), null, { timeout: 8000 })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-reopen"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'cancelled')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseCheck({ ready: true }))
    await page.waitForTimeout(350)
    assert.equal(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'cancelled')
    await page.locator('[data-testid="plan09-check-core"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-core"]')?.getAttribute('data-state') === 'ready')
  })
})

await check('plan09 shared pending evidence is not stuck after another page opens it', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextCheck())
    await page.locator('[data-testid="plan09-check-core"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-core"]')?.getAttribute('data-state') === 'checking')
    await page.waitForFunction(() => (window.__WHALE_PLAN09_ADAPTER_CALLS__ || []).includes('check:core'), null, { timeout: 8000 })
    await closePlan09Wizard(page)
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    assert.notEqual(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'checking')
    assert.equal(await page.locator('[data-testid="plan09-check-core"]').isDisabled(), false)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseCheck({ ready: true }))
    await page.waitForTimeout(350)
    assert.notEqual(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'ready')
  })
})

await check('plan09 keeps in-flight authority across pages', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-draft-voice"]').selectOption('demo-voice-b')
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextExecute())
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForTimeout(200)
    await page.getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-confirm-save"]').isDisabled(), true)
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseExecute())
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    assert.notEqual(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '')
  })
})

await check('plan09 honours a legitimate UNKNOWN without allowing apply', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.unknownNextApply())
    await page.locator('[data-testid="plan09-apply-check"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
    assert.equal(await page.locator('[data-testid="plan09-apply-check"]').isDisabled(), true)
    assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), true)
  })
})

await check('plan09 allows a new cycle after APPLIED', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.appliedNextApply())
    await page.locator('[data-testid="plan09-apply-check"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'APPLIED')
    await page.locator('[data-testid="plan09-tx-reset"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'DIRTY')
    assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
  })
})

await check('plan09 does not carry a transaction into another profile', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-prepare"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
    await page.locator('[data-testid="plan09-confirm-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ profile: 'other-profile' }))
    await page.waitForTimeout(400)
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '')
    assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'DIRTY')
  })
})

await check('plan09 shares core evidence and clears preview on authorization revoke', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-check-core"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="plan09-dep-core"]')?.getAttribute('data-state') === 'ready')
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[data-testid="plan09-dep-core"]').getAttribute('data-state'), 'ready')
    await page.locator('[data-testid="plan09-wizard-browse"]').click()

    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    if (await page.locator('[data-testid="plan09-wizard"]').count() === 0) await page.locator('[data-testid="plan09-reopen"]').click()
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ cloudAuthorized: true }))
    await page.locator('[data-testid="plan09-draft-engine"]').selectOption('cloud')
    await page.locator('[data-testid="plan09-preview"]').click()
    await page.locator('[data-testid="plan09-preview-result"]').waitFor()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.setContext({ cloudAuthorized: false }))
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-testid="plan09-preview-result"]').count(), 0)
    await page.locator('[data-testid="plan09-prepare"]').click()
    assert.match(await page.locator('[data-testid="plan09-errors"]').innerText(), /尚未授权/)
  })
})


await check('plan09 cancels pending dependency checks on mode change', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.deferNextCheck())
    await page.locator('[data-testid="plan09-check-gpu"]').click()
    await page.locator('[data-testid="plan09-mode-cpu"]').click()
    await page.evaluate(() => window.__WHALE_PLAN09_CONFIG__.releaseCheck({ ready: true }))
    await page.waitForTimeout(400)
    await page.locator('[data-testid="plan09-mode-local"]').click()
    assert.notEqual(await page.locator('[data-testid="plan09-dep-gpu"]').getAttribute('data-state'), 'ready')
  })
})

await check('plan09 existing mode and manual gateway stay consistent', async () => {
  await withPage(normal, async (page) => {
    await page.getByRole('button', { name: '唱歌', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-page-mode-existing"]').click()
    assert.equal(await page.locator('[data-testid="plan09-draft-engine"]').inputValue(), 'gateway')
    await page.locator('[data-testid="plan09-reopen"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-gateway"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-dep-rvc"]').count(), 0)
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.getByRole('button', { name: '语音气泡', exact: true }).click()
    await page.locator('[data-testid="plan09-wizard-browse"]').click()
    await page.locator('[data-testid="plan09-draft-engine"]').selectOption('cloud')
    assert.match(await page.locator('[data-testid="plan09-mode-summary"]').innerText(), /云端服务/)
    await page.locator('[data-testid="plan09-reopen"]').click()
    assert.equal(await page.locator('[data-testid="plan09-dep-cloud"]').count(), 1)
    assert.equal(await page.locator('[data-testid="plan09-dep-gpu"]').count(), 0)
  })
})


await check('plan09 browser calls a real isolated Coordinator end to end', async () => {
  const sandbox = createConfigSandbox()
  try {
    const bridge = createFixtureSource('bridgeVoice', { document: { schemaVersion: 1, enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1', allowedTargets: ['fixture-private-target'], token: 'fixture-bridge-token' } })
    const sender = createFixtureSource('senderService', { document: { schemaVersion: 1, tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' }, automation: 'manual', allowedChats: ['fixture-private-target'], token: 'fixture-sender-token' } })
    const core = createFixtureSource('core', { document: { schemaVersion: 1, qwenUrl: 'http://127.0.0.1:8765', roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' }, token: 'fixture-core-token' } })
    const worker = createFixtureSource('workerSafety', { document: { schemaVersion: 1, voice_enabled: true, voice_auto_mode: 'manual', token: 'fixture-worker-token' } })
    const permissions = createFixtureSource('wechatPermissions', { document: { schemaVersion: 1, wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' }, token: 'fixture-wechat-token' } })
    const coordinator = createConfigCoordinator({ sandbox, sources: { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions } })
    const bridgeContext = { workspace: 'fixture-workspace', profile: 'fixture-profile', manifestRevision: 2, capabilityRevision: 1, senderRevision: sender.revision, gpuAvailable: true, cloudAuthorized: false, deliveryAuthorized: false }
    await withPage('?plan09=real', async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.locator('[data-testid="plan09-preview"]').click()
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForTimeout(1200)
      const phaseAfterPrepare = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase')
      const errAfterPrepare = await page.locator('[data-testid="plan09-tx-error"]').count() ? await page.locator('[data-testid="plan09-tx-error"]').innerText() : ''
      assert.equal(phaseAfterPrepare, 'PREPARED', 'prepare phase=' + phaseAfterPrepare + ' err=' + errAfterPrepare)
      const frozen = await page.locator('[data-testid="plan09-frozen-preview"]').innerText()
      assert.match(frozen, /demo-voice-a/)
      await page.locator('[data-testid="plan09-confirm-save"]').click()
      await page.waitForTimeout(1500)
      const phaseAfterSave = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase')
      const errAfterSave = await page.locator('[data-testid="plan09-tx-error"]').count() ? await page.locator('[data-testid="plan09-tx-error"]').innerText() : ''
      assert.equal(phaseAfterSave, 'SAVED', 'save phase=' + phaseAfterSave + ' err=' + errAfterSave)
      assert.equal(sender.document.tts.voice, 'demo-voice-a')
      assert.equal(sender.saveCount, 1)
      await page.locator('[data-testid="plan09-apply-check"]').click()
      await page.waitForTimeout(1500)
      const phaseAfterApply = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase')
      const errAfterApply = await page.locator('[data-testid="plan09-tx-error"]').count() ? await page.locator('[data-testid="plan09-tx-error"]').innerText() : ''
      assert.equal(phaseAfterApply, 'PENDING_APPLY', 'apply phase=' + phaseAfterApply + ' err=' + errAfterApply)
      const calls = await page.evaluate(() => window.__WHALE_PLAN09_ADAPTER_CALLS__ || [])
      assert.ok(calls.includes('prepareChange') && calls.includes('execute') && calls.includes('apply'))
    }, async (page) => {
      await page.exposeFunction('__p9prepare', (draft) => coordinator.prepareChange(draft))
      await page.exposeFunction('__p9execute', (planId, options) => coordinator.execute(planId, options))
      await page.exposeFunction('__p9apply', (transactionId, options) => coordinator.apply(transactionId, options))
      await page.exposeFunction('__p9recover', (transactionId) => coordinator.recover(transactionId))
      await page.addInitScript((context) => {
        window.__PLAN09_REAL__ = {
          context,
          prepare: (draft) => window.__p9prepare(draft),
          execute: (planId, options) => window.__p9execute(planId, options),
          apply: (transactionId, options) => window.__p9apply(transactionId, options),
          recover: (transactionId) => window.__p9recover(transactionId),
          check: () => ({ ready: true }),
        }
      }, bridgeContext)
    })
  } finally {
    await rm(sandbox.root, { recursive: true, force: true })
  }
})

async function checkRealResponseFault(fault) {
  const sandbox = createConfigSandbox()
  try {
    const bridge = createFixtureSource('bridgeVoice', { document: { schemaVersion: 1, enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1', allowedTargets: ['fixture-private-target'], token: 'fixture-bridge-token' } })
    const sender = createFixtureSource('senderService', { document: { schemaVersion: 1, tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' }, automation: 'manual', allowedChats: ['fixture-private-target'], token: 'fixture-sender-token' } })
    const core = createFixtureSource('core', { document: { schemaVersion: 1, qwenUrl: 'http://127.0.0.1:8765', roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' }, token: 'fixture-core-token' } })
    const worker = createFixtureSource('workerSafety', { document: { schemaVersion: 1, voice_enabled: true, voice_auto_mode: 'manual', token: 'fixture-worker-token' } })
    const permissions = createFixtureSource('wechatPermissions', { document: { schemaVersion: 1, wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' }, token: 'fixture-wechat-token' } })
    const coordinator = createConfigCoordinator({ sandbox, sources: { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions } })
    const bridgeContext = { workspace: 'fixture-workspace', profile: 'fixture-profile', manifestRevision: 2, capabilityRevision: 1, senderRevision: sender.revision, gpuAvailable: true, cloudAuthorized: false, deliveryAuthorized: false }
    await withPage('?plan09=real', async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
      await page.locator('[data-testid="plan09-confirm-save"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'UNKNOWN')
      assert.equal(sender.saveCount, 1, 'the real save happened before the response fault: ' + fault)
      assert.equal(sender.document.tts.voice, 'demo-voice-a', fault)
      assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), '', fault)
      assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), true, fault)
      assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), true, fault)
      assert.match(await page.locator('[data-testid="plan09-tx-panel"]').innerText(), /未知|未收到|无法/, fault)
    }, async (page) => {
      await page.exposeFunction('__p9prepare', (draft) => coordinator.prepareChange(draft))
      await page.exposeFunction('__p9execute', (planId, options) => coordinator.execute(planId, options))
      await page.exposeFunction('__p9apply', (transactionId, options) => coordinator.apply(transactionId, options))
      await page.exposeFunction('__p9recover', (transactionId) => coordinator.recover(transactionId))
      await page.addInitScript((payload) => {
        window.__PLAN09_REAL__ = {
          context: payload.context,
          prepare: (draft) => window.__p9prepare(draft),
          execute: async (planId, options) => {
            const result = await window.__p9execute(planId, options)
            if (payload.fault === 'lost') throw new Error('response channel lost after the real save')
            if (payload.fault === 'null') return null
            if (payload.fault === 'okonly') return { ok: true }
            return {}
          },
          apply: (transactionId, options) => window.__p9apply(transactionId, options),
          recover: (transactionId) => window.__p9recover(transactionId),
          check: () => ({ ready: true }),
        }
      }, { context: bridgeContext, fault })
    })
  } finally {
    await rm(sandbox.root, { recursive: true, force: true })
  }
}

async function checkRealNotWrittenFailure() {
  const sandbox = createConfigSandbox()
  try {
    const bridge = createFixtureSource('bridgeVoice', { document: { schemaVersion: 1, enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1', allowedTargets: ['fixture-private-target'], token: 'fixture-bridge-token' } })
    const sender = createFixtureSource('senderService', {
      document: { schemaVersion: 1, tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' }, automation: 'manual', allowedChats: ['fixture-private-target'], token: 'fixture-sender-token' },
      saveFailure: 'CONFIG_COORDINATION_SAVE_FAILED',
      saveFailureOutcome: 'NOT_WRITTEN',
    })
    const core = createFixtureSource('core', { document: { schemaVersion: 1, qwenUrl: 'http://127.0.0.1:8765', roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' }, token: 'fixture-core-token' } })
    const worker = createFixtureSource('workerSafety', { document: { schemaVersion: 1, voice_enabled: true, voice_auto_mode: 'manual', token: 'fixture-worker-token' } })
    const permissions = createFixtureSource('wechatPermissions', { document: { schemaVersion: 1, wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' }, token: 'fixture-wechat-token' } })
    const coordinator = createConfigCoordinator({ sandbox, sources: { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions } })
    const bridgeContext = { workspace: 'fixture-workspace', profile: 'fixture-profile', manifestRevision: 2, capabilityRevision: 1, senderRevision: sender.revision, gpuAvailable: true, cloudAuthorized: false, deliveryAuthorized: false }
    await withPage('?plan09=real', async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
      await page.locator('[data-testid="plan09-confirm-save"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'FAILED', null, { timeout: 15000 })
      const txId = await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx')
      assert.notEqual(txId, '', 'a determinate no-write failure still has a transaction id')
      assert.equal(await page.locator('[data-testid="plan09-tx-no-write"]').count(), 1)
      assert.equal(sender.saveCount, 1)
      assert.equal(sender.document.tts.voice, 'whale-v1')
      assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), false)

      await page.locator('[data-testid="plan09-read-status"]').click()
      await page.waitForTimeout(1200)
      assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-phase'), 'FAILED')
      assert.equal(await page.locator('[data-testid="plan09-tx-panel"]').getAttribute('data-tx'), txId)
      assert.equal(await page.locator('[data-testid="plan09-tx-no-write"]').count(), 1)
      assert.equal(await page.locator('[data-testid="plan09-tx-reset"]').isDisabled(), false)

      await page.locator('[data-testid="plan09-tx-reset"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'DIRTY')
      assert.equal(await page.locator('[data-testid="plan09-tx-history"]').count(), 1)
      assert.equal(await page.locator('[data-testid="plan09-prepare"]').isDisabled(), false)
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
      assert.equal(sender.saveCount, 1, 'ending the association must not replay the consumed plan')
    }, async (page) => {
      await page.exposeFunction('__p9prepare', (draft) => coordinator.prepareChange(draft))
      await page.exposeFunction('__p9execute', (planId, options) => coordinator.execute(planId, options))
      await page.exposeFunction('__p9apply', (transactionId, options) => coordinator.apply(transactionId, options))
      await page.exposeFunction('__p9recover', (transactionId) => coordinator.recover(transactionId))
      await page.addInitScript((context) => {
        window.__PLAN09_REAL__ = {
          context,
          prepare: (draft) => window.__p9prepare(draft),
          execute: (planId, options) => window.__p9execute(planId, options),
          apply: (transactionId, options) => window.__p9apply(transactionId, options),
          recover: (transactionId) => window.__p9recover(transactionId),
          check: () => ({ ready: true }),
        }
      }, bridgeContext)
    })
  } finally {
    await rm(sandbox.root, { recursive: true, force: true })
  }
}

await check('plan09 real not-written failure can end and prepare a new draft', checkRealNotWrittenFailure)

await check('plan09 real lost or empty save responses stay UNKNOWN without claiming failure', async () => {
  for (const fault of ['lost', 'null', 'okonly', 'object']) await checkRealResponseFault(fault)
})

async function checkRealProviderMode(mode, expectedProvider) {
  const sandbox = createConfigSandbox()
  try {
    const bridge = createFixtureSource('bridgeVoice', { document: { schemaVersion: 1, enabled: false, mode: 'explicit', forGroup: false, autoProbability: 0, defaultVoice: 'whale-v1', allowedTargets: ['fixture-private-target'], token: 'fixture-bridge-token' } })
    const sender = createFixtureSource('senderService', { document: { schemaVersion: 1, tts: { provider: 'qwen-local', model: 'Qwen3-TTS-12Hz-1.7B-Base', voice: 'whale-v1', baseUrl: 'http://127.0.0.1:8765' }, automation: 'manual', allowedChats: ['fixture-private-target'], token: 'fixture-sender-token' } })
    const core = createFixtureSource('core', { document: { schemaVersion: 1, qwenUrl: 'http://127.0.0.1:8765', roots: { wechatAgent: 'fixture-root', sender: 'fixture-root' }, token: 'fixture-core-token' } })
    const worker = createFixtureSource('workerSafety', { document: { schemaVersion: 1, voice_enabled: true, voice_auto_mode: 'manual', token: 'fixture-worker-token' } })
    const permissions = createFixtureSource('wechatPermissions', { document: { schemaVersion: 1, wechat: { whitelist: ['fixture-private-target'], wake_mode: 'explicit' }, token: 'fixture-wechat-token' } })
    const coordinator = createConfigCoordinator({ sandbox, sources: { bridgeVoice: bridge, senderService: sender, core, workerSafety: worker, wechatPermissions: permissions } })
    const bridgeContext = { workspace: 'fixture-workspace', profile: 'fixture-profile', manifestRevision: 2, capabilityRevision: 1, senderRevision: sender.revision, gpuAvailable: true, cloudAuthorized: true, deliveryAuthorized: false }
    await withPage('?plan09=real', async (page) => {
      await page.getByRole('button', { name: '语音气泡', exact: true }).click()
      await page.locator('[data-testid="plan09-wizard"]').waitFor({ state: 'visible' })
      await page.locator('[data-testid="plan09-wizard-browse"]').click()
      if (mode === 'existing') await page.locator('[data-testid="plan09-page-mode-existing"]').click()
      else await page.locator('[data-testid="plan09-draft-engine"]').selectOption('cloud')
      await page.locator('[data-testid="plan09-prepare"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'PREPARED')
      await page.locator('[data-testid="plan09-confirm-save"]').click()
      await page.waitForFunction(() => document.querySelector('[data-testid="plan09-tx-panel"]')?.getAttribute('data-phase') === 'SAVED')
      assert.equal(sender.document.tts.provider, expectedProvider)
      assert.equal(sender.saveCount, 1)
    }, async (page) => {
      await page.exposeFunction('__p9prepare', (draft) => coordinator.prepareChange(draft))
      await page.exposeFunction('__p9execute', (planId, options) => coordinator.execute(planId, options))
      await page.exposeFunction('__p9apply', (transactionId, options) => coordinator.apply(transactionId, options))
      await page.exposeFunction('__p9recover', (transactionId) => coordinator.recover(transactionId))
      await page.addInitScript((context) => {
        window.__PLAN09_REAL__ = {
          context,
          prepare: (draft) => window.__p9prepare(draft),
          execute: (planId, options) => window.__p9execute(planId, options),
          apply: (transactionId, options) => window.__p9apply(transactionId, options),
          recover: (transactionId) => window.__p9recover(transactionId),
          check: () => ({ ready: true }),
        }
      }, bridgeContext)
    })
  } finally {
    await rm(sandbox.root, { recursive: true, force: true })
  }
}

await check('plan09 real Coordinator accepts the cloud provider mapping', async () => {
  await checkRealProviderMode('cloud', 'cloud')
})

await check('plan09 real Coordinator accepts the existing/custom provider mapping', async () => {
  await checkRealProviderMode('existing', 'custom')
})

await check('no console errors or failed resources', async () => {
  // The single expected console entry is the disabled-generation scene: its deliberate request to the
  // real Host route returns the 503 `generation_not_enabled` that the page must surface. All other
  // scenes must stay clean.
  const expectedDisabled503 = (item) => (item.scene === '?bridge=normal&generation=off' || item.scene === '?bridge=normal&generation=failed')
    && item.type === 'error'
    && /Failed to load resource: the server responded with a status of 503/.test(item.text)
  const errors = consoleMessages.filter((item) => (item.type === 'error' || item.type === 'pageerror') && !expectedDisabled503(item))
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
await singingBridge.close()
await hostGeneration.close()
await hostSettings.close()
await new Promise((resolve) => server.close(resolve))
if (results.some((item) => item.result !== 'PASS')) process.exitCode = 1
