/* Test-only child for 165: start one persistent generation and stay in progress until the parent
 * kills this process, so a real interrupted `BEGINNING` claim is left in the shared storage location.
 * Nothing here is imported by the plugin. */

import { openConfigStorage } from '../core/config-sandbox.mjs'
import { openQwenGenerationRuntime } from '../core/qwen-generation-runtime.mjs'

const [root, allowedRoot, worker, scopeId, rightsProofRef] = process.argv.slice(2)

const opened = await openQwenGenerationRuntime({
  sandbox: openConfigStorage({ root }),
  scopeId,
  rightsProofRef,
  allowedRoot,
  worker: { command: worker, runtime: process.execPath, args: ['--mode=ok', '--synth-delay-ms=5000'] },
  requestTimeoutMs: 30000,
  handshakeTimeoutMs: 5000,
  shutdownGraceMs: 500,
  killWaitMs: 300,
})
if (!opened.ok) {
  process.stderr.write('child runtime unavailable: ' + (opened.code || 'UNKNOWN') + '\n')
  process.exit(2)
}

process.stdout.write('ready\n')
const generated = await opened.value.app.generate({
  text: '这条生成会在中途被中断。',
  voiceId: 'demo-voice-a',
  language: 'zh-CN',
})
process.stdout.write(JSON.stringify(generated) + '\n')
await opened.value.close()
