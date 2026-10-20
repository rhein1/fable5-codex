import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { performance } from 'node:perf_hooks';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const python = [['python3'], ['python'], ['py', '-3']].find(([command, ...args]) =>
  spawnSync(command, [...args, '-I', '-B', '-c',
    'import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)'],
  { timeout: 10000, stdio: 'ignore', shell: false }).status === 0);

for (const file of ['rrsi_source_test.py', 'rrsi_evaluator_test.py', '../examples/rrsi-synthetic-comparison.py']) {
  test(`RRSI offline ${file}`, (t) => {
    assert.ok(python, 'Python 3.10+ is required for RRSI checks; coverage must not silently skip');
    const [command, ...args] = python;
    const sourceSuite = file === 'rrsi_source_test.py';
    const timeoutMs = process.platform === 'win32' && sourceSuite ? 300000 : 180000;
    const started = performance.now();
    const run = spawnSync(command, [...args, '-I', '-B', resolve(root, 'test', file), ...(sourceSuite ? ['-v'] : [])],
      { cwd: root, encoding: 'utf8', timeout: timeoutMs, shell: false });
    t.diagnostic(`${file}: ${Math.round(performance.now() - started)}ms elapsed; ${timeoutMs}ms whole-suite deadline.`);
    assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout}\n${run.stderr}`);
    t.diagnostic(run.stderr.trim());
  });
}
