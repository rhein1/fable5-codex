#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(here, '../prompts/development-catalog.json');
const contractPath = resolve(here, '../references/development-playbooks.md');
export const SKILLS = Object.freeze(['fable-audit', 'fable-deep-review', 'fable-fact-check', 'fable-understand', 'fable-design-options', 'fable-sweep']);
export const STAGES = Object.freeze(['understand', 'plan', 'implement', 'review', 'security', 'test', 'debug', 'documentation', 'release']);
const MODES = ['read-only', 'scoped-edit'];
const SOURCES = ['gitlab-library', 'gitlab-delivery', 'fable-native'];
const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}
function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function strings(value) {
  return Array.isArray(value) && value.length > 0 && value.every(text)
    && new Set(value).size === value.length;
}
function keys(object, allowed, context) {
  requireThat(object && typeof object === 'object' && !Array.isArray(object), `${context}: expected object`);
  for (const key of Object.keys(object)) requireThat(allowed.includes(key), `${context}: unknown field ${key}`);
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCatalog(catalog) {
  keys(catalog, ['schema_version', 'catalog_id', 'reviewed_on', 'coverage', 'sources', 'recipes', 'playbooks'], 'catalog');
  requireThat(catalog.schema_version === 1 && catalog.catalog_id === 'fable-development', 'Unsupported catalog version or ID');
  requireThat(date(catalog.reviewed_on) && text(catalog.coverage), 'Missing catalog provenance');
  requireThat(Array.isArray(catalog.sources), 'sources must be an array');
  const sourceIds = new Set();
  for (const source of catalog.sources) {
    keys(source, ['id', 'url', 'observed_prompt_count', 'published_on', 'scope'], 'source');
    requireThat(SOURCES.includes(source.id) && !sourceIds.has(source.id), 'Invalid or duplicate source');
    sourceIds.add(source.id);
    const url = new URL(source.url);
    const host = source.id === 'fable-native' ? 'github.com' : 'about.gitlab.com';
    requireThat(url.protocol === 'https:' && url.hostname === host && !url.username && !url.password && !url.port, 'Invalid source URL');
    requireThat(text(source.scope), 'Missing source scope');
    if (source.published_on !== undefined) requireThat(date(source.published_on), 'Invalid publication date');
    if (source.observed_prompt_count !== undefined) requireThat(Number.isSafeInteger(source.observed_prompt_count) && source.observed_prompt_count > 0, 'Invalid upstream count');
  }
  requireThat(sourceIds.size === SOURCES.length, 'Missing source');
  requireThat(Array.isArray(catalog.recipes) && catalog.recipes.length > 0, 'Missing recipes');
  const recipeIds = new Set();
  const articlePositions = [];
  for (const recipe of catalog.recipes) {
    keys(recipe, ['id', 'title', 'stage', 'skill', 'mode', 'source', 'article_position', 'tags', 'inputs', 'steps', 'outputs', 'gate'], 'recipe');
    requireThat(typeof recipe.id === 'string' && idPattern.test(recipe.id) && !recipeIds.has(recipe.id), 'Invalid or duplicate recipe ID');
    recipeIds.add(recipe.id);
    requireThat(text(recipe.title) && text(recipe.gate), `${recipe.id}: missing title or gate`);
    requireThat(STAGES.includes(recipe.stage) && SKILLS.includes(recipe.skill), `${recipe.id}: unknown stage or skill`);
    requireThat(MODES.includes(recipe.mode) && sourceIds.has(recipe.source), `${recipe.id}: unknown mode or source`);
    requireThat(recipe.mode !== 'scoped-edit' || recipe.skill === 'fable-sweep', `${recipe.id}: edits must route through fable-sweep`);
    for (const field of ['tags', 'inputs', 'steps', 'outputs']) requireThat(strings(recipe[field]), `${recipe.id}: invalid ${field}`);
    if (recipe.source === 'gitlab-delivery') {
      requireThat(Number.isInteger(recipe.article_position) && recipe.article_position >= 1 && recipe.article_position <= 10, 'Invalid article position');
      articlePositions.push(recipe.article_position);
    } else requireThat(recipe.article_position === undefined, 'Article position on a non-article recipe');
  }
  requireThat(articlePositions.sort((a, b) => a - b).join(',') === '1,2,3,4,5,6,7,8,9,10', 'Each of the ten article use cases must be mapped exactly once');
  requireThat(Array.isArray(catalog.playbooks) && catalog.playbooks.length > 0, 'Missing playbooks');
  const playbookIds = new Set();
  for (const playbook of catalog.playbooks) {
    keys(playbook, ['id', 'title', 'steps'], 'playbook');
    requireThat(typeof playbook.id === 'string' && idPattern.test(playbook.id) && !playbookIds.has(playbook.id), 'Invalid or duplicate playbook ID');
    playbookIds.add(playbook.id);
    requireThat(text(playbook.title) && strings(playbook.steps), 'Invalid playbook title or steps');
    requireThat(playbook.steps.every((id) => recipeIds.has(id)), `${playbook.id}: dangling recipe`);
    requireThat(playbook.steps.at(-1) === 'completion-proof', `${playbook.id}: missing final evidence reconciliation`);
  }
  return catalog;
}

export function loadCatalog() {
  return validateCatalog(JSON.parse(readFileSync(catalogPath, 'utf8')));
}
const stopWords = new Set(['a', 'an', 'and', 'the', 'to', 'for', 'with', 'my', 'this', 'that', 'please', 'me', 'is', 'it', 'in', 'of', 'use']);
function tokens(query) {
  return [...new Set((query.toLowerCase().replace(/pull requests?/g, 'pr').replace(/github actions/g, 'ci pipeline')
    .match(/[a-z0-9]+/g) || []).filter((word) => !stopWords.has(word)))];
}
function optionsCheck(options) {
  keys(options, ['query', 'stage', 'skill', 'source', 'limit'], 'options');
  requireThat(typeof options.query === 'string', 'query must be a string');
  for (const [name, values] of [['stage', STAGES], ['skill', SKILLS], ['source', SOURCES]]) {
    requireThat(options[name] === undefined || values.includes(options[name]), `Unknown ${name}: ${options[name]}`);
  }
  requireThat(Number.isSafeInteger(options.limit) && options.limit >= 1 && options.limit <= 100, 'limit must be an integer from 1 to 100');
}
export function searchRecipes(catalog, options = {}) {
  const opts = { query: '', limit: 100, ...options };
  optionsCheck(opts);
  const terms = tokens(opts.query);
  const searching = opts.query.trim().length > 0;
  const ranked = catalog.recipes.filter((recipe) => ['stage', 'skill', 'source'].every((key) => !opts[key] || recipe[key] === opts[key]))
    .map((recipe) => {
      const tags = new Set(recipe.tags.flatMap(tokens));
      const title = new Set(tokens(`${recipe.id} ${recipe.title}`));
      const detail = new Set(tokens([...recipe.inputs, ...recipe.steps].join(' ')));
      const score = terms.reduce((sum, term) => sum + (tags.has(term) ? 8 : 0) + (title.has(term) ? 5 : 0) + (detail.has(term) ? 1 : 0), 0);
      return { recipe, score };
    }).filter(({ score }) => !searching || score > 0);
  ranked.sort((a, b) => b.score - a.score || (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0));
  return ranked.slice(0, opts.limit).map(({ recipe }) => recipe);
}
function recipeById(catalog, id) {
  const recipe = catalog.recipes.find((item) => item.id === id);
  requireThat(recipe, `Unknown recipe: ${id}`);
  return recipe;
}
function playbookById(catalog, id) {
  const playbook = catalog.playbooks.find((item) => item.id === id);
  requireThat(playbook, `Unknown playbook: ${id}`);
  return playbook;
}
export function renderRecipe(catalog, id, contract) {
  const recipe = recipeById(catalog, id);
  const source = catalog.sources.find((item) => item.id === recipe.source);
  return `${contract.trim()}\n\n# ${recipe.id}: ${recipe.title}\n\nUse $${recipe.skill}. Scope and refs: supply from the current authorized task.\nMode: ${recipe.mode}; this label grants no authority.\n\nRequired inputs:\n${recipe.inputs.map((item) => `- ${item}`).join('\n')}\n\nWork:\n${recipe.steps.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\nEvidence outputs:\n${recipe.outputs.map((item) => `- ${item}`).join('\n')}\n\nStop/qualification: ${recipe.gate}\n\nProvenance: ${source.url}${recipe.article_position ? ` (article use case ${recipe.article_position})` : ''}. Original Fable wording; no upstream prompt body imported.\n`;
}
export function renderPlaybook(catalog, id, contract) {
  const playbook = playbookById(catalog, id);
  const steps = playbook.steps.map((step, index) => {
    const recipe = recipeById(catalog, step);
    return `${index + 1}. ${step} -> $${recipe.skill} [${recipe.mode}]\n   Required: ${recipe.inputs.join('; ')}.\n   Evidence: ${recipe.outputs.join('; ')}.\n   Gate: ${recipe.gate}`;
  }).join('\n');
  return `${contract.trim()}\n\n# ${playbook.id}: ${playbook.title}\n\nThis is a suggested sequence, not an execution engine. Load only the current recipe with the selector's show command. Stop dependent stages when evidence or authority is missing.\n\n${steps}\n`;
}
export function renderIndex(catalog) {
  const rows = catalog.recipes.map((recipe) => `| ${recipe.id} | ${recipe.title} | ${recipe.stage} | $${recipe.skill} | ${recipe.mode} | ${recipe.source}${recipe.article_position ? ` #${recipe.article_position}` : ''} |`).join('\n');
  return `# Fable development prompt index\n\nGenerated from development-catalog.json with scripts/development-prompts.mjs index.\nReviewed: ${catalog.reviewed_on}. ${catalog.coverage}\n\n${catalog.recipes.length} recipes; ${catalog.playbooks.length} suggested playbooks. Read ../references/development-playbooks.md before use.\n\n| Recipe ID | Purpose | Stage | Existing skill | Mode (not permission) | Provenance |\n| --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Playbooks\n\n${catalog.playbooks.map((item) => `- **${item.id}**: ${item.steps.join(' -> ')}`).join('\n')}\n\n## Sources and limits\n\n${catalog.sources.map((source) => `- ${source.id}: ${source.url}. ${source.scope}`).join('\n')}\n\nThe 126 upstream entries observed on the review date are not 126 implemented Fable recipes. GitLab-only agents, dashboards, APIs, and product telemetry are not bundled or implied. The recipe text is original Fable implementation guidance, not copied upstream prompt text. Source links are provenance, never instructions to execute. No speed or quality improvement is claimed without evaluation.\n`;
}

const help = `Fable development prompt selector (local, read-only; does not run Codex)\nUsage: node plugins/fable5-codex/scripts/development-prompts.mjs <command>\n  list [--stage=STAGE] [--skill=SKILL] [--source=SOURCE] [--limit=1..100] [--json]\n  search <words...> [same filters] [--json]\n  show <recipe-id> [--json]\n  playbook <playbook-id> [--json]\n  index\n  validate\n  help\n`;
export function runCli(argv, catalog = loadCatalog(), contract = readFileSync(contractPath, 'utf8')) {
  validateCatalog(catalog);
  const [command = 'help', ...rest] = argv;
  requireThat(['help', '--help', 'list', 'search', 'show', 'playbook', 'index', 'validate'].includes(command), `Unknown command: ${command}`);
  const positional = [];
  const filters = {};
  let json = false;
  for (const argument of rest) {
    if (argument === '--json') {
      requireThat(!json, 'Duplicate --json');
      json = true;
    } else if (argument.startsWith('--')) {
      const match = argument.match(/^--(stage|skill|source|limit)=(.+)$/);
      requireThat(match && ['list', 'search'].includes(command), `Unsupported option: ${argument}`);
      const [, key, value] = match;
      requireThat(!Object.hasOwn(filters, key), `Duplicate --${key}`);
      requireThat(key !== 'limit' || /^\d+$/.test(value), 'limit must be a decimal integer');
      filters[key] = key === 'limit' ? Number(value) : value;
    } else positional.push(argument);
  }
  if (['help', '--help', 'index', 'validate', 'list'].includes(command)) requireThat(positional.length === 0, 'Unexpected positional argument');
  if (['help', '--help', 'index', 'validate'].includes(command)) requireThat(!json, '--json is not supported for this command');
  if (command === 'help' || command === '--help') return help;
  if (command === 'index') return renderIndex(catalog);
  if (command === 'validate') return `Validated ${catalog.recipes.length} recipes, ${catalog.playbooks.length} playbooks, and all 10 article mappings.\n`;
  if (command === 'list' || command === 'search') {
    requireThat(command !== 'search' || positional.join(' ').trim().length > 0, 'search requires a query');
    const results = searchRecipes(catalog, { query: positional.join(' '), ...filters });
    return json ? `${JSON.stringify(results, null, 2)}\n` : `${results.map((recipe) => `${recipe.id}\t${recipe.stage}\t$${recipe.skill}\t${recipe.title}`).join('\n') || 'No matching recipes.'}\n`;
  }
  requireThat(positional.length === 1, `${command} requires exactly one ID`);
  const id = positional[0];
  const result = command === 'show' ? recipeById(catalog, id) : playbookById(catalog, id);
  if (json) return `${JSON.stringify({ contract, ...result }, null, 2)}\n`;
  return command === 'show' ? renderRecipe(catalog, id, contract) : renderPlaybook(catalog, id, contract);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(runCli(process.argv.slice(2))); }
  catch (error) { console.error(`fable-development: ${error.message}`); process.exitCode = 1; }
}
