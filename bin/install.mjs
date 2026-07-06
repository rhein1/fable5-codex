#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

if (has('--help') || has('-h')) {
  console.log(`Usage: fable5-codex [--project] [--dry-run] [--no-codex-add] [--marketplace-name=<name>]

Installs the Fable-5 Codex plugin into the Codex personal marketplace by default.

Options:
  --project              Install into the current directory as a repo-local marketplace.
  --dry-run              Print planned paths without writing files or running codex.
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
const noCodexAdd = has('--no-codex-add');
const targetRoot = resolve(project ? process.cwd() : homedir());
const marketplaceName = valueFor('--marketplace-name') || (project ? 'fable5-local' : 'personal');
const displayName = project ? 'Fable-5 Local Plugins' : 'Personal';
const pluginDest = join(targetRoot, 'plugins', pluginName);
const marketplacePath = join(targetRoot, '.agents', 'plugins', 'marketplace.json');
let installedMarketplaceName = marketplaceName;

function fail(message) {
  console.error(`fable5-codex: ${message}`);
  process.exit(1);
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
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

if (!existsSync(manifestPath)) {
  fail(`could not find plugin manifest at ${manifestPath}`);
}

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
  mkdirSync(dirname(pluginDest), { recursive: true });
  rmSync(pluginDest, { recursive: true, force: true });
  cpSync(pluginSrc, pluginDest, { recursive: true });

  mkdirSync(dirname(marketplacePath), { recursive: true });
  const marketplace = readJson(marketplacePath, {
    name: marketplaceName,
    interface: { displayName },
    plugins: []
  });

  marketplace.name ||= marketplaceName;
  marketplace.interface ||= {};
  marketplace.interface.displayName ||= displayName;
  marketplace.plugins ||= [];
  installedMarketplaceName = marketplace.name;

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

  const index = marketplace.plugins.findIndex((plugin) => plugin.name === pluginName);
  if (index >= 0) marketplace.plugins[index] = entry;
  else marketplace.plugins.push(entry);

  writeJson(marketplacePath, marketplace);
}

if (dryRun) {
  console.log('dry run: no files changed and codex was not invoked.');
} else {
  console.log(`installed plugin files and marketplace entry for ${pluginName}@${marketplace.name}`);
}

if (!dryRun && !noCodexAdd) {
  const commands = [];
  if (project) commands.push(['plugin', 'marketplace', 'add', targetRoot]);
  commands.push(['plugin', 'add', `${pluginName}@${installedMarketplaceName}`]);

  for (const command of commands) {
    console.log(`codex ${command.join(' ')}`);
    const result = spawnSync('codex', command, { stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) {
      fail(`codex command failed. You can rerun manually: codex ${command.join(' ')}`);
    }
  }
} else if (!dryRun) {
  if (project) {
    console.log(`next: codex plugin marketplace add ${targetRoot}`);
  }
  console.log(`next: codex plugin add ${pluginName}@${installedMarketplaceName}`);
}

console.log('Start a new Codex thread before using the updated skills.');
