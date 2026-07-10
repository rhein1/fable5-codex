# Contributing

Thanks for improving Fable-5 for Codex. This repo is an installable Codex plugin, so changes should keep the plugin package, docs, and marketplace metadata aligned.

## Local Setup

```powershell
git clone https://github.com/rhein1/fable5-codex.git
cd fable5-codex
npm install
npm run validate
```

You can install the local checkout into Codex with:

```powershell
codex plugin marketplace add .
codex plugin add fable5-codex@fable5-local
```

Start a new Codex thread after reinstalling.

## Pull Request Expectations

- Keep plugin code under `plugins/fable5-codex/`.
- Keep `.agents/plugins/marketplace.json` source paths relative and `./`-prefixed.
- Preserve the public boundary: Micro ECF-style contracts are public; private Full ECF internals must not be added.
- Do not claim multi-agent or parallel subagent behavior unless the workflow records real subagent IDs or runtime-visible handles.
- Run `npm test`, `npm run validate`, and `npm run pack:dry-run` before opening a PR.

## Useful Checks

```powershell
npm test
npm run validate
node --check bin/install.mjs
npm run pack:dry-run
git diff --check
```

For changes to examples or benchmark artifacts, make sure generated markdown has no trailing whitespace.
