import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLedger, planDigest } from '../scripts/run-closeout.mjs';
import { appendObservedCheck, fingerprintCheck, fingerprintSources, observeNodeCheck } from '../scripts/observe-check.mjs';

export const VERSION = 'fable-completion-verification/1';
export const METHODS = ['source', 'local', 'mock', 'hosted', 'installed', 'deployed', 'production'];
const sessions = new WeakMap();
const observations = new WeakMap();
const liveReports = new WeakMap();
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const copy = (value) => JSON.parse(JSON.stringify(value));
const identityKeys = ['repository', 'rootDigest', 'head', 'prHead', 'base', 'mergeTest', 'snapshotDigest'];

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function need(condition, code) {
  if (!condition) throw new Error(code);
}
function fields(value, names, code) {
  need(value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name)), code);
}
function text(value, code, max = 2048) {
  need(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max
    && !/[\u0000-\u001f\u007f]/u.test(value), code);
}
function identifier(value) {
  need(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value), 'invalid_id');
}
function list(value, code, max = 128) {
  need(Array.isArray(value) && value.length <= max && Object.keys(value).length === value.length, code);
}
function sameIdentity(left, right) {
  return identityKeys.every((key) => left[key] === right[key]);
}
function git(root, args) {
  const result = spawnSync('git', ['--no-pager', '-c', 'core.fsmonitor=false', '-C', root, ...args], {
    encoding: 'utf8', shell: false, windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_OPTIONAL_LOCKS: '0' },
  });
  need(!result.error && result.status === 0, 'git_observation_unavailable');
  return result.stdout;
}

