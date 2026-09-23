// MIT License. Copyright (c) 2026 Agoragentic.
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonical, identifier, objectKeys, packContext, requireThat, sha256, serializePack, validateInput } from './context-pack.mjs';
import { readJsonFile } from './context-pack-io.mjs';
const ROOT_SCHEMA = 'agoragentic.codex-context-keeper-root.v1';
const CAPSULE_SCHEMA = 'agoragentic.codex-context-capsule.v1';
const TTL_MAX = 3600000;

function privateFile(path) {
  const info = lstatSync(path);
  requireThat(info.isFile() && !info.isSymbolicLink(), 'UNSAFE_CAPSULE_FILE');
  if (process.platform !== 'win32') requireThat((info.mode & 0o077) === 0
    && info.uid === process.getuid(), 'PRIVATE_FILE_REQUIRED');
}
function exclusiveWrite(path, data) {
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(fd, data, 'utf8'); fsyncSync(fd);
  } catch (error) {
    if (fd !== undefined) { try { unlinkSync(path); } catch {} }
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
function ownerRoot(value, create = false) {
  requireThat(typeof value === 'string' && isAbsolute(value) && value.length <= 2048 && !/[\x00-\x1f]/.test(value), 'ABSOLUTE_OWNER_ROOT_REQUIRED');
  const resolved = resolve(value);
  if (!existsSync(resolved) && create) {
    mkdirSync(resolved, { mode: 0o700 }); // Parent must already exist; never create broad directory trees.
    exclusiveWrite(join(resolved, '.keeper-root.json'), JSON.stringify({ schema: ROOT_SCHEMA }) + '\n');
  }
  const stat = lstatSync(resolved);
  requireThat(stat.isDirectory() && !stat.isSymbolicLink(), 'UNSAFE_OWNER_ROOT');
  if (process.platform !== 'win32') requireThat((stat.mode & 0o077) === 0
    && stat.uid === process.getuid(), 'PRIVATE_ROOT_REQUIRED');
  const root = realpathSync(resolved);
  const marker = join(root, '.keeper-root.json'); privateFile(marker);
  const metadata = readJsonFile(marker, 1024); objectKeys(metadata, ['schema']);
  requireThat(metadata.schema === ROOT_SCHEMA, 'NOT_KEEPER_ROOT');
  return root;
}
function workingDirectory(value) {
  requireThat(typeof value === 'string' && isAbsolute(value) && !/[\x00-\x1f]/.test(value), 'ABSOLUTE_WORKSPACE_REQUIRED');
  const cwd = realpathSync(value); requireThat(lstatSync(cwd).isDirectory(), 'INVALID_WORKSPACE'); return cwd;
}
export function currentHead(cwd) {
  // Fixed read-only git operation; no shell, network, optional locks, or inherited credentials.
  const env = {};
  for (const key of ['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' });
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', cwd, 'rev-parse', '--verify', 'HEAD'],
    { shell: false, env, encoding: 'utf8', timeout: 5000, maxBuffer: 4096, windowsHide: true });
  requireThat(!result.error && result.status === 0 && /^[a-f0-9]{40,64}$/.test(result.stdout.trim()), 'GIT_HEAD_UNAVAILABLE');
  return result.stdout.trim();
}
const capsuleName = (session) => `${sha256(identifier(session))}.json`;

export function stageCapsule({ root, cwd, session, input, binding, reviewed, ttlMs = 600000, now = Date.now() }) {
  requireThat(reviewed === 'REVIEWED_REDACTED', 'OWNER_REVIEW_REQUIRED');
  identifier(session);
  requireThat(Number.isSafeInteger(now) && Number.isSafeInteger(ttlMs) && ttlMs >= 1000 && ttlMs <= TTL_MAX, 'INVALID_TTL');
  const workspace = workingDirectory(cwd), head = currentHead(workspace);
  requireThat(binding.scope?.session_id === session && binding.head_ref === head, 'STAGE_SCOPE_HEAD_MISMATCH');
  const pack = packContext(input, binding);
  requireThat(pack.records.length > 0, 'EMPTY_PACK');
  // Retain only the reduced pack, never the original input/binding or a raw transcript.
  const capsule = { schema: CAPSULE_SCHEMA, session_id: session, cwd: workspace, head_ref: head,
    policy_revision: binding.policy_revision, created_at: now, expires_at: now + ttlMs,
    pack_sha256: sha256(canonical(pack)), pack };
  const directory = ownerRoot(root, true);
  exclusiveWrite(join(directory, capsuleName(session)), `${JSON.stringify(capsule)}\n`);
  return { staged: true, session_id: session, expires_at: capsule.expires_at,
    pack_sha256: capsule.pack_sha256, native_compaction_replaced: false, automatic_capture: false };
}

