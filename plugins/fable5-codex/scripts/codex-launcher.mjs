import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const npmCmdShim = ['@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0', '',
  'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"', '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*'].join('\n');

function findExecutable(requested) {
  const explicit = isAbsolute(requested) || /[/\\]/.test(requested);
  const names = process.platform === 'win32' && !extname(requested)
    ? ['.cmd', '.ps1', '.exe', '.com', ''].map((suffix) => `${requested}${suffix}`) : [requested];
  const candidates = explicit ? [resolve(requested)] : (process.env.PATH || process.env.Path || '').split(delimiter)
    .filter(Boolean).flatMap((directory) => names.map((name) => resolve(directory, name)));
  for (const candidate of candidates) {
    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return realpathSync(candidate);
    } catch { }
  }
  throw new Error('codex_launcher_not_found');
}

export function validateLauncher(launcher) {
  if (!launcher || typeof launcher.command !== 'string' || !isAbsolute(launcher.command)
    || typeof launcher.path !== 'string' || !isAbsolute(launcher.path) || !Array.isArray(launcher.prefixArgs)
    || launcher.prefixArgs.some((argument) => typeof argument !== 'string' || argument.includes('\0'))) throw new Error('invalid_codex_launcher');
  return launcher;
}

export function decodeLauncher(token) {
  if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) throw new Error('invalid_codex_launcher');
  const bytes = Buffer.from(token, 'base64');
  if (bytes.toString('base64') !== token) throw new Error('invalid_codex_launcher');
  return validateLauncher(JSON.parse(bytes.toString('utf8')));
}

export function resolveCodexLauncher(requested = 'codex') {
  if (typeof requested !== 'string' || !requested || /[\r\n\0]/.test(requested)) throw new Error('invalid_codex_launcher');
  const path = findExecutable(requested);
  const extension = extname(path).toLowerCase();
  const packageRoot = join(dirname(path), 'node_modules/@openai/codex');
  const manifest = join(packageRoot, 'package.json');
  if (extension === '.ps1') return validateLauncher({ path, command: findExecutable(process.platform === 'win32' ? 'pwsh.exe' : 'pwsh'), prefixArgs: ['-NoProfile', '-File', path] });
  if (existsSync(manifest) && extension === '.cmd') {
    const metadata = JSON.parse(readFileSync(manifest, 'utf8'));
    const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.codex;
    const shim = readFileSync(path, 'utf8').replaceAll('\r\n', '\n').trim();
    if (metadata.name === '@openai/codex' && bin === 'bin/codex.js' && shim === npmCmdShim) {
      const entrypoint = realpathSync(join(packageRoot, bin));
      const inside = relative(realpathSync(packageRoot), entrypoint);
      if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('invalid_npm_codex_entrypoint');
      const localNode = join(dirname(path), 'node.exe');
      return validateLauncher({ path, command: process.platform === 'win32' && existsSync(localNode) ? realpathSync(localNode) : process.execPath, prefixArgs: [entrypoint] });
    }
  }
  if (process.platform === 'win32' && ['.cmd', '.bat'].includes(extension)) throw new Error('unsupported_codex_batch_launcher_use_native_or_npm');
  if (process.platform === 'win32' && !['.exe', '.com'].includes(extension)) return validateLauncher({ path, command: findExecutable('bash.exe'), prefixArgs: [path] });
  return validateLauncher({ path, command: path, prefixArgs: [] });
}

export function launchCodex(launcher, args) {
  validateLauncher(launcher);
  return new Promise((resolveExit, reject) => {
    const child = spawn(launcher.command, [...launcher.prefixArgs, ...args], { shell: false, windowsHide: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolveExit(code ?? 1));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, value, ...args] = process.argv.slice(2);
    if (['resolve', 'resolve-base64'].includes(operation) && !args.length) {
      const serialized = JSON.stringify(resolveCodexLauncher(value));
      process.stdout.write(`${operation === 'resolve-base64' ? Buffer.from(serialized).toString('base64') : serialized}\n`);
    }
    else if (operation === 'run') process.exitCode = await launchCodex(validateLauncher(JSON.parse(value)), args);
    else if (operation === 'run-base64') process.exitCode = await launchCodex(decodeLauncher(value), args);
    else throw new Error('invalid_launcher_arguments');
  } catch (error) {
    process.stderr.write(`Fable launcher: ${/^[a-z_]+$/.test(error.message) ? error.message : 'codex_launcher_failed'}\n`);
    process.exitCode = 1;
  }
}
