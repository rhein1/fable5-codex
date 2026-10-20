import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync, linkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendEvent, createLedger, evaluateCloseout, planDigest } from '../plugins/fable5-codex/scripts/run-closeout.mjs';
import { appendObservedCheck, fingerprintCheck, fingerprintSources, observeNodeCheck } from '../plugins/fable5-codex/scripts/observe-check.mjs';

function fixture(context, source = 'process.stdout.write("private output");') {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'fable-observer-')));
  context.after(() => {
    assert.equal(dirname(cwd), realpathSync(tmpdir()));
    rmSync(cwd, { recursive: true, force: true });
  });
  writeFileSync(join(cwd, 'check.mjs'), source);
  const plan = {
    goals: [{ id: 'verify', title: 'Run the scoped check', dependsOn: [], checkIds: ['tests'] }],
    checks: [{ id: 'tests', title: 'Local command', kind: 'command', required: true }],
    coverage: [{ id: 'scope', title: 'Review scoped files', required: true }],
  };
  const spec = { checkId: 'tests', cwd, args: ['check.mjs'], sourceFiles: ['check.mjs'], timeoutMs: 5000, maxOutputBytes: 1024 };
  const binding = {
    runId: 'local-test', scopeId: 'temporary-scope', revision: `sha256:${fingerprintSources(cwd, spec.sourceFiles).digest}`,
    policyDigest: 'a'.repeat(64), planDigest: planDigest(plan),
  };
  return { spec, binding, ledger: createLedger(plan, binding) };
}

test('observes actual exit/output metadata and reuses closeout without certifying work', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  assert.equal(observation.outcome, 'exit_zero');
  assert.equal(observation.exitCode, 0);
  assert.equal(observation.executionObserved, true);
  assert.equal(observation.sourceStable, true);
  assert.equal(observation.outputComplete, true);
  assert.equal(observation.capturedBytes, Buffer.byteLength('private output'));
  assert.equal(observation.semanticResultVerified, false);
  assert.equal(observation.authorityGranted, false);
  assert.equal(observation.descendantCleanup, 'unverified');
  assert.equal(observation.environmentIsolation, false);
  assert.equal(JSON.stringify(observation).includes('private output'), false);
  assert.equal(Object.isFrozen(observation), true);
  assert.ok(observation.durationMs >= 0);
  assert.ok(Date.parse(observation.endedAt) >= Date.parse(observation.startedAt));
  const next = appendObservedCheck(ledger, observation, binding);
  assert.equal(next.events.at(-1).status, 'passed');
  assert.equal(ledger.events.length, 0);
  assert.equal(evaluateCloseout(next, binding).verdict, 'INCOMPLETE');
  assert.equal(evaluateCloseout(next, binding).evidenceVerified, false);
});

test('observed nonzero exit cannot become a passing check', async (context) => {
  const { spec, binding, ledger } = fixture(context, 'process.stderr.write("private failure"); process.exitCode = 37;');
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  assert.equal(observation.exitCode, 37);
  assert.equal(observation.outcome, 'exit_nonzero');
  assert.equal(appendObservedCheck(ledger, observation, binding).events[0].status, 'failed');
});

test('timeout stays unavailable with no descendant cleanup claim', async (context) => {
  const { spec, binding, ledger } = fixture(context, 'setInterval(() => {}, 1000);');
  spec.timeoutMs = 100;
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  assert.equal(observation.outcome, 'timeout');
  assert.equal(observation.outputComplete, false);
  assert.equal(observation.descendantCleanup, 'unverified');
  assert.equal(appendObservedCheck(ledger, observation, binding).events[0].status, 'unavailable');
});

test('combined output limit retains only bounded digests and does not count a pass', async (context) => {
  const { spec, binding, ledger } = fixture(context, 'process.stdout.write("x".repeat(100000));');
  spec.maxOutputBytes = 12;
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  assert.equal(observation.outcome, 'output_limit');
  assert.equal(observation.capturedBytes, 12);
  assert.equal(observation.outputComplete, false);
  assert.equal(appendObservedCheck(ledger, observation, binding).events[0].status, 'unavailable');
});

test('source changes during execution invalidate an otherwise successful exit', async (context) => {
  const { spec, binding, ledger } = fixture(context, 'import { appendFileSync } from "node:fs"; appendFileSync("check.mjs", "\\n");');
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  assert.equal(observation.exitCode, 0);
  assert.equal(observation.sourceStable, false);
  assert.throws(() => appendObservedCheck(ledger, observation, binding), /observation_source_stale/);
});

test('source changes after observation cannot be attached to the old ledger', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  writeFileSync(join(spec.cwd, 'check.mjs'), 'process.exitCode = 37;');
  assert.throws(() => appendObservedCheck(ledger, observation, binding), /observation_source_stale/);
});

test('serialization and caller-authored receipts cannot supply observed evidence', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  assert.throws(() => appendObservedCheck(ledger, JSON.parse(JSON.stringify(observation)), binding), /observation_not_live/);
  assert.throws(() => appendObservedCheck(ledger, { ...observation, exitCode: 0 }, binding), /observation_not_live/);
});

