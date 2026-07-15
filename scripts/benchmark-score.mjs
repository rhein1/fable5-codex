function matchesPatternSet(text, patterns) {
  return patterns.every((pattern) => new RegExp(pattern, "is").test(text));
}

export function scoreBenchmarkOutput({ exitCode, text = "", expected = [], evidence = [] }) {
  const normalizedText = typeof text === "string" ? text : String(text ?? "");
  if (exitCode !== 0 || normalizedText.trim() === "") {
    return {
      status: "failed",
      expectedHits: [],
      evidenceHits: [],
      recallPct: 0,
      evidencePct: 0,
      unknownsPct: 0,
      structurePct: 0,
      compositePct: 0,
    };
  }

  const normalized = normalizedText.toLowerCase();
  const expectedHits = expected
    .filter(({ Patterns: patterns = [] }) => matchesPatternSet(normalized, patterns))
    .map(({ Label: label }) => label);
  const evidenceHits = evidence.filter((marker) => normalized.includes(marker.toLowerCase()));
  const recallPct = (100 * expectedHits.length) / Math.max(1, expected.length);
  const evidencePct = (100 * evidenceHits.length) / Math.max(1, evidence.length);
  const unknownsPct = /(unknown|coverage|gap|not inspected|not tested|cannot confirm|unverified|missing evidence)/is.test(
    normalized,
  )
    ? 100
    : 0;
  const structurePct = /(finding|severity|claim|evidence|recommend|fix|status|supported|unsupported)/is.test(
    normalized,
  )
    ? 100
    : 0;
  const compositePct =
    0.6 * recallPct + 0.2 * evidencePct + 0.1 * unknownsPct + 0.1 * structurePct;

  return {
    status: "passed",
    expectedHits,
    evidenceHits,
    recallPct,
    evidencePct,
    unknownsPct,
    structurePct,
    compositePct,
  };
}
