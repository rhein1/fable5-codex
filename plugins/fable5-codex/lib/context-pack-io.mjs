// Explicit-file I/O only. These helpers do not discover transcripts or traverse repositories.
import { constants, openSync, closeSync, fstatSync, lstatSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import { fail, requireThat, LIMITS } from './context-pack.mjs';

export function readJsonFile(name, maximum = LIMITS.inputBytes) {
  requireThat(typeof name === 'string' && name.length > 0 && !name.includes('\0'), 'INVALID_FILE');
  const path = resolve(name);
  let fd;
  try {
    const before = lstatSync(path);
    requireThat(before.isFile() && !before.isSymbolicLink(), 'NOT_REGULAR_FILE');
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = fstatSync(fd);
    requireThat(opened.isFile() && opened.dev === before.dev && opened.ino === before.ino, 'FILE_CHANGED');
    requireThat(opened.size <= maximum, 'FILE_TOO_LARGE');
    const buffer = Buffer.alloc(maximum + 1);
    let count = 0, got;
    do { got = readSync(fd, buffer, count, buffer.length - count, null); count += got; } while (got && count < buffer.length);
    requireThat(count <= maximum, 'FILE_TOO_LARGE');
    const after = fstatSync(fd);
    requireThat(after.size === opened.size && after.mtimeMs === opened.mtimeMs && count === opened.size, 'FILE_CHANGED');
    const value = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, count));
    return JSON.parse(value);
  } catch (error) { if (error.code && /^[A-Z_]+$/.test(error.code) && !['ENOENT', 'EACCES', 'EISDIR'].includes(error.code)) throw error; fail('FILE_READ_OR_JSON_FAILED'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export function parseOptions(args, allowed) {
  requireThat(args.length % 2 === 0, 'INVALID_ARGUMENTS');
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    requireThat(allowed.includes(args[i]) && !Object.hasOwn(result, args[i]) && typeof args[i + 1] === 'string'
      && !args[i + 1].startsWith('--'), 'INVALID_ARGUMENTS');
    result[args[i]] = args[i + 1];
  }
  return result;
}
