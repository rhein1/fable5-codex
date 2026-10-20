#!/usr/bin/env bash
set -euo pipefail

write=""
ecf=""
subagents=""
dry_run=""
profile="${FABLE5_PROFILE:-balanced}"
model="${FABLE5_MODEL:-}"
reasoning="${FABLE5_REASONING_EFFORT:-}"
subagent_model="${FABLE5_SUBAGENT_MODEL:-}"
subagent_reasoning="${FABLE5_SUBAGENT_REASONING_EFFORT:-}"
default_codex=codex
if [[ "${OS:-}" == "Windows_NT" ]]; then default_codex=codex.exe; fi
codex_executable="${FABLE5_CODEX_EXECUTABLE:-$default_codex}"
catalog=""
depth="quick"
minimum_worker_defaults_cli_version="0.152.0"
positionals=()

for arg in "$@"; do
  case "$arg" in
    --write) write="1" ;;
    --ecf) ecf="1" ;;
    --subagents) subagents="1"; ecf="1" ;;
    --dry-run) dry_run="1" ;;
    --profile=*) profile="${arg#--profile=}" ;;
    --catalog=*) catalog="${arg#--catalog=}" ;;
    --depth=*) depth="${arg#--depth=}" ;;
    --model=*) model="${arg#--model=}" ;;
    --reasoning=*) reasoning="${arg#--reasoning=}" ;;
    --subagent-model=*) subagent_model="${arg#--subagent-model=}" ;;
    --subagent-reasoning=*) subagent_reasoning="${arg#--subagent-reasoning=}" ;;
    --codex-executable=*) codex_executable="${arg#--codex-executable=}" ;;
    --*)
      echo "Unknown flag: $arg" >&2
      echo "Expected flags: --write, --ecf, --subagents, --dry-run, --model=<id>, --reasoning=<effort>, --subagent-model=<id>, --subagent-reasoning=<effort>, --codex-executable=<path>" >&2
      exit 2
      ;;
    *) positionals+=("$arg") ;;
  esac
done

if (( ${#positionals[@]} > 3 )); then
  echo "Too many positional arguments: expected mode, scope, and optional focus" >&2
  exit 2
fi

mode="${positionals[0]:-verify}"
scope="${positionals[1]:-.}"
focus="${positionals[2]:-}"

case "$mode" in
  verify) skill='$fable-verify' ;;
  audit) skill='$fable-audit' ;;
  deep-review) skill='$fable-deep-review' ;;
  fact-check) skill='$fable-fact-check' ;;
  understand) skill='$fable-understand' ;;
  design-options) skill='$fable-design-options' ;;
  sweep) skill='$fable-sweep' ;;
  *)
    echo "Unknown mode: $mode" >&2
    echo "Expected: verify, audit, deep-review, fact-check, understand, design-options, sweep" >&2
    exit 2
    ;;
esac

if [[ "$mode" == verify && -n "$write" ]]; then echo 'Verification is read-only; request repairs separately.' >&2; exit 2; fi
if [[ "$depth" != quick && "$depth" != deep ]]; then echo 'Unknown verification depth.' >&2; exit 2; fi
if [[ -z "$dry_run" ]]; then
  if ! command -v "$codex_executable" >/dev/null 2>&1; then echo "Codex executable not found: $codex_executable" >&2; exit 1; fi
  version_output="$("$codex_executable" --version 2>&1)" || { echo 'Could not determine Codex CLI version.' >&2; exit 1; }
  if [[ ! "$version_output" =~ (^|[[:space:]])codex-cli[[:space:]]+v?([0-9]+)\.([0-9]+)\.([0-9]+)(-[0-9A-Za-z][0-9A-Za-z.-]*)?([[:space:]]|$) ]]; then echo 'Could not parse Codex CLI version.' >&2; exit 1; fi
  installed_major=$((10#${BASH_REMATCH[2]})); installed_minor=$((10#${BASH_REMATCH[3]})); installed_patch=$((10#${BASH_REMATCH[4]}))
  if (( installed_major == 0 && installed_minor < 152 )); then echo "Fable worker defaults require Codex CLI $minimum_worker_defaults_cli_version or newer; executable reports $installed_major.$installed_minor.$installed_patch." >&2; exit 1; fi
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
resolver_args=(--profile "$profile" --codex-executable "$codex_executable" --format lines)
[[ -z "$model" ]] || resolver_args+=(--model "$model")
[[ -z "$reasoning" ]] || resolver_args+=(--effort "$reasoning")
[[ -z "$subagent_model" ]] || resolver_args+=(--worker-model "$subagent_model")
[[ -z "$subagent_reasoning" ]] || resolver_args+=(--worker-effort "$subagent_reasoning")
if [[ -n "$dry_run" ]]; then resolver_args+=(--dry-run); elif [[ -n "$catalog" ]]; then resolver_args+=(--catalog "$catalog"); fi
resolved="$(node "$script_dir/model-support.mjs" "${resolver_args[@]}")" || exit 2
while IFS='=' read -r key value; do
  case "$key" in model) model="$value" ;; reasoning_effort) reasoning="$value" ;; subagent_model) subagent_model="$value" ;; subagent_reasoning_effort) subagent_reasoning="$value" ;; esac
done <<< "$resolved"

if [[ -n "$write" ]]; then
  sandbox="workspace-write"
else
  sandbox="read-only"
fi

prompt="Use ${skill}. Scope: ${scope}"
if [[ "$mode" == verify ]]; then prompt="${prompt} Verification mode: ${depth}. Verify completion without repairs or changes to the reviewed system."; fi
if [[ -n "$focus" ]]; then
  prompt="${prompt} Focus: ${focus}."
fi
if [[ -n "$ecf" ]]; then
  prompt="${prompt} Include an ECF run contract and Workflow Trace."
fi
prompt="${prompt} For large or high-risk Fable tasks, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out. Report the requested and actual coordinator model and effort plus any fallback. Use ${subagent_model} with ${subagent_reasoning} reasoning for each delegated worker when supported, and report the requested and actual worker model plus any fallback; otherwise report single-agent multi-lens with the no-subagent reason."
if [[ -n "$subagents" ]]; then
  prompt="${prompt} I explicitly authorize parallel subagents for this run. Spawn four independent read-only lenses when the runtime exposes a subagent tool: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist."
fi

if [[ -n "$dry_run" ]]; then
  printf 'model=%s\nreasoning_effort=%s\nsubagent_model=%s\nsubagent_reasoning_effort=%s\ncodex_executable=%s\nminimum_cli_version=%s\nsandbox=%s\nprompt=%s\n' \
    "$model" "$reasoning" "$subagent_model" "$subagent_reasoning" "$codex_executable" "$minimum_worker_defaults_cli_version" "$sandbox" "$prompt"
  exit 0
fi

"$codex_executable" exec \
  --model "$model" \
  -c "model_reasoning_effort=\"$reasoning\"" \
  -c "agents.default_subagent_model=\"$subagent_model\"" \
  -c "agents.default_subagent_reasoning_effort=\"$subagent_reasoning\"" \
  --sandbox "$sandbox" \
  "$prompt"
