#!/usr/bin/env bash
set -euo pipefail

mode="${1:-audit}"
scope="${2:-.}"
focus="${3:-}"
write="${4:-}"

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

if [[ "$write" == "--write" ]]; then
  sandbox="workspace-write"
else
  sandbox="read-only"
fi

prompt="Use ${skill}. Scope: ${scope}."
if [[ -n "$focus" ]]; then
  prompt="${prompt} Focus: ${focus}."
fi

codex exec --sandbox "$sandbox" "$prompt"
