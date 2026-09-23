#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packContext, verifyPack, serializePack, requireThat } from '../lib/context-pack.mjs';
import { readJsonFile, parseOptions } from '../lib/context-pack-io.mjs';

export function runCli(args) {
  const [command, ...rest] = args;
  if ((!command || command === 'help' || command === '--help') && rest.length === 0) return [
    'Fable data-only context packer (explicit reviewed/redacted files only).',
    'pack --input FILE --binding FILE',
    'verify --input FILE --binding FILE --pack FILE',
    'Prints JSON; never modifies files, calls models, or changes Codex settings.',
  ].join('\n') + '\n';
  requireThat(['pack', 'verify'].includes(command), 'INVALID_COMMAND');
  const options = parseOptions(rest, command === 'pack' ? ['--input', '--binding'] : ['--input', '--binding', '--pack']);
  requireThat(options['--input'] && options['--binding'] && (command !== 'verify' || options['--pack']), 'MISSING_ARGUMENT');
  const input = readJsonFile(options['--input']), binding = readJsonFile(options['--binding']);
  return command === 'pack' ? serializePack(packContext(input, binding))
    : `${JSON.stringify(verifyPack(readJsonFile(options['--pack']), input, binding))}\n`;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(runCli(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.code ?? 'CONTEXT_PACK_FAILED'}\n`); process.exitCode = error.code === 'PROTECTED_CONTEXT_EXCEEDS_BUDGET' ? 3 : 2; }
}
