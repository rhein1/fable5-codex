# Release Checklist

Use this checklist for Fable-5 for Codex releases.

## Preflight

```powershell
git status -sb
npm test
npm run validate
npm run validate:artifact
node --check bin/install.mjs
npm run pack:dry-run
git diff --check
```

Verify versions match:

- `package.json`
- `plugins/fable5-codex/.codex-plugin/plugin.json`
- `CHANGELOG.md`

Verify repository hardening:

```powershell
gh api repos/rhein1/fable5-codex/private-vulnerability-reporting
gh api repos/rhein1/fable5-codex/actions/permissions
gh api repos/rhein1/fable5-codex/branches/main/protection
```

Private vulnerability reporting and Actions SHA pinning must be enabled. Main must require the aggregate `Release gate`, require conversation resolution, and reject force pushes and deletion.

## Merge Gate

Do not create a release tag from a feature branch. Merge the reviewed pull request, wait for the full `Validate` matrix to pass on `main`, then verify the local release point is the exact clean remote head:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw "local main does not match origin/main" }
if (-not [string]::IsNullOrWhiteSpace((git status --porcelain | Out-String))) { throw "release worktree is dirty" }
git log -1 --show-signature --oneline
gh run list --workflow Validate --branch main --limit 1
```

The latest successful `Validate` run must identify the same `HEAD` SHA before tagging.

## GitHub Release

Use a signed, annotated tag:

```powershell
git tag -s v0.4.0-alpha.3 -m "v0.4.0-alpha.3"
git push origin v0.4.0-alpha.3
```

Create the release:

```powershell
gh release create v0.4.0-alpha.3 --title "Fable-5 for Codex v0.4.0-alpha.3" --notes-file docs/release-notes/v0.4.0-alpha.3.md
```

Pin install example:

```powershell
codex plugin marketplace add rhein1/fable5-codex --ref v0.4.0-alpha.3
codex plugin add fable5-codex@fable5-local
```

## npm Publish

Check auth and existing versions:

```powershell
npm whoami
npm view fable5-codex versions --json
npm pack --dry-run
```

Publish prereleases with the alpha tag:

```powershell
npm publish --tag alpha
```

Smoke test from npm:

```powershell
npx fable5-codex --dry-run --no-codex-add
```

## Post-Release

- Update GitHub topics.
- Confirm README badges render.
- Confirm `latest-run.txt` points at the intended benchmark run.
- Confirm the GitHub release page includes benchmark images or links.
- If no new hardened benchmark was run, keep the pre-alpha.3 qualification visible and do not present historical charts as plugin-only causal proof.
- Share the install snippet and example gallery.