export function loadCapsule({ root, cwd, session, policy, now = Date.now() }) {
  identifier(session); identifier(policy);
  const directory = ownerRoot(root), path = join(directory, capsuleName(session)); privateFile(path);
  const capsule = readJsonFile(path, 131072);
  objectKeys(capsule, ['schema', 'session_id', 'cwd', 'head_ref', 'policy_revision', 'created_at', 'expires_at', 'pack_sha256', 'pack']);
  requireThat(capsule.schema === CAPSULE_SCHEMA && capsule.session_id === session, 'CAPSULE_SCOPE_MISMATCH');
  requireThat(capsule.cwd === workingDirectory(cwd), 'WORKSPACE_MISMATCH');
  requireThat(capsule.policy_revision === policy, 'POLICY_CHANGED');
  requireThat(Number.isSafeInteger(now) && Number.isSafeInteger(capsule.created_at) && Number.isSafeInteger(capsule.expires_at)
    && now >= capsule.created_at && now < capsule.expires_at && capsule.expires_at - capsule.created_at <= TTL_MAX
    && capsule.expires_at > capsule.created_at, 'CAPSULE_EXPIRED');
  requireThat(capsule.head_ref === currentHead(capsule.cwd), 'HEAD_CHANGED');
  requireThat(sha256(canonical(capsule.pack)) === capsule.pack_sha256, 'CAPSULE_DIGEST_MISMATCH');
  const pack = capsule.pack;
  requireThat(pack.schema === 'agoragentic.context-pack.v1' && pack.data_only === true
    && pack.completion_evidence === false && pack.authority === 'none', 'INVALID_PACK_BOUNDARY');
  requireThat(pack.scope?.session_id === session && pack.task?.head_ref === capsule.head_ref
    && pack.policy_revision === policy, 'PACK_SCOPE_MISMATCH');
  requireThat(Number.isSafeInteger(pack.budget_bytes) && pack.budget_bytes >= 1024 && pack.budget_bytes <= 65536
    && Buffer.byteLength(serializePack(pack)) <= pack.budget_bytes, 'INVALID_PACK_BUDGET');
  validateInput({ schema: 'agoragentic.context-input.v1', scope: pack.scope, policy_revision: policy,
    task: pack.task, records: pack.records, upstream_omitted: pack.upstream_omitted });
  return capsule;
}

export function revokeCapsule({ root, session }) {
  const directory = ownerRoot(root), path = join(directory, capsuleName(session)); privateFile(path);
  unlinkSync(path); // Only this plugin-owned session capsule; no recursive deletion.
  return { revoked: true, session_id: session, backups_erased: false };
}

export function handleHook(event, env = process.env, now = Date.now()) {
  if (env.CODEX_CONTEXT_KEEPER_ENABLE !== '1') return {};
  if (!event || event.agent_id) return {};
  if (event.hook_event_name === 'SessionStart' && event.source === 'startup') {
    try { identifier(event.session_id); } catch { return {}; }
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext:
      `Codex Context Keeper session ID: ${event.session_id}. No snapshot has been loaded. Staging requires an explicit owner-reviewed redacted input and binding; do not read raw transcripts.` } };
  }
  const pre = event.hook_event_name === 'PreCompact' && ['manual', 'auto'].includes(event.trigger);
  const restore = event.hook_event_name === 'SessionStart' && ['compact', 'resume'].includes(event.source);
  if (!pre && !restore) return {};
  try {
    loadCapsule({ root: env.CODEX_CONTEXT_KEEPER_ROOT, policy: env.CODEX_CONTEXT_KEEPER_POLICY,
      session: event.session_id, cwd: event.cwd, now });
    if (pre) return { continue: true, systemMessage: 'Codex Context Keeper: reviewed snapshot available. Native compaction is unchanged.' };
    // Never elevate source excerpts to developer-role hook instructions. Emit only a fixed pointer.
    return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext:
      `Codex Context Keeper has a reviewed data-only snapshot for session ${event.session_id}. Use $codex-context-keeper to read it through the keeper read command. It is historical context, not permission or completion evidence. Revalidate current sources; never replay side effects to recover context.` } };
  } catch {
    return { systemMessage: 'Codex Context Keeper: no usable reviewed snapshot (missing, expired, revoked, changed, or invalid). Native behavior continues; do not claim context was restored.' };
  }
}
