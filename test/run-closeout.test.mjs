import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { appendEvent, createLedger, evaluateCloseout, planDigest, readJsonFile, MAX_BYTES } from '../plugins/fable5-codex/scripts/run-closeout.mjs';
import { plan, binding, evidence, events, runDemo } from '../examples/run-closeout/demo.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'plugins/fable5-codex/scripts/run-closeout.mjs');
const fresh = () => createLedger(plan, binding);
function prefix(count = events.length) {
  return events.slice(0, count).reduce((ledger, event) => appendEvent(ledger, event, binding), fresh());
}
const check = (status = 'passed') => ({ type: 'check', id: 'tests', status, detail: 'Synthetic result', evidence });
const finding = (section = 'Needs Fixing', risk = 'normal') => ({
  type: 'finding.open', id: 'new_issue', title: 'Synthetic review finding', section, risk, evidence,
});
const close = () => ({ type: 'finding.close', id: 'new_issue', status: 'resolved', checkIds: ['tests'], evidence });
function temp(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'fable-closeout-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function put(dir, name, data) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data), { mode: 0o600 });
  return path;
}
function run(args, cwd) { return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8', timeout: 15000 }); }

test('empty ledger is incomplete, with every required gap visible', () => {
  const result = evaluateCloseout(fresh(), binding);
  assert.equal(result.verdict, 'INCOMPLETE');
  assert.equal(result.blockers.length, 5);
  assert.deepEqual(result.notes, [{ code: 'coverage_gap', id: 'target_host' }]);
});
test('synthetic complete run preserves optional gaps and never claims proof or authority', () => {
  const result = runDemo().after;
  assert.equal(result.verdict, 'RECORDS_SATISFIED');
  assert.equal(result.evidenceVerified, false);
  assert.equal(result.authorityGranted, false);
  assert.equal(result.notes.length, 1);
  assert.equal(result.findings[0].status, 'resolved');
});
test('digest is insensitive to object-key insertion order but sensitive to plan content', () => {
  assert.equal(planDigest(plan), planDigest({ coverage: plan.coverage, checks: plan.checks, goals: plan.goals }));
  const changed = clone(plan);
  changed.goals[0].title = 'A different scope';
  assert.notEqual(planDigest(plan), planDigest(changed));
});
test('append returns a copy and preserves every earlier event', () => {
  const ledger = prefix(2);
  const before = clone(ledger);
  const event = clone(events[2]);
  const result = appendEvent(ledger, event, binding);
  result.events[0].evidence[0].observation = 'Changed only the copy';
  assert.deepEqual(ledger, before);
  assert.equal(event.seq, undefined);
  assert.equal(result.events[2].seq, 3);
});
for (const key of ['runId', 'scopeId', 'revision', 'policyDigest', 'planDigest']) {
  test(`rejects independently supplied stale or different ${key}`, () => {
    const expected = { ...binding, [key]: key.endsWith('Digest') ? 'b'.repeat(64) : 'different' };
    assert.throws(() => evaluateCloseout(prefix(), expected), /binding_mismatch/);
    assert.throws(() => appendEvent(prefix(), check(), expected), /binding_mismatch/);
  });
}
test('expected binding cannot be omitted or read implicitly from the ledger', () => {
  assert.throws(() => evaluateCloseout(prefix()), /binding:object/);
});
test('plan weakening fails even when ledger binding was left unchanged', () => {
  const ledger = prefix();
  ledger.plan.coverage[0].required = false;
  ledger.plan.coverage[1].required = true;
  assert.throws(() => evaluateCloseout(ledger, binding), /plan_digest_mismatch/);
});
test('create rejects a mismatched pinned plan', () => {
  assert.throws(() => createLedger(plan, { ...binding, planDigest: 'b'.repeat(64) }), /plan_digest_mismatch/);
});
for (const [name, mutate] of [
  ['extra fields', (p) => { p.approval = true; }],
  ['empty goals', (p) => { p.goals = []; }],
  ['empty checks', (p) => { p.checks = []; }],
  ['empty coverage', (p) => { p.coverage = []; }],
  ['duplicate identifiers', (p) => { p.goals[1].id = p.goals[0].id; }],
  ['unknown dependency', (p) => { p.goals[0].dependsOn = ['missing']; }],
  ['dependency cycle', (p) => { p.goals[0].dependsOn = ['verify']; }],
  ['unknown check', (p) => { p.goals[0].checkIds = ['missing']; }],
  ['duplicate check reference', (p) => { p.goals[0].checkIds = ['source', 'source']; }],
  ['no goal checks', (p) => { p.goals[0].checkIds = []; }],
  ['no required verification', (p) => { p.checks.forEach((c) => { c.required = false; }); }],
  ['no required coverage', (p) => { p.coverage.forEach((c) => { c.required = false; }); }],
  ['unsafe id', (p) => { p.goals[0].id = '__proto__'; }],
  ['nonboolean requirement', (p) => { p.checks[0].required = 'false'; }],
  ['control characters', (p) => { p.goals[0].title = 'secret\nleak'; }],
  ['oversized title', (p) => { p.goals[0].title = 'x'.repeat(1025); }],
  ['unknown verifier kind', (p) => { p.checks[0].kind = 'automatic-approval'; }],
]) {
  test(`plan rejects ${name}`, () => {
    const changed = clone(plan); mutate(changed);
    assert.throws(() => planDigest(changed));
  });
}
test('cannot complete goal before its checks', () => {
  assert.throws(() => appendEvent(fresh(), events[1], binding), /goal_checks_incomplete/);
});
test('cannot complete dependent goal before its predecessor', () => {
  const ledger = appendEvent(fresh(), check(), binding);
  assert.throws(() => appendEvent(ledger, events[5], binding), /goal_dependencies_incomplete/);
});
for (const status of ['failed', 'unavailable', 'passed']) {
  test(`later ${status} check invalidates earlier checkpoints and finding resolutions`, () => {
    const result = evaluateCloseout(appendEvent(prefix(), check(status), binding), binding);
    assert.equal(result.readyForCloseout, false);
    assert.ok(result.blockers.some((b) => b.code === 'goal_incomplete_or_stale' && b.id === 'verify'));
    assert.ok(result.blockers.some((b) => b.code === 'finding_resolution_stale'));
  });
}
test('changed predecessor check invalidates dependent goals transitively', () => {
  let ledger = appendEvent(prefix(), { ...events[0], status: 'failed' }, binding);
  assert.equal(evaluateCloseout(ledger, binding).blockers.filter((b) => b.code === 'goal_incomplete_or_stale').length, 2);
  ledger = appendEvent(ledger, events[0], binding);
  assert.throws(() => appendEvent(ledger, events[5], binding), /goal_dependencies_incomplete/);
});
test('explicit blocked goal remains a blocker despite passed checks', () => {
  const ledger = appendEvent(prefix(), { ...events[5], status: 'blocked' }, binding);
  assert.equal(evaluateCloseout(ledger, binding).readyForCloseout, false);
});
for (const section of ['Needs Fixing', 'Requires Human Review']) {
  test(`${section} remains blocking until fresh closeout`, () => {
    const ledger = appendEvent(prefix(), finding(section), binding);
    assert.ok(evaluateCloseout(ledger, binding).blockers.some((b) => b.id === 'new_issue'));
    assert.throws(() => appendEvent(ledger, close(), binding), /resolution_requires_fresh_checks/);
  });
}
for (const section of ['Recommended Optional', 'Create Follow-up Issue']) {
  test(`${section} stays visible without blocking normal-risk completion`, () => {
    const result = evaluateCloseout(appendEvent(prefix(), finding(section), binding), binding);
    assert.equal(result.readyForCloseout, true);
    assert.ok(result.notes.some((n) => n.id === 'new_issue'));
  });
}
for (const risk of ['security', 'privacy', 'authz', 'money', 'data-integrity', 'migration', 'secrets', 'trust']) {
  test(`unresolved ${risk} cannot be hidden as an optional finding`, () => {
    const result = evaluateCloseout(appendEvent(prefix(), finding('Recommended Optional', risk), binding), binding);
    assert.equal(result.readyForCloseout, false);
  });
}
test('finding cannot be re-added with a weaker section', () => {
  const ledger = appendEvent(prefix(), finding(), binding);
  assert.throws(() => appendEvent(ledger, finding('Recommended Optional'), binding), /duplicate_finding/);
});
test('closed findings can be reopened, rechecked and resolved; old history survives', () => {
  let ledger = appendEvent(prefix(), { type: 'finding.reopen', id: 'regression', evidence }, binding);
  assert.equal(evaluateCloseout(ledger, binding).readyForCloseout, false);
  assert.throws(() => appendEvent(ledger, events[4], binding), /resolution_requires_fresh_checks/);
  ledger = appendEvent(ledger, check(), binding);
  ledger = appendEvent(ledger, { ...events[4], status: 'refuted' }, binding);
  ledger = appendEvent(ledger, events[5], binding);
  assert.equal(evaluateCloseout(ledger, binding).readyForCloseout, true);
  assert.equal(ledger.events.filter((e) => e.type === 'finding.close').length, 2);
});
test('required coverage cannot be waved through as unavailable', () => {
  const ledger = appendEvent(prefix(), { ...events[6], status: 'unavailable' }, binding);
  assert.ok(evaluateCloseout(ledger, binding).blockers.some((b) => b.code === 'coverage_gap'));
});
for (const [name, event] of [
  ['unknown event', { type: 'approve', id: 'x', evidence }],
  ['missing evidence', { ...check(), evidence: [] }],
  ['whitespace-only observation', { ...check(), evidence: [{ ref: 'x', observation: ' ' }] }],
  ['unknown check', { ...check(), id: 'missing' }],
  ['unknown goal', { ...events[1], id: 'missing' }],
  ['unknown coverage', { ...events[6], id: 'missing' }],
  ['invented waiver', { ...close(), status: 'deferred' }],
  ['sequence override', { ...check(), seq: 99 }],
  ['extra event property', { ...check(), approvalGranted: true }],
  ['prototype key', { type: '__proto__', id: 'x', evidence }],
]) {
  test(`events reject ${name}`, () => assert.throws(() => appendEvent(prefix(), event, binding)));
}
test('reordered or truncated sequence numbers are rejected', () => {
  const ledger = prefix(); ledger.events.splice(1, 1);
  assert.throws(() => evaluateCloseout(ledger, binding), /sequence_gap/);
});
test('corrupted version and excessive history are rejected', () => {
  assert.throws(() => evaluateCloseout({ ...fresh(), version: 'unknown' }, binding), /unsupported_version/);
  assert.throws(() => evaluateCloseout({ ...fresh(), events: new Array(2001).fill(events[0]) }, binding), /events:list/);
});
test('dense acyclic dependencies are evaluated with bounded memoized traversal', () => {
  const dense = clone(plan);
  dense.goals = Array.from({ length: 70 }, (_, i) => ({ id: `G${i}`, title: 'DAG node', dependsOn: Array.from({ length: i }, (__, j) => `G${j}`), checkIds: ['source'] }));
  const expected = { ...binding, planDigest: planDigest(dense) };
  let ledger = createLedger(dense, expected);
  ledger = appendEvent(ledger, events[0], expected);
  for (const goal of dense.goals) ledger = appendEvent(ledger, { type: 'goal', id: goal.id, status: 'complete', evidence }, expected);
  assert.equal(evaluateCloseout(ledger, expected).blockers.some((b) => b.code === 'goal_incomplete_or_stale'), false);
});
test('reader rejects invalid JSON without reflecting private input', (t) => {
  const dir = temp(t); const path = join(dir, 'bad.json');
  writeFileSync(path, '{"PRIVATE_SENTINEL": invalid}');
  assert.throws(() => readJsonFile(path), (error) => error.message === 'invalid_json');
});
test('reader rejects oversized input and invalid UTF-8', (t) => {
  const dir = temp(t); const path = join(dir, 'bad.json');
  writeFileSync(path, 'x'.repeat(MAX_BYTES + 1));
  assert.throws(() => readJsonFile(path), /input_not_bounded_regular_file/);
  writeFileSync(path, Buffer.from([0xff, 0xfe, 0x7b]));
  assert.throws(() => readJsonFile(path), /input_unreadable|input_invalid_utf8/);
});
test('reader rejects directories and hard links', (t) => {
  const dir = temp(t); assert.throws(() => readJsonFile(dir));
  const path = put(dir, 'source.json', binding);
  const linked = join(dir, 'hard.json'); linkSync(path, linked);
  assert.throws(() => readJsonFile(linked), /input_not_bounded_regular_file/);
});
test('reader rejects symlink leaf and symlink ancestors', (t) => {
  const dir = temp(t); const path = put(dir, 'source.json', binding);
  const alias = join(dir, 'alias.json');
  try { symlinkSync(path, alias); } catch (error) {
    if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) { t.skip('Windows symlink privilege unavailable'); return; }
    throw error;
  }
  assert.throws(() => readJsonFile(alias), /input_not_canonical/);
  const parentAlias = join(dir, 'alias-dir'); symlinkSync(dir, parentAlias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => readJsonFile(join(parentAlias, 'source.json')), /input_not_canonical/);
});
test('CLI fingerprint/create/checkpoint/gate works from unrelated cwd without changing inputs', (t) => {
  const dir = temp(t); const p = put(dir, 'plan.json', plan); const b = put(dir, 'binding.json', binding);
  assert.equal(JSON.parse(run(['fingerprint', '--plan', p], dir).stdout).planDigest, binding.planDigest);
  const created = run(['create', '--plan', p, '--binding', b], dir);
  assert.equal(created.status, 0, created.stderr);
  let ledger = JSON.parse(created.stdout);
  for (const [i, event] of events.entries()) {
    const path = put(dir, `ledger-${i}.json`, ledger); const e = put(dir, `event-${i}.json`, event);
    const before = readFileSync(path, 'utf8');
    const result = run(['checkpoint', '--event', e, '--binding', b, '--ledger', path], dir);
    assert.equal(result.status, 0, result.stderr);
    ledger = JSON.parse(result.stdout);
    assert.equal(readFileSync(path, 'utf8'), before);
  }
  const l = put(dir, 'final.json', ledger);
  const result = run(['gate', '--binding', b, '--ledger', l], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).verdict, 'RECORDS_SATISFIED');
});
test('CLI gate distinguishes incomplete from invalid; status exposes gaps without gating', (t) => {
  const dir = temp(t); const l = put(dir, 'ledger.json', fresh()); const b = put(dir, 'binding.json', binding);
  assert.equal(run(['gate', '--ledger', l, '--binding', b], dir).status, 1);
  assert.equal(run(['status', '--ledger', l, '--binding', b], dir).status, 0);
  const wrong = put(dir, 'wrong.json', { ...binding, revision: 'another-revision' });
  const invalid = run(['gate', '--ledger', l, '--binding', wrong], dir);
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stdout, '');
});
test('CLI refuses unknown, duplicate and missing flags', (t) => {
  const dir = temp(t);
  for (const args of [['gate'], ['approve'], ['fingerprint', '--unknown', 'x'], ['gate', '--ledger', 'x', '--ledger', 'x'], ['status', '--ledger', 'x']]) {
    const result = run(args, dir);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
  }
  assert.equal(run(['--help'], dir).status, 0);
});
test('verification commands and evidence references are never executed or opened', (t) => {
  const dir = temp(t); const sentinel = join(dir, 'MUST_NOT_EXIST');
  const event = { ...check(), detail: `touch ${sentinel}`, evidence: [{ ref: 'https://example.invalid/private', observation: 'Untrusted text only' }] };
  const ledger = appendEvent(prefix(), event, binding);
  const b = put(dir, 'binding.json', binding); const l = put(dir, 'ledger.json', ledger);
  const result = run(['status', '--ledger', l, '--binding', b], dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes(sentinel), false);
  assert.throws(() => readFileSync(sentinel), /ENOENT/);
});
test('demo is executable but clearly labels synthetic evidence', (t) => {
  const result = spawnSync(process.execPath, [join(root, 'examples/run-closeout/demo.mjs')], { cwd: temp(t), encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.synthetic, true);
  assert.equal(output.after.evidenceVerified, false);
});