test('one observation cannot be replayed even against its original history', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  appendObservedCheck(ledger, observation, binding);
  assert.throws(() => appendObservedCheck(ledger, observation, binding), /already_consumed/);
});

test('different run or new finding requires a fresh observation', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
  const otherBinding = { ...binding, runId: 'different-run' };
  const otherLedger = createLedger(ledger.plan, otherBinding);
  assert.throws(() => appendObservedCheck(otherLedger, observation, otherBinding), /binding_or_history_mismatch/);
  const next = appendEvent(ledger, {
    type: 'finding.open', id: 'new_finding', title: 'Requires a fresh check', section: 'Needs Fixing', risk: 'normal',
    evidence: [{ ref: 'synthetic:case', observation: 'Synthetic finding opened after command observation.' }],
  }, binding);
  assert.throws(() => appendObservedCheck(next, observation, binding), /binding_or_history_mismatch/);
});

test('source binding includes actual dirty bytes and rejects stale content before execution', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  writeFileSync(join(spec.cwd, 'check.mjs'), 'throw new Error("must not execute");');
  await assert.rejects(observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec)), /source_binding_mismatch/);
});

test('scope is explicit and deterministic; aliases, escapes and hardlinks fail closed', (context) => {
  const { spec } = fixture(context);
  writeFileSync(join(spec.cwd, 'other.mjs'), 'export const value = 1;');
  assert.equal(fingerprintSources(spec.cwd, ['check.mjs', 'other.mjs']).digest,
    fingerprintSources(spec.cwd, ['other.mjs', 'check.mjs']).digest);
  assert.equal(fingerprintSources(spec.cwd, ['check.mjs']).scope, 'explicit_files_only');
  for (const paths of [['../escape'], ['check.mjs', 'CHECK.mjs'], ['./check.mjs'], ['check.mjs', 'check.mjs']]) {
    assert.throws(() => fingerprintSources(spec.cwd, paths));
  }
  linkSync(join(spec.cwd, 'check.mjs'), join(spec.cwd, 'hard.mjs'));
  assert.throws(() => fingerprintSources(spec.cwd, ['check.mjs']), /source_not_bounded_regular_file/);
});

test('portable hidden package metadata is fingerprinted without allowing dot traversal', (context) => {
  const { spec } = fixture(context);
  mkdirSync(join(spec.cwd, '.codex-plugin'));
  writeFileSync(join(spec.cwd, '.codex-plugin/plugin.json'), '{}');
  assert.equal(fingerprintSources(spec.cwd, ['.codex-plugin/plugin.json']).fileCount, 1);
  for (const path of ['../escape', '.codex-plugin/../check.mjs', './check.mjs', '/check.mjs']) {
    assert.throws(() => fingerprintSources(spec.cwd, [path]));
  }
});

test('source and connector checks cannot silently become process observations', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  ledger.plan.checks[0].kind = 'source';
  binding.planDigest = planDigest(ledger.plan);
  ledger.binding.planDigest = binding.planDigest;
  await assert.rejects(observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec)), /command_check_required/);
});

test('malformed requests fail before spawning and private errors are not stored in receipts', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const original = readFileSync(join(spec.cwd, 'check.mjs'), 'utf8');
  for (const changes of [{ timeoutMs: 0 }, { maxOutputBytes: 0 }, { args: ['\0'] }, { approval: true }, { checkId: 'missing' }]) {
    await assert.rejects(observeNodeCheck(ledger, binding, { ...spec, ...changes }));
  }
  assert.equal(readFileSync(join(spec.cwd, 'check.mjs'), 'utf8'), original);
});

test('snapshot API does not copy caller token variables to the child', async (context) => {
  const { spec, binding, ledger } = fixture(context, 'if (process.env.FABLE_OBSERVER_TEST_SECRET) process.exitCode = 9;');
  const prior = process.env.FABLE_OBSERVER_TEST_SECRET;
  process.env.FABLE_OBSERVER_TEST_SECRET = 'private sentinel';
  try {
    const observation = await observeNodeCheck(ledger, binding, spec, fingerprintCheck(spec));
    assert.equal(observation.exitCode, 0);
  } finally {
    if (prior === undefined) delete process.env.FABLE_OBSERVER_TEST_SECRET;
    else process.env.FABLE_OBSERVER_TEST_SECRET = prior;
  }
});

test('a separately pinned command rejects changed args or limits before execution', async (context) => {
  const { spec, binding, ledger } = fixture(context);
  const approved = fingerprintCheck(spec);
  await assert.rejects(observeNodeCheck(ledger, binding, { ...spec, args: ['check.mjs', 'different'] }, approved), /command_spec_mismatch/);
  await assert.rejects(observeNodeCheck(ledger, binding, { ...spec, timeoutMs: 100 }, approved), /command_spec_mismatch/);
  await assert.rejects(observeNodeCheck(ledger, binding, spec), /command_spec_mismatch/);
});

test('inline Node evaluation cannot substitute for the scoped failing script', async (context) => {
  const { spec, binding, ledger } = fixture(context, 'process.exitCode = 37;');
  const approved = fingerprintCheck(spec);
  await assert.rejects(observeNodeCheck(ledger, binding, { ...spec, args: ['-e', 'process.exit(0)'] }, approved), /scoped_script_required/);
});
