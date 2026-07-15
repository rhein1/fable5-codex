import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const runner = path.join(repo, "scripts", "run-benchmarks.ps1");

function findPowerShell() {
  const candidates = process.platform === "win32" ? ["powershell.exe", "pwsh.exe"] : ["pwsh"];
  return candidates.find((candidate) => {
    const probe = spawnSync(candidate, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], {
      encoding: "utf8",
    });
    return probe.status === 0;
  });
}

const powerShell = findPowerShell();

async function createHarness(exitCode, delayMs = 0) {
  const root = await mkdtemp(path.join(os.tmpdir(), "fable5-benchmark-test-"));
  const results = path.join(root, "results");
  const assets = path.join(root, "assets");
  const runtime = path.join(root, "runtime");
  const fakeLog = path.join(root, "fake-cli.jsonl");
  const fakeModule = path.join(root, "fake-codex.mjs");
  const fakeCodex = path.join(root, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex");
  const authFile = path.join(root, "auth.json");
  await mkdir(results, { recursive: true });
  await writeFile(authFile, "{}\n", "utf8");
  await writeFile(
    fakeModule,
    `import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FABLE5_FAKE_LOG, JSON.stringify({
  arguments: args,
  codex_home: process.env.CODEX_HOME ?? "",
  secret_env_present: Boolean(
    process.env.FABLE5_SECRET_SENTINEL ||
    process.env.OPENAI_API_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY
  ),
}) + "\\n");
if (args.includes("--version")) {
  console.log("codex-cli 0.144.3");
  process.exit(0);
}
if (args[0] === "plugin" && args[1] === "list") {
  console.log('{"installed":[{"pluginId":"fable5-codex@fable5-local","enabled":true}]}');
  process.exit(0);
}
if (args[0] === "plugin") {
  console.log("{}");
  process.exit(0);
}
if (args.includes("exec")) {
  const outputIndex = args.indexOf("--output-last-message");
  const workIndex = args.indexOf("--cd");
  if (outputIndex < 0) throw new Error("missing output path");
  if (workIndex < 0) throw new Error("missing workspace path");
  const delayMs = Number(process.env.FABLE5_FAKE_DELAY_MS);
  if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
  const workspace = args[workIndex + 1].replaceAll("\\\\", "/");
  const backwardWorkspace = args[workIndex + 1].replaceAll("/", "\\\\");
  const mixedWorkspace = workspace
    .split("/")
    .map((segment, index) => index === 0 ? segment : (index % 2 === 0 ? "/" : "\\\\") + segment)
    .join("");
  const fileUri = "file://" + (workspace.startsWith("/") ? "" : "/") + workspace;
  const encodedWorkspace = workspace.replaceAll(" ", "%20");
  fs.writeFileSync(args[outputIndex + 1], [
    "Finding: retry safety is missing. Evidence and coverage gap noted at [STATUS.md](" + workspace + "/evals/fact-check-fixture/STATUS.md:1).",
    "Plain path: " + workspace + "/evals/fact-check-fixture/src/paymentAttempts.js",
    "Code path: \`" + backwardWorkspace + "\\\\evals\\\\fact-check-fixture\\\\tests\\\\paymentAttempts.test.js\`",
    "Mixed path: " + mixedWorkspace + "\\\\evals/fact-check-fixture/src/paymentAttempts.js",
    "URI path: [STATUS URI](" + fileUri + "/evals/fact-check-fixture/STATUS.md:1)",
    "Encoded path: [STATUS encoded](" + encodedWorkspace + "/evals/fact-check-fixture/STATUS.md:1)",
    "",
  ].join("\\n"));
  console.log("fake codex stream");
  process.exit(Number(process.env.FABLE5_FAKE_EXEC_EXIT));
}
throw new Error("unexpected fake Codex invocation: " + args.join(" "));
`,
    "utf8",
  );
  if (process.platform === "win32") {
    await writeFile(
      fakeCodex,
      '@echo off\r\nnode "%~dp0fake-codex.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n',
      "utf8",
    );
  } else {
    await writeFile(fakeCodex, '#!/usr/bin/env sh\nexec node "$(dirname "$0")/fake-codex.mjs" "$@"\n', "utf8");
    await chmod(fakeCodex, 0o755);
  }

  return { root, results, assets, runtime, fakeLog, fakeCodex, authFile, exitCode, delayMs };
}

function runHarness(harness, mode, timeoutSeconds = 30, resumeRunId = "", caseId = "fact-check-status") {
  const modeArgs = mode === "plugin"
    ? ["-PluginOnly"]
    : mode === "baseline"
      ? ["-BaselineOnly"]
      : [];
  const shellArgs = [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    runner,
    ...(caseId ? ["-CaseId", caseId] : []),
    ...modeArgs,
    "-TimeoutSeconds",
    String(timeoutSeconds),
    "-CodexExecutable",
    harness.fakeCodex,
    "-NodeExecutable",
    process.execPath,
    "-ResultsRoot",
    harness.results,
    "-AssetsRoot",
    harness.assets,
    "-RuntimeRoot",
    harness.runtime,
    "-AuthFile",
    harness.authFile,
    ...(resumeRunId ? ["-ResumeRunId", resumeRunId] : []),
  ];
  return spawnSync(powerShell, shellArgs, {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      FABLE5_FAKE_LOG: harness.fakeLog,
      FABLE5_FAKE_EXEC_EXIT: String(harness.exitCode),
      FABLE5_FAKE_DELAY_MS: String(harness.delayMs),
      FABLE5_SECRET_SENTINEL: "harmless-test-sentinel",
      OPENAI_API_KEY: "harmless-test-sentinel",
      AWS_SECRET_ACCESS_KEY: "harmless-test-sentinel",
    },
    timeout: 60_000,
  });
}

