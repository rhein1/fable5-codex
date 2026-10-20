import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { appendEvent, evaluateCloseout } from './run-closeout.mjs';

const observations = new WeakMap();
const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function need(condition, code) {
  if (!condition) throw new Error(code);
}

function bindingDigest(binding) {
  return digest(JSON.stringify(['runId', 'scopeId', 'revision', 'policyDigest', 'planDigest'].map((key) => binding[key])));
}

function readSources(cwd, sourceFiles) {
  need(typeof cwd === 'string' && isAbsolute(cwd) && realpathSync(cwd) === cwd
    && lstatSync(cwd).isDirectory(), 'source_root_not_canonical');
  need(Array.isArray(sourceFiles) && sourceFiles.length > 0 && sourceFiles.length <= 1024
    && Object.keys(sourceFiles).length === sourceFiles.length, 'source_files_invalid');
  const aliases = new Set();
  const files = [];
  let totalBytes = 0;
  for (const name of [...sourceFiles].sort()) {
    need(typeof name === 'string' && name.length <= 512 && /^[A-Za-z0-9.][A-Za-z0-9_./-]*$/.test(name)
      && name.split('/').every((part) => part !== '' && part !== '.' && part !== '..'), 'source_path_invalid');
    need(!aliases.has(name.toLowerCase()), 'source_path_alias');
    aliases.add(name.toLowerCase());
    const filename = resolve(cwd, name);
    need(realpathSync(filename) === filename, 'source_not_canonical');
    const before = lstatSync(filename);
    need(before.isFile() && before.nlink === 1 && before.size <= MAX_SOURCE_BYTES - totalBytes, 'source_not_bounded_regular_file');
    const descriptor = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      const opened = fstatSync(descriptor);
      need(opened.isFile() && opened.nlink === 1 && opened.dev === before.dev && opened.ino === before.ino
        && opened.size === before.size, 'source_changed_during_read');
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(65536);
      let length = 0;
      while (true) {
        const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, MAX_SOURCE_BYTES - totalBytes - length + 1), null);
        if (count === 0) break;
        length += count;
        need(totalBytes + length <= MAX_SOURCE_BYTES, 'source_too_large');
        hash.update(buffer.subarray(0, count));
      }
      const after = fstatSync(descriptor);
      need(length === opened.size && opened.size === after.size && opened.mode === after.mode
        && opened.mtimeMs === after.mtimeMs && opened.ctimeMs === after.ctimeMs, 'source_changed_during_read');
      totalBytes += length;
      files.push([name, opened.mode, length, hash.digest('hex')]);
    } finally {
      closeSync(descriptor);
    }
  }
  return Object.freeze({ digest: digest(JSON.stringify(files)), fileCount: files.length, totalBytes, scope: 'explicit_files_only' });
}

export function fingerprintSources(cwd, sourceFiles) {
  try {
    return readSources(cwd, sourceFiles);
  } catch (error) {
    if (error?.code) throw new Error('source_unreadable');
    throw error;
  }
}

function runNode(spec) {
  return new Promise((resolveResult) => {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const stdoutHash = createHash('sha256');
    const stderrHash = createHash('sha256');
    let capturedBytes = 0;
    let stopReason;
    let settled = false;
    let deadline;
    let grace;
    let child;
    function finish(exitCode, signal, startFailed = false, closeObserved = true) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(grace);
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.unref();
      resolveResult({
        outcome: stopReason || (startFailed ? 'start_failed' : exitCode === 0 && signal === null ? 'exit_zero' : 'exit_nonzero'),
        startedAt, endedAt: new Date().toISOString(), durationMs: performance.now() - started,
        exitCode, signal, closeObserved, capturedBytes,
        outputComplete: !stopReason && !startFailed && closeObserved,
        stdoutDigest: stdoutHash.digest('hex'), stderrDigest: stderrHash.digest('hex'),
      });
    }
    function stop(reason) {
      if (settled || stopReason) return;
      stopReason = reason;
      child.kill('SIGKILL');
      grace = setTimeout(() => finish(null, null, false, false), 1000);
    }
    function capture(hash, chunk) {
      if (settled || stopReason) return;
      const remaining = spec.maxOutputBytes - capturedBytes;
      const captured = chunk.subarray(0, remaining);
      hash.update(captured);
      capturedBytes += captured.length;
      if (chunk.length > remaining) stop('output_limit');
    }
    try {
      child = spawn(process.execPath, spec.args, {
        cwd: spec.cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR'].filter((key) => process.env[key]).map((key) => [key, process.env[key]])),
      });
      child.stdout.on('data', (chunk) => capture(stdoutHash, chunk));
      child.stderr.on('data', (chunk) => capture(stderrHash, chunk));
      child.on('error', () => finish(null, null, true));
      child.on('close', (exitCode, signal) => finish(exitCode, signal));
      deadline = setTimeout(() => stop('timeout'), spec.timeoutMs);
    } catch {
      finish(null, null, true, false);
    }
  });
}

