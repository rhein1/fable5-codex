import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { isolatedEnvironment, install, packageDigest, prepareMarketplace, privateRuntime, run } from './fable-runtime.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));

export async function discoverInstallation(codex, env, cwd, marketplace) {
  const child = spawn(codex, ['app-server'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map(); let nextId = 0;
  const lines = createInterface({ input: child.stdout });
  const fail = () => { for (const request of pending.values()) request.reject(new Error('installation_discovery_closed')); };
  child.on('error', fail); child.on('close', fail); child.stdin.on('error', fail);
  lines.on('line', (line) => {
    let message; try { message = JSON.parse(line); } catch { return; }
    if (message.method && message.id !== undefined) child.stdin.write(`${JSON.stringify({ id: message.id, error: { code: -32601, message: 'Read-only discovery only' } })}\n`);
    else if (pending.has(message.id)) {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.error) request.reject(new Error('installation_discovery_rejected')); else request.resolve(message.result);
    }
  });
  async function rpc(method, params) {
    const id = ++nextId; let timer;
    try { return await new Promise((resolveResult, reject) => {
      timer = setTimeout(() => { pending.delete(id); reject(new Error('installation_discovery_timeout')); }, 15000);
      pending.set(id, { resolve: resolveResult, reject }); child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    }); } finally { clearTimeout(timer); }
  }
  try {
    await rpc('initialize', { clientInfo: { name: 'fable_install_smoke', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    const { plugin } = await rpc('plugin/read', { marketplacePath: join(marketplace, '.agents/plugins/marketplace.json'), pluginName: 'fable5-codex' });
    const skills = await rpc('skills/list', { cwds: [cwd], forceReload: true });
    const discovered = skills.data.flatMap((entry) => entry.skills.map((skill) => skill.name));
    assert.ok(plugin.skills.some((skill) => skill.name === 'fable5-codex:fable-verify'));
    assert.ok(discovered.includes('fable5-codex:fable-verify'));
    return { primarySkillDiscovered: true, modelTurnExecuted: false, discoveryErrors: skills.data.flatMap((entry) => entry.errors || []) };
  } finally { lines.close(); child.stdin.destroy(); child.stdout.destroy(); child.kill(); child.unref(); }
}

export async function smoke(codex, previousSource) {
  const runtime = privateRuntime('fable-install-');
  try {
    const home = join(runtime.root, 'home'); const work = join(runtime.root, 'work'); const marketplace = join(runtime.root, 'marketplace');
    mkdirSync(home); mkdirSync(work); const env = isolatedEnvironment(home);
    const source = join(repo, 'plugins/fable5-codex'); const previousDigest = packageDigest(previousSource); const candidateDigest = packageDigest(source);
    prepareMarketplace(marketplace, previousSource);
    let installed = install(codex, marketplace, work, env);
    assert.equal(packageDigest(installed), previousDigest);
    const target = join(marketplace, 'plugins/fable5-codex');
    run(process.execPath, [join(repo, 'bin/install.mjs'), '--project', '--force', '--no-codex-add'], marketplace, env);
    installed = install(codex, marketplace, work, env);
    assert.equal(packageDigest(installed), candidateDigest);
    const discovery = await discoverInstallation(codex, env, work, marketplace);
    assert.deepEqual(discovery.discoveryErrors, []);
    assert.match(run(process.execPath, [join(installed, 'scripts/verify-completion.mjs'), '--help'], work, env), /Fable completion verification/);
    const resolved = resolve(target);
    assert.ok(resolved.startsWith(resolve(runtime.root) + (process.platform === 'win32' ? '\\' : '/')));
    rmSync(target, { recursive: true }); cpSync(previousSource, target, { recursive: true });
    installed = install(codex, marketplace, work, env); assert.equal(packageDigest(installed), previousDigest);
    run(process.execPath, [join(repo, 'bin/install.mjs'), '--project', '--force', '--no-codex-add'], marketplace, env);
    installed = install(codex, marketplace, work, env); assert.equal(packageDigest(installed), candidateDigest);
    const result = { version: 'fable-install-smoke/1', codexVersion: run(codex, ['--version'], work, env).trim(),
      previousVersion: JSON.parse(readFileSync(join(previousSource, '.codex-plugin/plugin.json'))).version,
      versionInstalled: JSON.parse(readFileSync(join(installed, '.codex-plugin/plugin.json'))).version,
      candidateDigest, previousDigest, initialInstall: true, projectUpgrade: true, rollback: true, finalUpgrade: true, discovery,
      personalHomeModified: false, modelTurnExecuted: false };
    return result;
  } finally { runtime.cleanup(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(await smoke(process.argv[2], process.argv[3]), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${error.stack}\n`); process.exitCode = 2; }
}