function plainResultOutput(result) {
  return `${result.stderr}\n${result.stdout}`.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

async function readOnlyRun(results) {
  const runIds = (await readdir(results)).filter((entry) => /^\d{8}T\d{6}Z$/.test(entry));
  assert.equal(runIds.length, 1);
  const summary = JSON.parse(await readFile(path.join(results, runIds[0], "summary.json"), "utf8"));
  return { runId: runIds[0], summary };
}

async function waitForFile(pathname, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await readFile(pathname);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`timed out waiting for ${pathname}`);
}

test("isolated plugin run succeeds without publishing an incomplete comparison", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const result = runHarness(harness, "plugin");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const { runId, summary } = await readOnlyRun(harness.results);
  assert.equal(summary.status, "passed");
  assert.equal(summary.exit_code, 0);
  assert.match(summary.output_digest_sha256, /^[a-f0-9]{64}$/);
  assert.ok(!Object.hasOwn(summary, "log_path"));
  const report = await readFile(path.join(harness.results, runId, "fact-check-status-plugin.md"), "utf8");
  assert.doesNotMatch(report, /fable5-codex-benchmarks|fable5-benchmark-test-/);
  assert.doesNotMatch(report, /file:\/\//);
  assert.match(report, /evals\/fact-check-fixture\/STATUS\.md#L1\)/);
  await assert.rejects(readFile(path.join(harness.results, "latest-summary.json"), "utf8"));
  assert.deepEqual(await readdir(harness.runtime), []);

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const execCall = calls.find((call) => call.arguments.includes("exec"));
  assert.ok(execCall);
  assert.match(execCall.codex_home, /codex-home-plugin$/);
  assert.deepEqual(execCall.arguments.slice(0, 5), [
    "--ask-for-approval",
    "never",
    "-c",
    "shell_environment_policy.inherit=none",
    "exec",
  ]);
  assert.ok(execCall.arguments.includes("read-only"));
  assert.ok(execCall.arguments.includes("--ignore-rules"));
  assert.ok(!execCall.arguments.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.equal(execCall.secret_env_present, false);
});

test("model execution requires an explicit benchmark auth file", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const root = await mkdtemp(path.join(os.tmpdir(), "fable5-auth-required-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = spawnSync(powerShell, [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    runner,
    "-ResultsRoot",
    path.join(root, "results"),
  ], { cwd: repo, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(plainResultOutput(result), /AuthFile is required for benchmark execution/);
});

test("failed baseline run records zero scores and leaves latest artifacts untouched", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(9);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const result = runHarness(harness, "baseline");
  assert.notEqual(result.status, 0, "runner should fail closed");
  const { summary } = await readOnlyRun(harness.results);
  assert.equal(summary.status, "failed");
  assert.equal(summary.exit_code, 9);
  assert.equal(summary.expected_hits, 0);
  assert.equal(summary.evidence_hits, 0);
  assert.equal(summary.composite_pct, 0);
  await assert.rejects(readFile(path.join(harness.results, "latest-summary.json"), "utf8"));
  assert.deepEqual(await readdir(harness.runtime), []);

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const execCall = calls.find((call) => call.arguments.includes("exec"));
  assert.ok(execCall);
  assert.match(execCall.codex_home, /codex-home-baseline$/);
  assert.equal(execCall.secret_env_present, false);
});

test("timed-out run is terminated, scored zero, and cleaned up", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0, 5_000);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const result = runHarness(harness, "baseline", 1);
  assert.notEqual(result.status, 0, "runner should reject timed-out trials");
  const { runId, summary } = await readOnlyRun(harness.results);
  assert.equal(summary.status, "failed");
  assert.equal(summary.exit_code, 124);
  assert.equal(summary.composite_pct, 0);
  assert.match(
    await readFile(path.join(harness.results, runId, "fact-check-status-baseline.log"), "utf8"),
    /TIMEOUT after 1 seconds/,
  );
  assert.deepEqual(await readdir(harness.runtime), []);
});

