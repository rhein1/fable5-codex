import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLedger, evaluateCloseout, planDigest } from '../../plugins/fable5-codex/scripts/run-closeout.mjs';
import { appendObservedCheck, fingerprintCheck, fingerprintSources, observeNodeCheck } from '../../plugins/fable5-codex/scripts/observe-check.mjs';

const cwd = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
const sourceFiles = [
  'plugins/fable5-codex/scripts/run-closeout.mjs',
  'plugins/fable5-codex/scripts/observe-check.mjs',
  'test/run-closeout.test.mjs',
  'examples/run-closeout/demo.mjs',
  'examples/run-closeout/observe.mjs',
];
const plan = {
  goals: [{ id: 'verify', title: 'Verify scoped closeout code', dependsOn: [], checkIds: ['tests'] }],
  checks: [{ id: 'tests', title: 'Closeout regression process', kind: 'command', required: true }],
  coverage: [{ id: 'review', title: 'Independent source review', required: true }],
};
const binding = {
  runId: randomUUID(), scopeId: 'explicit-closeout-test-files',
  revision: `sha256:${fingerprintSources(cwd, sourceFiles).digest}`,
  policyDigest: createHash('sha256').update('Local demonstration only; no ECF grant or completion authority.').digest('hex'),
  planDigest: planDigest(plan),
};
const ledger = createLedger(plan, binding);
const spec = {
  checkId: 'tests', cwd, args: ['--test', 'test/run-closeout.test.mjs'], sourceFiles,
  timeoutMs: 30000, maxOutputBytes: 1024 * 1024,
};
const reviewedSpecDigest = fingerprintCheck(spec);
const observation = await observeNodeCheck(ledger, binding, spec, reviewedSpecDigest);
const accounting = evaluateCloseout(appendObservedCheck(ledger, observation, binding), binding);
process.stdout.write(`${JSON.stringify({ localDemonstration: true, observation, accounting }, null, 2)}\n`);
process.exitCode = observation.outcome === 'exit_zero' && observation.sourceStable ? 0 : 1;
