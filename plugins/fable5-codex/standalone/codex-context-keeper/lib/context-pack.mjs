// MIT License. Copyright (c) 2026 Agoragentic.
// Pure, data-only packing. No filesystem, network, model, or execution authority.
import { createHash } from 'node:crypto';

export const INPUT_SCHEMA = 'agoragentic.context-input.v1';
export const PACK_SCHEMA = 'agoragentic.context-pack.v1';
export const LIMITS = Object.freeze({ inputBytes: 1048576, records: 128, textBytes: 32768, budgetBytes: 65536 });
export const KINDS = Object.freeze(['note', 'tool_call', 'tool_result', 'constraint', 'failure', 'finding',
  'test_result', 'action', 'approval', 'correction', 'unknown', 'run_contract']);
const SCOPE_KEYS = ['project_id', 'repo_id', 'worktree_id', 'session_id'];
const OPTIONAL_KINDS = new Set(['note', 'tool_call', 'tool_result']);
export function fail(code) { const error = new Error(code); error.code = code; throw error; }
export function requireThat(ok, code) { if (!ok) fail(code); }
export const bytes = (text) => Buffer.byteLength(text, 'utf8');
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
export function objectKeys(value, required, optional = []) {
  requireThat(plain(value), 'INVALID_OBJECT');
  requireThat(required.every((key) => Object.hasOwn(value, key)), 'MISSING_FIELD');
  requireThat(Object.keys(value).every((key) => [...required, ...optional].includes(key)), 'UNKNOWN_FIELD');
}
export function identifier(value) {
  requireThat(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value), 'INVALID_ID');
  return value;
}
function text(value, max = LIMITS.textBytes) {
  requireThat(typeof value === 'string' && value.trim().length > 0 && bytes(value) <= max
    && !value.includes('\0') && Buffer.from(value).toString('utf8') === value, 'INVALID_TEXT');
}
function digest(value) { requireThat(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'INVALID_DIGEST'); }
function ids(values, max = LIMITS.records) {
  requireThat(Array.isArray(values) && values.length <= max, 'INVALID_IDS');
  values.forEach(identifier);
  requireThat(new Set(values).size === values.length, 'DUPLICATE_ID');
}
export function scope(value) { objectKeys(value, SCOPE_KEYS); SCOPE_KEYS.forEach((key) => identifier(value[key])); return value; }
export function canonical(value) {
  // JSON data only: reject getters, cycles, exotic objects and non-finite values.
  const seen = new Set();
  function walk(item, depth = 0) {
    requireThat(depth <= 32, 'JSON_DEPTH');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number') { requireThat(Number.isFinite(item), 'NONFINITE_NUMBER'); return JSON.stringify(item); }
    requireThat(Array.isArray(item) || plain(item), 'NON_JSON_VALUE');
    requireThat(!seen.has(item), 'JSON_CYCLE'); seen.add(item);
    for (const desc of Object.values(Object.getOwnPropertyDescriptors(item))) {
      requireThat(!desc.get && !desc.set, 'JSON_ACCESSOR');
    }
    let result;
    if (Array.isArray(item)) {
      requireThat(Object.keys(item).length === item.length, 'SPARSE_ARRAY');
      result = `[${item.map((value) => walk(value, depth + 1)).join(',')}]`;
    } else {
      const keys = Object.keys(item).sort();
      requireThat(keys.every((key) => !['__proto__', 'prototype', 'constructor'].includes(key)), 'UNSAFE_KEY');
      result = `{${keys.map((key) => `${JSON.stringify(key)}:${walk(item[key], depth + 1)}`).join(',')}}`;
    }
    seen.delete(item); return result;
  }
  const encoded = walk(value);
  requireThat(bytes(encoded) <= LIMITS.inputBytes, 'INPUT_TOO_LARGE');
  return encoded;
}
export const snapshotDigest = (value) => sha256(canonical(value));
export const serializePack = (pack) => `${JSON.stringify(pack)}\n`;