test("an active run lock rejects a concurrent invocation before setup or cleanup", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));
  const holderScript = path.join(harness.root, "hold-run-locks.ps1");
  const readyFile = path.join(harness.root, "locks-ready.txt");
  await writeFile(holderScript, `param([string]$ResultsRoot, [string]$ReadyFile)
$streams = @()
try {
  New-Item -ItemType Directory -Force -Path $ResultsRoot | Out-Null
  $start = [DateTime]::UtcNow
  foreach ($offset in 0..20) {
    $runId = $start.AddSeconds($offset).ToString("yyyyMMddTHHmmssZ")
    $path = Join-Path $ResultsRoot ".run-$runId.lock"
    $streams += [System.IO.File]::Open($path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  }
  Set-Content -LiteralPath $ReadyFile -Value "ready"
  Start-Sleep -Seconds 30
} finally {
  foreach ($stream in $streams) { $stream.Dispose() }
}
`, "utf8");

  const holder = spawn(powerShell, [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    holderScript,
    "-ResultsRoot",
    harness.results,
    "-ReadyFile",
    readyFile,
  ], { cwd: repo, stdio: "ignore" });
  try {
    await waitForFile(readyFile);
    const result = runHarness(harness, "plugin");
    assert.notEqual(result.status, 0);
    assert.match(plainResultOutput(result), /already active/);
    const runIds = (await readdir(harness.results)).filter((entry) => /^\d{8}T\d{6}Z$/.test(entry));
    assert.deepEqual(runIds, []);
    const calls = (await readFile(harness.fakeLog, "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.equal(calls.filter((call) => call.arguments.includes("exec")).length, 0);
  } finally {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      holder.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      holder.kill();
    });
  }
});

test("runtime root links are rejected before auth material is copied", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));
  const outside = path.join(harness.root, "outside-runtime");
  await mkdir(outside);
  try {
    await symlink(outside, harness.runtime, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      return t.skip(`directory links unavailable on this runner: ${error.code}`);
    }
    throw error;
  }

  const result = runHarness(harness, "plugin");
  assert.notEqual(result.status, 0);
  assert.match(plainResultOutput(result), /symbolic link or reparse\s+point/);
  assert.deepEqual(await readdir(outside), []);
});

test("runtime root ancestor links are rejected before creating descendants", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));
  const outside = path.join(harness.root, "outside-ancestor-runtime");
  const ancestorLink = path.join(harness.root, "runtime-ancestor-link");
  await mkdir(outside);
  try {
    await symlink(outside, ancestorLink, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      return t.skip(`directory links unavailable on this runner: ${error.code}`);
    }
    throw error;
  }
  harness.runtime = path.join(ancestorLink, "descendant-root");

  const result = runHarness(harness, "plugin");
  assert.notEqual(result.status, 0);
  assert.match(plainResultOutput(result), /symbolic link or reparse\s+point/);
  assert.deepEqual(await readdir(outside), []);
});

