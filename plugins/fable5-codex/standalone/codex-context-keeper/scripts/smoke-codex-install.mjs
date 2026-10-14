#!/usr/bin/env node
// Real Codex installation/discovery plus installed CLI lifecycle; no model turn.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { sha256, snapshotDigest } from '../lib/context-pack.mjs';

assert.ok(process.argv.length <= 4, 'Usage: node scripts/smoke-codex-install.mjs [CODEX_EXECUTABLE] [both|portable|compatibility]');
const codex = process.argv[2] || 'codex';
const layout = process.argv[3] || 'both';
assert.ok(['both', 'portable', 'compatibility'].includes(layout), 'Unsupported installation layout');
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempParent = realpathSync(tmpdir());
const temporary = realpathSync(mkdtempSync(join(tempParent, 'keeper-install-')));
const selector = 'codex-context-keeper@codex-context-keeper-local';
const marketplaceName = 'codex-context-keeper-local';
const report = [];

function run(command, args, cwd, env, extra = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', shell: false,
    windowsHide: true, timeout: 60000, maxBuffer: 1048576, ...extra });
  if (result.error) throw result.error;
  return result;
}
function success(result) { assert.equal(result.status, 0, result.stderr || result.stdout); return result.stdout; }

async function discover(env, cwd, marketplace) {
  const child = spawn(codex, ['--enable', 'hooks', 'app-server', '--listen', 'stdio://'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let nextId = 0; let stderr = '';
  child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-8192); });
  child.on('error', (error) => { for (const p of pending.values()) p.reject(error); });
  const closed = new Promise((resolveClose) => child.on('close', resolveClose));
  child.on('close', () => { for (const p of pending.values()) p.reject(new Error(`App-server closed: ${stderr}`)); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.method && message.id !== undefined) {
      child.stdin.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'No runtime actions authorized by installation smoke' } }) + '\n');
    } else if (pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error))); else request.resolve(message.result);
    }
  });
  async function rpc(method, params) {
    const id = ++nextId;
    let timer;
    try {
      return await new Promise((resolveResult, reject) => {
        timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}; ${stderr}`)); }, 20000);
        pending.set(id, { resolve: resolveResult, reject });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    } finally { clearTimeout(timer); }
  }
  try {
    await rpc('initialize', { clientInfo: { name: 'keeper_install_smoke', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const { plugin } = await rpc('plugin/read', { marketplacePath: join(marketplace, '.agents/plugins/marketplace.json'), pluginName: 'codex-context-keeper' });
    const hooks = await rpc('hooks/list', { cwds: [cwd] });
    assert.ok(plugin.skills.some((skill) => skill.name === 'codex-context-keeper:codex-context-keeper'));
    assert.equal(plugin.summary.interface.displayName, 'Codex Context Keeper');
    assert.equal(plugin.summary.interface.developerName, 'Agoragentic');
    assert.equal(hooks.data.length, 1); assert.deepEqual(hooks.data[0].errors, []);
    const installedHooks = hooks.data[0].hooks.filter((hook) => hook.pluginId === selector);
    assert.ok(installedHooks.every((hook) => hook.source === 'plugin' && hook.handlerType === 'command'));
    const skills = await rpc('skills/list', { cwds: [cwd], forceReload: true });
    assert.ok(skills.data.some((entry) => entry.skills.some((skill) => skill.name === 'codex-context-keeper:codex-context-keeper')));
    // Complete both installation paths before failing the hook-discovery gate.
    return { advertised: plugin.hooks.map((hook) => hook.eventName).sort(),
      discovered: installedHooks.map(({ eventName, trustStatus }) => ({ eventName, trustStatus })), warnings: hooks.data[0].warnings };
  } finally {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2000);
    await closed; clearTimeout(timer); lines.close();
  }
}

try {
  for (const mode of layout === 'both' ? ['portable', 'compatibility'] : [layout]) {
    const directory = join(temporary, mode); mkdirSync(directory);
    const codexHome = join(directory, 'codex-home'); mkdirSync(codexHome);
    const repo = join(directory, 'repository'); mkdirSync(repo);
    const marketplace = join(directory, 'marketplace');
    const env = {};
    for (const key of ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) if (process.env[key]) env[key] = process.env[key];
    Object.assign(env, { CODEX_HOME: codexHome, HOME: directory, USERPROFILE: directory,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' });
    if (mode === 'compatibility') {
      const prepare = [join(source, 'scripts/prepare-codex-plugin.mjs'), marketplace];
      assert.equal(JSON.parse(success(run(process.execPath, prepare, directory, env))).installed, false);
      assert.equal(run(process.execPath, prepare, directory, env).status, 2, 'Existing output must not be overwritten');
      assert.equal(existsSync(join(marketplace, 'plugin.json')), false);
    } else cpSync(source, marketplace, { recursive: true });
    const host = (args) => JSON.parse(success(run(codex, args, repo, env)));
    const git = (args) => success(run('git', ['-c', 'commit.gpgSign=false', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args], repo, env)).trim();
    const version = success(run(codex, ['--version'], repo, env)).trim();
    git(['init']); git(['commit', '--allow-empty', '-m', 'Synthetic fixture']);
    host(['plugin', 'marketplace', 'add', marketplace, '--json']);
    const installed = host(['plugin', 'add', selector, '--json']);
    assert.equal(installed.pluginId, selector);
    const installedRoot = realpathSync(installed.installedPath);
    assert.ok(installedRoot.startsWith(realpathSync(codexHome) + (process.platform === 'win32' ? '\\' : '/')));
    assert.deepEqual(readFileSync(join(installedRoot, 'lib/context-pack.mjs')), readFileSync(join(source, 'lib/context-pack.mjs')));
    assert.ok(host(['plugin', 'list', '--json']).installed.some((plugin) => plugin.pluginId === selector && plugin.enabled));
    const hookDiscovery = await discover(env, repo, marketplace);
    const bin = join(installedRoot, 'bin/codex-context-keeper.mjs');
    const cli = (args, extra = {}) => run(process.execPath, [bin, ...args], repo, env, extra);
    assert.deepEqual(JSON.parse(success(cli(['hook'], { input: 'malformed' }))), {});
    const head = git(['rev-parse', 'HEAD']);
    const session = 'synthetic-install-session';
    const input = { schema: 'agoragentic.context-input.v1', scope: { project_id: 'p', repo_id: 'r', worktree_id: 'w', session_id: session },
      policy_revision: 'policy1', task: { goal: 'Keep evidence', head_ref: head, required_ids: [] }, upstream_omitted: 0,
      records: [{ id: 'constraint', kind: 'constraint', text: 'Do not deploy. Original failure remains unresolved.',
        sha256: sha256('Do not deploy. Original failure remains unresolved.'), source: { id: 'src', revision: 'rev1' }, evidence_refs: ['failure-evidence'], requires: [] }] };
    const binding = { scope: input.scope, policy_revision: 'policy1', head_ref: head, source_revisions: { src: 'rev1' }, expected_digest: snapshotDigest(input), budget_bytes: 3000 };
    const inputFile = join(directory, 'input.json'), bindingFile = join(directory, 'binding.json');
    writeFileSync(inputFile, JSON.stringify(input)); writeFileSync(bindingFile, JSON.stringify(binding));
    const privateRoot = join(directory, 'private-capsules');
    const common = ['--root', privateRoot, '--cwd', repo, '--session', session];
    const stage = ['stage', '--input', inputFile, '--binding', bindingFile, ...common];
    assert.equal(cli([...stage, '--reviewed', 'NO']).status, 2);
    assert.equal(existsSync(privateRoot), false);
    assert.equal(JSON.parse(success(cli([...stage, '--reviewed', 'REVIEWED_REDACTED']))).staged, true);
    const read = ['read', ...common, '--policy', 'policy1'];
    assert.equal(JSON.parse(success(cli(read))).records[0].text, input.records[0].text);
    const enabledEnv = { ...env, CODEX_CONTEXT_KEEPER_ENABLE: '1', CODEX_CONTEXT_KEEPER_ROOT: privateRoot, CODEX_CONTEXT_KEEPER_POLICY: 'policy1' };
    const event = { hook_event_name: 'SessionStart', source: 'compact', cwd: repo, session_id: session, transcript_path: join(directory, 'must-not-be-read') };
    const handler = JSON.parse(readFileSync(join(installedRoot, 'hooks/hooks.json'))).hooks.SessionStart[0].hooks[0];
    const windows = process.platform === 'win32';
    const hookCommand = windows ? handler.commandWindows : handler.command;
    const hookArgs = windows ? ['-NoProfile', '-NonInteractive', '-Command', hookCommand] : ['-c', hookCommand];
    const hook = JSON.parse(success(run(windows ? 'pwsh' : 'sh', hookArgs, repo,
      { ...enabledEnv, PLUGIN_ROOT: installedRoot }, { input: JSON.stringify(event) })));
    assert.match(hook.hookSpecificOutput.additionalContext, /reviewed data-only snapshot/);
    assert.ok(!JSON.stringify(hook).includes(input.records[0].text));
    assert.equal(cli(['read', ...common, '--policy', 'wrong']).status, 2);
    host(['plugin', 'remove', selector, '--json']);
    assert.ok(!host(['plugin', 'list', '--json']).installed.some((plugin) => plugin.pluginId === selector));
    assert.equal(existsSync(installedRoot), false);
    assert.equal(existsSync(join(privateRoot, sha256(session) + '.json')), true);
    host(['plugin', 'add', selector, '--json']);
    assert.equal(JSON.parse(success(cli(read))).records[0].text, input.records[0].text);
    git(['commit', '--allow-empty', '-m', 'Changed HEAD']);
    assert.match(cli(read).stderr, /HEAD_CHANGED/);
    assert.equal(JSON.parse(success(cli(['revoke', '--root', privateRoot, '--session', session]))).revoked, true);
    const revoked = JSON.parse(success(cli(['hook'], { env: enabledEnv, input: JSON.stringify(event) })));
    assert.equal(revoked.hookSpecificOutput, undefined); assert.match(revoked.systemMessage, /no usable/);
    host(['plugin', 'remove', selector, '--json']);
    host(['plugin', 'marketplace', 'remove', marketplaceName, '--json']);
    assert.ok(!host(['plugin', 'list', '--json']).installed.some((plugin) => plugin.pluginId === selector));
    report.push({ mode, version, installed: true, hookDiscovery, installed_cli_lifecycle: 'passed', removed: true });
  }
  const expectedEvents = JSON.stringify(['preCompact', 'sessionStart']);
  const passed = report.every(({ hookDiscovery }) => JSON.stringify(hookDiscovery.advertised) === expectedEvents
    && JSON.stringify(hookDiscovery.discovered.map((hook) => hook.eventName).sort()) === expectedEvents
    && hookDiscovery.discovered.every((hook) => hook.trustStatus === 'untrusted') && hookDiscovery.warnings.length === 0);
  console.log(JSON.stringify({ passed, layout, checks: report, native_compaction_exercised: false, model_turns: 0, normal_codex_home_modified: false }, null, 2));
  assert.ok(passed, 'Host hook discovery gate failed; installation/CLI success does not establish native hook availability');
} finally {
  assert.equal(dirname(temporary), tempParent, 'Refusing cleanup outside the temporary parent');
  rmSync(temporary, { recursive: true, force: true });
}
