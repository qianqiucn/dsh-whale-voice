import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, 'node_modules', 'playwright', 'cli.js')
if (!existsSync(cli)) {
  console.error('Pinned Playwright is not installed. Run: npm.cmd install --prefix tests/ui')
  process.exit(1)
}
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' })
if (result.error) {
  console.error(String(result.error.message || result.error))
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
