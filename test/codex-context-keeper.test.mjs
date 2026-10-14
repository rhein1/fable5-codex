// Existing npm test discovers this wrapper; independent package tests run unchanged.
import '../plugins/fable5-codex/standalone/codex-context-keeper/test/keeper.test.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const canonical = new URL('../plugins/fable5-codex/lib/', import.meta.url);
const standalone = new URL('../plugins/fable5-codex/standalone/codex-context-keeper/lib/', import.meta.url);
test('standalone shared core and IO match Fable canonical bytes', () => {
  for (const name of ['context-pack.mjs', 'context-pack-io.mjs']) assert.deepEqual(readFileSync(new URL(name, standalone)), readFileSync(new URL(name, canonical)));
});
