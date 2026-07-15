import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const repo = fileURLToPath(new URL('..', import.meta.url));
const renderer = path.join(repo, 'scripts', 'render-benchmark-charts.mjs');

function sampleRows() {
  const cases = ['fact-check-status', 'audit-payment-attempts', 'understand-toy-repo'];
  return cases.flatMap((caseId, index) => [
    {
      run_id: '20260715T120000Z',
      case_id: caseId,
      mode: 'baseline',
      model: 'gpt-5.6-sol',
      composite_pct: 70 + index * 5,
      recall_pct: 80 + index * 4,
      evidence_pct: 60 + index * 7,
      unknowns_pct: index * 20,
      structure_pct: 100,
      seconds: 50 + index * 35,
    },
    {
      run_id: '20260715T120000Z',
      case_id: caseId,
      mode: 'plugin',
      model: 'gpt-5.6-sol',
      composite_pct: 95 + index * 2,
      recall_pct: 100,
      evidence_pct: 100,
      unknowns_pct: 100,
      structure_pct: 100,
      seconds: 100 + index * 60,
    },
  ]);
}

function inspectPng(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.readUInt32BE(16), 1600);
  assert.equal(buffer.readUInt32BE(20), 900);
  const idat = [];
  const metadata = {};
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === 'tEXt') {
      const value = buffer.toString('latin1', offset + 8, offset + 8 + length);
      const separator = value.indexOf('\0');
      metadata[value.slice(0, separator)] = value.slice(separator + 1);
    }
    offset += 12 + length;
  }
  const pixels = inflateSync(Buffer.concat(idat));
  let nonBackgroundPixels = 0;
  for (let y = 0; y < 900; y += 1) {
    assert.equal(pixels[y * (1600 * 4 + 1)], 0);
    for (let x = 0; x < 1600; x += 1) {
      const pixel = y * (1600 * 4 + 1) + 1 + x * 4;
      if (pixels[pixel] !== 12 || pixels[pixel + 1] !== 18 || pixels[pixel + 2] !== 34) {
        nonBackgroundPixels += 1;
      }
    }
  }
  assert.ok(nonBackgroundPixels > 20_000, `chart has too few drawn pixels: ${nonBackgroundPixels}`);
  return metadata;
}

test('dependency-free renderer creates nonblank 1600x900 PNG charts', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'fable5-chart-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'summary.json');
  const output = path.join(root, 'charts');
  await writeFile(input, `${JSON.stringify(sampleRows())}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    renderer,
    '--input', input,
    '--output-dir', output,
    '--model', 'gpt-5.6-sol',
  ], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);

  for (const name of ['summary', 'metrics', 'latency']) {
    const metadata = inspectPng(await readFile(path.join(output, `fable5-benchmark-${name}.png`)));
    assert.equal(metadata.Run, '20260715T120000Z');
    assert.equal(metadata.Qualification, 'attested-alpha3');
  }
});

test('renderer embeds a visible and machine-readable historical qualification', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'fable5-chart-historical-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'summary.json');
  const output = path.join(root, 'charts');
  await writeFile(input, `${JSON.stringify(sampleRows())}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    renderer,
    '--input', input,
    '--output-dir', output,
    '--model', 'gpt-5.6-sol',
    '--qualification', 'historical-pre-alpha3',
  ], { encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);

  const metadata = inspectPng(await readFile(path.join(output, 'fable5-benchmark-summary.png')));
  assert.equal(metadata.Qualification, 'historical-pre-alpha3');
  assert.match(metadata.Description, /NOT PLUGIN-ONLY CAUSAL EVIDENCE/);
});
