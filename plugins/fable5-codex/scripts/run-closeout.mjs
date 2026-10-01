#!/usr/bin/env node
// Original Agoragentic implementation, MIT. See references/run-closeout.md.
// Pure record accounting, not command execution, attestation, or authority.
import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = 'fable5-closeout/1';
export const MAX_BYTES = 1024 * 1024;
const MAX_ITEMS = 128;
const MAX_EVENTS = 2000;
const SECTIONS = ['Needs Fixing', 'Requires Human Review', 'Recommended Optional', 'Create Follow-up Issue'];
const RISKS = ['normal', 'security', 'privacy', 'authz', 'money', 'data-integrity', 'migration', 'secrets', 'trust'];

function need(condition, code) {
  if (!condition) throw new Error(code);
}
function object(value, keys, label) {
  need(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), `${label}:object`);
  need(Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)), `${label}:fields`);
}
function text(value, label, max = 1024) {
  need(typeof value === 'string' && value.trim().length > 0
    && value === value.trim() && Buffer.byteLength(value, 'utf8') <= max
    && !/[\u0000-\u001f\u007f]/u.test(value), `${label}:text`);
}
function id(value) {
  need(typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value), 'invalid_id');
}
function list(value, label, min = 0, max = MAX_ITEMS) {
  need(Array.isArray(value) && value.length >= min && value.length <= max, `${label}:list`);
  need(Object.keys(value).length === value.length, `${label}:dense_array`);
}
function ids(value, label, min = 0) {
  list(value, label, min);
  value.forEach(id);
  need(new Set(value).size === value.length, `${label}:duplicate`);
}
function oneOf(value, values, label) {
  need(values.includes(value), `${label}:value`);
}
function evidence(value) {
  list(value, 'evidence', 1, 8);
  for (const item of value) {
    object(item, ['ref', 'observation'], 'evidence');
    text(item.ref, 'evidence_ref');
    text(item.observation, 'evidence_observation');
  }
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function copy(value) { return JSON.parse(JSON.stringify(value)); }

export function validatePlan(plan) {
  object(plan, ['goals', 'checks', 'coverage'], 'plan');
  const allIds = new Set();
  for (const category of ['goals', 'checks', 'coverage']) {
    list(plan[category], category, 1);
    for (const item of plan[category]) {
      object(item, category === 'goals' ? ['id', 'title', 'dependsOn', 'checkIds']
        : category === 'checks' ? ['id', 'title', 'kind', 'required']
          : ['id', 'title', 'required'], category);
      id(item.id);
      text(item.title, 'title');
      need(!allIds.has(item.id), 'duplicate_plan_id');
      allIds.add(item.id);
      if (category === 'goals') {
        ids(item.dependsOn, 'dependsOn');
        ids(item.checkIds, 'checkIds', 1);
      } else {
        need(typeof item.required === 'boolean', 'required:boolean');
        if (category === 'checks') oneOf(item.kind, ['command', 'source', 'connector'], 'kind');
      }
    }
  }
  need(plan.checks.some((item) => item.required), 'required_check_missing');
  need(plan.coverage.some((item) => item.required), 'required_coverage_missing');
  const goals = new Map(plan.goals.map((item) => [item.id, item]));
  const checks = new Set(plan.checks.map((item) => item.id));
  const seen = new Set();
  const active = new Set();
  function visit(key) {
    need(goals.has(key), 'unknown_dependency');
    need(!active.has(key), 'dependency_cycle');
    if (seen.has(key)) return;
    active.add(key);
    const goal = goals.get(key);
    need(goal.checkIds.every((check) => checks.has(check)), 'unknown_check');
    goal.dependsOn.forEach(visit);
    active.delete(key);
    seen.add(key);
  }
  plan.goals.forEach((goal) => visit(goal.id));
  return plan;
}
export function planDigest(plan) {
  validatePlan(plan);
  return createHash('sha256').update(canonical(plan)).digest('hex');
}
function validateBinding(binding) {
  object(binding, ['runId', 'scopeId', 'revision', 'policyDigest', 'planDigest'], 'binding');
  for (const key of ['runId', 'scopeId', 'revision']) text(binding[key], key, 256);
  for (const key of ['policyDigest', 'planDigest']) {
    need(typeof binding[key] === 'string' && /^[0-9a-f]{64}$/.test(binding[key]), `${key}:sha256`);
  }
}
function compareBinding(actual, expected) {
  validateBinding(actual);
  validateBinding(expected);
  need(canonical(actual) === canonical(expected), 'binding_mismatch');
}

export function createLedger(plan, binding) {
  validateBinding(binding);
  need(planDigest(plan) === binding.planDigest, 'plan_digest_mismatch');
  return copy({ version: VERSION, binding, plan, events: [] });
}
function validateEvent(event) {
  need(event && typeof event === 'object', 'event:object');
  const fields = {
    check: ['status', 'detail'],
    goal: ['status'],
    coverage: ['status'],
    'finding.open': ['title', 'section', 'risk'],
    'finding.close': ['status', 'checkIds'],
    'finding.reopen': [],
  };
  need(Object.hasOwn(fields, event.type), 'unknown_event');
  object(event, ['seq', 'type', 'id', 'evidence', ...fields[event.type]], 'event');
  need(Number.isSafeInteger(event.seq) && event.seq > 0, 'invalid_sequence');
  id(event.id);
  evidence(event.evidence);
  if (event.type === 'check') {
    oneOf(event.status, ['passed', 'failed', 'unavailable'], 'check_status');
    text(event.detail, 'check_detail');
  } else if (event.type === 'goal') {
    oneOf(event.status, ['complete', 'blocked'], 'goal_status');
  } else if (event.type === 'coverage') {
    oneOf(event.status, ['inspected', 'unavailable'], 'coverage_status');
  } else if (event.type === 'finding.open') {
    text(event.title, 'finding_title');
    oneOf(event.section, SECTIONS, 'section');
    oneOf(event.risk, RISKS, 'risk');
  } else if (event.type === 'finding.close') {
    oneOf(event.status, ['resolved', 'refuted'], 'finding_status');
    ids(event.checkIds, 'resolution_checks', 1);
  }
}
function goalCurrent(key, state, planGoals, memo = new Map()) {
  if (memo.has(key)) return memo.get(key);
  const goal = state.goals.get(key);
  if (goal?.status !== 'complete') { memo.set(key, false); return false; }
  const planned = planGoals.get(key);
  const current = planned.checkIds.every((checkId) => {
    const check = state.checks.get(checkId);
    return check?.status === 'passed' && check.seq < goal.seq;
  }) && planned.dependsOn.every((dependency) => goalCurrent(dependency, state, planGoals, memo)
    && state.goals.get(dependency).seq < goal.seq);
  memo.set(key, current);
  return current;
}
function replay(ledger, expected) {
  object(ledger, ['version', 'binding', 'plan', 'events'], 'ledger');
  need(ledger.version === VERSION, 'unsupported_version');
  compareBinding(ledger.binding, expected);
  need(planDigest(ledger.plan) === expected.planDigest, 'plan_digest_mismatch');
  list(ledger.events, 'events', 0, MAX_EVENTS);
  const state = { goals: new Map(), checks: new Map(), coverage: new Map(), findings: new Map() };
  const planGoals = new Map(ledger.plan.goals.map((item) => [item.id, item]));
  const planChecks = new Set(ledger.plan.checks.map((item) => item.id));
  const planCoverage = new Set(ledger.plan.coverage.map((item) => item.id));
  ledger.events.forEach((event, index) => {
    validateEvent(event);
    need(event.seq === index + 1, 'sequence_gap');
    if (event.type === 'check') {
      need(planChecks.has(event.id), 'unknown_check');
      state.checks.set(event.id, event);
    } else if (event.type === 'coverage') {
      need(planCoverage.has(event.id), 'unknown_coverage');
      state.coverage.set(event.id, event);
    } else if (event.type === 'goal') {
      need(planGoals.has(event.id), 'unknown_goal');
      const planned = planGoals.get(event.id);
      if (event.status === 'complete') {
        need(planned.checkIds.every((key) => state.checks.get(key)?.status === 'passed'), 'goal_checks_incomplete');
        need(planned.dependsOn.every((key) => goalCurrent(key, state, planGoals)), 'goal_dependencies_incomplete');
      }
      state.goals.set(event.id, event);
    } else if (event.type === 'finding.open') {
      need(!state.findings.has(event.id), 'duplicate_finding');
      need(!planGoals.has(event.id) && !planChecks.has(event.id) && !planCoverage.has(event.id), 'finding_id_collision');
      state.findings.set(event.id, { ...event, status: 'open', openedSeq: event.seq });
    } else {
      const finding = state.findings.get(event.id);
      need(finding, 'unknown_finding');
      if (event.type === 'finding.reopen') {
        need(finding.status !== 'open', 'finding_already_open');
        state.findings.set(event.id, { ...finding, status: 'open', openedSeq: event.seq });
      } else {
        need(finding.status === 'open', 'finding_not_open');
        need(event.checkIds.every((key) => {
          const check = state.checks.get(key);
          return check?.status === 'passed' && check.seq > finding.openedSeq;
        }), 'resolution_requires_fresh_checks');
        state.findings.set(event.id, { ...finding, status: event.status, closedSeq: event.seq, checkIds: event.checkIds });
      }
    }
  });
  return { state, planGoals };
}
export function appendEvent(ledger, event, expected) {
  replay(ledger, expected);
  need(event && typeof event === 'object' && !Object.hasOwn(event, 'seq'), 'event_sequence_is_assigned');
  const next = copy(ledger);
  next.events.push({ ...copy(event), seq: next.events.length + 1 });
  replay(next, expected);
  need(Buffer.byteLength(JSON.stringify(next)) <= MAX_BYTES, 'ledger_too_large');
  return next;
}

export function evaluateCloseout(ledger, expected) {
  const { state, planGoals } = replay(ledger, expected);
  const blockers = [];
  const notes = [];
  const add = (code, key) => blockers.push({ code, id: key });
  for (const goal of ledger.plan.goals) {
    if (!goalCurrent(goal.id, state, planGoals)) add('goal_incomplete_or_stale', goal.id);
  }
  for (const check of ledger.plan.checks) {
    if (state.checks.get(check.id)?.status !== 'passed') {
      (check.required ? blockers : notes).push({ code: 'check_not_passed', id: check.id });
    }
  }
  for (const item of ledger.plan.coverage) {
    if (state.coverage.get(item.id)?.status !== 'inspected') {
      (item.required ? blockers : notes).push({ code: 'coverage_gap', id: item.id });
    }
  }
  for (const finding of state.findings.values()) {
    const blocking = SECTIONS.slice(0, 2).includes(finding.section) || finding.risk !== 'normal';
    const current = finding.status !== 'open' && finding.checkIds.every((key) => {
      const check = state.checks.get(key);
      return check?.status === 'passed' && check.seq < finding.closedSeq;
    });
    if (!current) (blocking ? blockers : notes).push({
      code: finding.status === 'open' ? 'finding_open' : 'finding_resolution_stale', id: finding.id,
    });
  }
  return {
    version: VERSION, verdict: blockers.length ? 'INCOMPLETE' : 'RECORDS_SATISFIED',
    readyForCloseout: blockers.length === 0, evidenceVerified: false, authorityGranted: false,
    eventCount: ledger.events.length, blockers, notes,
    findings: [...state.findings.values()].map(({ id: key, section, risk, status }) => ({ id: key, section, risk, status })),
    boundary: 'Recorded evidence only; host must verify current source, actual results, permissions and history completeness.',
  };
}

// Explicit local inputs only. No discovery, reference following, writes, shell,
// subprocesses, network, hooks, provider routing, or persistent shared database.
export function readJsonFile(filename) {
  let fd;
  try {
    text(filename, 'filename', 4096);
    const absolute = resolve(filename);
    // Reject symlink ancestors as well as a symlink leaf. The trusted caller
    // should pass a canonical path (especially on macOS with /var aliases).
    need(realpathSync(absolute) === absolute, 'input_not_canonical');
    const before = lstatSync(absolute);
    need(before.isFile() && before.nlink === 1 && before.size <= MAX_BYTES, 'input_not_bounded_regular_file');
    fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    const opened = fstatSync(fd);
    need(opened.isFile() && opened.nlink === 1 && opened.dev === before.dev && opened.ino === before.ino
      && opened.size <= MAX_BYTES, 'input_changed');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    need(length <= MAX_BYTES, 'input_too_large');
    const after = fstatSync(fd);
    need(length === after.size && opened.size === after.size
      && opened.mtimeMs === after.mtimeMs && opened.ctimeMs === after.ctimeMs, 'input_changed');
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    try { return JSON.parse(decoded); } catch { throw new Error('invalid_json'); }
  } catch (error) {
    // Do not echo filenames, input snippets, parser context or secrets on error.
    if (error?.code) throw new Error('input_unreadable');
    if (error instanceof TypeError) throw new Error('input_invalid_utf8');
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
const USAGE = `Fable run closeout (record accounting, not proof or authorization)
  fingerprint --plan FILE
  create --plan FILE --binding FILE
  checkpoint --ledger FILE --binding FILE --event FILE
  status --ledger FILE --binding FILE
  gate --ledger FILE --binding FILE
Commands emit JSON to stdout only. Inputs must be reviewed, redacted, canonical
regular files. Keep each output as a new private file; never redirect onto input.
Gate: 0 records satisfied, 1 incomplete, 2 invalid input. No commands are executed.
`;
export function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || (argv.length === 1 && ['help', '--help'].includes(argv[0]))) {
    process.stdout.write(USAGE);
    return 0;
  }
  const [command, ...args] = argv;
  const allowed = {
    fingerprint: ['--plan'], create: ['--plan', '--binding'],
    checkpoint: ['--ledger', '--binding', '--event'],
    status: ['--ledger', '--binding'], gate: ['--ledger', '--binding'],
  };
  need(Object.hasOwn(allowed, command), 'unknown_command');
  need(args.length === allowed[command].length * 2, 'invalid_arguments');
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    need(allowed[command].includes(args[i]) && !options.has(args[i])
      && typeof args[i + 1] === 'string' && !args[i + 1].startsWith('--'), 'invalid_arguments');
    options.set(args[i], args[i + 1]);
  }
  const read = (key) => readJsonFile(options.get(key));
  let result;
  if (command === 'fingerprint') result = { planDigest: planDigest(read('--plan')) };
  else if (command === 'create') result = createLedger(read('--plan'), read('--binding'));
  else if (command === 'checkpoint') result = appendEvent(read('--ledger'), read('--event'), read('--binding'));
  else result = evaluateCloseout(read('--ledger'), read('--binding'));
  const output = `${JSON.stringify(result)}\n`;
  need(Buffer.byteLength(output) <= MAX_BYTES, 'output_too_large');
  process.stdout.write(output);
  return command === 'gate' && !result.readyForCloseout ? 1 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message })}\n`);
    process.exitCode = 2;
  }
}
