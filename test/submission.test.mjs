import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

test('submission ZIP has exactly inspected package bytes and grants no publication status', (context) => {
  if (spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], { encoding: 'utf8' }).status !== 0) return context.skip('PowerShell unavailable on this host');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable-submission-')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  const output = join(root, 'submission.zip');
  const args = ['-NoProfile', '-File', fileURLToPath(new URL('../scripts/prepare-submission.ps1', import.meta.url)), '-OutputZip', output];
  const result = spawnSync('pwsh', args, { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  const record = JSON.parse(result.stdout);
  assert.equal(record.version, '0.5.0-alpha.1');
  assert.ok(record.fileCount >= 70);
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
  assert.equal(record.uploaded, false); assert.equal(record.approved, false); assert.equal(record.published, false);
  assert.ok(statSync(output).size > 0);
  assert.notEqual(spawnSync('pwsh', args, { encoding: 'utf8', shell: false }).status, 0);
});
