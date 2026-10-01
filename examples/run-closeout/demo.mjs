#!/usr/bin/env node
// Synthetic record-accounting demo. This does not run a project test or Codex.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendEvent, createLedger, evaluateCloseout, planDigest } from '../../plugins/fable5-codex/scripts/run-closeout.mjs';

export const plan = {
  goals: [
    { id: 'map', title: 'Inspect affected contracts', dependsOn: [], checkIds: ['source'] },
    { id: 'verify', title: 'Verify the scoped change', dependsOn: ['map'], checkIds: ['tests'] },
  ],
  checks: [
    { id: 'source', title: 'Source trace', kind: 'source', required: true },
    { id: 'tests', title: 'Regression suite', kind: 'command', required: true },
  ],
  coverage: [
    { id: 'changed_files', title: 'Every changed file', required: true },
    { id: 'target_host', title: 'Optional target-host probe', required: false },
  ],
};
export const binding = {
  runId: 'synthetic-demo', scopeId: 'disposable-worktree', revision: 'synthetic-source-revision',
  policyDigest: 'a'.repeat(64), planDigest: planDigest(plan),
};
export const evidence = [{ ref: 'synthetic:fixture', observation: 'Invented example, not observed project execution.' }];
export const events = [
  { type: 'check', id: 'source', status: 'passed', detail: 'Synthetic source inspection', evidence },
  { type: 'goal', id: 'map', status: 'complete', evidence },
  { type: 'finding.open', id: 'regression', title: 'Synthetic missing edge-case test', section: 'Needs Fixing', risk: 'normal', evidence },
  { type: 'check', id: 'tests', status: 'passed', detail: 'Synthetic test result, no command executed', evidence },
  { type: 'finding.close', id: 'regression', status: 'resolved', checkIds: ['tests'], evidence },
  { type: 'goal', id: 'verify', status: 'complete', evidence },
  { type: 'coverage', id: 'changed_files', status: 'inspected', evidence },
];
export function runDemo() {
  let ledger = createLedger(plan, binding);
  const before = evaluateCloseout(ledger, binding);
  for (const event of events) ledger = appendEvent(ledger, event, binding);
  return { synthetic: true, before, after: evaluateCloseout(ledger, binding), ledger };
}
// Importing fixtures must not execute the demo or write stdout.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(runDemo(), null, 2));
}
