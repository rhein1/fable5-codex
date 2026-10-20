import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { discoverModels, modelProfiles, resolveModels } from '../plugins/fable5-codex/scripts/model-support.mjs';

const entry = (model, supportedReasoningEfforts = ['low', 'medium', 'high', 'xhigh', 'max']) => ({ model, defaultReasoningEffort: 'medium', supportedReasoningEfforts: supportedReasoningEfforts.map((reasoningEffort) => ({ reasoningEffort })) });
const current = [entry('gpt-6.1-sol'), entry('gpt-6-luna')];
const legacy = [entry('gpt-5.6-sol', ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']), entry('gpt-5.6-luna')];

test('balanced/deep/economical profiles resolve only advertised model-effort pairs', () => {
  assert.equal(modelProfiles.defaultProfile, 'balanced');
  assert.equal(resolveModels(current).model, 'gpt-6.1-sol');
  assert.equal(resolveModels(current, { profile: 'deep' }).reasoningEffort, 'max');
  assert.equal(resolveModels(current, { profile: 'economical' }).model, 'gpt-6-luna');
  assert.equal(resolveModels(current).accessVerified, false);
});
test('older client catalogs produce an explicit supported fallback', () => {
  const result = resolveModels(legacy);
  assert.equal(result.model, 'gpt-5.6-sol');
  assert.match(result.fallback, /gpt-6.1-sol unavailable/);
  assert.equal(result.catalogChecked, true);
  assert.equal(result.accessVerified, false);
});
test('explicit model/effort overrides are preserved or clearly rejected without silent substitution', () => {
  assert.equal(resolveModels(current, { model: 'gpt-6-luna', effort: 'high' }).reasoningEffort, 'high');
  assert.throws(() => resolveModels(legacy, { model: 'gpt-6.1-sol' }), /explicit_model_or_effort_unsupported/);
  assert.throws(() => resolveModels(current, { model: 'gpt-6.1-sol', effort: 'ultra' }), /explicit_model_or_effort_unsupported/);
  assert.throws(() => resolveModels(current, { workerModel: 'invented' }), /explicit_model_or_effort_unsupported/);
});
test('dry-run preferences and hidden catalog entries never establish access', () => {
  const dry = resolveModels(null);
  assert.equal(dry.catalogChecked, false);
  assert.equal(dry.accessVerified, false);
  assert.throws(() => resolveModels([{ ...entry('gpt-6.1-sol'), hidden: true }, entry('gpt-6-luna')]), /profile_unavailable/);
  assert.throws(() => resolveModels(current, { profile: '__proto__' }), /unknown_profile/);
  assert.throws(() => resolveModels(current, { model: 'bad"; command' }), /invalid_model/);
});
test('read-only app-server discovery completes initialization, pagination and sanitized catalog without a turn', async (context) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'fable-catalog-')));
  context.after(() => { assert.equal(dirname(directory), realpathSync(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
  const server = join(directory, 'catalog.mjs');
  writeFileSync(server, `import readline from 'node:readline';
const io = readline.createInterface({input:process.stdin});
io.on('line', line => { const message = JSON.parse(line);
if (message.method === 'initialize') process.stdout.write(JSON.stringify({id:message.id,result:{privateAuthSentinel:'DO_NOT_RETAIN'}})+'\\n');
else if(message.method === 'initialized') {}
else if(message.method === 'model/list') process.stdout.write(JSON.stringify({id:message.id,result:{data:[{model:message.params.cursor?'gpt-6-luna':'gpt-6.1-sol',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium'}],privateAuthSentinel:'DO_NOT_RETAIN'}],nextCursor:message.params.cursor?null:'second'}})+'\\n');
else process.exit(99); });
`);
  const catalog = await discoverModels(process.execPath, [server]);
  assert.equal(catalog.length, 2);
  assert.equal(JSON.stringify(catalog).includes('DO_NOT_RETAIN'), false);
  assert.equal(resolveModels(catalog).model, 'gpt-6.1-sol');
});