test("a matching partial run resumes without rerunning its completed arm", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const first = runHarness(harness, "plugin");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const firstRun = await readOnlyRun(harness.results);

  const resumed = runHarness(harness, "baseline", 30, firstRun.runId);
  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
  const { summary } = await readOnlyRun(harness.results);
  const rows = Array.isArray(summary) ? summary : [summary];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.mode).sort(), ["baseline", "plugin"]);
  assert.ok(rows.every((row) => !Object.hasOwn(row, "log_path")));
  await assert.rejects(readFile(path.join(harness.results, "latest-summary.json"), "utf8"));

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const execCalls = calls.filter((call) => call.arguments.includes("exec"));
  assert.equal(execCalls.length, 2);
  assert.equal(execCalls.filter((call) => /codex-home-plugin$/.test(call.codex_home)).length, 1);
  assert.equal(execCalls.filter((call) => /codex-home-baseline$/.test(call.codex_home)).length, 1);
  assert.deepEqual(await readdir(harness.runtime), []);
});

test("resume-to-complete manifest separates invocation scope from completed coverage", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const first = runHarness(harness, "plugin", 30, "", "");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const { runId } = await readOnlyRun(harness.results);

  const resumed = runHarness(harness, "baseline", 30, runId, "");
  assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
  const manifest = JSON.parse(await readFile(path.join(harness.results, runId, "run.json"), "utf8"));
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.published_as_latest, true);
  assert.deepEqual(manifest.invocation_selected_modes, ["baseline"]);
  assert.deepEqual(manifest.completed_modes, ["baseline", "plugin"]);
  assert.deepEqual(manifest.completed_cases, [
    "audit-payment-attempts",
    "fact-check-status",
    "understand-toy-repo",
  ]);
  assert.equal(manifest.completed_row_count, 6);
  assert.deepEqual(await readdir(harness.runtime), []);
});

test("resume rejects an attestation mismatch before another trial executes", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const first = runHarness(harness, "plugin");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const { runId } = await readOnlyRun(harness.results);

  const rejected = runHarness(harness, "baseline", 31, runId);
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stderr}\n${rejected.stdout}`, /Resume configuration mismatch for timeout_seconds/);

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(calls.filter((call) => call.arguments.includes("exec")).length, 1);
  assert.deepEqual(await readdir(harness.runtime), []);
});

test("resume rejects a changed summary before another trial executes", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const first = runHarness(harness, "plugin");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const { runId } = await readOnlyRun(harness.results);
  const summaryCsv = path.join(harness.results, runId, "summary.csv");
  await writeFile(summaryCsv, `${await readFile(summaryCsv, "utf8")}# changed\n`, "utf8");

  const rejected = runHarness(harness, "baseline", 30, runId);
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stderr}\n${rejected.stdout}`, /Resume summary digest mismatch/);

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(calls.filter((call) => call.arguments.includes("exec")).length, 1);
  assert.deepEqual(await readdir(harness.runtime), []);
});

test("resume rejects a changed prior output before another trial executes", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const first = runHarness(harness, "plugin");
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const { runId } = await readOnlyRun(harness.results);
  const report = path.join(harness.results, runId, "fact-check-status-plugin.md");
  await writeFile(report, `${await readFile(report, "utf8")}changed\n`, "utf8");

  const rejected = runHarness(harness, "baseline", 30, runId);
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stderr}\n${rejected.stdout}`, /Resume output digest mismatch/);

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(calls.filter((call) => call.arguments.includes("exec")).length, 1);
  assert.deepEqual(await readdir(harness.runtime), []);
});

