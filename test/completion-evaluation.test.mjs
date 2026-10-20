import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { configureEvaluationPermissions, isolatedEnvironment } from '../scripts/fable-runtime.mjs';
import { freezeComparisonGrader, isFixtureTestCommand, validateFrozenGrader } from '../scripts/run-completion-comparison.mjs';

const repo = new URL('..', import.meta.url);
const dataset = JSON.parse(readFileSync(new URL('evals/completion-verification/cases.json', repo)));
const grader = new URL('scripts/completion-evaluation.py', repo);

test('test observation accepts only the exact fixture command through known literal shells', () => {
  for (const command of ['node test.mjs', '/bin/bash -c \'node test.mjs\'', '/bin/bash -lc "node ./test.mjs"', '"C:\\PowerShell\\pwsh.exe" -Command "node .\\test.mjs"']) assert.equal(isFixtureTestCommand(command), true, command);
  for (const command of ['echo node test.mjs', 'node other.mjs', '/bin/bash -c \'false; node test.mjs\'', '/bin/bash -c \'echo node test.mjs\'', 'node test.mjs; echo passed']) assert.equal(isFixtureTestCommand(command), false, command);
});

function evaluate(context, runs, graderPath = grader.pathname.replace(/^\/([A-Za-z]:)/, '$1')) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable-grader-')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  const packet = { cases: dataset.cases, runs, model: 'gpt-6.1-sol', effort: 'medium', timeoutMs: 120000,
    baselineCommit: 'a'.repeat(40), candidateCommit: 'b'.repeat(40) };
  const input = join(root, 'runs.json'); writeFileSync(input, JSON.stringify(packet));
  const result = spawnSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-I', '-B', graderPath, input], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('grading executes preserved grader and dependency bytes rather than mutable trial-era sources', (context) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable-frozen-grader-')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  const graderFile = join(root, 'source-grader.py');
  const evaluatorFile = join(root, 'source-evaluator.py');
  writeFileSync(graderFile, readFileSync(grader));
  writeFileSync(evaluatorFile, readFileSync(new URL('plugins/fable5-codex/experiments/rrsi/evaluator.py', repo)));
  const frozen = freezeComparisonGrader(root, { graderFile, evaluatorFile });
  writeFileSync(graderFile, 'raise RuntimeError("mutated grader must not execute")');
  writeFileSync(evaluatorFile, 'raise RuntimeError("mutated dependency must not execute")');
  validateFrozenGrader(frozen);
  assert.equal(evaluate(context, [], frozen.graderPath).effectivenessProven, false);
  for (const path of [frozen.graderPath, frozen.evaluatorPath]) {
    const original = readFileSync(path);
    writeFileSync(path, 'raise RuntimeError("changed frozen bytes")');
    assert.throws(() => validateFrozenGrader(frozen), /frozen_grader_changed/);
    writeFileSync(path, original);
  }
});

test('missing and timeout trials remain in the matched fixed denominator with no completion proof', (context) => {
  const report = evaluate(context, [{ caseId: dataset.cases[0].id, arm: 'baseline', stopped: true, exitCode: null, durationMs: 120000 }]);
  assert.equal(report.reports.baseline.completed, 0);
  assert.equal(report.reports.candidate.completed, 0);
  assert.equal(report.reports.baseline.score, 0);
  assert.equal(report.reports.candidate.score, 0);
  assert.equal(report.costComparisonAdmissible, false);
  assert.equal(report.effectivenessProven, false);
  assert.equal(report.promotionAllowed, false);
});

test('known synthetic answers score without certifying real model effectiveness or unknown costs', (context) => {
  const runs = dataset.cases.flatMap((fixture) => ['baseline', 'candidate'].map((arm) => ({ caseId: fixture.id, arm, exitCode: 0,
    durationMs: 100, reportedTokens: 100, testCommandObserved: false, parsed: { requirements: fixture.expected.map(({ id, status, path, line }) => ({ id, status, evidence: { path, line } })), testsObserved: false, deployedVerified: false } })));
  const report = evaluate(context, runs);
  assert.equal(report.reports.baseline.completed, 3);
  assert.equal(report.reports.candidate.score, 1);
  assert.equal(report.metrics.candidate.invalidEvidence, 0);
  assert.equal(report.reports.candidate.costs_known_positive, false);
  assert.equal(report.effectivenessProven, false);
  runs[0].parsed.deployedVerified = true;
  runs[0].parsed.requirements[1].status = 'verified';
  runs[0].parsed.requirements[0].evidence.line = 99;
  const forged = evaluate(context, runs);
  assert.equal(forged.reports.baseline.safety_ok, false);
  assert.ok(forged.metrics.baseline.falseCompletionClaims > 0);
  assert.ok(forged.metrics.baseline.invalidEvidence > 0);
});

test('isolated runtime does not inherit personal plugin homes, credentials or proxy variables', (context) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable-environment-')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  mkdirSync(join(root, 'home'));
  const env = isolatedEnvironment(join(root, 'home'));
  assert.equal(env.CODEX_HOME, join(root, 'home'));
  assert.equal(env.APPDATA, join(root, 'home/AppData/Roaming'));
  assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.HTTPS_PROXY, undefined);
  configureEvaluationPermissions(env.CODEX_HOME, join(root, 'original/auth.json'), join(root, 'plugin'), join(root, 'runtime'));
  const policy = readFileSync(join(env.CODEX_HOME, 'config.toml'), 'utf8');
  assert.match(policy, /":root" = "deny"/);
  assert.match(policy, /auth\.json" = "deny"/);
  assert.match(policy, /enabled = false/);
  assert.ok(policy.includes(`${JSON.stringify(join(root, 'runtime').replaceAll('\\', '/'))} = "read"`));
  assert.equal(policy.includes('sandbox_mode'), false);
});

for (const variant of ['invented', 'duplicate', 'malformed']) {
  test(`${variant} response requirements fail closed without shrinking the matched denominator`, (context) => {
    const runs = dataset.cases.flatMap((fixture) => ['baseline', 'candidate'].map((arm) => ({ caseId: fixture.id, arm, exitCode: 0,
      durationMs: 100, reportedTokens: 100, testCommandObserved: false, parsed: { requirements: fixture.expected.map(({ id, status, path, line }) => ({ id, status, evidence: { path, line } })), testsObserved: false, deployedVerified: false } })));
    for (const run of runs.filter(({ arm }) => arm === 'candidate')) {
      if (variant === 'invented') run.parsed.requirements.push({ id: 'R999', status: 'incomplete', evidence: { path: 'invented', line: 99 } });
      if (variant === 'duplicate') run.parsed.requirements.push({ ...run.parsed.requirements[0], status: 'unverified' });
      if (variant === 'malformed') run.parsed.requirements = { id: 'R1' };
    }
    const report = evaluate(context, runs);
    assert.equal(report.reports.baseline.score, 1);
    assert.equal(report.reports.candidate.score, 0);
    assert.equal(report.reports.candidate.completed, dataset.cases.length);
    assert.equal(report.reports.candidate.expected_trials, dataset.cases.length);
    assert.equal(report.reports.candidate.safety_ok, false);
    assert.equal(report.metrics.candidate.invalidResponses, dataset.cases.length);
    assert.equal(report.metrics.candidate.expectedRequirements, report.metrics.baseline.expectedRequirements);
    assert.equal(report.effectivenessProven, false);
    assert.equal(report.promotionAllowed, false);
  });
}
