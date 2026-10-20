import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolveCodexLauncher } from '../plugins/fable5-codex/scripts/codex-launcher.mjs';

const scripts = fileURLToPath(new URL('../plugins/fable5-codex/scripts/', import.meta.url));
const resolver = join(scripts, 'codex-launcher.mjs');

function shellPath(shell) {
  if (process.platform === 'win32' && shell === 'Bash') {
    const gitBash = join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe');
    if (existsSync(gitBash)) return gitBash;
  }
  return resolveCodexLauncher(process.platform === 'win32' ? shell === 'Bash' ? 'bash.exe' : 'pwsh.exe' : shell === 'Bash' ? 'bash' : 'pwsh').path;
}

function fixture(context, mixed = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable npm & launcher ')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  const npm = join(root, 'npm'); const native = join(root, 'native');
  mkdirSync(join(npm, 'node_modules/@openai/codex/bin'), { recursive: true }); mkdirSync(native);
  const entrypoint = join(npm, 'node_modules/@openai/codex/bin/codex.js');
  const log = join(root, 'calls.jsonl');
  writeFileSync(join(npm, 'node_modules/@openai/codex/package.json'), JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } }));
  const shims = {
    codex: `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$(dirname "$0")/node_modules/@openai/codex/bin/codex.js" "$@"\n`,
    'codex.ps1': `& '${process.execPath.replaceAll("'", "''")}' "$PSScriptRoot/node_modules/@openai/codex/bin/codex.js" @args\nexit $LASTEXITCODE\n`,
    'codex.cmd': ['@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0', '',
      'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"', '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*'].join('\r\n'),
  };
  for (const [name, content] of Object.entries(shims)) { writeFileSync(join(npm, name), content); chmodSync(join(npm, name), 0o755); }
  writeFileSync(entrypoint, `const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ entrypoint: __filename, args: process.argv.slice(2) }) + '\\n');
if (process.argv[2] === '--version') console.log('codex-cli 0.152.0');
else if (process.argv[2] === 'app-server') require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const message = JSON.parse(line);
 if (message.method === 'initialize') console.log(JSON.stringify({id:message.id,result:{}}));
 if (message.method === 'model/list') console.log(JSON.stringify({id:message.id,result:{data:['gpt-6.1-sol','gpt-6-luna'].map(model=>({model,defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'}]})),nextCursor:null}}));
});
else if (process.argv[2] !== 'exec') process.exit(99);
`);
  if (mixed) { writeFileSync(join(native, 'codex.exe'), 'different client must not run'); chmodSync(join(native, 'codex.exe'), 0o755); }
  const runtimeDirectories = [dirname(process.execPath)];
  for (const shell of ['PowerShell', 'Bash']) {
    try { runtimeDirectories.push(dirname(shellPath(shell))); } catch { }
  }
  if (process.platform === 'win32') runtimeDirectories.push(join(process.env.SystemRoot, 'System32'));
  else runtimeDirectories.push('/usr/bin', '/bin');
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = [npm, ...(mixed ? [native] : []), ...runtimeDirectories].join(delimiter);
  delete env.FABLE5_CODEX_EXECUTABLE;
  return { root, npm, native, entrypoint, log, env };
}

for (const mixed of [false, true]) {
  for (const shell of ['PowerShell', 'Bash']) {
    test(`${shell} uses one npm launcher for version, catalog and execution with ${mixed ? 'a later native client' : 'no native client'}`, (context) => {
      const data = fixture(context, mixed);
      let command;
      try { command = shellPath(shell); }
      catch { context.skip(`${shell} unavailable`); return; }
      const args = shell === 'Bash' ? [join(scripts, 'fable5-codex.sh'), 'audit', 'scope & literal', 'focus; literal']
        : ['-NoProfile', '-File', join(scripts, 'fable5-codex.ps1'), '-Mode', 'audit', '-Scope', 'scope & literal', '-Focus', 'focus; literal'];
      const result = spawnSync(command, args, { env: data.env, encoding: 'utf8', shell: false, timeout: 30000 });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const calls = readFileSync(data.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
      assert.deepEqual(calls.map((call) => call.args[0]), ['--version', 'app-server', 'exec']);
      assert.ok(calls.every((call) => call.entrypoint === data.entrypoint));
      assert.equal(calls[2].args.at(-1).includes('Scope: scope & literal Focus: focus; literal.'), true);
    });
  }
}

test('explicit npm cmd override binds the selected package rather than the later desktop executable', (context) => {
  const data = fixture(context, true);
  const result = spawnSync(process.execPath, [resolver, 'resolve', join(data.npm, 'codex.cmd')], { env: data.env, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  const launcher = JSON.parse(result.stdout);
  assert.equal(launcher.path, join(data.npm, 'codex.cmd'));
  assert.deepEqual(launcher.prefixArgs, [data.entrypoint]);
  const invoked = spawnSync(process.execPath, [resolver, 'run', JSON.stringify(launcher), '--version'], { env: data.env, encoding: 'utf8', shell: false });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.match(invoked.stdout, /codex-cli 0.152.0/);
});

test('explicit native executable remains selected instead of preferring an npm package', (context) => {
  const data = fixture(context, true);
  const launcher = resolveCodexLauncher(join(data.native, 'codex.exe'));
  assert.equal(launcher.command, join(data.native, 'codex.exe'));
  assert.deepEqual(launcher.prefixArgs, []);
});

test('explicit PowerShell scripts preserve custom environment and argument semantics', (context) => {
  try { shellPath('PowerShell'); } catch { context.skip('PowerShell unavailable'); return; }
  const data = fixture(context);
  writeFileSync(join(data.npm, 'codex.ps1'), "$env:CODEX_HOME = 'custom-home'\n& node \"$PSScriptRoot/node_modules/@openai/codex/bin/codex.js\" --sandbox read-only @args\n");
  if (process.platform !== 'win32') chmodSync(join(data.npm, 'codex.ps1'), 0o644);
  const launcher = resolveCodexLauncher(join(data.npm, 'codex.ps1'));
  assert.deepEqual(launcher.prefixArgs, ['-NoProfile', '-File', join(data.npm, 'codex.ps1')]);
});

test('customized npm batch launchers are not silently bypassed', { skip: process.platform !== 'win32' }, (context) => {
  const data = fixture(context);
  const path = join(data.npm, 'codex.cmd');
  writeFileSync(path, readFileSync(path, 'utf8').replace('%*', '--sandbox read-only %*'));
  assert.throws(() => resolveCodexLauncher(path), /unsupported_codex_batch_launcher/);
});

test('default npm-only Windows launcher does not require PowerShell 7', { skip: process.platform !== 'win32' }, (context) => {
  const data = fixture(context);
  const env = { ...data.env, PATH: [data.npm, dirname(process.execPath)].join(delimiter) };
  const resolved = spawnSync(process.execPath, [resolver, 'resolve-base64', 'codex'], { env, encoding: 'utf8', shell: false });
  assert.equal(resolved.status, 0, resolved.stderr);
  const launcher = JSON.parse(Buffer.from(resolved.stdout.trim(), 'base64').toString('utf8'));
  assert.equal(launcher.path, join(data.npm, 'codex.cmd'));
  assert.deepEqual(launcher.prefixArgs, [data.entrypoint]);
  const result = spawnSync(process.execPath, [resolver, 'run-base64', resolved.stdout.trim(), '--version'], { env, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /codex-cli 0.152.0/);
});
