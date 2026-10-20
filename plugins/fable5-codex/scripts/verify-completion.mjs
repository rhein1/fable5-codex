import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile } from './run-closeout.mjs';
import { createHandoff, createVerification, finishVerification, memoryExport, renderReport,
  revalidateArtifact, snapshotRepository, validateArtifact } from '../lib/completion-verification.mjs';

export function main(args = process.argv.slice(2)) {
  if (args.length === 0 || args[0] === '--help') {
    process.stdout.write('Fable completion verification: snapshot|draft|validate|check|render|handoff|export-memory\n'
      + '--root PATH --repository ID [--pr-head SHA] [--base SHA] [--merge-test SHA]; draft also needs --request FILE --mode quick|deep.\n'
      + 'Other commands need --artifact FILE. No commands from input records are executed.\n');
    return 0;
  }
  const [command, ...flags] = args;
  const allowed = {
    snapshot: ['--root', '--repository', '--pr-head', '--base', '--merge-test'],
    draft: ['--root', '--repository', '--pr-head', '--base', '--merge-test', '--request', '--mode'],
    validate: ['--artifact'], check: ['--artifact', '--root', '--repository', '--pr-head', '--base', '--merge-test'],
    render: ['--artifact'], handoff: ['--artifact'], 'export-memory': ['--artifact'],
  };
  if (!Object.hasOwn(allowed, command) || flags.length % 2) throw new Error('invalid_arguments');
  const options = new Map();
  for (let index = 0; index < flags.length; index += 2) {
    if (!allowed[command].includes(flags[index]) || options.has(flags[index])
      || !flags[index + 1] || flags[index + 1].startsWith('--')) throw new Error('invalid_arguments');
    options.set(flags[index], flags[index + 1]);
  }
  const identityOptions = { repository: options.get('--repository'), prHead: options.get('--pr-head') || null, base: options.get('--base') || null, mergeTest: options.get('--merge-test') || null };
  let result;
  if (command === 'snapshot') result = snapshotRepository(options.get('--root'), identityOptions);
  else if (command === 'draft') result = finishVerification(createVerification(options.get('--root'), readJsonFile(options.get('--request')), { ...identityOptions, mode: options.get('--mode') || 'quick' }));
  else {
    const artifact = readJsonFile(options.get('--artifact'));
    result = command === 'validate' ? validateArtifact(artifact)
      : command === 'check' ? revalidateArtifact(artifact, options.get('--root'), identityOptions)
        : command === 'render' ? renderReport(artifact) : command === 'handoff' ? createHandoff(artifact) : memoryExport(artifact);
  }
  process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}\n`);
  return command === 'check' && result.overall !== 'verified' ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch {
    process.stderr.write('{"error":"invalid_or_inaccessible_verification_input"}\n');
    process.exitCode = 2;
  }
}
