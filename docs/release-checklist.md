# Release Checklist

Use this checklist for Fable-5 for Codex releases.

## Preflight

```powershell
git status -sb
npm test
npm run validate
node --check bin/install.mjs
npm run pack:dry-run
git diff --check
```

Verify versions match:

- `package.json`
- `plugins/fable5-codex/.codex-plugin/plugin.json`
- `CHANGELOG.md`

## GitHub Release

Use a signed, annotated tag:

```powershell
git tag -s v0.4.0-alpha.2 -m "v0.4.0-alpha.2"
git push origin v0.4.0-alpha.2
```

Create the release:

```powershell
gh release create v0.4.0-alpha.2 --title "Fable-5 for Codex v0.4.0-alpha.2" --notes-file docs/release-notes/v0.4.0-alpha.2.md
```

Pin install example:

```powershell
codex plugin marketplace add rhein1/fable5-codex --ref v0.4.0-alpha.2
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
- Share the install snippet and example gallery.
