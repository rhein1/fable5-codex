#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueFor = (name) => {
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
};

const supportedFlags = new Set(['--project', '--dry-run', '--force', '--no-codex-add', '--help', '-h']);
const seenFlags = new Set();
let marketplaceNameCount = 0;
for (const arg of args) {
  if (supportedFlags.has(arg)) {
    const canonicalFlag = arg === '-h' ? '--help' : arg;
    if (seenFlags.has(canonicalFlag)) fail(`${canonicalFlag} may only be provided once`);
    seenFlags.add(canonicalFlag);
    continue;
  }
  if (arg.startsWith('--marketplace-name=')) {
    marketplaceNameCount += 1;
    if (marketplaceNameCount > 1) fail('--marketplace-name may only be provided once');
    continue;
  }
  fail(`unknown argument: ${arg}`);
}

if (has('--help') || has('-h')) {
  console.log(`Usage: fable5-codex [--project] [--dry-run] [--force] [--no-codex-add] [--marketplace-name=<name>]

Installs the Fable-5 Codex plugin into the Codex personal marketplace by default.

Options:
  --project              Install into the current directory as a repo-local marketplace.
  --dry-run              Print planned paths without writing files or running codex.
  --force                Replace an existing copied plugin directory.
  --no-codex-add         Copy files and write marketplace.json, but do not run codex plugin add.
  --marketplace-name=N   Override the marketplace name. Defaults to personal or fable5-local.
`);
  process.exit(0);
}

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginName = 'fable5-codex';
const pluginSrc = join(pkgRoot, 'plugins', pluginName);
const manifestPath = join(pluginSrc, '.codex-plugin', 'plugin.json');
const project = has('--project');
const dryRun = has('--dry-run');
const force = has('--force');
const noCodexAdd = has('--no-codex-add');
const targetRoot = resolve(project ? process.cwd() : homedir());
const marketplaceNameOption = valueFor('--marketplace-name');
const marketplaceName = marketplaceNameOption === undefined
  ? (project ? 'fable5-local' : 'personal')
  : marketplaceNameOption;
const displayName = project ? 'Fable-5 Local Plugins' : 'Personal';
const pluginDest = join(targetRoot, 'plugins', pluginName);
const marketplacePath = join(targetRoot, '.agents', 'plugins', 'marketplace.json');
let installedMarketplaceName = marketplaceName;

function fail(message) {
  console.error(`fable5-codex: ${message}`);
  process.exit(1);
}

function validateMarketplaceName(value) {
  if (typeof value !== 'string') {
    fail('marketplace name must be a string');
  }
  const name = value;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
    fail('marketplace name must be 1-64 characters using only letters, numbers, dot, underscore, or hyphen');
  }
  return name;
}

function ensureInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return;
  }
  fail(`refusing to write outside target root: ${child}`);
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  const raw = readFileSync(path, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`could not parse JSON at ${path}: ${error.message}`);
  }
}

function writeJson(path, value) {
  const tempPath = join(dirname(path), `.marketplace-${process.pid}-${randomUUID()}.tmp`);
  ensurePhysicalContainment(tempPath, targetRoot);
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    try {
      renameSync(tempPath, path);
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'EACCES'].includes(error.code)
          || !lstatSync(path, { throwIfNoEntry: false })) throw error;
      ensurePhysicalContainment(path, targetRoot);
      unlinkSync(path);
      renameSync(tempPath, path);
    }
  } finally {
    if (lstatSync(tempPath, { throwIfNoEntry: false })) unlinkSync(tempPath);
  }
}

if (!existsSync(manifestPath)) {
  fail(`could not find plugin manifest at ${manifestPath}`);
}

function ensurePhysicalContainment(child, parent) {
  ensureInside(child, parent);
  const resolvedParent = resolve(parent);
  const parentPhysical = comparablePhysicalPath(resolvedParent);
  let candidate = resolve(child);

  while (!lstatSync(candidate, { throwIfNoEntry: false }) && candidate !== resolvedParent) {
    candidate = dirname(candidate);
  }

  let candidatePhysical;
  try {
    candidatePhysical = realpathSync.native(candidate);
  } catch {
    fail(`refusing an unresolved link or path in target root: ${child}`);
  }
  if (process.platform === 'win32') candidatePhysical = candidatePhysical.toLowerCase();
  const rel = relative(parentPhysical, candidatePhysical);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return;
  }
  fail(`refusing to follow a path outside target root: ${child}`);
}

function comparablePhysicalPath(value) {
  let physical;
  try {
    physical = realpathSync.native(value);
  } catch {
    physical = resolve(value);
  }
  return process.platform === 'win32' ? physical.toLowerCase() : physical;
}

