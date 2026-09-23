// Host-controlled adapter for Memory's existing context-mode packet. No Memory writes.
import { canonical, identifier, objectKeys, packContext, requireThat, sha256, snapshotDigest, scope } from './context-pack.mjs';

export async function packReviewedMemory(packet, options) {
  requireThat(typeof options?.authorize === 'function' && typeof options?.verifySource === 'function', 'MISSING_HOST_CONTROL');
  const data = JSON.parse(canonical(packet)); // Snapshot before any asynchronous host call.
  const host = JSON.parse(canonical(options.binding));
  objectKeys(host, ['scope', 'policy_revision', 'head_ref', 'budget_bytes']); scope(host.scope);
  identifier(host.policy_revision); identifier(host.head_ref);
  requireThat(data.schema === 'agoragentic.memory.context-mode-packet.v1'
    && data.coordinate_space === 'redacted_snapshot', 'UNSUPPORTED_MEMORY_PACKET');
  requireThat(canonical(data.scope) === canonical(host.scope) && data.policy_revision === host.policy_revision, 'MEMORY_SCOPE_POLICY_MISMATCH');
  requireThat(data.authority?.data_only === true && data.authority.completion_evidence === false
    && data.authority.memory_write === false && data.authority.execution === false && data.authority.spending === false, 'INVALID_MEMORY_AUTHORITY');
  requireThat(Array.isArray(data.snippets) && data.snippets.length <= 32
    && Number.isSafeInteger(data.selected_chunks) && Number.isSafeInteger(data.omitted_chunks)
    && data.omitted_chunks >= 0 && data.selected_chunks === data.snippets.length + data.omitted_chunks
    && data.truncated === (data.omitted_chunks > 0), 'INVALID_MEMORY_COVERAGE');
  requireThat(options.runContract?.contractVersion === 'fable5-ecf-0.1', 'UNSUPPORTED_FABLE_CONTRACT');
  const contractText = JSON.stringify(JSON.parse(canonical(options.runContract)), null, 2);
  const contractHash = sha256(contractText);
  const requiredRefs = [...(options.requiredEvidenceRefs ?? [])];
  requireThat(requiredRefs.length <= 32 && new Set(requiredRefs).size === requiredRefs.length, 'INVALID_REQUIRED_REFS');
  requiredRefs.forEach(identifier);
  const records = [{ id: 'fable-run-contract', kind: 'run_contract', text: contractText, sha256: contractHash,
    source: { id: 'fable-run-contract', revision: contractHash }, evidence_refs: [], requires: [] }];
  const sourceRevisions = { 'fable-run-contract': contractHash };
  const requiredIds = [];
  for (const [index, snippet] of data.snippets.entries()) {
    objectKeys(snippet, ['source_id', 'revision', 'content_hash', 'evidence_refs', 'excerpt', 'line_start', 'line_end']);
    identifier(snippet.source_id); identifier(snippet.revision);
    requireThat(snippet.source_id !== 'fable-run-contract', 'RESERVED_SOURCE_ID');
    if (Object.hasOwn(sourceRevisions, snippet.source_id)) requireThat(sourceRevisions[snippet.source_id] === snippet.revision, 'INCONSISTENT_SOURCE');
    sourceRevisions[snippet.source_id] = snippet.revision;
    const record = { id: `memory-${index}`, kind: 'note', text: snippet.excerpt, sha256: sha256(snippet.excerpt),
      source: { id: snippet.source_id, revision: snippet.revision, content_hash: snippet.content_hash,
        line_start: snippet.line_start, line_end: snippet.line_end }, evidence_refs: snippet.evidence_refs, requires: [] };
    records.push(record);
    requireThat(Array.isArray(snippet.evidence_refs), 'INVALID_EVIDENCE_REFS');
    if (requiredRefs.some((ref) => snippet.evidence_refs.includes(ref))) requiredIds.push(record.id);
  }
  requireThat(requiredRefs.every((ref) => records.some((record) => record.evidence_refs.includes(ref))), 'MISSING_REQUIRED_EVIDENCE');
  const input = { schema: 'agoragentic.context-input.v1', scope: host.scope, policy_revision: host.policy_revision,
    task: { goal: options.goal, head_ref: host.head_ref, required_ids: requiredIds }, records, upstream_omitted: data.omitted_chunks };
  const binding = { ...host, source_revisions: sourceRevisions, expected_digest: snapshotDigest(input) };
  // Validate before exposing even the approved packet to callbacks.
  const packed = packContext(input, binding);
  async function check(phase) {
    const metadata = { scope: { ...host.scope }, policy_revision: host.policy_revision, head_ref: host.head_ref, phase };
    requireThat(await options.authorize(metadata) === true, 'MEMORY_SOURCE_DENIED');
    for (const snippet of data.snippets) requireThat(await options.verifySource(JSON.parse(canonical(snippet)), metadata) === true, 'MEMORY_SOURCE_STALE_OR_DENIED');
  }
  await check('before');
  await check('after');
  return packed;
}
