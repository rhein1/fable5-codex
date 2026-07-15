import assert from 'node:assert/strict';
import test from 'node:test';
import {
  containsAbsoluteLocalMarkdownLink,
  containsFileUri,
  containsPlainMachinePath,
} from '../scripts/benchmark-path-hygiene.mjs';

test('benchmark hygiene rejects Windows absolute markdown links with either separator', () => {
  assert.equal(containsAbsoluteLocalMarkdownLink('[leak](C:\\Users\\runner\\work\\secret.txt)'), true);
  assert.equal(containsAbsoluteLocalMarkdownLink('[leak](C:/Users/runner/work/secret.txt)'), true);
});

test('benchmark hygiene rejects file URIs and plain machine paths', () => {
  assert.equal(containsFileUri('[leak](file:///C:/Users/runner/work/secret.txt)'), true);
  assert.equal(containsPlainMachinePath('Plain: C:\\Users\\runner\\work\\secret.txt'), true);
  assert.equal(containsPlainMachinePath('Plain: /tmp/private-output.txt'), true);
});

test('benchmark hygiene preserves repository-relative and HTTPS links', () => {
  const text = '[fixture](../../../evals/audit-fixture/README.md) [docs](https://example.com/docs)';
  assert.equal(containsAbsoluteLocalMarkdownLink(text), false);
  assert.equal(containsFileUri(text), false);
  assert.equal(containsPlainMachinePath(text), false);
});
