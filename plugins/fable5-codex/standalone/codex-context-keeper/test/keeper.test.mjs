import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { packContext, sha256, snapshotDigest } from '../lib/context-pack.mjs';
import { currentHead, stageCapsule, loadCapsule, revokeCapsule, handleHook } from '../lib/keeper.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const bin = join(root, 'bin/codex-context-keeper.mjs');
const clock = 1800000000000;
function git(cwd, args) {
  const env = {};
  for (const key of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' });
  const result = spawnSync('git', ['-c', 'commit.gpgSign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-C', cwd, ...args], { env, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function fixture(fn) {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'codex-keeper-')));
  try {
    git(tmp, ['init']); git(tmp, ['commit', '--allow-empty', '-m', 'synthetic initial']);
    const head = currentHead(tmp);
    const record = (id, kind, text) => ({ id, kind, text, sha256: sha256(text), source: { id: 'src', revision: 'rev1' }, evidence_refs: [], requires: [] });
    const input = { schema: 'agoragentic.context-input.v1', scope: { project_id: 'p', repo_id: 'r', worktree_id: 'w', session_id: 'session-1' }, policy_revision: 'policy-1',
      task: { goal: 'Fix exact failure', head_ref: head, required_ids: ['failure'] }, records: [record('failure', 'failure', 'IMPORTANT_FAILURE_SECRET_FIXTURE'), record('old', 'note', 'old notes '.repeat(1000))], upstream_omitted: 0 };
    const binding = { scope: input.scope, policy_revision: input.policy_revision, head_ref: head, source_revisions: { src: 'rev1' }, expected_digest: snapshotDigest(input), budget_bytes: 3000 };
    const args = { root: join(tmp, 'private-packs'), cwd: tmp, session: 'session-1', policy: 'policy-1', input, binding, reviewed: 'REVIEWED_REDACTED', now: clock };
    const env = { CODEX_CONTEXT_KEEPER_ENABLE: '1', CODEX_CONTEXT_KEEPER_ROOT: args.root, CODEX_CONTEXT_KEEPER_POLICY: args.policy };
    const event = { hook_event_name: 'SessionStart', source: 'compact', session_id: args.session, cwd: tmp, transcript_path: '/never/read/this' };
    fn({ tmp, args, env, event });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
test('standalone core packs without Fable or any dependency', () => fixture(({ args }) => {
  const pack = packContext(args.input, args.binding); assert.equal(pack.records[0].text, 'IMPORTANT_FAILURE_SECRET_FIXTURE'); assert.ok(pack.omitted.length);
}));
test('stage stores only the reduced pack, not original source or binding', () => fixture(({ args }) => {
  const staged = stageCapsule(args); assert.equal(staged.staged, true); assert.equal(staged.native_compaction_replaced, false);
  const capsule = loadCapsule(args); assert.equal(capsule.pack.records.length, 1); assert.equal(capsule.input, undefined); assert.equal(capsule.binding, undefined);
}));
test('capsule creation is explicit and never overwrites', () => fixture(({ args }) => {
  assert.throws(() => stageCapsule({ ...args, reviewed: 'yes' }), /OWNER_REVIEW_REQUIRED/);
  stageCapsule(args); assert.throws(() => stageCapsule(args), /EEXIST/);
  assert.equal(loadCapsule(args).pack.records.length, 1);
}));
for (const [name, patch, error] of [
  ['workspace', { cwd: realpathSync(tmpdir()) }, 'WORKSPACE_MISMATCH'],
  ['policy', { policy: 'other' }, 'POLICY_CHANGED'],
  ['expiry', { now: clock + 600000 }, 'CAPSULE_EXPIRED'],
  ['clock rollback', { now: clock - 1 }, 'CAPSULE_EXPIRED'],
]) test(`read rejects ${name}`, () => fixture(({ args }) => { stageCapsule(args); assert.throws(() => loadCapsule({ ...args, ...patch }), new RegExp(error)); }));
test('read rejects foreign session without searching other capsules', () => fixture(({ args }) => {
  stageCapsule(args); assert.throws(() => loadCapsule({ ...args, session: 'foreign' }));
}));
test('Git head change invalidates old capsule', () => fixture(({ args, tmp }) => {
  stageCapsule(args); git(tmp, ['commit', '--allow-empty', '-m', 'new head']); assert.throws(() => loadCapsule(args), /HEAD_CHANGED/);
}));
test('staging refuses a false head binding before creating owner root', () => fixture(({ args }) => {
  args.binding.head_ref = '0'.repeat(40); assert.throws(() => stageCapsule(args), /STAGE_SCOPE_HEAD_MISMATCH/);
  assert.ok(!readdirSync(args.cwd).includes('private-packs'));
}));
for (const ttlMs of [0, -1, 999, 3600001, NaN, Infinity, 1.2]) test(`reject invalid TTL ${ttlMs}`, () => fixture(({ args }) => {
  assert.throws(() => stageCapsule({ ...args, ttlMs }), /INVALID_TTL/);
}));
test('mutation of staged bytes is detected', () => fixture(({ args }) => {
  stageCapsule(args); const name = join(args.root, sha256(args.session) + '.json');
  const capsule = JSON.parse(readFileSync(name)); capsule.pack.records[0].text = 'tampered'; writeFileSync(name, JSON.stringify(capsule));
  assert.throws(() => loadCapsule(args), /CAPSULE_DIGEST_MISMATCH/);
}));
test('revoke deletes only own capsule and leaves root and unrelated data', () => fixture(({ args }) => {
  stageCapsule(args); writeFileSync(join(args.root, 'unrelated.txt'), 'keep'); revokeCapsule(args);
  assert.equal(readFileSync(join(args.root, 'unrelated.txt'), 'utf8'), 'keep'); assert.throws(() => loadCapsule(args));
}));
test('refuses an existing unmarked directory', () => fixture(({ args }) => {
  assert.throws(() => stageCapsule({ ...args, root: args.cwd }));
  assert.ok(!readdirSync(args.cwd).includes('.keeper-root.json'));
}));
test('path traversal IDs and relative private roots are rejected', () => fixture(({ args }) => {
  assert.throws(() => stageCapsule({ ...args, session: '../other' }), /INVALID_ID/);
  assert.throws(() => stageCapsule({ ...args, root: 'relative-root' }), /ABSOLUTE_OWNER_ROOT_REQUIRED/);
}));
test('default-off hook reads neither stdin event nor paths', () => {
  const event = { get cwd() { throw new Error('must not access'); } };
  assert.deepEqual(handleHook(event, {}), {});
  const result = spawnSync(process.execPath, [bin, 'hook'], { env: { ...process.env, CODEX_CONTEXT_KEEPER_ENABLE: '0' }, input: 'malformed', encoding: 'utf8' });
  assert.equal(result.status, 0); assert.deepEqual(JSON.parse(result.stdout), {});
});
test('startup emits current session identifier without reading transcripts or loading a pack', () => {
  const result = handleHook({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'actual-session', transcript_path: '/invalid' }, { CODEX_CONTEXT_KEEPER_ENABLE: '1' });
  assert.ok(result.hookSpecificOutput.additionalContext.includes('actual-session')); assert.ok(result.hookSpecificOutput.additionalContext.includes('No snapshot has been loaded'));
});
test('after compact hook emits pointer only, never source excerpts as developer context', () => fixture(({ args, env, event }) => {
  stageCapsule(args); const result = handleHook(event, env, clock);
  assert.equal(result.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(result.hookSpecificOutput.additionalContext.includes(args.session));
  assert.ok(!JSON.stringify(result).includes('IMPORTANT_FAILURE_SECRET_FIXTURE')); assert.equal(result.messages, undefined);
}));
test('PreCompact does not replace or block native compaction', () => fixture(({ args, env, event }) => {
  stageCapsule(args); const result = handleHook({ ...event, hook_event_name: 'PreCompact', trigger: 'auto' }, env, clock);
  assert.equal(result.continue, true); assert.equal(result.messages, undefined); assert.equal(result.hookSpecificOutput, undefined);
}));
test('failure and revocation do not masquerade as restore', () => fixture(({ args, env, event }) => {
  stageCapsule(args); revokeCapsule(args); const result = handleHook(event, env, clock);
  assert.equal(result.hookSpecificOutput, undefined); assert.ok(result.systemMessage.includes('no usable')); assert.notEqual(result.continue, false);
}));
test('subagent and unrelated events are ignored', () => {
  const env = { CODEX_CONTEXT_KEEPER_ENABLE: '1' };
  for (const event of [{ hook_event_name: 'PostToolUse' }, { hook_event_name: 'SessionStart', source: 'clear' }, { hook_event_name: 'SessionStart', source: 'compact', agent_id: 'child' }]) assert.deepEqual(handleHook(event, env), {});
});
test('hook stdin is bounded and malformed JSON does not expose raw input', () => {
  for (const input of ['SECRET_NOT_JSON', 'x'.repeat(17000)]) {
    const result = spawnSync(process.execPath, [bin, 'hook'], { env: { ...process.env, CODEX_CONTEXT_KEEPER_ENABLE: '1' }, input, encoding: 'utf8', maxBuffer: 32768 });
    assert.equal(result.status, 0); const out = JSON.parse(result.stdout); assert.ok(out.systemMessage.includes('hook unavailable')); assert.ok(!result.stdout.includes('SECRET_NOT_JSON'));
  }
});
test('actual standalone CLI stage/read/revoke loop', () => fixture(({ args, tmp }) => {
  const input = join(tmp, 'input.json'), binding = join(tmp, 'binding.json');
  writeFileSync(input, JSON.stringify(args.input)); writeFileSync(binding, JSON.stringify(args.binding));
  const common = ['--root', args.root, '--cwd', args.cwd, '--session', args.session];
  function run(a) { return spawnSync(process.execPath, [bin, ...a], { cwd: tmpdir(), encoding: 'utf8' }); }
  const staged = run(['stage', '--input', input, '--binding', binding, ...common, '--reviewed', 'REVIEWED_REDACTED']);
  assert.equal(staged.status, 0, staged.stderr); assert.equal(JSON.parse(staged.stdout).staged, true);
  const loaded = run(['read', ...common, '--policy', args.policy]); assert.equal(loaded.status, 0, loaded.stderr); assert.equal(JSON.parse(loaded.stdout).completion_evidence, false);
  const revoked = run(['revoke', '--root', args.root, '--session', args.session]); assert.equal(revoked.status, 0, revoked.stderr);
  const missing = run(['read', ...common, '--policy', args.policy]); assert.equal(missing.status, 2); assert.equal(missing.stdout, '');
}));
test('Unix permissions and final symlinks are refused where supported', () => fixture(({ args, tmp }) => {
  stageCapsule(args);
  if (process.platform !== 'win32') {
    const capsule = join(args.root, sha256(args.session) + '.json'); chmodSync(capsule, 0o644);
    assert.throws(() => loadCapsule(args), /PRIVATE_FILE_REQUIRED/); chmodSync(capsule, 0o600);
    symlinkSync(args.root, join(tmp, 'root-alias')); assert.throws(() => loadCapsule({ ...args, root: join(tmp, 'root-alias') }), /UNSAFE_OWNER_ROOT/);
  }
}));
test('portable manifest, compatibility manifest and marketplace agree', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'))), manifest = JSON.parse(readFileSync(join(root, 'plugin.json')));
  const compat = JSON.parse(readFileSync(join(root, '.codex-plugin/plugin.json'))), market = JSON.parse(readFileSync(join(root, '.agents/plugins/marketplace.json')));
  assert.equal(pkg.private, true); assert.equal(pkg.version, manifest.version); assert.equal(compat.version, manifest.version);
  assert.equal(manifest.name, market.plugins[0].name); assert.equal(market.plugins[0].source.path, './');
  assert.equal(pkg.dependencies, undefined); assert.equal(manifest.extensions['com.openai'].hooks, './hooks/hooks.json');
  const hooks = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'))).hooks;
  assert.deepEqual(Object.keys(hooks).sort(), ['PreCompact', 'SessionStart']);
  assert.ok(hooks.SessionStart[0].hooks[0].command.includes('${PLUGIN_ROOT}'));
});

test('CLI entrypoint runs through a package-style bin symlink where supported', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'keeper-bin-'));
  try {
    let entry = bin;
    if (process.platform !== 'win32') { entry = join(tmp, 'keeper'); symlinkSync(bin, entry); }
    const result = spawnSync(process.execPath, [entry, 'help'], { encoding: 'utf8', cwd: tmp });
    assert.equal(result.status, 0, result.stderr); assert.ok(result.stdout.startsWith('Codex Context Keeper'));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
