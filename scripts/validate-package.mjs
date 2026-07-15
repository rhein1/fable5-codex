#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repo = resolve(dirname(scriptPath), '..');
const plugin = join(repo, 'plugins', 'fable5-codex');
const packageFile = join(repo, 'package.json');
const installer = join(repo, 'bin', 'install.mjs');
const manifestFile = join(plugin, '.codex-plugin', 'plugin.json');
const marketplaceFile = join(repo, '.agents', 'plugins', 'marketplace.json');
const schemaFile = join(plugin, 'schemas', 'fable5.schema.json');
const ecfReference = join(plugin, 'references', 'ecf-run-contract.md');
const ecfTemplate = join(plugin, 'templates', 'fable-ecf-run-contract.json');
const solUltraTemplate = join(plugin, 'templates', 'sol-ultra.config.toml');
const reviewTemplate = join(plugin, 'templates', 'fable-review-contract.md');
const latestRunFile = join(repo, 'benchmarks', 'results', 'latest-run.txt');
const latestSummaryCsv = join(repo, 'benchmarks', 'results', 'latest-summary.csv');
const latestSummaryJson = join(repo, 'benchmarks', 'results', 'latest-summary.json');
const rootReadme = join(repo, 'README.md');
const benchmarkReadme = join(repo, 'benchmarks', 'README.md');
const benchmarkRunner = join(repo, 'scripts', 'run-benchmarks.ps1');
const benchmarkWorker = join(repo, 'scripts', 'invoke-codex-benchmark.ps1');
const benchmarkScorer = join(repo, 'scripts', 'benchmark-score.mjs');
const benchmarkScorerCli = join(repo, 'scripts', 'benchmark-score-cli.mjs');
const benchmarkChartRenderer = join(repo, 'scripts', 'render-benchmark-charts.mjs');
const testLauncher = join(repo, 'scripts', 'run-tests.mjs');
const packedArtifactValidator = join(repo, 'scripts', 'validate-packed-artifact.mjs');
const changelogFile = join(repo, 'CHANGELOG.md');
const securityFile = join(repo, 'SECURITY.md');
const validationWorkflow = join(repo, '.github', 'workflows', 'validate.yml');
const bugReportTemplate = join(repo, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml');
const powerShellWrapper = join(plugin, 'scripts', 'fable5-codex.ps1');
const bashWrapper = join(plugin, 'scripts', 'fable5-codex.sh');
const requiredSkills = [
  'fable-audit',
  'fable-deep-review',
  'fable-fact-check',
  'fable-understand',
  'fable-design-options',
  'fable-sweep',
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertExists(path) {
  assert(existsSync(path), `Missing required path: ${path}`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON at ${path}: ${error.message}`);
  }
}

function fileSha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function parseCsv(text) {
  const records = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }

  assert(!quoted, 'Unterminated quoted field in benchmark CSV');
  if (field !== '' || row.length > 0) {
    row.push(field);
    records.push(row);
  }
  assert(records.length > 1, 'Benchmark CSV must contain a header and rows');
  const [header, ...dataRows] = records;
  return dataRows.map((values, index) => {
    assert(values.length === header.length, `Benchmark CSV row ${index + 2} has the wrong field count`);
    return Object.fromEntries(header.map((name, fieldIndex) => [name, values[fieldIndex]]));
  });
}

function summaryValuesEqual(csvValue, jsonValue) {
  if (typeof jsonValue === 'boolean') return csvValue.toLowerCase() === String(jsonValue);
  if (typeof jsonValue === 'number') return Number(csvValue) === jsonValue;
  return csvValue === String(jsonValue ?? '');
}

function normalizeRepoRelative(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function setNested(target, section, key, value) {
  let cursor = target;
  for (const part of section) {
    cursor[part] ||= {};
    assert(typeof cursor[part] === 'object' && !Array.isArray(cursor[part]), `TOML section collision at ${part}`);
    cursor = cursor[part];
  }
  assert(!Object.hasOwn(cursor, key), `Duplicate TOML key: ${[...section, key].join('.')}`);
  cursor[key] = value;
}

// The packaged TOML files intentionally use only tables, strings, integers,
// booleans, and triple-single-quoted multiline strings.
function parsePackagedToml(path) {
  const result = {};
  let section = [];
  let multiline = null;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (multiline) {
      if (trimmed === "'''") {
        setNested(result, multiline.section, multiline.key, multiline.value.replace(/\n$/, ''));
        multiline = null;
      } else {
        multiline.value += `${line}\n`;
      }
      continue;
    }
    if (!trimmed || trimmed.startsWith('#')) continue;

    const table = trimmed.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (table) {
      section = table[1].split('.');
      continue;
    }

    const assignment = line.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/);
    assert(assignment, `Unsupported TOML syntax at ${path}:${index + 1}`);
    const [, key, rawValue] = assignment;
    if (rawValue.startsWith("'''")) {
      const remainder = rawValue.slice(3);
      if (remainder.endsWith("'''")) {
        setNested(result, section, key, remainder.slice(0, -3));
      } else {
        multiline = { section: [...section], key, value: remainder ? `${remainder}\n` : '' };
      }
      continue;
    }

    let value;
    if (rawValue.startsWith('"')) {
      try {
        value = JSON.parse(rawValue);
      } catch (error) {
        fail(`Invalid TOML string at ${path}:${index + 1}: ${error.message}`);
      }
    } else if (/^-?\d+$/.test(rawValue)) {
      value = Number(rawValue);
    } else if (rawValue === 'true' || rawValue === 'false') {
      value = rawValue === 'true';
    } else {
      fail(`Unsupported TOML value at ${path}:${index + 1}`);
    }
    setNested(result, section, key, value);
  }

  assert(!multiline, `Unterminated TOML multiline string at ${path}`);
  return result;
}

function validate() {
  for (const path of [
    manifestFile,
    marketplaceFile,
    schemaFile,
    ecfReference,
    ecfTemplate,
    solUltraTemplate,
    reviewTemplate,
    latestRunFile,
    latestSummaryCsv,
    latestSummaryJson,
    rootReadme,
    benchmarkReadme,
    benchmarkRunner,
    benchmarkWorker,
    benchmarkScorer,
    benchmarkScorerCli,
    benchmarkChartRenderer,
    testLauncher,
    packedArtifactValidator,
    changelogFile,
    securityFile,
    validationWorkflow,
    bugReportTemplate,
    powerShellWrapper,
    bashWrapper,
    packageFile,
    installer,
  ]) assertExists(path);

  const manifest = readJson(manifestFile);
  assert(manifest.name === 'fable5-codex', `Unexpected plugin name: ${manifest.name}`);
  assert(typeof manifest.version === 'string' && manifest.version.trim(), 'Plugin version must not be empty');
  assert(manifest.skills === './skills/', `Unexpected skills path: ${manifest.skills}`);
  assert(manifest.homepage === 'https://agoragentic.com', `Unexpected homepage: ${manifest.homepage}`);
  assert(manifest.interface?.websiteURL === 'https://agoragentic.com', `Unexpected interface.websiteURL: ${manifest.interface?.websiteURL}`);
  assert(Array.isArray(manifest.interface?.defaultPrompt), 'Plugin interface.defaultPrompt must be an array');
  for (const prompt of manifest.interface.defaultPrompt) {
    assert(typeof prompt === 'string' && prompt.length <= 128, `Plugin default prompts must be strings of at most 128 characters: ${prompt}`);
  }
  const releaseNote = join(repo, 'docs', 'release-notes', `v${manifest.version}.md`);
  assertExists(releaseNote);
  assert(readFileSync(changelogFile, 'utf8').includes(`## ${manifest.version} -`),
    `CHANGELOG.md is missing ${manifest.version}`);
  assert(readFileSync(bugReportTemplate, 'utf8').includes(`placeholder: "${manifest.version}"`),
    `Bug report template is not synchronized to ${manifest.version}`);

  const benchmarkRunnerText = readFileSync(benchmarkRunner, 'utf8');
  assert(!benchmarkRunnerText.includes('--dangerously-bypass-approvals-and-sandbox'),
    'Benchmark runner must not bypass approvals and sandboxing');
  assert(benchmarkRunnerText.includes('"--sandbox", "read-only"'),
    'Benchmark runner must use the read-only sandbox');
  assert(benchmarkRunnerText.includes('SkipRuns was removed'),
    'Benchmark runner must reject stale-output SkipRuns behavior');
  assert(benchmarkRunnerText.includes('render-benchmark-charts.mjs')
    && !benchmarkRunnerText.includes('System.Drawing'),
  'Benchmark runner must use the cross-platform Node chart renderer');
  assert(benchmarkRunnerText.includes('shell_environment_policy.inherit=none')
    && benchmarkRunnerText.includes('Set-BenchmarkProcessEnvironment')
    && benchmarkRunnerText.includes('Remove-IsolatedAuth')
    && benchmarkRunnerText.includes('AuthFile is required for benchmark execution'),
  'Benchmark runner must isolate caller environment variables and remove copied auth before publication');
  assert(benchmarkRunnerText.includes('.latest-publish.lock')
    && benchmarkRunnerText.includes('publicationCommitted')
    && benchmarkRunnerText.includes('invocation_selected_modes')
    && benchmarkRunnerText.includes('completed_modes'),
  'Benchmark runner must serialize publication and preserve complete resume coverage metadata');

  const packageJson = readJson(packageFile);
  assert(packageJson.name === 'fable5-codex', `Unexpected package name: ${packageJson.name}`);
  assert(packageJson.version === manifest.version, `Package version ${packageJson.version} does not match plugin version ${manifest.version}`);
  assert(packageJson.bin?.['fable5-codex'] === 'bin/install.mjs', 'Package bin.fable5-codex must be bin/install.mjs');
  assert(packageJson.engines?.node === '>=18', 'Package must preserve Node >=18 compatibility');
  assert(packageJson.scripts?.test === 'node scripts/run-tests.mjs',
    'Package tests must use the cross-platform explicit test launcher');
  assert(packageJson.scripts?.['validate:artifact'] === 'node scripts/validate-packed-artifact.mjs',
    'Package must expose the packed-artifact validation gate');
  for (const requiredPackagePath of [
    '.agents/plugins/marketplace.json',
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/workflows/validate.yml',
    'evals',
    'scripts',
    'test',
    'SECURITY.md',
  ]) {
    assert(packageJson.files?.includes(requiredPackagePath), `npm package files must include ${requiredPackagePath}`);
  }

  const workflowText = readFileSync(validationWorkflow, 'utf8');
  assert(/fetch-depth:\s*0/.test(workflowText), 'Validation checkout must fetch history for range checks');
  assert(/actions\/checkout@[0-9a-f]{40}/.test(workflowText)
    && /actions\/setup-node@[0-9a-f]{40}/.test(workflowText),
  'Validation workflow actions must be pinned to full commit SHAs');
  assert(/os:\s*\[ubuntu-latest,\s*macos-latest,\s*windows-latest\]/.test(workflowText)
    && /node:\s*\[18,\s*24\]/.test(workflowText),
  'Validation workflow must cover the supported OS and Node matrix');
  assert(workflowText.includes('git diff --check "$PR_BASE_SHA"...HEAD')
    && workflowText.includes('git diff --check "$PUSH_BEFORE_SHA" HEAD')
    && workflowText.includes('git show --check --format= HEAD'),
  'Validation workflow must check committed whitespace for PR, push, and manual events');
  assert(/name:\s*Packed artifact/.test(workflowText)
    && /run:\s*npm run validate:artifact/.test(workflowText)
    && /name:\s*Release gate/.test(workflowText)
    && /needs:\s*\[validation, artifact\]/.test(workflowText),
  'Validation workflow must aggregate the matrix and installed-tarball gate');
  assert((workflowText.match(/name:\s*Require PowerShell/g) || []).length === 2,
    'Validation workflow must fail instead of silently skipping PowerShell-backed tests');

  const latestRunRelative = normalizeRepoRelative(readFileSync(latestRunFile, 'utf8').trim());
  const benchmarkResultsRoot = join(repo, 'benchmarks', 'results');
  const latestRunDir = resolve(repo, ...latestRunRelative.split('/'));
  assert(dirname(latestRunDir) === resolve(benchmarkResultsRoot),
    `Latest benchmark run must be a direct child of benchmarks/results: ${latestRunRelative}`);
  assertExists(latestRunDir);
  const latestRunId = basename(latestRunDir);
  assert(/^\d{8}T\d{6}Z$/.test(latestRunId), `Invalid latest benchmark run id: ${latestRunId}`);
  const runSummaryCsv = join(latestRunDir, 'summary.csv');
  const runSummaryJson = join(latestRunDir, 'summary.json');
  assertExists(runSummaryCsv);
  assertExists(runSummaryJson);
  assert(fileSha256(latestSummaryCsv) === fileSha256(runSummaryCsv),
    'latest-summary.csv does not match the run selected by latest-run.txt');
  assert(fileSha256(latestSummaryJson) === fileSha256(runSummaryJson),
    'latest-summary.json does not match the run selected by latest-run.txt');

  const summaryJsonValue = readJson(runSummaryJson);
  const summaryJsonRows = Array.isArray(summaryJsonValue) ? summaryJsonValue : [summaryJsonValue];
  const summaryCsvRows = parseCsv(readFileSync(runSummaryCsv, 'utf8'));
  assert(summaryJsonRows.length === summaryCsvRows.length, 'Benchmark CSV and JSON row counts differ');
  const jsonRowsByKey = new Map(summaryJsonRows.map((row) => [`${row.case_id}:${row.mode}`, row]));
  assert(jsonRowsByKey.size === summaryJsonRows.length, 'Benchmark JSON contains duplicate case/mode rows');
  for (const csvRow of summaryCsvRows) {
    const key = `${csvRow.case_id}:${csvRow.mode}`;
    const jsonRow = jsonRowsByKey.get(key);
    assert(jsonRow, `Benchmark CSV row is missing from JSON: ${key}`);
    assert(csvRow.run_id === latestRunId && jsonRow.run_id === latestRunId,
      `Benchmark summary row does not match latest run id: ${key}`);
    for (const [field, value] of Object.entries(csvRow)) {
      assert(Object.hasOwn(jsonRow, field) && summaryValuesEqual(value, jsonRow[field]),
        `Benchmark CSV/JSON mismatch for ${key}.${field}`);
    }
  }

  const runManifestFile = join(latestRunDir, 'run.json');
  if (existsSync(runManifestFile)) {
    const runManifest = readJson(runManifestFile);
    assert(runManifest.schema_version === 2
      && runManifest.run_id === latestRunId
      && runManifest.status === 'complete'
      && runManifest.published_as_latest === true,
    'Latest alpha.3 run manifest is not complete and published');
    assert(runManifest.summary_digest_sha256 === fileSha256(runSummaryCsv),
      'Latest alpha.3 run manifest summary digest does not match summary.csv');
  } else {
    const qualification = join(latestRunDir, 'RUN.md');
    assert(latestRunId === '20260713T234332Z'
      && existsSync(qualification)
      && readFileSync(qualification, 'utf8').includes('predates the alpha.3 benchmark hardening'),
    'Only the explicitly qualified pre-alpha.3 latest run may omit run.json');
  }

  const rootReadmeText = readFileSync(rootReadme, 'utf8');
  const benchmarkReadmeText = readFileSync(benchmarkReadme, 'utf8');
  for (const chartName of ['summary', 'metrics', 'latency']) {
    const assetName = `fable5-benchmark-${chartName}-${latestRunId}.png`;
    const versionedAsset = join(repo, 'assets', 'benchmarks', assetName);
    const stableAsset = join(repo, 'assets', 'benchmarks', `fable5-benchmark-${chartName}.png`);
    assertExists(versionedAsset);
    assertExists(stableAsset);
    assert(fileSha256(versionedAsset) === fileSha256(stableAsset),
      `Run-specific benchmark asset does not match its stable counterpart: ${assetName}`);
    assert(rootReadmeText.includes(`assets/benchmarks/${assetName}`),
      `Root README must reference the run-specific benchmark asset: ${assetName}`);
    assert(benchmarkReadmeText.includes(`../assets/benchmarks/${assetName}`),
      `Benchmark README must reference the run-specific benchmark asset: ${assetName}`);
    assert(!rootReadmeText.includes(`assets/benchmarks/fable5-benchmark-${chartName}.png`),
      `Root README must not reference the cache-prone stable benchmark filename: ${chartName}`);
    assert(!benchmarkReadmeText.includes(`../assets/benchmarks/fable5-benchmark-${chartName}.png`),
      `Benchmark README must not reference the cache-prone stable benchmark filename: ${chartName}`);
  }

  for (const file of readdirSync(latestRunDir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(join(latestRunDir, file), 'utf8');
    assert(!/\((?:\/?[A-Za-z]:\/|\/(?!\/))/.test(text),
      `Latest benchmark report contains an absolute local link: ${file}`);
    assert(!/file:\/\//i.test(text), `Latest benchmark report contains a file URI: ${file}`);
    assert(!/(?:^|[\s`])\/?[A-Za-z]:[\\/]|\/(?:tmp|private\/var|home\/runner|Users)\//m.test(text),
      `Latest benchmark report contains a plain machine path: ${file}`);
  }

  const marketplace = readJson(marketplaceFile);
  const entry = marketplace.plugins?.find((pluginEntry) => pluginEntry?.name === 'fable5-codex');
  assert(entry, 'Marketplace does not include fable5-codex');
  assert(entry.source?.path === './plugins/fable5-codex',
    `Marketplace source.path must be ./plugins/fable5-codex, got ${entry.source?.path}`);
  assert(resolve(repo, entry.source.path) === resolve(plugin),
    `Marketplace source.path does not resolve to ${plugin}`);

  const schema = readJson(schemaFile);
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'Unexpected JSON Schema draft');
  assert(schema.type === 'object' && schema.$defs?.finding && schema.$defs?.workflowTrace,
    'Evidence ledger schema is missing required object definitions');
  readJson(ecfTemplate);

  const solConfig = parsePackagedToml(solUltraTemplate);
  assert(solConfig.model === 'gpt-5.6-sol', 'Sol Ultra config must use gpt-5.6-sol');
  assert(solConfig.model_reasoning_effort === 'ultra', 'Sol Ultra config must use ultra reasoning');
  assert(solConfig.agents?.max_threads === 6 && solConfig.agents?.max_depth === 1,
    'Sol Ultra config must bound agent threads and depth');

  const powerShellWrapperText = readFileSync(powerShellWrapper, 'utf8');
  const bashWrapperText = readFileSync(bashWrapper, 'utf8');
  assert(/\$Model\s*=\s*"gpt-5\.6-sol"/.test(powerShellWrapperText)
    && /\$ReasoningEffort\s*=\s*"ultra"/.test(powerShellWrapperText),
  'PowerShell wrapper must default to gpt-5.6-sol with ultra reasoning');
  assert(/FABLE5_MODEL:-gpt-5\.6-sol/.test(bashWrapperText)
    && /FABLE5_REASONING_EFFORT:-ultra/.test(bashWrapperText),
  'Bash wrapper must default to gpt-5.6-sol with ultra reasoning');

  const customAgentsDir = join(plugin, 'custom-agents');
  for (const file of readdirSync(customAgentsDir).filter((name) => name.endsWith('.toml'))) {
    const agent = parsePackagedToml(join(customAgentsDir, file));
    assert(agent.name === basename(file, '.toml'), `Custom agent name does not match filename: ${file}`);
    assert(typeof agent.description === 'string' && agent.description.trim(), `Custom agent description is missing: ${file}`);
    assert(typeof agent.developer_instructions === 'string' && agent.developer_instructions.trim(),
      `Custom agent instructions are missing: ${file}`);
  }

  for (const skill of requiredSkills) {
    const skillFile = join(plugin, 'skills', skill, 'SKILL.md');
    assertExists(skillFile);
    const text = readFileSync(skillFile, 'utf8');
    const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
    assert(frontmatter && new RegExp(`^name:\\s*${skill}\\s*$`, 'm').test(frontmatter[1])
      && /^description:\s*.+$/m.test(frontmatter[1]), `Skill frontmatter is missing name/description for ${skill}`);
    assert(/gpt-5\.6-sol/.test(text)
      && /model_reasoning_effort\s*=\s*"ultra"/.test(text)
      && /parallel delegation/.test(text)
      && /single-agent multi-lens/.test(text), `Skill is missing the Sol Ultra delegation/fallback policy: ${skill}`);
  }

  const installDryRun = spawnSync(process.execPath, [installer, '--dry-run', '--no-codex-add'], {
    cwd: repo,
    encoding: 'utf8',
    shell: false,
  });
  assert(installDryRun.status === 0, `Installer dry-run failed: ${installDryRun.stderr}`);

  console.log('Fable-5 package validation passed.');
}

try {
  validate();
} catch (error) {
  console.error(`fable5-codex validation failed: ${error.message}`);
  process.exitCode = 1;
}
