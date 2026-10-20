import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/sync-personal-plugin.ps1', import.meta.url));
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const powerShell = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8', shell: false }).status === 0 ? 'pwsh' : null;

function fixture(context, injection = '', after = '') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable-sync-')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  const source = join(root, 'source');
  const home = join(root, 'home');
  const target = join(home, 'plugins/fable5-codex');
  for (const [directory, content] of [[source, 'new'], [target, 'old']]) {
    mkdirSync(join(directory, '.codex-plugin'), { recursive: true });
    writeFileSync(join(directory, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'fable5-codex' }));
    writeFileSync(join(directory, 'content.txt'), content);
  }
  const command = join(root, 'run.ps1');
  writeFileSync(command, `$ErrorActionPreference = 'Stop'\n. ${quote(script)}\nSet-Variable -Name HOME -Value ${quote(home)} -Force\n${injection}\nInvoke-PersonalPluginSync -CanonicalPlugin ${quote(source)} -PersonalPlugin ${quote(target)}\n${after}\n`);
  return { root, source, home, target, run: () => spawnSync(powerShell, ['-NoProfile', '-File', command], { encoding: 'utf8', shell: false }) };
}

test('personal sync stages, verifies and retains the old installation as a recoverable backup', { skip: !powerShell }, (context) => {
  const fixtureData = fixture(context);
  const result = fixtureData.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(fixtureData.target, 'content.txt'), 'utf8'), 'new');
  const backups = readdirSync(dirname(fixtureData.target)).filter((name) => name.startsWith('fable5-codex.backup-'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(dirname(fixtureData.target), backups[0], 'content.txt'), 'utf8'), 'old');
  assert.match(result.stdout, /Recoverable backup retained:/);
});

for (const phase of ['copy', 'promotion']) {
  test(`personal sync ${phase} failure preserves or restores the old installation`, { skip: !powerShell }, (context) => {
    const injection = phase === 'copy' ? "function Copy-Item { throw 'fixture copy failure' }"
      : "function Move-PluginDirectory([string]$Source, [string]$Destination) { if ($Source -match '\\.stage-') { throw 'fixture promotion failure' }; [System.IO.Directory]::Move($Source, $Destination) }";
    const fixtureData = fixture(context, injection);
    const result = fixtureData.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fixture (?:copy|promotion) failure/);
    assert.equal(readFileSync(join(fixtureData.target, 'content.txt'), 'utf8'), 'old');
    assert.equal(readdirSync(dirname(fixtureData.target)).some((name) => name.startsWith('fable5-codex.backup-')), false);
  });
}

test('personal sync refuses a non-plugin target before copying or moving it', { skip: !powerShell }, (context) => {
  const fixtureData = fixture(context);
  writeFileSync(join(fixtureData.target, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'unrelated' }));
  assert.notEqual(fixtureData.run().status, 0);
  assert.equal(readFileSync(join(fixtureData.target, 'content.txt'), 'utf8'), 'old');
  assert.deepEqual(readdirSync(dirname(fixtureData.target)), ['fable5-codex']);
});

test('personal sync refuses reparse ancestors before reading or writing plugin bytes', { skip: !powerShell }, (context) => {
  const fixtureData = fixture(context, "function Get-Item { [pscustomobject]@{ Attributes = [System.IO.FileAttributes]::ReparsePoint } }");
  const result = fixtureData.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /reparse\/link component/);
  assert.equal(readFileSync(join(fixtureData.target, 'content.txt'), 'utf8'), 'old');
  assert.deepEqual(readdirSync(dirname(fixtureData.target)), ['fable5-codex']);
});

test('personal sync actually restores the retained previous package through the same verified path', { skip: !powerShell }, (context) => {
  const after = "$backup = Get-ChildItem -LiteralPath (Split-Path -Parent $PersonalPlugin) -Directory -Filter 'fable5-codex.backup-*' | Select-Object -First 1\nInvoke-PersonalPluginSync -CanonicalPlugin $backup.FullName -PersonalPlugin $PersonalPlugin";
  const fixtureData = fixture(context, '', after.replaceAll('$PersonalPlugin', '(Join-Path $HOME \'plugins/fable5-codex\')'));
  const result = fixtureData.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(fixtureData.target, 'content.txt'), 'utf8'), 'old');
  const backups = readdirSync(dirname(fixtureData.target)).filter((name) => name.startsWith('fable5-codex.backup-'));
  assert.equal(backups.length, 2);
  assert.deepEqual(backups.map((name) => readFileSync(join(dirname(fixtureData.target), name, 'content.txt'), 'utf8')).sort(), ['new', 'old']);
});
