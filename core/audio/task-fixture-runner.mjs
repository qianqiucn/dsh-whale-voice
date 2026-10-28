/* Whale Voice — legacy 08-C Fixture runner facade (Plan 08-D-B).
 *
 * Keeps the original public surface exactly:
 *   TASK_FIXTURE_SCHEMA_VERSION, TASK_FIXTURE_ERRORS, runFixtureAudioTaskOnce(input).
 *
 * The implementation now lives in the single internal engine; this module only forwards the draft
 * entry and returns its public `result` envelope. A full AudioTask record can never leave here.
 * No I/O, clock, randomness, process, queue or cross-call state is used.
 */

import {
  TASK_FIXTURE_ERRORS,
  TASK_FIXTURE_SCHEMA_VERSION,
  runDraftFixtureTaskOnce,
} from './task-fixture-engine-internal.mjs'

export { TASK_FIXTURE_ERRORS, TASK_FIXTURE_SCHEMA_VERSION }

/**
 * Run one Fixture audio task through the legacy draft entry.
 * @returns {{ok:true,value:object}|{ok:false,errors:Array<{code:string,path:string,reason:string}>}}
 */
export function runFixtureAudioTaskOnce(input) {
  return runDraftFixtureTaskOnce(input).result
}
