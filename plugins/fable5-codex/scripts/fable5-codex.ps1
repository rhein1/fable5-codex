param(
  [ValidateSet("audit", "deep-review", "fact-check", "understand", "design-options", "sweep")]
  [string]$Mode = "audit",
  [string]$Scope = ".",
  [string]$Focus = "",
  [switch]$Write,
  [switch]$Ecf,
  [switch]$Subagents
)

$ErrorActionPreference = "Stop"

$skillByMode = @{
  "audit" = '$fable-audit'
  "deep-review" = '$fable-deep-review'
  "fact-check" = '$fable-fact-check'
  "understand" = '$fable-understand'
  "design-options" = '$fable-design-options'
  "sweep" = '$fable-sweep'
}

$sandbox = if ($Write) { "workspace-write" } else { "read-only" }
$skill = $skillByMode[$Mode]

$prompt = "Use $skill. Scope: $Scope."
if ($Focus.Trim().Length -gt 0) {
  $prompt = "$prompt Focus: $Focus."
}
if ($Ecf -or $Subagents) {
  $prompt = "$prompt Include an ECF run contract and Workflow Trace."
}
$prompt = "$prompt For large or high-risk Fable tasks, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out; otherwise report single-agent multi-lens with the no-subagent reason."
if ($Subagents) {
  $prompt = "$prompt I explicitly authorize parallel subagents for this run. Spawn four independent read-only lenses when the runtime exposes a subagent tool: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist."
}

codex exec --sandbox $sandbox $prompt
