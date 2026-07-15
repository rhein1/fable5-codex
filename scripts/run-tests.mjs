#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(repo, 'test');
const tests = readdirSync(testDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => join(testDir, name));

if (tests.length === 0) {
  console.error('No test/*.test.mjs files found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: repo,
  stdio: 'inherit',
  shell: false,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