export function snapshotRepository(root, { repository, prHead = null, base = null, mergeTest = null } = {}) {
  text(repository, 'repository_required', 256);
  const canonical = realpathSync(root);
  const gitRoot = git(canonical, ['rev-parse', '--show-toplevel']).trim();
  need(process.platform === 'win32'
    ? realpathSync.native(gitRoot).toLowerCase() === realpathSync.native(canonical).toLowerCase()
    : realpathSync(gitRoot) === canonical, 'repository_root_required');
  for (const revision of [prHead, base, mergeTest]) need(revision === null || /^[0-9a-f]{40}$/.test(revision), 'exact_revision_required');
  const head = git(canonical, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();
  need(/^[0-9a-f]{40}$/.test(head), 'exact_head_required');
  for (const revision of [prHead, base, mergeTest]) if (revision) {
    need(git(canonical, ['rev-parse', '--verify', `${revision}^{commit}`]).trim() === revision, 'revision_unavailable');
  }
  const stages = git(canonical, ['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
  need(stages.every((entry) => !/^(?:120000|160000) /.test(entry) && /^[0-9]+ [0-9a-f]+ 0\t/.test(entry)), 'unsupported_link_submodule_or_conflict');
  const paths = [...new Set(git(canonical, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();
  need(paths.length <= 1024 && paths.every((path) => !/(^|\/)\.git(\/|$)/.test(path)), 'snapshot_scope_exceeded');
  const present = [];
  const deleted = [];
  for (const path of paths) {
    try {
      lstatSync(resolve(canonical, path));
      present.push(path);
    } catch (error) {
      need(error.code === 'ENOENT', 'snapshot_file_unavailable');
      deleted.push(path);
    }
  }
  const source = present.length ? fingerprintSources(canonical, present) : { digest: hash([]) };
  const dirty = git(canonical, ['status', '--porcelain=v1', '--untracked-files=all']).length > 0;
  return Object.freeze({
    repository, rootDigest: hash(canonical), head, prHead, base, mergeTest,
    snapshotDigest: hash({ files: source.digest, deleted, stages }), dirty,
    scope: 'tracked_and_nonignored_untracked', fileCount: paths.length,
    repositoryProvenance: 'caller_label_and_observed_root', referenceProvenance: 'local_object_availability_only',
  });
}

export function validateRequest(request) {
  fields(request, ['taskRef', 'requirements'], 'request_fields');
  text(request.taskRef, 'task_reference_required');
  list(request.requirements, 'requirements_invalid');
  const seen = new Set();
  for (const requirement of request.requirements) {
    fields(requirement, ['id', 'text', 'origin', 'sourceRef', 'methods', ...(Object.hasOwn(requirement, 'hostedChecks') ? ['hostedChecks'] : [])], 'requirement_fields');
    identifier(requirement.id);
    need(!seen.has(requirement.id), 'duplicate_requirement');
    seen.add(requirement.id);
    text(requirement.text, 'requirement_text');
    text(requirement.sourceRef, 'requirement_source_required');
    need(['explicit', 'assumption'].includes(requirement.origin), 'requirement_origin');
    list(requirement.methods, 'methods_invalid', METHODS.length);
    need(requirement.methods.length > 0 && new Set(requirement.methods).size === requirement.methods.length
      && requirement.methods.every((method) => METHODS.includes(method)), 'methods_invalid');
    if (Object.hasOwn(requirement, 'hostedChecks')) {
      list(requirement.hostedChecks, 'hosted_policy_invalid', 32);
      for (const check of requirement.hostedChecks) {
        fields(check, ['name', 'appId'], 'hosted_policy_fields'); text(check.name, 'hosted_name_required');
        need(Number.isSafeInteger(check.appId) && check.appId > 0, 'hosted_app_required');
      }
    }
  }
  return request;
}

export function createVerification(root, request, options) {
  validateRequest(request);
  need(options && ['quick', 'deep'].includes(options.mode), 'mode_required');
  const identity = snapshotRepository(root, options);
  const session = Object.freeze({ version: VERSION, identity });
  sessions.set(session, { root: realpathSync(root), request: copy(request), options: copy(options), identity, evidence: [] });
  return session;
}

function current(session) {
  const state = sessions.get(session);
  need(state, 'live_session_required');
  need(sameIdentity(state.identity, snapshotRepository(state.root, state.options)), 'source_or_revision_stale');
  return state;
}
function addObservation(session, value) {
  const state = current(session);
  need(state.evidence.length < 128, 'evidence_limit');
  const observation = freeze({ id: `E${state.evidence.length + 1}`, ...value, binding: state.identity });
  observations.set(observation, session);
  state.evidence.push(observation);
  return observation;
}

export function inspectSource(session, { path, startLine, endLine }) {
  const state = current(session);
  need(Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine)
    && startLine > 0 && endLine >= startLine && endLine - startLine < 200, 'source_range_invalid');
  const source = fingerprintSources(state.root, [path]);
  const contents = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(state.root, path)));
  const lines = contents.split(/\r?\n/);
  need(endLine <= lines.length, 'source_range_missing');
  const excerptDigest = hash(lines.slice(startLine - 1, endLine).join('\n'));
  need(fingerprintSources(state.root, [path]).digest === source.digest, 'source_changed_during_inspection');
  return addObservation(session, {
    method: 'source', outcome: 'passed', provenance: 'host_observed', ref: `${path}:${startLine}`,
    context: { path, startLine, endLine, sourceDigest: source.digest, excerptDigest },
  });
}

export async function executeNodeCheck(session, spec, expectedSpecDigest, method = 'local') {
  const state = current(session);
  need(['local', 'mock'].includes(method), 'local_or_mock_only');
  need(realpathSync(spec.cwd) === state.root, 'check_root_mismatch');
  const plan = {
    goals: [{ id: 'verify', title: 'Observe one reviewed command', dependsOn: [], checkIds: [spec.checkId] }],
    checks: [{ id: spec.checkId, title: 'Explicitly reviewed Node check', kind: 'command', required: true }],
    coverage: [{ id: 'review', title: 'Semantic review remains separate', required: true }],
  };
  const binding = {
    runId: hash(state.identity).slice(0, 32), scopeId: state.identity.repository,
    revision: `sha256:${fingerprintSources(state.root, spec.sourceFiles).digest}`,
    policyDigest: hash({ method, command: expectedSpecDigest }), planDigest: planDigest(plan),
  };
  const ledger = createLedger(plan, binding);
  const receipt = await observeNodeCheck(ledger, binding, spec, expectedSpecDigest);
  const checked = appendObservedCheck(ledger, receipt, binding);
  return addObservation(session, {
    method, outcome: checked.events[0].status, provenance: 'host_observed', ref: `sha256:${hash(receipt)}`,
    context: { commandSpecDigest: fingerprintCheck(spec), receipt: copy(receipt) },
  });
}

export function suppliedEvidence(session, { method, outcome, ref, context = {} }) {
  need(METHODS.includes(method), 'method_invalid');
  need(['passed', 'failed', 'skipped', 'cancelled', 'pending', 'unavailable'].includes(outcome), 'outcome_invalid');
  text(ref, 'evidence_reference_required');
  need(context && typeof context === 'object' && !Array.isArray(context)
    && Buffer.byteLength(JSON.stringify(context)) <= 16384, 'context_invalid');
  return addObservation(session, { method, outcome, provenance: 'supplied_unverified', ref, context: copy(context) });
}

export function observeGitHubCheck(session, { checkRunId, revisionKind = 'prHead', expectedName, expectedAppId }) {
  const state = current(session);
  need(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(state.identity.repository)
    && typeof checkRunId === 'string' && /^[1-9][0-9]{0,19}$/.test(checkRunId), 'github_check_identity_invalid');
  need(['head', 'prHead', 'mergeTest'].includes(revisionKind) && state.identity[revisionKind], 'tested_revision_required');
  text(expectedName, 'hosted_name_required');
  need(Number.isSafeInteger(expectedAppId) && expectedAppId > 0, 'hosted_app_required');
  const result = spawnSync('gh', ['api', `repos/${state.identity.repository}/check-runs/${checkRunId}`], {
    encoding: 'utf8', shell: false, windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024,
  });
  need(!result.error && result.status === 0, 'hosted_evidence_inaccessible');
  let check;
  try { check = JSON.parse(result.stdout); } catch { throw new Error('hosted_evidence_malformed'); }
  need(String(check.id) === checkRunId && check.head_sha === state.identity[revisionKind], 'hosted_revision_stale');
  need(check.name === expectedName && check.app?.id === expectedAppId, 'hosted_check_identity_mismatch');
  const outcome = check.status !== 'completed' ? 'pending'
    : check.conclusion === 'success' ? 'passed' : check.conclusion === 'skipped' ? 'skipped'
      : check.conclusion === 'cancelled' ? 'cancelled' : ['failure', 'timed_out', 'action_required'].includes(check.conclusion) ? 'failed' : 'unavailable';
  return addObservation(session, {
    method: 'hosted', outcome, provenance: 'host_observed',
    ref: `https://github.com/${state.identity.repository}/runs/${checkRunId}`,
    context: { provider: 'github', checkRunId, name: check.name, appId: check.app.id, revisionKind, testedSha: check.head_sha,
      status: check.status, conclusion: check.conclusion, observedAt: new Date().toISOString() },
  });
}

function directoryFiles(root, prefix = '', budget = { entries: 0, depth: 0 }) {
  need(budget.depth <= 32 && prefix.length <= 512, 'installation_depth_or_path_exceeded');
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    budget.entries += 1; need(budget.entries <= 4096, 'installation_entry_limit');
    need(!entry.isSymbolicLink(), 'installation_link_unsupported');
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      budget.depth += 1; paths.push(...directoryFiles(resolve(root, entry.name), name, budget)); budget.depth -= 1;
    }
    else { need(entry.isFile(), 'installation_regular_file_required'); paths.push(name); }
    need(paths.length <= 1024, 'installation_scope_exceeded');
  }
  return paths.sort();
}

export function observeInstallation(session, { sourceDirectory, installationDirectory }) {
  const state = current(session);
  need(typeof sourceDirectory === 'string' && /^[A-Za-z0-9][A-Za-z0-9_/-]*$/.test(sourceDirectory)
    && !sourceDirectory.split('/').includes('..'), 'installation_source_invalid');
  const sourceRoot = resolve(state.root, sourceDirectory);
  const installedRoot = realpathSync(installationDirectory);
  need(realpathSync(sourceRoot) === sourceRoot && installedRoot !== sourceRoot, 'distinct_canonical_installation_required');
  const sourceFiles = directoryFiles(sourceRoot);
  const installedFiles = directoryFiles(installedRoot);
  const source = fingerprintSources(sourceRoot, sourceFiles);
  const installed = fingerprintSources(installedRoot, installedFiles);
  return addObservation(session, {
    method: 'installed', outcome: source.digest === installed.digest ? 'passed' : 'failed', provenance: 'host_observed',
    ref: `installation:sha256:${hash(installedRoot)}`, context: { sourceDirectory, sourceDigest: source.digest,
      installedDigest: installed.digest, sourceFileCount: sourceFiles.length, installedFileCount: installedFiles.length, activation: 'unverified' },
  });
}

export function finishVerification(session, assessments = []) {
  const state = current(session);
  list(assessments, 'assessments_invalid');
  const byId = new Map();
  for (const assessment of assessments) {
    fields(assessment, ['requirementId', 'decision', 'reason', 'evidence', 'changes', 'remainingWork', 'nextAction'], 'assessment_fields');
    need(state.request.requirements.some((requirement) => requirement.id === assessment.requirementId)
      && !byId.has(assessment.requirementId), 'unknown_or_duplicate_assessment');
    need(['satisfied', 'incomplete', 'unverified'].includes(assessment.decision), 'assessment_decision');
    for (const key of ['reason', 'remainingWork', 'nextAction']) text(assessment[key], `assessment_${key}`);
    list(assessment.evidence, 'assessment_evidence_invalid');
    list(assessment.changes, 'changes_invalid');
    assessment.changes.forEach((change) => text(change, 'change_reference'));
    need(assessment.evidence.every((evidence) => observations.get(evidence) === session), 'live_evidence_required');
    byId.set(assessment.requirementId, assessment);
  }
  const requirements = state.request.requirements.map((requirement) => {
    const assessment = byId.get(requirement.id);
    const evidence = assessment?.evidence || [];
    const missing = requirement.methods.filter((method) => method === 'hosted'
      ? !requirement.hostedChecks?.length || !requirement.hostedChecks.every((check) => evidence.some((item) => item.method === method
        && item.outcome === 'passed' && item.provenance === 'host_observed' && item.context.name === check.name && item.context.appId === check.appId))
      : !evidence.some((item) => item.method === method && item.outcome === 'passed'
        && item.provenance === 'host_observed' && sameIdentity(item.binding, state.identity)));
    const failed = evidence.some((item) => requirement.methods.includes(item.method) && item.outcome === 'failed');
    const status = assessment?.decision === 'incomplete' || failed ? 'incomplete'
      : assessment?.decision === 'satisfied' && requirement.origin === 'explicit' && missing.length === 0 ? 'verified' : 'unverified';
    return {
      ...requirement, status,
      reason: !assessment ? 'No assessment or evidence was supplied.'
        : status === 'unverified' ? `${assessment.reason} Missing observed methods: ${missing.join(', ') || 'explicit acceptance criteria or satisfied judgment'}.` : assessment.reason,
      evidenceIds: evidence.map((item) => item.id), changes: assessment?.changes || [],
      remainingWork: assessment?.remainingWork || 'Obtain requirements and current evidence.',
      nextAction: assessment?.nextAction || 'Inspect the requirement and collect the narrowest missing evidence.',
      semanticJudgment: assessment ? 'coordinator_reasoned_not_machine_proved' : 'unavailable',
    };
  });
  const overall = requirements.some((requirement) => requirement.status === 'incomplete') ? 'incomplete'
    : requirements.length && requirements.every((requirement) => requirement.status === 'verified') ? 'verified' : 'unverified';
  const report = {
    version: VERSION, mode: state.options.mode, taskRef: state.request.taskRef, identity: state.identity,
    generatedAt: new Date().toISOString(), overall, requirements, evidence: copy(state.evidence),
    requirementsUnavailable: requirements.length === 0, authorityGranted: false,
    semanticCorrectnessProved: false, independentEvidenceAuthentication: false,
    coverage: state.options.mode === 'quick' ? 'Supplied requirements and their direct evidence only; no exhaustive review.'
      : 'Deep mode requested; caller, negative-case and independent-review coverage must be documented, never inferred from the mode.',
    gaps: ['Hashes prove identity, not correctness.', 'Supplied and serialized execution records are not authenticated observations.',
      'Ignored files and external dependencies are outside the snapshot scope.', 'Installation, deployment and production need their own observations.'],
  };
  validateArtifact(report);
  liveReports.set(report, { session, digest: hash(report) });
  return report;
}

export function validateArtifact(artifact) {
  need(Buffer.byteLength(JSON.stringify(artifact)) <= 1024 * 1024, 'artifact_too_large');
  fields(artifact, ['version', 'mode', 'taskRef', 'identity', 'generatedAt', 'overall', 'requirements', 'evidence',
    'requirementsUnavailable', 'authorityGranted', 'semanticCorrectnessProved', 'independentEvidenceAuthentication', 'coverage', 'gaps'], 'artifact_fields');
  need(artifact.version === VERSION && ['quick', 'deep'].includes(artifact.mode), 'artifact_version_or_mode');
  text(artifact.taskRef, 'task_reference_required');
  need(artifact.authorityGranted === false && artifact.semanticCorrectnessProved === false
    && artifact.independentEvidenceAuthentication === false, 'unsupported_assurance');
  fields(artifact.identity, [...identityKeys, 'dirty', 'scope', 'fileCount', 'repositoryProvenance', 'referenceProvenance'], 'identity_fields');
  need(artifact.identity.repositoryProvenance === 'caller_label_and_observed_root'
    && artifact.identity.referenceProvenance === 'local_object_availability_only', 'identity_provenance_invalid');
  text(artifact.identity.repository, 'repository_required', 256);
  for (const key of ['rootDigest', 'snapshotDigest']) need(/^[0-9a-f]{64}$/.test(artifact.identity[key]), 'identity_digest_invalid');
  need(/^[0-9a-f]{40}$/.test(artifact.identity.head), 'head_invalid');
  for (const key of ['prHead', 'base', 'mergeTest']) need(artifact.identity[key] === null || /^[0-9a-f]{40}$/.test(artifact.identity[key]), 'revision_invalid');
  need(typeof artifact.identity.dirty === 'boolean' && artifact.identity.scope === 'tracked_and_nonignored_untracked'
    && Number.isSafeInteger(artifact.identity.fileCount) && artifact.identity.fileCount >= 0, 'snapshot_invalid');
  need(typeof artifact.generatedAt === 'string' && Number.isFinite(Date.parse(artifact.generatedAt)), 'timestamp_invalid');
  list(artifact.requirements, 'requirements_invalid');
  list(artifact.evidence, 'evidence_invalid');
  list(artifact.gaps, 'gaps_invalid');
  text(artifact.coverage, 'coverage_required');
  artifact.gaps.forEach((gap) => text(gap, 'gap_invalid'));
  need(artifact.requirementsUnavailable === (artifact.requirements.length === 0), 'requirements_flag_invalid');
  const evidenceIds = new Set();
  for (const evidence of artifact.evidence) {
    fields(evidence, ['id', 'method', 'outcome', 'provenance', 'ref', 'context', 'binding'], 'evidence_fields');
    identifier(evidence.id);
    need(!evidenceIds.has(evidence.id), 'duplicate_evidence');
    evidenceIds.add(evidence.id);
    need(METHODS.includes(evidence.method) && ['passed', 'failed', 'skipped', 'cancelled', 'pending', 'unavailable'].includes(evidence.outcome), 'evidence_method_or_outcome');
    need(['host_observed', 'supplied_unverified'].includes(evidence.provenance), 'evidence_provenance');
    text(evidence.ref, 'evidence_reference_required');
    need(evidence.context && typeof evidence.context === 'object' && !Array.isArray(evidence.context), 'context_invalid');
    need(sameIdentity(evidence.binding, artifact.identity), 'evidence_revision_stale');
    if (evidence.provenance === 'host_observed' && evidence.outcome === 'passed' && ['local', 'mock'].includes(evidence.method)) {
      const receipt = evidence.context.receipt;
      need(receipt && receipt.exitCode === 0 && receipt.outcome === 'exit_zero' && receipt.sourceStable === true
        && receipt.outputComplete === true && receipt.executionObserved === true, 'passed_command_receipt_invalid');
    }
    if (evidence.provenance === 'host_observed' && evidence.method === 'hosted') {
      need(['head', 'prHead', 'mergeTest'].includes(evidence.context.revisionKind)
        && evidence.context.testedSha === artifact.identity[evidence.context.revisionKind], 'hosted_revision_stale');
      if (evidence.outcome === 'passed') need(evidence.context.status === 'completed' && evidence.context.conclusion === 'success', 'hosted_not_passed');
    }
  }
  validateRequest({ taskRef: artifact.taskRef, requirements: artifact.requirements.map(({ id, text: title, origin, sourceRef, methods, hostedChecks }) => ({ id, text: title, origin, sourceRef, methods, ...(hostedChecks ? { hostedChecks } : {}) })) });
  for (const requirement of artifact.requirements) {
    fields(requirement, ['id', 'text', 'origin', 'sourceRef', 'methods', 'status', 'reason', 'evidenceIds', 'changes', 'remainingWork', 'nextAction', 'semanticJudgment', ...(Object.hasOwn(requirement, 'hostedChecks') ? ['hostedChecks'] : [])], 'result_fields');
    need(['verified', 'incomplete', 'unverified'].includes(requirement.status), 'status_invalid');
    list(requirement.evidenceIds, 'references_invalid');
    need(new Set(requirement.evidenceIds).size === requirement.evidenceIds.length
      && requirement.evidenceIds.every((id) => evidenceIds.has(id)), 'evidence_reference_missing');
    for (const key of ['reason', 'remainingWork', 'nextAction']) text(requirement[key], `result_${key}`);
    list(requirement.changes, 'changes_invalid');
    requirement.changes.forEach((change) => text(change, 'change_reference'));
    need(['coordinator_reasoned_not_machine_proved', 'unavailable'].includes(requirement.semanticJudgment), 'judgment_invalid');
    if (requirement.status === 'verified') {
      need(requirement.origin === 'explicit' && requirement.semanticJudgment !== 'unavailable', 'verified_without_requirement_or_judgment');
      const linked = artifact.evidence.filter((item) => requirement.evidenceIds.includes(item.id));
      need(requirement.methods.every((method) => linked.some((item) => item.method === method
        && item.outcome === 'passed' && item.provenance === 'host_observed'))
        && !linked.some((item) => requirement.methods.includes(item.method) && item.outcome === 'failed'), 'verified_without_observed_evidence');
      if (requirement.methods.includes('hosted')) need(requirement.hostedChecks?.length > 0
        && requirement.hostedChecks.every((check) => linked.some((item) => item.method === 'hosted' && item.outcome === 'passed'
          && item.provenance === 'host_observed' && item.context.name === check.name && item.context.appId === check.appId)), 'hosted_policy_not_satisfied');
    }
  }
  const expected = artifact.requirements.some((requirement) => requirement.status === 'incomplete') ? 'incomplete'
    : artifact.requirements.length && artifact.requirements.every((requirement) => requirement.status === 'verified') ? 'verified' : 'unverified';
  need(artifact.overall === expected, 'overall_status_invalid');
  return { structureValid: true, evidenceVerified: false, authorityGranted: false };
}

export function revalidateArtifact(artifact, root, options) {
  validateArtifact(artifact);
  const identity = snapshotRepository(root, options);
  const stale = !sameIdentity(artifact.identity, identity);
  return {
    version: VERSION, structureValid: true, stale, currentIdentity: identity,
    overall: stale ? 'unverified' : artifact.overall === 'incomplete' ? 'incomplete' : 'unverified',
    evidenceVerified: false, authorityGranted: false,
    reason: stale ? 'Repository, revision or working-tree bytes changed; collect fresh evidence.'
      : 'Identity matches; serialized observations and semantic conclusions still require fresh host verification.',
  };
}

const plain = (value) => String(value).replace(/[\\`*_{}\[\]<>|#!]/g, '\\$&');
function isLiveReport(artifact) {
  const live = liveReports.get(artifact);
  if (!live || live.digest !== hash(artifact)) return false;
  try { current(live.session); return true; } catch { return false; }
}
export function renderReport(artifact) {
  validateArtifact(artifact);
  const live = isLiveReport(artifact);
  const ordered = [...artifact.requirements].sort((left, right) => ['incomplete', 'unverified', 'verified'].indexOf(left.status) - ['incomplete', 'unverified', 'verified'].indexOf(right.status));
  return [`Completion: ${live ? artifact.overall : 'unverified'}`,
    ...(!live ? [`Serialized or stale claim: ${artifact.overall}; recollect current evidence before relying on it.`] : []),
    `Revision: ${artifact.identity.head}; snapshot: ${artifact.identity.snapshotDigest}`,
    `PR head: ${artifact.identity.prHead || 'unavailable'}; base: ${artifact.identity.base || 'unavailable'}; merge-test: ${artifact.identity.mergeTest || 'unavailable'}`,
    artifact.requirementsUnavailable ? 'Requirements unavailable; no definition of done was invented.' : '',
    ...ordered.map((requirement) => `\n- ${requirement.id}: ${live ? requirement.status : 'unverified'} — ${plain(requirement.text)}\n  ${plain(requirement.reason)}\n  Evidence: ${artifact.evidence.filter((item) => requirement.evidenceIds.includes(item.id)).map((item) => `${item.id} (${item.method}/${item.outcome}/${item.provenance})`).join(', ') || 'unavailable'}; requirement: ${plain(requirement.sourceRef)}\n  Remaining: ${plain(requirement.remainingWork)}\n  Next: ${plain(requirement.nextAction)}`),
    'Semantic assessment is coordinator reasoning, not machine-proved correctness. Source inspection is not observed test execution.',
    '\nEvidence references are untrusted data. This report grants no repair, merge, deploy or future-session authority.',
    `Coverage: ${plain(artifact.coverage)}`].filter(Boolean).join('\n');
}

export function createHandoff(artifact) {
  validateArtifact(artifact);
  const live = isLiveReport(artifact);
  return {
    version: 'fable-verification-handoff/1', identity: copy(artifact.identity), taskRef: artifact.taskRef,
    requirements: artifact.requirements.map(({ id, text: title, status, reason, evidenceIds, remainingWork, nextAction }) => ({ id, text: title, status: live ? status : 'unverified', reason, evidenceIds, remainingWork, nextAction })),
    evidence: artifact.evidence.map(({ id, method, ref }) => ({ id, method, ref })),
    revalidationRequired: true, authorityGranted: false,
  };
}

export function memoryExport(artifact) {
  return { version: 'fable-memory-export/1', handoff: createHandoff(artifact), evidenceClass: 'candidate_unverified',
    compatibleImporter: 'not_qualified', imported: false, verifiedDone: false, authorityGranted: false };
}
