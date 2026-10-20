import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fingerprintSources } from '../plugins/fable5-codex/scripts/observe-check.mjs';

export function restrictDirectory(root) {
  if (process.platform !== 'win32') chmodSync(root, 0o700);
  if (process.platform === 'win32') {
    const who = spawnSync('whoami', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = who.stdout?.match(/S-\d(?:-\d+)+/u)?.[0];
    if (!sid) throw new Error('private_runtime_identity_unavailable');
    const acl = spawnSync('icacls', [root, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
    if (acl.status !== 0) throw new Error('private_runtime_acl_unavailable');
  }
}

export function privateRuntime(prefix) {
  const parent = realpathSync(tmpdir());
  const root = realpathSync(mkdtempSync(join(parent, prefix)));
  if (dirname(root) !== parent) throw new Error('private_runtime_root_invalid');
  restrictDirectory(root);
  return { root, cleanup() {
    if (dirname(realpathSync(root)) !== parent || !root.split(/[\\/]/).at(-1).startsWith(prefix)) throw new Error('runtime_cleanup_refused');
    rmSync(root, { recursive: true, force: true });
  } };
}

export function isolatedEnvironment(home) {
  const env = {};
  for (const key of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'PROGRAMDATA', 'LANG', 'LC_ALL', 'TZ']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { CODEX_HOME: home, HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData/Roaming'), LOCALAPPDATA: join(home, 'AppData/Local'), GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_TERMINAL_PROMPT: '0' });
  return env;
}

export function configureEvaluationPermissions(home, originalAuth, installedRoot) {
  const quoted = (value) => JSON.stringify(value.replaceAll('\\', '/'));
  appendFileSync(join(home, 'config.toml'), `\n[permissions.fable-evaluation.filesystem]\n":root" = "deny"\n":minimal" = "read"\n${quoted(join(home, 'auth.json'))} = "deny"\n${quoted(originalAuth)} = "deny"\n${installedRoot ? `${quoted(installedRoot)} = "read"\n` : ''}[permissions.fable-evaluation.filesystem.":workspace_roots"]\n"." = "read"\n[permissions.fable-evaluation.network]\nenabled = false\n`);
}

export function run(command, args, cwd, env, input) {
  const result = spawnSync(command, args, { cwd, env, input, encoding: 'utf8', shell: false, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error('isolated_command_failed');
  return result.stdout;
}

export function filesIn(root, prefix = '', budget = { entries: 0 }) {
  if (prefix.length > 512 || prefix.split('/').length > 32) throw new Error('source_inventory_limit');
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    budget.entries += 1;
    if (budget.entries > 4096 || entry.isSymbolicLink()) throw new Error('source_inventory_limit_or_link');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...filesIn(resolve(root, entry.name), relative, budget));
    else if (entry.isFile()) paths.push(relative);
    else throw new Error('source_regular_files_required');
  }
  return paths.sort();
}

export function packageDigest(root) { return fingerprintSources(realpathSync(root), filesIn(root)).digest; }

export function prepareMarketplace(root, pluginSource) {
  mkdirSync(join(root, '.agents', 'plugins'), { recursive: true });
  mkdirSync(join(root, 'plugins'));
  cpSync(pluginSource, join(root, 'plugins', 'fable5-codex'), { recursive: true });
  writeFileSync(join(root, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({ name: 'fable5-local', plugins: [{ name: 'fable5-codex',
    source: { source: 'local', path: './plugins/fable5-codex' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' } }] }));
}

export function install(codex, marketplace, cwd, env) {
  const before = JSON.parse(run(codex, ['plugin', 'list', '--json'], cwd, env));
  if (before.installed?.some((entry) => entry.name === 'fable5-codex' && entry.pluginId !== 'fable5-codex@fable5-local')) throw new Error('isolated_home_contains_personal_plugin');
  run(codex, ['plugin', 'marketplace', 'add', marketplace, '--json'], cwd, env);
  const installed = JSON.parse(run(codex, ['plugin', 'add', 'fable5-codex@fable5-local', '--json'], cwd, env));
  if (installed.pluginId !== 'fable5-codex@fable5-local' || !installed.installedPath) throw new Error('isolated_plugin_install_failed');
  const installedRoot = realpathSync(installed.installedPath);
  if (!installedRoot.startsWith(realpathSync(env.CODEX_HOME) + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('installation_escaped_isolated_home');
  return installedRoot;
}

export function runTrial(command, args, cwd, env, prompt, timeoutMs) {
  return new Promise((resolveResult) => {
    const started = performance.now();
    const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = ''; let stopped = false; let settled = false; let grace;
    function stop() {
      if (settled || stopped) return;
      stopped = true;
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true, timeout: 10000 });
      else if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      grace = setTimeout(() => finish(null), 2000);
    }
    function finish(exitCode) {
      if (settled) return;
      settled = true; clearTimeout(deadline); clearTimeout(grace);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref();
      resolveResult({ exitCode: stopped ? null : exitCode, stopped, durationMs: performance.now() - started,
        stdout, stderr, cleanupVerified: false });
    }
    const deadline = setTimeout(stop, timeoutMs);
    child.on('error', () => finish(null)); child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => { if (stopped || settled) return; stdout += chunk.toString('utf8'); if (stdout.length > 4 * 1024 * 1024) { stdout = stdout.slice(0, 4 * 1024 * 1024); stop(); } });
    child.stderr.on('data', (chunk) => { if (stopped || settled) return; stderr += chunk.toString('utf8'); if (stderr.length > 1024 * 1024) { stderr = stderr.slice(0, 1024 * 1024); stop(); } });
    child.on('close', (code) => finish(code)); child.stdin.end(prompt);
  });
}

export function readManifest(root) { return JSON.parse(readFileSync(join(root, '.codex-plugin', 'plugin.json'), 'utf8')); }
