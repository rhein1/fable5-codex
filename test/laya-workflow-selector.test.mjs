import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { loadCatalog, searchRecipes } from '../plugins/fable5-codex/scripts/development-prompts.mjs';
import { baseline } from '../plugins/fable5-codex/scripts/laya-baseline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bridge = resolve(root, 'plugins/fable5-codex/scripts/laya-baseline.mjs');
const contract = JSON.parse(readFileSync(resolve(root, 'plugins/fable5-codex/experiments/laya/contract.json'), 'utf8'));

test('Laya answer space is exactly the existing six playbooks plus unclear', () => {
  const ids = Object.keys(contract.questions[contract.question_id].criteria);
  assert.deepEqual(ids.filter((id) => id !== 'unclear').sort(), loadCatalog().playbooks.map((p) => p.id).sort());
  assert.equal(ids.length, 7);
  assert.equal(contract.calibration_status, 'uncalibrated_for_fable');
});

for (const query of ['pipeline failing runner logs', 'security auth secrets', 'new feature scope epic', 'zzzznomatchzzzz']) {
  test(`baseline preserves existing first-recipe ranking: ${query}`, () => {
    const catalog = loadCatalog();
    const first = searchRecipes(catalog, { query, limit: 1 })[0];
    const expected = first ? catalog.playbooks.filter((p) => p.steps.includes(first.id)).map((p) => p.id).sort() : [];
    const result = baseline(query, catalog);
    assert.equal(result.recipe, first?.id ?? null);
    assert.deepEqual(result.candidates, expected);
    assert.equal(result.playbook, expected.length === 1 ? expected[0] : null);
  });
}

test('shared and unowned recipes abstain instead of inventing a playbook', () => {
  const catalog = loadCatalog();
  const first = searchRecipes(catalog, { query: 'pipeline logs failing', limit: 1 })[0];
  assert.ok(first);
  const shared = { ...catalog, playbooks: [{ id: 'ci-rescue', steps: [first.id] }, { id: 'pr-ready', steps: [first.id] }] };
  assert.equal(baseline('pipeline logs failing', shared).playbook, null);
  assert.equal(baseline('pipeline logs failing', { ...catalog, playbooks: [] }).playbook, null);
});

test('bridge works from an unrelated cwd and does not echo the task', () => {
  const cwd = mkdtempSync(resolve(tmpdir(), 'fable-laya-test-'));
  try {
    const task = 'pipeline logs failing private-marker-not-for-output';
    const run = spawnSync(process.execPath, [bridge], { input: JSON.stringify({ task }), cwd, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), baseline(task));
    assert.ok(!(run.stdout + run.stderr).includes('private-marker-not-for-output'));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('bridge rejects invalid and oversized inputs without reflecting them', () => {
  for (const input of ['{"secret malformed', JSON.stringify({ task: 'secret', execute: true }), JSON.stringify({ task: 'x'.repeat(4097) }), '{}']) {
    const run = spawnSync(process.execPath, [bridge], { input, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 1);
    assert.equal(run.stdout, '');
    assert.equal(run.stderr.trim(), 'baseline_unavailable');
  }
});

const python = [ ['python3'], ['python'], ['py', '-3'] ].find(([command, ...args]) => {
  const probe = spawnSync(command, [...args, '-I', '-B', '-c', 'import sys;sys.exit(0 if sys.version_info >= (3,9) else 1)'], { timeout: 10000, stdio: 'ignore', shell: false });
  return probe.status === 0;
});

test('Python offline selector, manifest, subprocess, and evaluation tests', { skip: !python && !process.env.CI ? 'Optional Python 3.9+ unavailable locally' : false }, (t) => {
  assert.ok(python, 'Hosted validation must have Python 3.9+; do not silently skip these checks in CI');
  const [command, ...args] = python;
  const run = spawnSync(command, [...args, '-I', '-B', resolve(root, 'test/laya_selector_test.py')], { cwd: root, encoding: 'utf8', timeout: 60000, shell: false });
  assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout}\n${run.stderr}`);
  t.diagnostic(run.stderr.trim());
});
