#!/usr/bin/env bash
set -euo pipefail

write=""
ecf=""
subagents=""
dry_run=""
model="${FABLE5_MODEL:-gpt-5.6-sol}"
reasoning="${FABLE5_REASONING_EFFORT:-ultra}"
codex_executable="${FABLE5_CODEX_EXECUTABLE:-codex}"
minimum_gpt56_cli_version="0.144.0"
positionals=()

for arg in "$@"; do
  case "$arg" in
    --write) write="1" ;;
    --ecf) ecf="1" ;;
    --subagents) subagents="1"; ecf="1" ;;
    --dry-run) dry_run="1" ;;
    --model=*) model="${arg#--model=}" ;;
    --reasoning=*) reasoning="${arg#--reasoning=}" ;;
    --codex-executable=*) codex_executable="${arg#--codex-executable=}" ;;
    --*)
      echo "Unknown flag: $arg" >&2
      echo "Expected flags: --write, --ecf, --subagents, --dry-run, --model=<id>, --reasoning=<effort>, --codex-executable=<path>" >&2
      exit 2
      ;;
    *) positionals+=("$arg") ;;
  esac
done

if (( ${#positionals[@]} > 3 )); then
  echo "Too many positional arguments: expected mode, scope, and optional focus" >&2
  exit 2
fi

mode="${positionals[0]:-audit}"
scope="${positionals[1]:-.}"
focus="${positionals[2]:-}"

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
  printf 'model=%s\nreasoning_effort=%s\ncodex_executable=%s\nminimum_cli_version=%s\nsandbox=%s\nprompt=%s\n' \
    "$model" "$reasoning" "$codex_executable" "$minimum_gpt56_cli_version" "$sandbox" "$prompt"
  exit 0
fi

if ! command -v "$codex_executable" >/dev/null 2>&1; then
  echo "Codex executable not found: $codex_executable" >&2
  exit 1
fi

version_output="$("$codex_executable" --version 2>&1)" || {
  echo "Could not determine Codex CLI version from '$codex_executable --version': $version_output" >&2
  exit 1
}
if [[ ! "$version_output" =~ (^|[[:space:]])codex-cli[[:space:]]+v?([0-9]+)\.([0-9]+)\.([0-9]+)([[:space:]]|$) ]]; then
  echo "Could not parse Codex CLI version from: $version_output" >&2
  exit 1
fi
installed_major=$((10#${BASH_REMATCH[2]}))
installed_minor=$((10#${BASH_REMATCH[3]}))
installed_patch=$((10#${BASH_REMATCH[4]}))
installed_version_text="${BASH_REMATCH[2]}.${BASH_REMATCH[3]}.${BASH_REMATCH[4]}"

if [[ "$model" == gpt-5.6-* ]]; then
  minimum_major=0
  minimum_minor=144
  minimum_patch=0
  if ((
    installed_major < minimum_major ||
    (installed_major == minimum_major && installed_minor < minimum_minor) ||
    (installed_major == minimum_major && installed_minor == minimum_minor && installed_patch < minimum_patch)
  )); then
    echo "GPT-5.6 requires Codex CLI $minimum_gpt56_cli_version or newer; $codex_executable reports $installed_version_text." >&2
    exit 1
  fi
fi

"$codex_executable" exec --model "$model" -c "model_reasoning_effort=\"$reasoning\"" --sandbox "$sandbox" "$prompt"
