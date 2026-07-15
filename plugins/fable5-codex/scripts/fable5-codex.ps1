param(
  [ValidateSet("audit", "deep-review", "fact-check", "understand", "design-options", "sweep")]
  [string]$Mode = "audit",
  [string]$Scope = ".",
  [string]$Focus = "",
  [string]$Model = "gpt-5.6-sol",
  [ValidateSet("low", "medium", "high", "xhigh", "max", "ultra")]
  [string]$ReasoningEffort = "ultra",
  [string]$CodexExecutable = "codex",
  [switch]$Write,
  [switch]$Ecf,
  [switch]$Subagents,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$minimumGpt56CliVersion = [version]"0.144.0"

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

$prompt = "Use $skill. Scope: $Scope"
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

$codexArgs = @(
  "exec",
  "--model", $Model,
  "-c", "model_reasoning_effort=`"$ReasoningEffort`"",
  "--sandbox", $sandbox,
  $prompt
)

if ($DryRun) {
  [pscustomobject]@{
    model = $Model
    reasoningEffort = $ReasoningEffort
    codexExecutable = $CodexExecutable
    minimumCliVersion = $minimumGpt56CliVersion.ToString()
    sandbox = $sandbox
    prompt = $prompt
  } | ConvertTo-Json -Depth 3
  return
}

if (-not (Get-Command $CodexExecutable -ErrorAction SilentlyContinue)) {
  throw "Codex executable not found: $CodexExecutable"
}

$versionOutput = (& $CodexExecutable --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '(\d+\.\d+\.\d+)') {
  throw "Could not determine Codex CLI version from '$CodexExecutable --version': $versionOutput"
}
$installedCliVersion = [version]$Matches[1]
if ($Model -match '^gpt-5\.6-' -and $installedCliVersion -lt $minimumGpt56CliVersion) {
  throw "GPT-5.6 requires Codex CLI $minimumGpt56CliVersion or newer; $CodexExecutable reports $installedCliVersion."
}

& $CodexExecutable @codexArgs
exit $LASTEXITCODE
