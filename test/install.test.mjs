import assert from 'node:assert/strict';
import {
  chmodSync,
  cpSync,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const installer = join(repoRoot, 'bin', 'install.mjs');

function run(args, cwd = repoRoot, installerPath = installer, env = process.env) {
  return spawnSync(process.execPath, [installerPath, ...args], {
    cwd,
    encoding: 'utf8',
    env,
    shell: false,
  });
}

test('rejects unsafe marketplace names before any codex command can run', () => {
  const result = run(['--dry-run', '--marketplace-name=personal&echo-injected']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /marketplace name must be/);
});

test('accepts a bounded marketplace name in dry-run mode', () => {
  const result = run(['--dry-run', '--no-codex-add', '--marketplace-name=fable5-local_1']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry run: no files changed/);
});

test('requires --force before replacing an existing copied plugin', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-installer-'));
  try {
    const first = run(['--project', '--no-codex-add'], target);
    assert.equal(first.status, 0, first.stderr);
    assert.ok(existsSync(join(target, 'plugins', 'fable5-codex')));

    const second = run(['--project', '--no-codex-add'], target);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /Rerun with --force/);

    const forced = run(['--project', '--force', '--no-codex-add'], target);
    assert.equal(forced.status, 0, forced.stderr);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('project install never deletes the plugin when source and destination are identical', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-self-copy-'));
  try {
    mkdirSync(join(target, 'bin'), { recursive: true });
    cpSync(installer, join(target, 'bin', 'install.mjs'));
    cpSync(
      join(repoRoot, 'plugins', 'fable5-codex'),
      join(target, 'plugins', 'fable5-codex'),
      { recursive: true },
    );

    const isolatedInstaller = join(target, 'bin', 'install.mjs');
    const result = run(['--project', '--no-codex-add'], target, isolatedInstaller);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /copy skipped/);
    assert.ok(existsSync(join(target, 'plugins', 'fable5-codex', '.codex-plugin', 'plugin.json')));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('project install refuses a plugin leaf alias outside the target root', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-alias-copy-'));
  try {
    const packageRoot = join(target, 'package');
    const projectRoot = join(target, 'project');
    mkdirSync(join(packageRoot, 'bin'), { recursive: true });
    mkdirSync(join(projectRoot, 'plugins'), { recursive: true });
    cpSync(installer, join(packageRoot, 'bin', 'install.mjs'));
    const pluginSource = join(packageRoot, 'plugins', 'fable5-codex');
    cpSync(join(repoRoot, 'plugins', 'fable5-codex'), pluginSource, { recursive: true });
    symlinkSync(
      pluginSource,
      join(projectRoot, 'plugins', 'fable5-codex'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const isolatedInstaller = join(packageRoot, 'bin', 'install.mjs');
    const result = run(['--project', '--force', '--no-codex-add'], projectRoot, isolatedInstaller);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to follow a path outside target root/);
    assert.ok(existsSync(join(pluginSource, '.codex-plugin', 'plugin.json')));
  } finally {
    const alias = join(target, 'project', 'plugins', 'fable5-codex');
    if (existsSync(alias)) unlinkSync(alias);
    rmSync(target, { recursive: true, force: true });
  }
});

test('rejects non-string marketplace names', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-marketplace-type-'));
  try {
    const metadataDir = join(target, '.agents', 'plugins');
    mkdirSync(metadataDir, { recursive: true });
    writeFileSync(
      join(metadataDir, 'marketplace.json'),
      `${JSON.stringify({ name: ['safe'], interface: {}, plugins: [] })}\n`,
    );
    const result = run(['--project', '--no-codex-add'], target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketplace name must be a string/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('rejects an explicitly null marketplace name', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-marketplace-null-'));
  try {
    const metadataDir = join(target, '.agents', 'plugins');
    mkdirSync(metadataDir, { recursive: true });
    writeFileSync(
      join(metadataDir, 'marketplace.json'),
      `${JSON.stringify({ name: null, interface: {}, plugins: [] })}\n`,
    );
    const result = run(['--project', '--no-codex-add'], target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketplace name must be a string/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('rejects an explicitly null marketplace interface with a validation error', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-interface-null-'));
  try {
    const metadataDir = join(target, '.agents', 'plugins');
    mkdirSync(metadataDir, { recursive: true });
    writeFileSync(
      join(metadataDir, 'marketplace.json'),
      `${JSON.stringify({ name: 'fable5-local', interface: null, plugins: [] })}\n`,
    );
    const result = run(['--project', '--no-codex-add'], target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /marketplace interface must be an object/);
    assert.doesNotMatch(result.stderr, /TypeError/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('rejects malformed marketplace JSON with a validation error', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-marketplace-parse-'));
  try {
    const metadataDir = join(target, '.agents', 'plugins');
    mkdirSync(metadataDir, { recursive: true });
    writeFileSync(join(metadataDir, 'marketplace.json'), '{ "name": "fable5-local",\n');
    const result = run(['--project', '--no-codex-add'], target);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /could not parse JSON at /);
    assert.doesNotMatch(result.stderr, /^SyntaxError/m);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

for (const ancestor of ['plugins', '.agents']) {
  test(`project install refuses an outside ${ancestor} ancestor alias`, () => {
    const target = mkdtempSync(join(tmpdir(), `fable5-${ancestor.replace('.', '')}-ancestor-`));
    const projectRoot = join(target, 'project');
    const outside = join(target, 'outside');
    const alias = join(projectRoot, ancestor);
    try {
      mkdirSync(projectRoot, { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, 'sentinel.txt'), 'preserve');
      symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');

      const result = run(['--project', '--force', '--no-codex-add'], projectRoot);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /refusing to follow a path outside target root/);
      assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'preserve');
    } finally {
      if (existsSync(alias)) unlinkSync(alias);
      rmSync(target, { recursive: true, force: true });
    }
  });
}

test('Windows guidance uses a path-independent marketplace command', { skip: process.platform !== 'win32' }, () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5 residual & spaces '));
  try {
    const result = run(['--project'], target);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /next \(from the target root shown above\): codex plugin marketplace add \./);
    assert.doesNotMatch(result.stdout, /codex plugin marketplace add .*&/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('non-Windows codex integration passes literal argv without a shell', { skip: process.platform === 'win32' }, () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-codex-argv-'));
  const fakeBin = join(target, 'fake-bin');
  const projectRoot = join(target, 'project with spaces');
  const capture = join(target, 'codex-args.txt');
  try {
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(projectRoot, { recursive: true });
    const fakeCodex = join(fakeBin, 'codex');
    writeFileSync(fakeCodex, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CAPTURE"\n');
    chmodSync(fakeCodex, 0o755);

    const result = run(
      ['--project'],
      projectRoot,
      installer,
      { ...process.env, CAPTURE: capture, PATH: `${fakeBin}${delimiter}${process.env.PATH || ''}` },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(capture, 'utf8').trim().split(/\r?\n/), [
      'plugin marketplace add .',
      'plugin add fable5-codex@fable5-local',
    ]);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test('project install refuses a dangling plugin destination link', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-dangling-plugin-'));
  const projectRoot = join(target, 'project');
  const outsideTarget = join(target, 'outside-plugin-target');
  const alias = join(projectRoot, 'plugins', 'fable5-codex');
  try {
    mkdirSync(join(projectRoot, 'plugins'), { recursive: true });
    symlinkSync(outsideTarget, alias, process.platform === 'win32' ? 'junction' : 'dir');

    const result = run(['--project', '--force', '--no-codex-add'], projectRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing an unresolved link or path/);
    assert.equal(existsSync(outsideTarget), false);
  } finally {
    try { unlinkSync(alias); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    rmSync(target, { recursive: true, force: true });
  }
});

test('project install refuses a dangling marketplace file link', (context) => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-dangling-marketplace-'));
  const projectRoot = join(target, 'project');
  const metadataDir = join(projectRoot, '.agents', 'plugins');
  const outsideTarget = join(target, 'outside-marketplace.json');
  const alias = join(metadataDir, 'marketplace.json');
  try {
    mkdirSync(metadataDir, { recursive: true });
    try {
      symlinkSync(outsideTarget, alias, 'file');
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        context.skip(`file symlinks unavailable on this runner: ${error.code}`);
        return;
      }
      throw error;
    }

    const result = run(['--project', '--force', '--no-codex-add'], projectRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing an unresolved link or path/);
    assert.equal(existsSync(outsideTarget), false);
  } finally {
    try { unlinkSync(alias); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    rmSync(target, { recursive: true, force: true });
  }
});

test('project install refuses a dangling marketplace ancestor junction', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-dangling-marketplace-dir-'));
  const projectRoot = join(target, 'project');
  const outsideTarget = join(target, 'outside-agents-target');
  const alias = join(projectRoot, '.agents');
  try {
    mkdirSync(projectRoot, { recursive: true });
    symlinkSync(outsideTarget, alias, process.platform === 'win32' ? 'junction' : 'dir');

    const result = run(['--project', '--force', '--no-codex-add'], projectRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing an unresolved link or path/);
    assert.equal(existsSync(outsideTarget), false);
  } finally {
    try { unlinkSync(alias); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    rmSync(target, { recursive: true, force: true });
  }
});

test('marketplace update replaces a hard link without mutating the outside inode', () => {
  const target = mkdtempSync(join(tmpdir(), 'fable5-marketplace-hardlink-'));
  const projectRoot = join(target, 'project');
  const metadataDir = join(projectRoot, '.agents', 'plugins');
  const marketplacePath = join(metadataDir, 'marketplace.json');
  const outsidePath = join(target, 'outside-marketplace.json');
  const original = `${JSON.stringify({ name: 'fable5-local', interface: {}, plugins: [] }, null, 2)}\n`;
  try {
    mkdirSync(metadataDir, { recursive: true });
    writeFileSync(outsidePath, original);
    linkSync(outsidePath, marketplacePath);

    const result = run(['--project', '--force', '--no-codex-add'], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(outsidePath, 'utf8'), original);
    assert.match(readFileSync(marketplacePath, 'utf8'), /"name": "fable5-codex"/);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});