function isSamePhysicalPath(left, right) {
  return comparablePhysicalPath(left) === comparablePhysicalPath(right);
}

validateMarketplaceName(marketplaceName);

const manifest = readJson(manifestPath);
if (manifest.name !== pluginName) {
  fail(`unexpected plugin name in manifest: ${manifest.name}`);
}

ensureInside(pluginDest, targetRoot);
ensureInside(marketplacePath, targetRoot);

console.log(`Fable-5 for Codex ${manifest.version}`);
console.log(`source:      ${pluginSrc}`);
console.log(`target root: ${targetRoot}`);
console.log(`plugin:      ${pluginDest}`);
console.log(`marketplace: ${marketplacePath}`);
console.log(`market name: ${marketplaceName}`);

if (!dryRun) {
  ensurePhysicalContainment(pluginDest, targetRoot);
  ensurePhysicalContainment(marketplacePath, targetRoot);
  const marketplace = readJson(marketplacePath, {
    name: marketplaceName,
    interface: { displayName },
    plugins: []
  });
  if (!marketplace || typeof marketplace !== 'object' || Array.isArray(marketplace)) {
    fail(`marketplace metadata must be a JSON object: ${marketplacePath}`);
  }
  if (marketplaceNameOption !== undefined) marketplace.name = marketplaceName;
  else if (!Object.hasOwn(marketplace, 'name')) marketplace.name = marketplaceName;
  if (!Object.hasOwn(marketplace, 'interface')) marketplace.interface = {};
  if (!marketplace.interface || typeof marketplace.interface !== 'object' || Array.isArray(marketplace.interface)) {
    fail(`marketplace interface must be an object: ${marketplacePath}`);
  }
  marketplace.interface.displayName ||= displayName;
  if (!Object.hasOwn(marketplace, 'plugins')) marketplace.plugins = [];
  if (!Array.isArray(marketplace.plugins)) {
    fail(`marketplace plugins must be an array: ${marketplacePath}`);
  }
  installedMarketplaceName = validateMarketplaceName(marketplace.name);
  marketplace.name = installedMarketplaceName;

  const sourceIsDestination = isSamePhysicalPath(pluginSrc, pluginDest);
  if (sourceIsDestination) {
    console.log('plugin source is already the project-local destination; copy skipped.');
  } else {
    if (existsSync(pluginDest) && !force) {
      fail(`plugin destination already exists: ${pluginDest}. Rerun with --force to replace it.`);
    }
    mkdirSync(dirname(pluginDest), { recursive: true });
    ensurePhysicalContainment(pluginDest, targetRoot);
    if (existsSync(pluginDest)) rmSync(pluginDest, { recursive: true, force: true });
    cpSync(pluginSrc, pluginDest, { recursive: true });
  }

  mkdirSync(dirname(marketplacePath), { recursive: true });
  ensurePhysicalContainment(marketplacePath, targetRoot);
  const entry = {
    name: pluginName,
    source: {
      source: 'local',
      path: `./plugins/${pluginName}`
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL'
    },
    category: 'Developer Tools'
  };

  const index = marketplace.plugins.findIndex((plugin) => plugin && plugin.name === pluginName);
  if (index >= 0) marketplace.plugins[index] = entry;
  else marketplace.plugins.push(entry);

  writeJson(marketplacePath, marketplace);
}

if (dryRun) {
  console.log('dry run: no files changed and codex was not invoked.');
} else {
  console.log(`installed plugin files and marketplace entry for ${pluginName}@${installedMarketplaceName}`);
}

if (!dryRun && !noCodexAdd && process.platform !== 'win32') {
  const commands = [];
  if (project) commands.push({ args: ['plugin', 'marketplace', 'add', '.'], cwd: targetRoot });
  commands.push({ args: ['plugin', 'add', `${pluginName}@${installedMarketplaceName}`], cwd: targetRoot });

  for (const command of commands) {
    console.log(`codex ${command.args.join(' ')}`);
    const result = spawnSync('codex', command.args, { cwd: command.cwd, stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) {
      fail(`codex command failed. Rerun the printed command from the target root shown above.`);
    }
  }
} else if (!dryRun) {
  if (!noCodexAdd && process.platform === 'win32') {
    console.log('codex invocation skipped on Windows to avoid passing arguments through a command shell.');
  }
  if (project) {
    console.log('next (from the target root shown above): codex plugin marketplace add .');
  }
  console.log(`next: codex plugin add ${pluginName}@${installedMarketplaceName}`);
}

console.log('Start a new Codex thread before using the updated skills.');