test("complete comparison renders charts and publishes one coherent latest run", async (t) => {
  if (!powerShell) return t.skip("PowerShell is unavailable");
  const harness = await createHarness(0);
  t.after(() => rm(harness.root, { recursive: true, force: true }));

  const result = runHarness(harness, "both", 30, "", "");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const { runId, summary } = await readOnlyRun(harness.results);
  assert.equal(summary.length, 6);
  assert.ok(summary.every((row) => row.status === "passed" && /^[a-f0-9]{64}$/.test(row.output_digest_sha256)));

  const manifest = JSON.parse(await readFile(path.join(harness.results, runId, "run.json"), "utf8"));
  assert.equal(manifest.status, "complete");
  assert.equal(manifest.published_as_latest, true);
  assert.match(manifest.summary_digest_sha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.harness_digest_sha256, /^[a-f0-9]{64}$/);
  assert.match(await readFile(path.join(harness.results, "latest-run.txt"), "utf8"), new RegExp(`${runId}\\s*$`));

  for (const name of ["summary", "metrics", "latency"]) {
    const stable = await readFile(path.join(harness.assets, `fable5-benchmark-${name}.png`));
    const versioned = await readFile(path.join(harness.assets, `fable5-benchmark-${name}-${runId}.png`));
    assert.deepEqual(stable, versioned);
    assert.deepEqual([...stable.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
  const renderOnly = spawnSync(powerShell, [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    runner,
    "-RenderSummaryPath",
    path.join(harness.results, "latest-summary.csv"),
    "-ResultsRoot",
    harness.results,
    "-AssetsRoot",
    harness.assets,
    "-NodeExecutable",
    process.execPath,
  ], { cwd: repo, encoding: "utf8" });
  assert.equal(renderOnly.status, 0, renderOnly.stderr || renderOnly.stdout);

  const attestedSummaryChart = await readFile(path.join(harness.assets, "fable5-benchmark-summary.png"));
  const callerModelOverride = spawnSync(powerShell, [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    runner,
    "-RenderSummaryPath",
    path.join(harness.results, "latest-summary.csv"),
    "-ResultsRoot",
    harness.results,
    "-AssetsRoot",
    harness.assets,
    "-NodeExecutable",
    process.execPath,
    "-Model",
    "gpt-5.5",
  ], { cwd: repo, encoding: "utf8" });
  assert.equal(callerModelOverride.status, 0, callerModelOverride.stderr || callerModelOverride.stdout);
  assert.deepEqual(
    await readFile(path.join(harness.assets, "fable5-benchmark-summary.png")),
    attestedSummaryChart,
    "render-only mode must derive the chart label from attested rows",
  );

  const fakeNodeModule = path.join(harness.root, "fake-node.mjs");
  const fakeNode = path.join(harness.root, process.platform === "win32" ? "fake-node.cmd" : "fake-node");
  const latestRunPath = path.join(harness.results, "latest-run.txt");
  await writeFile(fakeNodeModule, `import fs from "node:fs";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
if (args[0] === "--version") {
  console.log(process.version);
  process.exit(0);
}
if ((args[0] || "").replaceAll("\\\\", "/").endsWith("/render-benchmark-charts.mjs")) {
  fs.writeFileSync(process.env.FABLE5_TEST_LATEST_RUN, "../changed-during-render\\n");
}
const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`, "utf8");
  if (process.platform === "win32") {
    await writeFile(fakeNode, `@echo off\r\n"${process.execPath}" "%~dp0fake-node.mjs" %*\r\nexit /b %ERRORLEVEL%\r\n`, "utf8");
  } else {
    await writeFile(fakeNode, `#!/usr/bin/env sh\nexec ${JSON.stringify(process.execPath)} "$(dirname "$0")/fake-node.mjs" "$@"\n`, "utf8");
    await chmod(fakeNode, 0o755);
  }
  const changedDuringRender = spawnSync(powerShell, [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    runner,
    "-RenderSummaryPath",
    path.join(harness.results, "latest-summary.csv"),
    "-ResultsRoot",
    harness.results,
    "-AssetsRoot",
    harness.assets,
    "-NodeExecutable",
    fakeNode,
  ], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, FABLE5_TEST_LATEST_RUN: latestRunPath },
  });
  assert.notEqual(changedDuringRender.status, 0);
  assert.match(`${changedDuringRender.stderr}\n${changedDuringRender.stdout}`, /changed before chart publication/);
  assert.deepEqual(
    await readFile(path.join(harness.assets, "fable5-benchmark-summary.png")),
    attestedSummaryChart,
    "stale render-only charts must not overwrite the stable asset",
  );
  await writeFile(latestRunPath, "../outside-results\n", "utf8");
  const escapedLatest = spawnSync(powerShell, [
    "-NoProfile",
    ...(process.platform === "win32" ? ["-ExecutionPolicy", "Bypass"] : []),
    "-File",
    runner,
    "-RenderSummaryPath",
    path.join(harness.results, "latest-summary.csv"),
    "-ResultsRoot",
    harness.results,
    "-AssetsRoot",
    harness.assets,
    "-NodeExecutable",
    process.execPath,
  ], { cwd: repo, encoding: "utf8" });
  assert.notEqual(escapedLatest.status, 0);
  assert.match(`${escapedLatest.stderr}\n${escapedLatest.stdout}`, /direct child of ResultsRoot/);

  const calls = (await readFile(harness.fakeLog, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  assert.equal(calls.filter((call) => call.arguments.includes("exec")).length, 6);
  assert.deepEqual(await readdir(harness.runtime), []);
});
