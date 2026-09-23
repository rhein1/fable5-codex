// Synthetic fixture only. Prints a pack; never reads a real transcript or writes files.
import { packContext, serializePack, sha256, snapshotDigest } from '../lib/context-pack.mjs';
const record = (id, kind, text) => ({ id, kind, text, sha256: sha256(text),
  source: { id: 'demo-source', revision: 'demo-rev1' }, evidence_refs: [], requires: [] });
const input = { schema: 'agoragentic.context-input.v1',
  scope: { project_id: 'demo', repo_id: 'demo-repo', worktree_id: 'demo-worktree', session_id: 'demo-session' },
  policy_revision: 'demo-policy1', task: { goal: 'Fix the failing assertion; do not deploy.', head_ref: 'demo-head1', required_ids: ['failure'] },
  records: [record('constraint', 'constraint', 'Read-only review until a separate edit approval. Never deploy.'),
    record('old-read', 'note', 'Superseded sample file content.\n'.repeat(180)),
    record('failure', 'failure', 'At demo-head1: example.test expected 2, observed 3. This is a synthetic fixture.')], upstream_omitted: 0 };
const binding = { scope: input.scope, policy_revision: input.policy_revision, head_ref: input.task.head_ref,
  source_revisions: { 'demo-source': 'demo-rev1' }, expected_digest: snapshotDigest(input), budget_bytes: 3000 };
process.stdout.write(serializePack(packContext(input, binding)));