export function validateInput(raw) {
  const input = JSON.parse(canonical(raw));
  objectKeys(input, ['schema', 'scope', 'policy_revision', 'task', 'records', 'upstream_omitted']);
  requireThat(input.schema === INPUT_SCHEMA, 'INVALID_INPUT_SCHEMA');
  scope(input.scope); identifier(input.policy_revision);
  objectKeys(input.task, ['goal', 'head_ref', 'required_ids']);
  text(input.task.goal, 4096); identifier(input.task.head_ref); ids(input.task.required_ids);
  requireThat(Number.isSafeInteger(input.upstream_omitted) && input.upstream_omitted >= 0, 'INVALID_UPSTREAM_OMISSIONS');
  requireThat(Array.isArray(input.records) && input.records.length > 0 && input.records.length <= LIMITS.records, 'RECORD_LIMIT');
  const byId = new Map(), pairs = new Map();
  for (const record of input.records) {
    objectKeys(record, ['id', 'kind', 'text', 'sha256', 'source', 'evidence_refs', 'requires'], ['call_id', 'effect']);
    identifier(record.id); requireThat(!byId.has(record.id), 'DUPLICATE_RECORD'); byId.set(record.id, record);
    requireThat(KINDS.includes(record.kind), 'INVALID_KIND'); text(record.text); digest(record.sha256);
    requireThat(sha256(record.text) === record.sha256, 'TEXT_DIGEST_MISMATCH');
    objectKeys(record.source, ['id', 'revision'], ['content_hash', 'line_start', 'line_end']);
    identifier(record.source.id); identifier(record.source.revision);
    if (record.source.content_hash !== undefined) digest(record.source.content_hash);
    if ('line_start' in record.source || 'line_end' in record.source) {
      requireThat(Number.isSafeInteger(record.source.line_start) && record.source.line_start >= 1
        && Number.isSafeInteger(record.source.line_end) && record.source.line_end >= record.source.line_start, 'INVALID_COORDINATES');
    }
    ids(record.evidence_refs, 32); ids(record.requires);
    if (record.kind === 'tool_call' || record.kind === 'tool_result') {
      identifier(record.call_id); requireThat(['read_only', 'side_effect', 'unknown'].includes(record.effect), 'INVALID_EFFECT');
      const group = pairs.get(record.call_id) ?? [];
      group.push(record); pairs.set(record.call_id, group);
    } else requireThat(!('call_id' in record) && !('effect' in record), 'UNEXPECTED_PAIR_FIELDS');
  }
  for (const group of pairs.values()) {
    requireThat(group.length === 2 && group[0].kind === 'tool_call' && group[1].kind === 'tool_result', 'INVALID_TOOL_PAIR');
    requireThat(group[0].effect === group[1].effect, 'PAIR_EFFECT_MISMATCH');
  }
  requireThat(input.task.required_ids.every((id) => byId.has(id)), 'MISSING_REQUIRED_RECORD');
  for (const record of input.records) requireThat(record.requires.every((id) => byId.has(id)), 'MISSING_DEPENDENCY');
  return input;
}

/** binding is trusted host configuration or a separately owner-reviewed local file.
 * It is not inferred from model output or a retrieved packet's permission flags.
 * This function checks the supplied binding, not live Git, ECF or external permissions.
 */
