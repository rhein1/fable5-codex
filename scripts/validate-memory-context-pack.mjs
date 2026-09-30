#!/usr/bin/env node
// Offline integration gate. Imports the real, pinned Memory producer from an
// explicitly supplied checkout. Only the external context-mode peer is doubled.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { packReviewedMemory } from '../plugins/fable5-codex/lib/context-pack-memory.mjs';
import { sha256 } from '../plugins/fable5-codex/lib/context-pack.mjs';

assert.equal(process.argv.length, 3, 'Usage: node scripts/validate-memory-context-pack.mjs MEMORY_CHECKOUT');
const producer = join(realpathSync(resolve(process.argv[2])), 'plugins/agoragentic-memory/src/context-mode/bridge.cjs');
const source = Buffer.from(readFileSync(producer, 'utf8').replaceAll('\r\n', '\n'));
const blob = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
assert.equal(blob, '79ab8f628c003ec2834b4de09ed7f42ed4d53c53', 'Review producer contract changes before updating this pin');
const { createContextModeBridge } = createRequire(import.meta.url)(producer);
const scope = { project_id: 'fixture', repo_id: 'repo', worktree_id: 'tree', session_id: 'session' };
const directory = mkdtempSync(join(tmpdir(), 'fable-memory-contract-'));
const path = join(directory, 'reviewed.txt');
const required = 'Never deploy, publish, spend, or replay actions.\nFailure: the original assertion is still unresolved.';
writeFileSync(path, `${required}\n\n${'Optional old context. '.repeat(80)}\n\n${'Optional recent context. '.repeat(80)}`);
const policy = { allowed: true, revision: 'policy1' };
const refs = ['constraint-evidence', 'failure-evidence'];
const checks = [];
const corpus = new Map();
let peerCalls = 0;
// Synthetic reviewed file with no private material; no transcript or Memory DB.
function snapshot() {
  const text = readFileSync(path, 'utf8');
  return { text, revision: sha256(text), evidence_refs: [...refs] };
}
function authorize(metadata) {
  checks.push(metadata.phase ?? 'producer');
  return policy.allowed && metadata.policy_revision === policy.revision
    && Object.entries(scope).every(([key, value]) => metadata.scope[key] === value);
}
function verifySource(snippet, metadata) {
  const current = snapshot();
  return authorize(metadata) && snippet.source_id === 'reviewed'
    && snippet.revision === current.revision && snippet.content_hash === sha256(current.text)
    && JSON.stringify(snippet.evidence_refs) === JSON.stringify(current.evidence_refs)
    && snippet.excerpt === current.text.split('\n').slice(snippet.line_start - 1, snippet.line_end).join('\n');
}
const bridge = createContextModeBridge({ enabled: true, scope, policyRevision: policy.revision,
  authorize(metadata) {
    return metadata.source_id === 'reviewed' && ['index', 'search'].includes(metadata.operation)
      && authorize({ scope: metadata, policy_revision: metadata.policy_revision });
  },
  readSource(sourceId) { assert.equal(sourceId, 'reviewed'); return snapshot(); },
  redact(text) { return text; }, // This explicit synthetic fixture contains no sensitive data.
  client: { async callTool(name, args) {
    peerCalls += 1;
    assert.ok(['ctx_index', 'ctx_search'].includes(name));
    if (name === 'ctx_index') corpus.set(args.source, args.content);
    return { content: [{ type: 'text', text: name === 'ctx_index' ? 'indexed' : corpus.get(args.source) }] };
  } },
});
const options = { binding: { scope, policy_revision: policy.revision, head_ref: 'synthetic-head', budget_bytes: 6000 },
  goal: 'Retain constraints and unresolved failure',
  runContract: { contractVersion: 'fable5-ecf-0.1', authority: { editMode: 'read-only', spend: false } },
  requiredEvidenceRefs: refs, authorize, verifySource };
try {
  await bridge.indexSource('reviewed');
  const observed = [];
  for (const settings of [{ max_results: 1 }, { budget_bytes: 1800 }]) {
    const packet = await bridge.search('failure', settings);
    assert.equal(packet.selected_chunks, 3);
    assert.equal(packet.snippets.length, 1);
    assert.equal(packet.omitted_chunks, 2);
    assert.equal(packet.truncated, true);
    const pack = await packReviewedMemory(packet, options);
    assert.equal(pack.records[1].text, required);
    assert.deepEqual(pack.records[1].evidence_refs, refs);
    assert.deepEqual(pack.protected_ids, ['fable-run-contract', 'memory-0']);
    assert.equal(pack.upstream_omitted, 2);
    assert.equal(pack.coverage, 'partial');
    assert.equal(pack.authority, 'none');
    assert.equal(pack.completion_evidence, false);
    observed.push({ settings, selected_chunks: packet.selected_chunks, emitted: packet.snippets.length, omitted_chunks: packet.omitted_chunks });
    // Emitted-count semantics are incompatible with the actual v1 producer.
    await assert.rejects(packReviewedMemory({ ...packet, selected_chunks: 1 }, options), /INVALID_MEMORY_COVERAGE/);
    await assert.rejects(packReviewedMemory(packet, { ...options, requiredEvidenceRefs: ['absent'] }), /MISSING_REQUIRED_EVIDENCE/);
    await assert.rejects(packReviewedMemory(packet, { ...options, binding: { ...options.binding, budget_bytes: 1024 } }), /PROTECTED_CONTEXT_EXCEEDS_BUDGET/);
  }
  const packet = await bridge.search('failure', { max_results: 1 });
  policy.allowed = false;
  await assert.rejects(packReviewedMemory(packet, options), /MEMORY_SOURCE_DENIED/);
  const before = peerCalls;
  await assert.rejects(bridge.search('failure'), /SOURCE_DENIED/);
  assert.equal(peerCalls, before);
  policy.allowed = true;
  await assert.rejects(packReviewedMemory(packet, { ...options, authorize(metadata) {
    if (metadata.phase === 'after') policy.allowed = false;
    return authorize(metadata);
  } }), /MEMORY_SOURCE_DENIED/);
  policy.allowed = true;
  writeFileSync(path, 'Changed source');
  await assert.rejects(packReviewedMemory(packet, options), /MEMORY_SOURCE_STALE_OR_DENIED/);
  assert.ok(checks.includes('before') && checks.includes('after'));
  console.log(JSON.stringify({ passed: true, producer_blob: blob, accounting: observed,
    constraint_and_evidence_retained: true, denial_revocation_staleness_and_overflow_rejected: true,
    external_peer: 'offline double', memory_database_opened: false, model_calls: 0 }, null, 2));
} finally {
  bridge.close();
  rmSync(directory, { recursive: true, force: true });
}
