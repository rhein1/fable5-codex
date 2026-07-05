# Runtime Smoke Artifacts

These reports were generated with `codex exec` against the installed `fable5-codex` plugin.

## Captured

- `01-understand.md`: `$fable-understand` self-discovery smoke.
- `02-fact-check.md`: `$fable-fact-check` against `VALIDATION.md`.
- `03-audit.md`: `$fable-audit` against the package before post-audit fixes.

## Notes

The CLI smokes selected the Fable-5 skills and produced source-cited reports. During the runs, the read-only Windows sandbox could not spawn PowerShell inside the agent (`CreateProcessAsUserW failed: 5`), so the reports used filesystem and Node MCP fallbacks for repository inspection.

`03-audit.md` intentionally preserves the pre-fix findings that drove the post-audit package changes.
