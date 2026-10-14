#!/usr/bin/env node
// Build a new compatibility-layout directory for hosts without portable hooks.
// This never installs a plugin or changes Codex configuration.
import { cpSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireThat } from '../lib/context-pack.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const payload = ['.codex-plugin', '.agents', 'bin', 'lib', 'hooks', 'skills', 'README.md', 'SECURITY.md', 'LICENSE'];
function check(path) {
  const info = lstatSync(path);
  requireThat(!info.isSymbolicLink() && (info.isDirectory() || info.isFile()), 'UNSAFE_PACKAGE_ENTRY');
  if (info.isDirectory()) for (const name of readdirSync(path)) check(join(path, name));
}
try {
  requireThat(process.argv.length === 3 && process.argv[2].trim(), 'DESTINATION_REQUIRED');
  const destination = resolve(process.argv[2]);
  for (const name of payload) check(join(root, name));
  mkdirSync(destination); // Exclusive: existing destinations and missing parents fail.
  for (const name of payload) cpSync(join(root, name), join(destination, name), { recursive: true, errorOnExist: true, force: false });
  console.log(JSON.stringify({ prepared: true, layout: 'codex-compatibility', destination, installed: false }));
} catch (error) {
  // Do not delete a partial output: callers can inspect it; never overwrite it.
  console.error(error.code && /^[A-Z_]+$/.test(error.code) ? error.code : 'PREPARE_FAILED');
  process.exitCode = 2;
}
