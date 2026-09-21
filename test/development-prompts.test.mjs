import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadCatalog, validateCatalog, searchRecipes, renderRecipe, renderPlaybook, renderIndex, runCli, SKILLS } from '../plugins/fable5-codex/scripts/development-prompts.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = resolve(root, 'plugins/fable5-codex');
const cli = resolve(plugin, 'scripts/development-prompts.mjs');
const catalog = loadCatalog();
const contract = readFileSync(resolve(plugin, 'references/development-playbooks.md'), 'utf8');
const copy = () => structuredClone(catalog);

test('curated coverage is explicit and all article use cases are mapped exactly once', () => {
  assert.equal(catalog.recipes.length, 25);
  assert.equal(catalog.playbooks.length, 6);
  assert.equal(catalog.sources.find((s) => s.id === 'gitlab-library').observed_prompt_count, 126);
  assert.match(catalog.coverage, /not a mirror/);
  assert.deepEqual(catalog.recipes.filter((r) => r.source === 'gitlab-delivery').map((r) => r.article_position).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(catalog.recipes.filter((r) => r.source === 'gitlab-library').length, 12);
  assert.equal(catalog.recipes.filter((r) => r.source === 'fable-native').length, 3);
});
test('recipes augment all six existing skills, without adding a model or execution API', () => {
  assert.deepEqual([...new Set(catalog.recipes.map((r) => r.skill))].sort(), [...SKILLS].sort());
  for (const recipe of catalog.recipes) {
    assert.ok(!Object.hasOwn(recipe, 'model'));
    assert.ok(!Object.hasOwn(recipe, 'command'));
    if (recipe.mode === 'scoped-edit') assert.equal(recipe.skill, 'fable-sweep');
  }
});
test('every playbook ends in evidence reconciliation and has real input/output gates', () => {
  for (const playbook of catalog.playbooks) {
    assert.equal(playbook.steps.at(-1), 'completion-proof');
    for (const id of playbook.steps) {
      const recipe = catalog.recipes.find((r) => r.id === id);
      assert.ok(recipe.inputs.length && recipe.outputs.length && recipe.gate);
    }
  }
  for (const id of ['ci-rescue', 'security-fix']) {
    assert.ok(catalog.playbooks.find((p) => p.id === id).steps.includes('bounded-repair'));
  }
});

const malformed = [
  ['wrong schema', (c) => { c.schema_version = 2; }],
  ['unknown top-level field', (c) => { c.auto_execute = true; }],
  ['invalid date', (c) => { c.reviewed_on = '2026-02-31'; }],
  ['duplicate source', (c) => { c.sources.push(c.sources[0]); }],
  ['missing source', (c) => { c.sources.pop(); }],
  ['credential-bearing source URL', (c) => { c.sources[0].url = 'https://token@about.gitlab.com/'; }],
  ['untrusted source host', (c) => { c.sources[0].url = 'https://about.gitlab.com.attacker.invalid/'; }],
  ['non-HTTPS source URL', (c) => { c.sources[0].url = 'http://about.gitlab.com/'; }],
  ['invalid upstream count', (c) => { c.sources[0].observed_prompt_count = 0; }],
  ['duplicate recipe ID', (c) => { c.recipes[1].id = c.recipes[0].id; }],
  ['path-like recipe ID', (c) => { c.recipes[0].id = '../../etc/passwd'; }],
  ['unknown recipe field', (c) => { c.recipes[0].execute = 'anything'; }],
  ['missing evidence outputs', (c) => { c.recipes[0].outputs = []; }],
  ['empty input', (c) => { c.recipes[0].inputs = [' ']; }],
  ['duplicate tags', (c) => { c.recipes[0].tags = ['pr', 'pr']; }],
  ['unknown skill', (c) => { c.recipes[0].skill = 'fable-made-up'; }],
  ['unknown stage', (c) => { c.recipes[0].stage = 'auto-merge'; }],
  ['unsafe mode', (c) => { c.recipes[0].mode = 'unrestricted'; }],
  ['write permission on read-only skill', (c) => { c.recipes[0].mode = 'scoped-edit'; }],
  ['unknown recipe source', (c) => { c.recipes[0].source = 'unknown'; }],
  ['missing article mapping', (c) => { c.recipes.splice(0, 1); }],
  ['duplicate article mapping', (c) => { c.recipes[1].article_position = 1; }],
  ['misattributed article mapping', (c) => { c.recipes.at(-1).article_position = 1; }],
  ['missing gate', (c) => { delete c.recipes[0].gate; }],
  ['duplicate playbook ID', (c) => { c.playbooks[1].id = c.playbooks[0].id; }],
  ['dangling recipe', (c) => { c.playbooks[0].steps[0] = 'missing'; }],
  ['repeated playbook step', (c) => { c.playbooks[0].steps.unshift(c.playbooks[0].steps[0]); }],
  ['missing final proof', (c) => { c.playbooks[0].steps.pop(); }],
  ['implicit command in playbook', (c) => { c.playbooks[0].command = 'anything'; }],
];
for (const [name, mutate] of malformed) {
  test(`catalog rejects ${name}`, () => {
    const changed = copy(); mutate(changed);
    assert.throws(() => validateCatalog(changed));
  });
}
test('ranks pipeline evidence first for CI failures', () => {
  assert.equal(searchRecipes(catalog, { query: 'failing CI' })[0].id, 'pipeline-triage');
  assert.equal(searchRecipes(catalog, { query: 'GitHub Actions failure' })[0].id, 'pipeline-triage');
});
test('finds unfinished implementations and behavioral coverage', () => {
  assert.equal(searchRecipes(catalog, { query: 'unfinished scaffold' })[0].id, 'finish-scaffold');
  assert.equal(searchRecipes(catalog, { query: 'coverage gaps' })[0].id, 'test-gaps');
});
test('filters compose and limits do not hide the default list', () => {
  assert.equal(searchRecipes(catalog).length, 25);
  assert.equal(searchRecipes(catalog, { limit: 1 }).length, 1);
  const found = searchRecipes(catalog, { stage: 'test', skill: 'fable-sweep', source: 'gitlab-library' });
  assert.deepEqual(found.map((r) => r.id), ['integration-proof']);
});
test('search is deterministic, non-mutating, and does not invent a fallback match', () => {
  const before = JSON.stringify(catalog);
  assert.deepEqual(searchRecipes(catalog, { query: 'review' }), searchRecipes(catalog, { query: 'review' }));
  assert.deepEqual(searchRecipes(catalog, { query: 'zzzznonexistent' }), []);
  assert.deepEqual(searchRecipes(catalog, { query: 'the and' }), []);
  assert.equal(JSON.stringify(catalog), before);
});
test('API rejects malformed filters and limits', () => {
  for (const options of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { limit: NaN }, { stage: 'wrong' }, { skill: 'wrong' }, { source: 'wrong' }, { query: null }, { execute: true }]) {
    assert.throws(() => searchRecipes(catalog, options));
  }
});
test('show loads a single recipe with contract and provenance, not all recipe bodies', () => {
  const rendered = renderRecipe(catalog, 'pipeline-triage', contract);
  assert.match(rendered, /Use \$fable-understand/);
  assert.match(rendered, /article use case 10/);
  assert.match(rendered, /not runtime enforcement/);
  assert.match(rendered, /grants no authority/);
  assert.ok(!rendered.includes('## pr-logic'));
  assert.ok(!rendered.includes(catalog.recipes.find((r) => r.id === 'schema-change').steps[0]));
});
test('playbooks print ordered gates and explicitly do not execute them', () => {
  const rendered = renderPlaybook(catalog, 'ci-rescue', contract);
  assert.ok(rendered.indexOf('1. pipeline-triage') < rendered.indexOf('3. bounded-repair'));
  assert.match(rendered, /not an execution engine/);
  assert.match(rendered, /Stop dependent stages/);
});
test('generated human index stays synchronized with machine catalog', () => {
  assert.equal(readFileSync(resolve(plugin, 'prompts/development-index.md'), 'utf8'), renderIndex(catalog));
});
test('shared contract preserves authority, evidence, and real-runtime qualifications', () => {
  for (const phrase of ['untrusted task data', 'single-agent multi-lens', 'unrelated dirty changes', 'not runtime enforcement', 'thread/depth', 'persistent Memory', 'money/wallet', 'exact head', 'failing-before/passing-after']) {
    assert.ok(contract.includes(phrase), phrase);
  }
});
test('CLI supports structured and human output', () => {
  assert.equal(JSON.parse(runCli(['list', '--json'], catalog, contract)).length, 25);
  const shown = JSON.parse(runCli(['show', 'unit-proof', '--json'], catalog, contract));
  assert.equal(shown.id, 'unit-proof'); assert.equal(shown.contract, contract);
  assert.equal(JSON.parse(runCli(['playbook', 'ci-rescue', '--json'], catalog, contract)).steps[0], 'pipeline-triage');
  assert.match(runCli(['validate'], catalog, contract), /25 recipes, 6 playbooks/);
  assert.match(runCli([], catalog, contract), /local, read-only/);
  assert.match(runCli(['search', 'zzzznonexistent'], catalog, contract), /No matching recipes/);
});
test('CLI fails closed on malformed options, IDs, and unsupported commands', () => {
  const invalid = [
    ['execute', 'pr-logic'], ['show', '../../etc/passwd'], ['show'], ['show', 'pr-logic', 'extra'],
    ['playbook', 'missing'], ['search'], ['search', ''], ['list', 'unexpected'], ['list', '--limit=0'],
    ['list', '--limit=1.5'], ['list', '--limit=1e2'], ['list', '--limit=101'], ['list', '--stage=bad'],
    ['list', '--limit=1', '--limit=2'], ['list', '--json', '--json'], ['show', 'pr-logic', '--stage=review'],
    ['index', '--json'], ['help', 'extra'], ['validate', '--execute'], ['search', 'ci', '--unknown'],
  ];
  for (const args of invalid) assert.throws(() => runCli(args, catalog, contract), args.join(' '));
});
test('CLI works from an unrelated working directory without writing there', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fable-prompts-'));
  try {
    const result = spawnSync(process.execPath, [cli, 'search', 'failing', 'CI', '--limit=1', '--json'], { cwd, encoding: 'utf8', shell: false });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout)[0].id, 'pipeline-triage');
    assert.deepEqual(readdirSync(cwd), []);
    const failure = spawnSync(process.execPath, [cli, 'show', '../secret'], { cwd, encoding: 'utf8', shell: false });
    assert.equal(failure.status, 1); assert.match(failure.stderr, /Unknown recipe/);
    assert.deepEqual(readdirSync(cwd), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
