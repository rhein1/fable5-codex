import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { scoreBenchmarkOutput } from "../scripts/benchmark-score.mjs";

const expected = [
  { Label: "retry finding", Patterns: ["retry", "missing|unsafe"] },
  { Label: "status finding", Patterns: ["status", "missing|absent"] },
];

test("scores successful output against expected and evidence markers", () => {
  const score = scoreBenchmarkOutput({
    exitCode: 0,
    text: "Finding: retry safety is missing. Evidence: src/payments.js. Coverage gap remains.",
    expected,
    evidence: ["src/payments.js", "tests/payments.test.js"],
  });

  assert.equal(score.status, "passed");
  assert.deepEqual(score.expectedHits, ["retry finding"]);
  assert.deepEqual(score.evidenceHits, ["src/payments.js"]);
  assert.equal(score.recallPct, 50);
  assert.equal(score.evidencePct, 50);
  assert.equal(score.unknownsPct, 100);
  assert.equal(score.structurePct, 100);
  assert.equal(score.compositePct, 60);
});

test("scores every nonzero execution as a failed zero regardless of stale text", () => {
  const score = scoreBenchmarkOutput({
    exitCode: 124,
    text: "Finding: retry is missing. Status is absent. Evidence: src/payments.js.",
    expected,
    evidence: ["src/payments.js"],
  });

  assert.deepEqual(score, {
    status: "failed",
    expectedHits: [],
    evidenceHits: [],
    recallPct: 0,
    evidencePct: 0,
    unknownsPct: 0,
    structurePct: 0,
    compositePct: 0,
  });
});

test("treats empty exit-zero output as a failed zero", () => {
  const score = scoreBenchmarkOutput({
    exitCode: 0,
    text: "  \n",
    expected,
    evidence: ["src/payments.js"],
  });

  assert.equal(score.status, "failed");
  assert.equal(score.compositePct, 0);
  assert.deepEqual(score.expectedHits, []);
  assert.deepEqual(score.evidenceHits, []);
});

test("runner keeps both arms isolated and removes the unsafe bypass", async () => {
  const runner = await readFile(new URL("../scripts/run-benchmarks.ps1", import.meta.url), "utf8");

  assert.doesNotMatch(runner, /--dangerously-bypass-approvals-and-sandbox/);
  assert.match(runner, /"--sandbox", "read-only"/);
  assert.match(runner, /"--ignore-rules"/);
  assert.match(runner, /shell_environment_policy\.inherit=/);
  assert.match(runner, /Set-BenchmarkProcessEnvironment/);
  assert.match(runner, /Remove-IsolatedAuth/);
  assert.match(runner, /\.latest-publish\.lock/);
  assert.match(runner, /publicationCommitted/);
  assert.match(runner, /SkipRuns was removed/);
  assert.match(runner, /codex-home-baseline/);
  assert.match(runner, /codex-home-plugin/);
});