export function fingerprintCheck(spec) {
  need(spec !== null && typeof spec === 'object' && !Array.isArray(spec)
    && Object.keys(spec).length === 6
    && ['checkId', 'cwd', 'args', 'sourceFiles', 'timeoutMs', 'maxOutputBytes'].every((key) => Object.hasOwn(spec, key)), 'check_spec_invalid');
  need(Array.isArray(spec.args) && spec.args.length > 0 && spec.args.length <= 64
    && Object.keys(spec.args).length === spec.args.length
    && spec.args.every((arg) => typeof arg === 'string' && Buffer.byteLength(arg) <= 16384 && !arg.includes('\0')), 'command_args_invalid');
  need(Number.isSafeInteger(spec.timeoutMs) && spec.timeoutMs >= 10 && spec.timeoutMs <= 600000, 'timeout_invalid');
  need(Number.isSafeInteger(spec.maxOutputBytes) && spec.maxOutputBytes >= 1 && spec.maxOutputBytes <= 1024 * 1024, 'output_limit_invalid');
  need(Array.isArray(spec.sourceFiles), 'source_files_invalid');
  const scripts = spec.args[0] === '--test' ? spec.args.slice(1) : spec.args.slice(0, 1);
  need(scripts.length > 0 && scripts.every((script) => spec.sourceFiles.includes(script)
    && /\.(?:mjs|cjs|js)$/.test(script) && !script.startsWith('-')), 'scoped_script_required');
  return digest(JSON.stringify([process.execPath, process.version, process.platform, process.arch,
    spec.checkId, spec.cwd, spec.args, [...spec.sourceFiles].sort(), spec.timeoutMs, spec.maxOutputBytes]));
}

export async function observeNodeCheck(ledger, expected, spec, expectedSpecDigest) {
  evaluateCloseout(ledger, expected);
  need(ledger.plan.checks.some((check) => check.id === spec?.checkId && check.kind === 'command'), 'command_check_required');
  const commandSpecDigest = fingerprintCheck(spec);
  need(typeof expectedSpecDigest === 'string' && /^[0-9a-f]{64}$/.test(expectedSpecDigest)
    && commandSpecDigest === expectedSpecDigest, 'command_spec_mismatch');
  const request = clone(spec);
  const binding = clone(expected);
  const historyDigest = digest(JSON.stringify(ledger));
  const before = fingerprintSources(request.cwd, request.sourceFiles);
  need(binding.revision === `sha256:${before.digest}`, 'source_binding_mismatch');
  const result = await runNode(request);
  let sourceStable = false;
  try {
    sourceStable = fingerprintSources(request.cwd, request.sourceFiles).digest === before.digest;
  } catch {
    sourceStable = false;
  }
  const receipt = Object.freeze({
    version: 'fable5-observed-check/1', checkId: request.checkId, commandSpecDigest,
    bindingDigest: bindingDigest(binding), historyDigest,
    executablePathDigest: digest(process.execPath),
    argvDigest: digest(JSON.stringify(request.args)), cwdDigest: digest(request.cwd),
    nodeVersion: process.version, platform: process.platform, arch: process.arch,
    sourceDigest: before.digest, sourceFileCount: before.fileCount, sourceScope: before.scope,
    timeoutMs: request.timeoutMs, maxOutputBytes: request.maxOutputBytes, ...result, sourceStable,
    executionObserved: result.outcome !== 'start_failed', evidenceVerified: false,
    semanticResultVerified: false, authorityGranted: false, historyComplete: false,
    descendantCleanup: 'unverified', environmentIsolation: false,
  });
  observations.set(receipt, {
    binding: bindingDigest(binding), historyDigest, consumed: false,
    cwd: request.cwd, sourceFiles: request.sourceFiles, sourceDigest: before.digest,
  });
  return receipt;
}

export function appendObservedCheck(ledger, observation, expected) {
  evaluateCloseout(ledger, expected);
  const known = observations.get(observation);
  need(known && !known.consumed, 'observation_not_live_or_already_consumed');
  need(known.binding === bindingDigest(expected) && known.historyDigest === digest(JSON.stringify(ledger)), 'observation_binding_or_history_mismatch');
  need(fingerprintSources(known.cwd, known.sourceFiles).digest === known.sourceDigest, 'observation_source_stale');
  const status = !observation.sourceStable || !observation.outputComplete ? 'unavailable'
    : observation.outcome === 'exit_zero' ? 'passed' : 'failed';
  const next = appendEvent(ledger, {
    type: 'check', id: observation.checkId, status,
    detail: 'Host observed a bounded local Node process; exit status does not verify semantic correctness.',
    evidence: [{ ref: `sha256:${digest(JSON.stringify(observation))}`, observation: `Process outcome ${observation.outcome}; scoped source stable ${observation.sourceStable}; descendant cleanup unverified.` }],
  }, expected);
  known.consumed = true;
  return next;
}
