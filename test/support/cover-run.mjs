/* Test-only wrapper: every normal execution supplies the trusted current Fixture dependency facts,
 * exactly as a real caller must. Tests that intentionally omit or override dependencies import the
 * executor module directly.
 */
import { executeCover as realExecuteCover } from '../../core/audio/cover-executor-internal.mjs'
import { coverDependencies } from './cover-dependencies.mjs'

export { COVER_EXECUTION_CODES, coverStatus, createCoverTask, requestCoverCancel, resumeCoverFinal } from '../../core/audio/cover-executor-internal.mjs'

export function executeCover(args) {
  const dependencies =
    args.dependencies === undefined
      ? coverDependencies({
          scopeId: args.scopeId,
          sourceRef: args.intent.sourceRef,
          taskId: args.taskId,
          now: args.now,
          expiresAt: args.expiresAt,
          intent: args.intent,
        })
      : args.dependencies
  return realExecuteCover({ ...args, dependencies })
}
