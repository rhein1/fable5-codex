#!/usr/bin/env node
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packContext, serializePack, verifyPack, requireThat } from '../lib/context-pack.mjs';
import { readJsonFile, parseOptions } from '../lib/context-pack-io.mjs';
import { stageCapsule, loadCapsule, revokeCapsule, handleHook } from '../lib/keeper.mjs';
const HELP = `Codex Context Keeper by Agoragentic (MIT; source preview).
pack --input FILE --binding FILE
verify --input FILE --binding FILE --pack FILE
stage --input FILE --binding FILE --root ABSOLUTE_PRIVATE_ROOT --cwd ABSOLUTE_WORKTREE --session ID --reviewed REVIEWED_REDACTED [--ttl-ms 600000]
read --root ABSOLUTE_PRIVATE_ROOT --cwd ABSOLUTE_WORKTREE --session ID --policy REVISION
revoke --root ABSOLUTE_PRIVATE_ROOT --session ID
hook (bounded Codex event on stdin; default-off)
No transcript scan, hosted model, automatic capture, or native compaction replacement.
`;
export async function runCli(args, stdin = process.stdin) {
  const [command = 'help', ...rest] = args;
  if (['help', '--help'].includes(command)) { requireThat(!rest.length, 'INVALID_ARGUMENTS'); return HELP; }
  if (command === 'hook') {
    requireThat(!rest.length, 'INVALID_ARGUMENTS');
    // Default-off means no stdin reads and no file accesses, not a fake successful restore.
    if (process.env.CODEX_CONTEXT_KEEPER_ENABLE !== '1') return '{}\n';
    let size = 0; const chunks = [];
    for await (const chunk of stdin) { size += Buffer.byteLength(chunk); requireThat(size <= 16384, 'HOOK_INPUT_TOO_LARGE'); chunks.push(Buffer.from(chunk)); }
    return `${JSON.stringify(handleHook(JSON.parse(Buffer.concat(chunks).toString('utf8'))))}\n`;
  }
  const flags = {
    pack: ['--input', '--binding'], verify: ['--input', '--binding', '--pack'],
    stage: ['--input', '--binding', '--root', '--cwd', '--session', '--reviewed', '--ttl-ms'],
    read: ['--root', '--cwd', '--session', '--policy'], revoke: ['--root', '--session'],
  };
  requireThat(Object.hasOwn(flags, command), 'INVALID_COMMAND');
  const o = parseOptions(rest, flags[command]);
  const required = flags[command].filter((key) => key !== '--ttl-ms');
  requireThat(required.every((key) => Object.hasOwn(o, key)), 'MISSING_ARGUMENT');
  if (command === 'pack' || command === 'verify') {
    const input = readJsonFile(o['--input']), binding = readJsonFile(o['--binding']);
    return command === 'pack' ? serializePack(packContext(input, binding))
      : `${JSON.stringify(verifyPack(readJsonFile(o['--pack']), input, binding))}\n`;
  }
  if (command === 'read') return serializePack(loadCapsule({ root: o['--root'], cwd: o['--cwd'], session: o['--session'], policy: o['--policy'] }).pack);
  if (command === 'revoke') return `${JSON.stringify(revokeCapsule({ root: o['--root'], session: o['--session'] }))}\n`;
  requireThat(o['--ttl-ms'] === undefined || /^\d+$/.test(o['--ttl-ms']), 'INVALID_TTL');
  return `${JSON.stringify(stageCapsule({ root: o['--root'], cwd: o['--cwd'], session: o['--session'], reviewed: o['--reviewed'],
    ttlMs: o['--ttl-ms'] === undefined ? 600000 : Number(o['--ttl-ms']), input: readJsonFile(o['--input']), binding: readJsonFile(o['--binding']) }))}\n`;
}
function isMain() {
  try { return Boolean(process.argv[1]) && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url); }
  catch { return false; }
}
if (isMain()) {
  try { process.stdout.write(await runCli(process.argv.slice(2))); }
  catch (error) {
    if (process.argv[2] === 'hook') { process.stdout.write(JSON.stringify({ systemMessage: 'Codex Context Keeper: hook unavailable. Native behavior continues; context restoration is not confirmed.' }) + '\n'); }
    else { process.stderr.write(`${error.code && /^[A-Z_]+$/.test(error.code) ? error.code : 'KEEPER_FAILED'}\n`); process.exitCode = 2; }
  }
}
