#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run packed-artifact validation through npm run validate:artifact');
const tempParent = resolve(tmpdir());
const root = mkdtempSync(join(tempParent, 'fable5-packed-artifact-'));

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? `\n${result.stderr || result.stdout || ''}` : '';
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}${detail}`);
  }
  return result.stdout || '';
}

function runNpm(args, cwd, capture = false) {
  return run(process.execPath, [npmCli, ...args], cwd, capture);
}

try {
  if (dirname(root) !== tempParent || !/^fable5-packed-artifact-[A-Za-z0-9_-]+$/.test(root.split(/[\\/]/).at(-1))) {
    throw new Error(`refusing unexpected artifact validation root: ${root}`);
  }

  const packOutput = runNpm(['pack', '--json', '--pack-destination', root], repo, true);
  const jsonStart = packOutput.indexOf('[');
  if (jsonStart < 0) throw new Error('npm pack did not emit JSON');
  const [pack] = JSON.parse(packOutput.slice(jsonStart));
  const tarball = join(root, pack.filename);
  if (!existsSync(tarball)) throw new Error(`npm pack omitted tarball: ${tarball}`);

  const consumer = join(root, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"name":"fable5-artifact-check","private":true}\n');
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);

  const installed = join(consumer, 'node_modules', 'fable5-codex');
  const installedPackage = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  if (installedPackage.version !== pack.version) {
    throw new Error(`installed version ${installedPackage.version} does not match packed version ${pack.version}`);
  }

  run(process.execPath, [join(installed, 'scripts', 'run-tests.mjs')], installed);
  run(process.execPath, [join(installed, 'scripts', 'validate-package.mjs')], installed);
  run(process.execPath, [join(installed, 'bin', 'install.mjs'), '--dry-run', '--no-codex-add'], installed);
  console.log(`Packed artifact validation passed: ${pack.id}`);
} finally {
  if (dirname(root) !== tempParent) throw new Error(`refusing artifact cleanup outside temp: ${root}`);
  rmSync(root, { recursive: true, force: true });
}
