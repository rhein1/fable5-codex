import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile } from './run-closeout.mjs';

export const modelProfiles = JSON.parse(readFileSync(new URL('../config/model-profiles.json', import.meta.url), 'utf8'));
const efforts = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
function need(condition, code) { if (!condition) throw new Error(code); }
function modelId(value) { need(typeof value === 'string' && /^[a-z0-9][a-z0-9._/-]{0,127}$/.test(value), 'invalid_model'); }

export function resolveModels(catalog, options = {}) {
  const profile = options.profile || modelProfiles.defaultProfile;
  need(Object.hasOwn(modelProfiles.profiles, profile), 'unknown_profile');
  const preferences = modelProfiles.profiles[profile];
  need(catalog === null || Array.isArray(catalog), 'invalid_catalog');
  function select(role, explicitModel, explicitEffort) {
    if (explicitModel) modelId(explicitModel);
    if (explicitEffort) need(efforts.includes(explicitEffort), 'invalid_effort');
    const candidates = explicitModel ? [{ model: explicitModel, effort: explicitEffort || null }]
      : preferences[role].map((item) => ({ ...item, effort: explicitEffort || item.effort }));
    if (catalog === null) return { ...candidates[0], effort: candidates[0].effort || 'medium', verified: false, fallback: '' };
    for (const candidate of candidates) {
      const entry = catalog.find((item) => (item.model || item.id) === candidate.model && item.hidden !== true);
      if (!entry) continue;
      const supported = (entry.supportedReasoningEfforts || []).map((item) => typeof item === 'string' ? item : item.reasoningEffort);
      const effort = candidate.effort || entry.defaultReasoningEffort;
      if (!supported.includes(effort)) continue;
      return { model: candidate.model, effort, verified: true,
        fallback: candidate.model === candidates[0].model ? '' : `${candidates[0].model} unavailable in this Codex catalog; selected ${candidate.model}/${effort}.` };
    }
    throw new Error(explicitModel || explicitEffort ? 'explicit_model_or_effort_unsupported' : 'profile_unavailable');
  }
  const coordinator = select('coordinator', options.model, options.effort);
  const worker = select('worker', options.workerModel, options.workerEffort);
  return { version: modelProfiles.version, profile, model: coordinator.model, reasoningEffort: coordinator.effort,
    subagentModel: worker.model, subagentReasoningEffort: worker.effort, catalogChecked: catalog !== null,
    accessVerified: false, fallback: [coordinator.fallback, worker.fallback].filter(Boolean).join(' '),
    boundary: 'Catalog support is a preflight, not account entitlement or proof of an inference turn.' };
}

export function discoverModels(executable = 'codex', prefixArgs = []) {
  return new Promise((resolveCatalog, reject) => {
    let command = executable;
    let prefix = [...prefixArgs];
    if (process.platform === 'win32') {
      if (executable === 'codex') command = 'codex.exe';
      else if (extname(executable).toLowerCase() === '.ps1') { command = 'pwsh'; prefix = ['-NoProfile', '-File', executable]; }
      else if (existsSync(executable) && !['.exe', '.com'].includes(extname(executable).toLowerCase())) { command = 'bash'; prefix = [executable]; }
    }
    const child = spawn(command, [...prefix, 'app-server'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let pending = '';
    let totalBytes = 0;
    let settled = false;
    let pageId = 2;
    const models = [];
    function done(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.destroy(); child.stdout.destroy(); child.kill(); child.unref();
      if (error) reject(new Error(error)); else resolveCatalog(models);
    }
    function send(value) { if (!settled) child.stdin.write(`${JSON.stringify(value)}\n`); }
    const timer = setTimeout(() => done('catalog_discovery_timeout'), 15000);
    child.on('error', () => done('catalog_discovery_unavailable'));
    child.stdin.on('error', () => done('catalog_discovery_unavailable'));
    child.on('close', () => { if (!settled) done('catalog_discovery_incomplete'); });
    child.stdout.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 1024 * 1024) { done('catalog_discovery_oversized'); return; }
      pending += chunk.toString('utf8');
      while (pending.includes('\n') && !settled) {
        const index = pending.indexOf('\n');
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { done('catalog_discovery_malformed'); return; }
        if (message.error) { done('catalog_discovery_rejected'); return; }
        if (message.id === 1) {
          send({ method: 'initialized', params: {} });
          send({ id: pageId, method: 'model/list', params: { includeHidden: false, limit: 100 } });
        } else if (message.id === pageId) {
          if (!Array.isArray(message.result?.data)) { done('catalog_discovery_malformed'); return; }
          models.push(...message.result.data.map((entry) => ({ model: entry.model || entry.id, id: entry.id,
            hidden: entry.hidden === true, isDefault: entry.isDefault === true,
            defaultReasoningEffort: entry.defaultReasoningEffort, supportedReasoningEfforts: entry.supportedReasoningEfforts })));
          if (message.result.nextCursor && pageId < 32) {
            pageId += 1;
            send({ id: pageId, method: 'model/list', params: { includeHidden: false, limit: 100, cursor: message.result.nextCursor } });
          } else if (message.result.nextCursor) done('catalog_discovery_truncated');
          else done();
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'fable_model_preflight', version: '1.0.0' }, capabilities: {} } });
  });
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  let executable = 'codex';
  let catalogPath;
  let format = 'json';
  let dryRun = false;
  const names = { '--profile': 'profile', '--model': 'model', '--effort': 'effort', '--worker-model': 'workerModel', '--worker-effort': 'workerEffort' };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    need(!seen.has(flag), 'duplicate_argument'); seen.add(flag);
    if (flag === '--dry-run') { dryRun = true; continue; }
    need(Object.hasOwn(names, flag) || ['--codex-executable', '--catalog', '--format'].includes(flag), 'invalid_arguments');
    const value = args[++index]; need(typeof value === 'string' && value && !value.startsWith('--'), 'invalid_arguments');
    if (flag === '--codex-executable') executable = value;
    else if (flag === '--catalog') catalogPath = value;
    else if (flag === '--format') format = value;
    else options[names[flag]] = value;
  }
  need(['json', 'lines'].includes(format), 'invalid_format');
  const catalog = dryRun ? null : catalogPath ? readJsonFile(catalogPath) : await discoverModels(executable);
  const result = resolveModels(catalog, options);
  if (catalogPath) { result.catalogOrigin = 'supplied_unverified'; result.catalogChecked = false; }
  process.stdout.write(format === 'json' ? `${JSON.stringify(result)}\n`
    : `model=${result.model}\nreasoning_effort=${result.reasoningEffort}\nsubagent_model=${result.subagentModel}\nsubagent_reasoning_effort=${result.subagentReasoningEffort}\ncatalog_checked=${result.catalogChecked}\naccess_verified=false\n`);
  if (result.fallback) process.stderr.write(`Fable model fallback: ${result.fallback}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch (error) {
    const code = /^[a-z_]+$/.test(error.message) ? error.message : 'model_preflight_failed';
    process.stderr.write(`Fable model preflight: ${code}; inspect this Codex client's model catalog and authentication.\n`);
    process.exitCode = 2;
  }
}
