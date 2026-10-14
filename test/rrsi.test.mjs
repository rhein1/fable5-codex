import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = [['python3'], ['python'], ['py', '-3']].find(([command, ...args]) =>
  spawnSync(command, [...args, '-I', '-B', '-c',
    'import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)'],
  { timeout: 10000, stdio: 'ignore', shell: false }).status === 0);

for (const file of ['rrsi_source_test.py', 'rrsi_evaluator_test.py']) {
  test(`RRSI offline ${file}`, (t) => {
    assert.ok(python, 'Python 3.10+ is required for RRSI checks; coverage must not silently skip');
    const [command, ...args] = python;
    const run = spawnSync(command, [...args, '-I', '-B', resolve(root, 'test', file)],
      { cwd: root, encoding: 'utf8', timeout: 180000, shell: false });
    assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout}\n${run.stderr}`);
    t.diagnostic(run.stderr.trim());
  });
}
