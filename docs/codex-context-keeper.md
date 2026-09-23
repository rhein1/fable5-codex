# Standalone Codex Context Keeper

The original MIT-licensed standalone edition lives at:

```text
plugins/fable5-codex/standalone/codex-context-keeper/
```

It includes its own package, CLI, portable and compatibility plugin manifests,
local marketplace, skill, optional Codex hooks, tests, demo and license. Copy the
**entire directory including hidden files** to use it independently. Nothing in
the standalone runtime imports Fable or Memory. The shared core and I/O modules
are checked byte-for-byte against Fable by `test/codex-context-keeper.test.mjs`.

From that directory:

```sh
node examples/demo.mjs
npm test
npm run check
npm pack --ignore-scripts
```

There are no npm runtime dependencies or installation scripts. `private: true`
is an intentional registry publication guard, not a private-source license.
This is a source preview, not a published npm release or a separate remote repo.

Read the standalone README and SECURITY.md before staging data or registering
the local marketplace. Staging is an explicit private-file write; hooks stay off
without owner opt-in. The root Fable plugin and marketplace are unchanged, so
installing/updating Fable does not register or activate this nested plugin.

The hook supports a reviewed handoff after native compaction; it does not replace
the native compactor or edit Codex rollout files. Only fixed retrieval guidance,
not source excerpts, enters developer-role hook output. Real Codex installation,
manual/automatic compaction, resume, source freshness and resumed-task accuracy
still require target-host validation. No automatic capture or model call exists.

Review/merge order: the evidence-preserving context-packing PR first, then this
standalone-package PR. The latter is stacked on the former for a bounded diff.
No Fable model defaults, approval policies, existing skills, Laya settings,
package version or release claims are changed.
