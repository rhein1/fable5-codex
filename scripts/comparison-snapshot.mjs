import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const scopes = ['package.json', 'plugins/fable5-codex', 'scripts', 'evals/completion-verification'];

function gitBytes(repository, args, limit = 8 * 1024 * 1024) {
  const result = spawnSync('git', args, { cwd: repository, shell: false, windowsHide: true, timeout: 60000, maxBuffer: limit });
  if (result.error || result.status !== 0) throw new Error('comparison_git_object_unavailable');
  return result.stdout;
}

export function freezeComparisonSources(repository, commit, destination) {
  if (!/^[0-9a-f]{40}$/.test(commit) || !isAbsolute(destination) || existsSync(destination)) throw new Error('invalid_comparison_snapshot');
  const listing = gitBytes(repository, ['ls-tree', '-rz', '--full-tree', commit, '--', ...scopes]).toString('utf8');
  const entries = listing.split('\0').filter(Boolean).map((row) => {
    const match = /^(100644|100755) blob ([0-9a-f]{40})\t([A-Za-z0-9._/-]+)$/.exec(row);
    if (!match || match[3].split('/').some((part) => !part || part === '.' || part === '..')
      || !scopes.some((scope) => match[3] === scope || match[3].startsWith(`${scope}/`))) throw new Error('unsupported_comparison_tree_entry');
    return { mode: match[1], blob: match[2], path: match[3] };
  });
  if (!entries.length || entries.length > 4096 || new Set(entries.map((entry) => entry.path.toLowerCase())).size !== entries.length) throw new Error('invalid_comparison_tree');
  const required = ['package.json', 'scripts/run-completion-comparison.mjs', 'scripts/comparison-snapshot.mjs', 'scripts/fable-runtime.mjs',
    'scripts/completion-evaluation.py', 'plugins/fable5-codex/scripts/model-support.mjs', 'plugins/fable5-codex/experiments/rrsi/evaluator.py',
    'evals/completion-verification/cases.json'];
  if (required.some((path) => !entries.some((entry) => entry.path === path))) throw new Error('comparison_snapshot_inputs_missing');
  mkdirSync(destination);
  let totalBytes = 0;
  for (const entry of entries) {
    const bytes = gitBytes(repository, ['cat-file', 'blob', entry.blob]);
    totalBytes += bytes.length;
    if (totalBytes > 32 * 1024 * 1024) throw new Error('comparison_snapshot_too_large');
    const target = resolve(destination, entry.path);
    if (!target.startsWith(`${resolve(destination)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('invalid_comparison_snapshot_path');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: 'wx' });
    if (process.platform !== 'win32') chmodSync(target, entry.mode === '100755' ? 0o755 : 0o644);
  }
  return { root: destination, commit, entries };
}

export function validateComparisonBootstrap(repository, snapshot) {
  for (const path of ['scripts/run-completion-comparison.mjs', 'scripts/comparison-snapshot.mjs', 'scripts/fable-runtime.mjs']) {
    const actual = readFileSync(join(repository, path));
    const committed = readFileSync(join(snapshot.root, path));
    if (!actual.equals(committed) && !(process.platform === 'win32' && !actual.includes(0) && !committed.includes(0)
      && actual.toString('utf8').replaceAll('\r\n', '\n') === committed.toString('utf8').replaceAll('\r\n', '\n'))) throw new Error('comparison_bootstrap_differs_from_commit');
  }
}