export function packContext(raw, binding) {
  const input = validateInput(raw);
  canonical(binding);
  objectKeys(binding, ['scope', 'policy_revision', 'head_ref', 'source_revisions', 'expected_digest', 'budget_bytes']);
  scope(binding.scope); identifier(binding.policy_revision); identifier(binding.head_ref); digest(binding.expected_digest);
  requireThat(plain(binding.source_revisions), 'INVALID_REVISIONS');
  Object.entries(binding.source_revisions).forEach(([id, rev]) => { identifier(id); identifier(rev); });
  requireThat(canonical(input.scope) === canonical(binding.scope), 'SCOPE_MISMATCH');
  requireThat(input.policy_revision === binding.policy_revision, 'POLICY_MISMATCH');
  requireThat(input.task.head_ref === binding.head_ref, 'HEAD_MISMATCH');
  requireThat(snapshotDigest(input) === binding.expected_digest, 'SNAPSHOT_DIGEST_MISMATCH');
  const budget = binding.budget_bytes;
  requireThat(Number.isSafeInteger(budget) && budget >= 1024 && budget <= LIMITS.budgetBytes, 'INVALID_BUDGET');
  for (const record of input.records) requireThat(Object.hasOwn(binding.source_revisions, record.source.id)
    && binding.source_revisions[record.source.id] === record.source.revision, 'SOURCE_REVISION_MISMATCH');

  const byId = new Map(input.records.map((record) => [record.id, record]));
  const pairIds = new Map();
  for (const record of input.records) if (record.call_id) {
    pairIds.set(record.call_id, [...(pairIds.get(record.call_id) ?? []), record.id]);
  }
  function closure(start) {
    const set = new Set(), pending = [...start];
    while (pending.length) {
      const id = pending.pop(); if (set.has(id)) continue;
      set.add(id); const record = byId.get(id);
      pending.push(...record.requires, ...(pairIds.get(record.call_id) ?? []));
    }
    return set;
  }
  const protectedIds = closure([...input.task.required_ids, ...input.records.filter((record) =>
    !OPTIONAL_KINDS.has(record.kind) || (record.call_id && record.effect !== 'read_only')).map((record) => record.id)]);
  function render(selected) {
    return {
      schema: PACK_SCHEMA, scope: input.scope, policy_revision: input.policy_revision, task: input.task,
      data_only: true, completion_evidence: false, authority: 'none',
      snapshot_digest: binding.expected_digest, budget_bytes: budget,
      coordinate_space: 'redacted_snapshot', source_freshness: 'host_binding_not_live_attestation',
      protected_ids: input.records.filter((record) => protectedIds.has(record.id)).map((record) => record.id),
      records: input.records.filter((record) => selected.has(record.id)),
      omitted: input.records.filter((record) => !selected.has(record.id)).map((record) => ({
        id: record.id, source: record.source, sha256: record.sha256, evidence_refs: record.evidence_refs, reason: 'budget',
      })),
      upstream_omitted: input.upstream_omitted,
      coverage: selected.size === input.records.length && input.upstream_omitted === 0 ? 'supplied_snapshot_complete' : 'partial',
      recovery: 'Retrieve an authorized source snapshot. Never replay an action to recover context.',
      measurements: { input_json_bytes: bytes(canonical(input)), token_savings: null, task_quality: 'not_measured' },
    };
  }
  let selected = new Set(protectedIds);
  requireThat(bytes(serializePack(render(selected))) <= budget, 'PROTECTED_CONTEXT_EXCEEDS_BUDGET');
  const words = (value) => new Set(value.toLowerCase().match(/[a-z0-9_]+/g) ?? []);
  const terms = words(input.task.goal);
  const ranking = input.records.map((record, index) => {
    const candidate = words(record.text);
    return { id: record.id, index, score: [...terms].filter((term) => candidate.has(term)).length };
  }).sort((a, b) => b.score - a.score || b.index - a.index);
  for (const item of ranking) {
    if (selected.has(item.id)) continue;
    const next = new Set([...selected, ...closure([item.id])]);
    if (bytes(serializePack(render(next))) <= budget) selected = next;
  }
  const result = render(selected);
  requireThat(bytes(serializePack(result)) <= budget, 'PACK_EXCEEDS_BUDGET');
  return result;
}

export function verifyPack(pack, input, binding) {
  requireThat(canonical(pack) === canonical(packContext(input, binding)), 'PACK_MISMATCH');
  return { valid: true, completion_evidence: false, authority: 'none' };
}
