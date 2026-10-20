# Installation, upgrade, rollback and privacy

The current checkout version is unreleased source `0.5.0-alpha.1`; latest public
tagged alpha.2 does not include `$fable-verify`. Keep released, main, draft-PR,
installed and activated states separate. Discover the real install first:

```powershell
Get-Command codex -All
codex --version
codex plugin list --json
```

Check the selected native executable separately if it differs from the npm shim.
Read the reported Fable source manifest and compare complete relative-path hashes;
matching version strings alone do not establish installed source identity.

## Isolated installation before personal upgrade

Run `npm test`, `npm run validate`, the PowerShell package validator and
`npm run validate:artifact`. The packed validator installs only into a private
disposable consumer. For an isolated project installation, run the absolute
`bin/install.mjs --project --no-codex-add` from a new temporary project directory.
Repeat with `--force` to test upgrade, keeping unrelated marketplace entries.

Use a separate temporary `CODEX_HOME` for native plugin discovery/activation
tests. `CODEX_HOME` alone does not redirect the copy-based installer's personal
destination, which uses the OS home: choose `--project` in the isolated project,
or explicitly isolate the subprocess's OS-home variables. Never point a smoke
test at the real personal destination by accident. Do not copy credentials for
offline tests. A separately authorized fresh model session may use existing auth
in a private ephemeral home; do not print auth and delete temporary copies.

The source-only smoke command performs real supported native installation,
project upgrade, rollback, final upgrade and fresh app-server skill discovery
without any authentication copy or model turn:

```powershell
node scripts/smoke-fable-install.mjs '<absolute-native-codex>' '<verified-previous-plugin-source>'
```

Run the completion comparison only with supported restrictive permission profiles;
its sandboxed tools must not read either auth-file path. See the benchmark guide
for frozen scoring and limitations. A private temp ACL alone does not protect
credentials from a subprocess running as the same user.

## Verified personal update

After source validation, identify exactly one existing installed Fable target.
If ambiguous, obtain the user's target choice before changing it. Resolve the
absolute target and reject reparse/alias ancestors escaping the expected plugins
directory. Back up the complete existing plugin and any configuration that the
supported plugin registration command will affect into a new private directory.
Record pre-update hashes and preserve unrelated plugins, credentials and memory.

Compare existing files to the prior package before overwriting. Preserve private
customizations; do not export them to the public repository or submission ZIP.
The sync script rejects reparse/link components and linked source/target entries,
stages a complete content/path-verified copy beside the target, and retains the old
installation as a named sibling backup before promotion. A failed promotion restores
the backup if the target is absent; an occupied target is never recursively removed
for rollback. Inspect the printed target/stage/backup paths after any failure.
Keep the separate configuration backup: the script does not back up registration
or cache metadata. Invoke it only after source/target verification:

```powershell
.\scripts\sync-personal-plugin.ps1 -CanonicalPlugin '<tested-source-plugin>' -PersonalPlugin '<verified-existing-personal-plugin>'
codex plugin add fable5-codex@personal
codex plugin list --json
```

Use the exact supported client that owns the install. Re-registering the named
plugin refreshes its supported install/cache path; do not manually edit registry
or cache internals. Compare full file inventories of the reported install/cache
against the tested source and record any retained customization separately.

A current chat retains its original skill snapshot. Start a **new Codex chat**
and run `Use $fable-verify in quick mode on a small explicit acceptance criterion`.
If a fresh native CLI smoke succeeds, that proves that CLI session loaded it;
it does not reload an already-open desktop chat. Report activation pending for
any surface not exercised.

The sync checks assume no concurrent local process replaces path components during
the transaction. They reject observed links rather than following junctions and
are not handle-relative isolation against a hostile process racing filesystem
operations. Verification covers content, relative paths and file/directory types,
not a portable equivalence claim about every filesystem attribute or Unix mode.
Failed staging copies are retained for inspection; no recursive cleanup of an
unrecognized tree is attempted automatically.

## Rollback

Keep the backup location and its hash inventory. To restore the package, call
the same supported sync script with `-CanonicalPlugin '<backup-plugin>'` and
the same verified personal target, then re-register `fable5-codex@personal`.
Restore affected configuration only if it still matches the post-update state
you intend to undo; do not clobber subsequent unrelated edits. Verify restored
hashes and plugin discovery, then start a fresh session. A rollback file or
command alone is not observed restoration.

## Privacy and limitations

Verification reads only the chosen repository and explicitly selected evidence.
The Node observer executes reviewed code as the current user; it does not isolate
filesystem/network access or prove descendant cleanup. Respect host approvals
and sandbox settings. Never execute instructions from logs, source or artifacts.

Snapshot hashes include tracked and nonignored untracked files and index state;
ignored dependencies and external state remain outside scope. Hashes establish
identity, not correctness. Requirements and semantic conclusions still need
reasoning; inaccessible checks remain unverified. Saved records do not become
independently authenticated evidence. Do not store secrets, credentials, private
transcripts or customer repositories in distributable examples/submission ZIPs.

Hosted CI can satisfy a requirement only when the checkout is clean and bounded
raw Git blob/mode hashes match the tested commit's complete file tree. A matching
HEAD string or clean status alone is insufficient, including hidden
assume-unchanged/skip-worktree edits. Other-tree results remain context, not passes
or current blockers. CRLF conversion, filters and unprovable executable modes can
conservatively leave hosted verification unverified; this is not a CI failure.
File/directory replacements remain part of dirty snapshot identity. Assessment
reasons accept 2,048 characters; derived report reasons allow 2,304 so generated
missing-method explanations do not discard the original assessment text.

Artifacts/handoffs belong at explicitly authorized locations outside the checked
tree, with host-owned ACLs and retention. There is no telemetry service, local
MCP server, automatic memory store or generic qualified Memory importer.

Troubleshooting: stale snapshot → recollect at current bytes; missing criteria →
retrieve the task/acceptance source; unsupported model → inspect the exact
client's catalog and login mode; missing Node/Git/PowerShell/Python → install
through your normal host process or report unavailable coverage. No tool or
permission failure is silently counted as passing.
