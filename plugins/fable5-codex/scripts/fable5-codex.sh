#!/usr/bin/env bash
set -euo pipefail

mode="${1:-audit}"
scope="${2:-.}"
focus="${3:-}"
shift $(( $# >= 3 ? 3 : $# ))
write=""
ecf=""
subagents=""
dry_run=""
model="${FABLE5_MODEL:-gpt-5.6-sol}"
reasoning="${FABLE5_REASONING_EFFORT:-ultra}"

for flag in "$@"; do
  case "$flag" in
    --write) write="1" ;;
    --ecf) ecf="1" ;;
    --subagents) subagents="1"; ecf="1" ;;
    --dry-run) dry_run="1" ;;
    --model=*) model="${flag#--model=}" ;;
    --reasoning=*) reasoning="${flag#--reasoning=}" ;;
    *)
      echo "Unknown flag: $flag" >&2
      echo "Expected flags: --write, --ecf, --subagents, --dry-run, --model=<id>, --reasoning=<effort>" >&2
      exit 2
      ;;
  esac
done

case "$mode" in
  audit) skill='$fable-audit' ;;
  deep-review) skill='$fable-deep-review' ;;
  fact-check) skill='$fable-fact-check' ;;
  understand) skill='$fable-understand' ;;
  design-options) skill='$fable-design-options' ;;
  sweep) skill='$fable-sweep' ;;
  *)
    echo "Unknown mode: $mode" >&2
    echo "Expected: audit, deep-review, fact-check, understand, design-options, sweep" >&2
    exit 2
    ;;
esac

if [[ -n "$write" ]]; then
  sandbox="workspace-write"
else
  sandbox="read-only"
fi

prompt="Use ${skill}. Scope: ${scope}"
if [[ -n "$focus" ]]; then
  prompt="${prompt} Focus: ${focus}."
fi
if [[ -n "$ecf" ]]; then
  prompt="${prompt} Include an ECF run contract and Workflow Trace."
fi
prompt="${prompt} For large or high-risk Fable tasks, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out; otherwise report single-agent multi-lens with the no-subagent reason."
if [[ -n "$subagents" ]]; then
  prompt="${prompt} I explicitly authorize parallel subagents for this run. Spawn four independent read-only lenses when the runtime exposes a subagent tool: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist."
fi

if [[ -n "$dry_run" ]]; then
  printf 'model=%s\nreasoning_effort=%s\nsandbox=%s\nprompt=%s\n' "$model" "$reasoning" "$sandbox" "$prompt"
  exit 0
fi

codex exec --model "$model" -c "model_reasoning_effort=\"$reasoning\"" --sandbox "$sandbox" "$prompt"
