import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHandoff, createVerification, executeNodeCheck, finishVerification, inspectSource,
  renderReport } from '../../plugins/fable5-codex/lib/completion-verification.mjs';
import { fingerprintCheck } from '../../plugins/fable5-codex/scripts/observe-check.mjs';

const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'fable-verification-demo-')));
function git(args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error('demo_git_failed');
}
try {
  git(['init', '-q']);
  writeFileSync(join(cwd, 'feature.mjs'), 'export const enabled = false;\n');
  writeFileSync(join(cwd, 'check.mjs'), 'import assert from "node:assert/strict"; import { enabled } from "./feature.mjs"; assert.equal(enabled, false);\n');
  git(['add', '--', 'feature.mjs', 'check.mjs']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic demo']);
  const request = { taskRef: 'synthetic:user-task', requirements: [
    { id: 'disabled', text: 'Keep the feature disabled.', origin: 'explicit', sourceRef: 'synthetic:task:1', methods: ['source', 'local'] },
    { id: 'deployed', text: 'Verify the deployed version.', origin: 'explicit', sourceRef: 'synthetic:task:2', methods: ['deployed'] },
  ] };
  const session = createVerification(cwd, request, { repository: 'synthetic/demo', mode: 'quick' });
  const source = inspectSource(session, { path: 'feature.mjs', startLine: 1, endLine: 1 });
  const spec = { checkId: 'tests', cwd, args: ['check.mjs'], sourceFiles: ['feature.mjs', 'check.mjs'], timeoutMs: 5000, maxOutputBytes: 4096 };
  const observed = await executeNodeCheck(session, spec, fingerprintCheck(spec));
  const artifact = finishVerification(session, [{ requirementId: 'disabled', decision: 'satisfied', reason: 'The source exports false and the actual local assertion passed.',
    evidence: [source, observed], changes: ['feature.mjs:1'], remainingWork: 'None for the local disabled-state criterion.', nextAction: 'Obtain separate deployment evidence.' }]);
  process.stdout.write(`${JSON.stringify({ syntheticFixture: true, artifact, report: renderReport(artifact), handoff: createHandoff(artifact) }, null, 2)}\n`);
} finally {
  if (dirname(cwd) !== realpathSync(tmpdir())) throw new Error('demo_cleanup_root_invalid');
  rmSync(cwd, { recursive: true, force: true });
}
