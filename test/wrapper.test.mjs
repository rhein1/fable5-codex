import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bashWrapper = 'plugins/fable5-codex/scripts/fable5-codex.sh';
const powerShellWrapper = join(repoRoot, 'plugins', 'fable5-codex', 'scripts', 'fable5-codex.ps1');

function runBash(args, env = process.env) {
  return spawnSync('bash', [bashWrapper, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
    shell: false,
  });
}

function findPowerShell() {
  for (const executable of ['pwsh', 'powershell']) {
    const result = spawnSync(executable, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8',
      shell: false,
    });
    if (result.status === 0) return executable;
  }
  return null;
}

function runPowerShell(executable, args) {
  return spawnSync(executable, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', powerShellWrapper,
    ...args,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
}

test('Bash wrapper recognizes flags when optional focus is omitted', () => {
  const result = runBash(['audit', '.', '--subagents', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^model=gpt-5\.6-sol$/m);
  assert.match(result.stdout, /^reasoning_effort=ultra$/m);
  assert.match(result.stdout, /I explicitly authorize parallel subagents/);
  assert.doesNotMatch(result.stdout, /Focus: --subagents/);
});

test('Bash wrapper accepts flags before positional arguments', () => {
  const result = runBash(['--dry-run', '--ecf', 'audit', 'src', 'correctness']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Scope: src Focus: correctness\./);
  assert.match(result.stdout, /Include an ECF run contract/);
});

test('Bash wrapper rejects a GPT-5.6 launch on an outdated Codex CLI', () => {
  const testRoot = join(repoRoot, 'tmp');
  mkdirSync(testRoot, { recursive: true });
  const target = mkdtempSync(join(testRoot, 'fable5-wrapper-'));
  try {
    const fakeCodex = join(target, 'codex');
    writeFileSync(fakeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.143.9"\n');
    chmodSync(fakeCodex, 0o755);
    const bashFakeCodex = `./${relative(repoRoot, fakeCodex).replaceAll('\\', '/')}`;
    const result = runBash(['audit', '.', `--codex-executable=${bashFakeCodex}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires Codex CLI 0\.144\.0 or newer/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('Bash wrapper compares multi-digit version components semantically', () => {
  const testRoot = join(repoRoot, 'tmp');
  mkdirSync(testRoot, { recursive: true });
  const target = mkdtempSync(join(testRoot, 'fable5-wrapper-semver-'));
  try {
    const fakeCodex = join(target, 'codex');
    writeFileSync(fakeCodex, '#!/usr/bin/env bash\necho "codex-cli 0.143.1000"\n');
    chmodSync(fakeCodex, 0o755);
    const bashFakeCodex = `./${relative(repoRoot, fakeCodex).replaceAll('\\', '/')}`;
    const result = runBash(['audit', '.', `--codex-executable=${bashFakeCodex}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requires Codex CLI 0\.144\.0 or newer/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('Bash wrapper is directly executable on non-Windows checkouts', { skip: process.platform === 'win32' }, () => {
  const result = spawnSync(join(repoRoot, bashWrapper), ['audit', '.', '--dry-run'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
});

test('Bash wrapper preflights a supported CLI and passes literal arguments', () => {
  const testRoot = join(repoRoot, 'tmp');
  mkdirSync(testRoot, { recursive: true });
  const target = mkdtempSync(join(testRoot, 'fable5 wrapper current '));
  try {
    const fakeCodex = join(target, 'codex');
    const capture = join(target, 'args.txt');
    writeFileSync(fakeCodex, `#!/usr/bin/env bash\nif [[ \"\${1:-}\" == \"--version\" ]]; then\n  echo \"codex-cli 0.144.0\"\n  exit 0\nfi\nprintf '%s\\n' \"$@\" > \"$(dirname \"$0\")/args.txt\"\n`);
    chmodSync(fakeCodex, 0o755);
    const bashFakeCodex = `./${relative(repoRoot, fakeCodex).replaceAll('\\', '/')}`;
    const result = runBash(['audit', 'src', '--codex-executable=' + bashFakeCodex]);
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(capture, 'utf8').trim().split(/\r?\n/);
    assert.deepEqual(args.slice(0, 6), [
      'exec',
      '--model',
      'gpt-5.6-sol',
      '-c',
      'model_reasoning_effort="ultra"',
      '--sandbox',
    ]);
    assert.equal(args[6], 'read-only');
    assert.match(args[7], /^Use \$fable-audit\. Scope: src/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('PowerShell wrapper dry-run exposes executable and subagent authorization', (context) => {
  const powerShell = findPowerShell();
  if (!powerShell) {
    context.skip('PowerShell is unavailable');
    return;
  }
  const result = runPowerShell(powerShell, ['-DryRun', '-Subagents', '-CodexExecutable', 'custom-codex']);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.model, 'gpt-5.6-sol');
  assert.equal(output.reasoningEffort, 'ultra');
  assert.equal(output.codexExecutable, 'custom-codex');
  assert.equal(output.minimumCliVersion, '0.144.0');
  assert.match(output.prompt, /I explicitly authorize parallel subagents/);
});

test('PowerShell wrapper rejects a GPT-5.6 launch on an outdated Codex CLI', (context) => {
  const powerShell = findPowerShell();
  if (!powerShell) {
    context.skip('PowerShell is unavailable');
    return;
  }
  const target = mkdtempSync(join(repoRoot, 'tmp', 'fable5-wrapper-pwsh-'));
  try {
    const fakeCodex = join(target, 'codex.ps1');
    writeFileSync(fakeCodex, 'param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)\nif ($Rest[0] -eq "--version") { Write-Output "codex-cli 0.143.9"; exit 0 }\nexit 0\n');
    const result = runPowerShell(powerShell, ['-CodexExecutable', fakeCodex]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /requires Codex CLI 0\.144\.0 or newer/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('PowerShell wrapper preflights a supported CLI and passes literal arguments', (context) => {
  const powerShell = findPowerShell();
  if (!powerShell) {
    context.skip('PowerShell is unavailable');
    return;
  }
  const target = mkdtempSync(join(repoRoot, 'tmp', 'fable5 wrapper pwsh current '));
  try {
    const fakeCodex = join(target, 'codex current.ps1');
    const capture = join(target, 'args.txt');
    const escapedCapture = capture.replaceAll("'", "''");
    writeFileSync(fakeCodex, [
      'param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)',
      'if ($Rest[0] -eq "--version") { Write-Output "codex-cli 0.144.0"; exit 0 }',
      `$Rest | Set-Content -LiteralPath '${escapedCapture}' -Encoding UTF8`,
      'exit 0',
      '',
    ].join('\n'));

    const result = runPowerShell(powerShell, [
      '-Mode', 'audit',
      '-Scope', 'src path',
      '-Focus', 'money safety',
      '-CodexExecutable', fakeCodex,
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const args = readFileSync(capture, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    assert.deepEqual(args.slice(0, 7), [
      'exec',
      '--model',
      'gpt-5.6-sol',
      '-c',
      'model_reasoning_effort="ultra"',
      '--sandbox',
      'read-only',
    ]);
    assert.match(args[7], /^Use \$fable-audit\. Scope: src path Focus: money safety\./);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
