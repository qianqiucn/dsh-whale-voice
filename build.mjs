import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'client.css'), 'utf8')
const pages = readFileSync(join(here, 'pages.js'), 'utf8')
const setup = readFileSync(join(here, 'setup.js'), 'utf8')
const setupStatus = readFileSync(join(here, 'core', 'setup-status.mjs'), 'utf8').replace(/^export\s+/gm, '')
const view = readFileSync(join(here, 'core', 'view.mjs'), 'utf8').replace(/^export\s+/gm, '')
const capabilityView = readFileSync(join(here, 'core', 'capability-view.mjs'), 'utf8').replace(/^export\s+/gm, '')
let js = readFileSync(join(here, 'client.template.js'), 'utf8')

if (!js.includes('// __PAGES__')) throw new Error('client.template.js is missing the __PAGES__ marker')
if (!js.includes('__WHALE_CSS__')) throw new Error('client.template.js is missing __WHALE_CSS__')
js = js.replace('// __PAGES__', setupStatus + '\n' + view + '\n' + capabilityView + '\n' + pages + '\n' + setup)
js = js.replace('__WHALE_CSS__', JSON.stringify(css))
writeFileSync(join(here, 'client.js'), js, 'utf8')
console.log('built client.js', js.length, 'bytes')
