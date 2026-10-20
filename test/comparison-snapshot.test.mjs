import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { freezeComparisonSources, validateComparisonBootstrap } from '../scripts/comparison-snapshot.mjs';

function fixture(context) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'fable-commit-export-')));
  context.after(() => { assert.equal(dirname(root), realpathSync(tmpdir())); rmSync(root, { recursive: true }); });
  const repository = join(root, 'repo'); mkdirSync(repository);
  function git(...args) {
    const result = spawnSync('git', args, { cwd: repository, encoding: 'utf8', shell: false });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '-q');
  const paths = ['package.json', 'scripts/run-completion-comparison.mjs', 'scripts/comparison-snapshot.mjs', 'scripts/fable-runtime.mjs',
    'scripts/completion-evaluation.py', 'plugins/fable5-codex/scripts/model-support.mjs', 'plugins/fable5-codex/experiments/rrsi/evaluator.py',
    'evals/completion-verification/cases.json'];
  for (const path of paths) { mkdirSync(dirname(join(repository, path)), { recursive: true }); writeFileSync(join(repository, path), `committed ${path}\n`); }
  git('add', '--', ...paths);
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'Exact inputs');
  return { root, repository, paths, git, commit: git('rev-parse', 'HEAD') };
}

for (const flag of ['--assume-unchanged', '--skip-worktree']) {
  test(`Git-object export ignores ${flag} working edits across every comparison input`, (context) => {
    const { root, repository, paths, git, commit } = fixture(context);
    for (const path of paths) { git('update-index', flag, '--', path); writeFileSync(join(repository, path), 'hidden working edit\n'); }
    assert.equal(git('status', '--porcelain'), '');
    const snapshot = freezeComparisonSources(repository, commit, join(root, 'export'));
    assert.equal(snapshot.commit, commit);
    for (const path of paths) assert.equal(readFileSync(join(snapshot.root, path), 'utf8'), `committed ${path}\n`);
    assert.throws(() => validateComparisonBootstrap(repository, snapshot), /bootstrap_differs_from_commit/);
  });
}

test('snapshot remains exact Git bytes despite checkout CRLF and ignores untracked input files', (context) => {
  const { root, repository, paths, commit } = fixture(context);
  for (const path of paths) writeFileSync(join(repository, path), `committed ${path}\r\n`);
  writeFileSync(join(repository, 'scripts/untracked.mjs'), 'must not enter snapshot');
  const snapshot = freezeComparisonSources(repository, commit, join(root, 'export'));
  for (const path of paths) assert.equal(readFileSync(join(snapshot.root, path), 'utf8'), `committed ${path}\n`);
  assert.equal(snapshot.entries.some((entry) => entry.path.endsWith('untracked.mjs')), false);
  if (process.platform === 'win32') validateComparisonBootstrap(repository, snapshot);
  else assert.throws(() => validateComparisonBootstrap(repository, snapshot), /bootstrap_differs_from_commit/);
});

test('snapshot rejects Git symlinks without creating filesystem links or escaping its root', (context) => {
  const { root, repository, git } = fixture(context);
  const blobResult = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: repository, input: '../outside', encoding: 'utf8', shell: false });
  assert.equal(blobResult.status, 0, blobResult.stderr);
  git('update-index', '--add', '--cacheinfo', `120000,${blobResult.stdout.trim()},scripts/link`);
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'Unsupported tree');
  assert.throws(() => freezeComparisonSources(repository, git('rev-parse', 'HEAD'), join(root, 'export')), /unsupported_comparison_tree_entry/);
});
