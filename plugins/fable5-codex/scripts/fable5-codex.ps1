param(
  [ValidateSet("audit", "deep-review", "fact-check", "understand", "design-options", "sweep")]
  [string]$Mode = "audit",
  [string]$Scope = ".",
  [string]$Focus = "",
  [string]$Model = "gpt-5.6-sol",
  [ValidateSet("low", "medium", "high", "xhigh", "max", "ultra")]
  [string]$ReasoningEffort = "ultra",
  [string]$SubagentModel = "gpt-5.6-luna",
  [ValidateSet("low", "medium", "high", "xhigh", "max", "ultra")]
  [string]$SubagentReasoningEffort = "medium",
  [string]$CodexExecutable = "codex",
  [switch]$Write,
  [switch]$Ecf,
  [switch]$Subagents,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$minimumWorkerDefaultsCliVersion = [version]"0.152.0"

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
$prompt = "$prompt For large or high-risk Fable tasks, use real Codex subagents when the runtime exposes a subagent tool and the user has not opted out. Report the requested and actual coordinator model and effort plus any fallback. Use $SubagentModel with $SubagentReasoningEffort reasoning for each delegated worker when supported, and report the requested and actual worker model plus any fallback; otherwise report single-agent multi-lens with the no-subagent reason."
if ($Subagents) {
  $prompt = "$prompt I explicitly authorize parallel subagents for this run. Spawn four independent read-only lenses when the runtime exposes a subagent tool: correctness-integration, security-privacy-authz, data-migrations-idempotency, and operations-tests-docs. The main agent must verify candidates locally before final findings. Do not claim multi-agent mode unless real subagent IDs exist."
}

$codexArgs = @(
  "exec",
  "--model", $Model,
  "-c", "model_reasoning_effort=`"$ReasoningEffort`"",
  "-c", "agents.default_subagent_model=`"$SubagentModel`"",
  "-c", "agents.default_subagent_reasoning_effort=`"$SubagentReasoningEffort`"",
  "--sandbox", $sandbox,
  $prompt
)

if ($DryRun) {
  [pscustomobject]@{
    model = $Model
    reasoningEffort = $ReasoningEffort
    subagentModel = $SubagentModel
    subagentReasoningEffort = $SubagentReasoningEffort
    codexExecutable = $CodexExecutable
    minimumCliVersion = $minimumWorkerDefaultsCliVersion.ToString()
    sandbox = $sandbox
    prompt = $prompt
  } | ConvertTo-Json -Depth 3
  return
}

if (-not (Get-Command $CodexExecutable -ErrorAction SilentlyContinue)) {
  throw "Codex executable not found: $CodexExecutable"
}

$versionOutput = (& $CodexExecutable --version 2>&1 | Out-String).Trim()
$versionExitCode = $LASTEXITCODE
$versionMatch = [regex]::Match(
  $versionOutput,
  '(?im)^\s*codex-cli\s+v?(\d+\.\d+\.\d+)(?=\s|$)'
)
if ($versionExitCode -ne 0 -or -not $versionMatch.Success) {
  throw "Could not determine Codex CLI version from '$CodexExecutable --version': $versionOutput"
}
$installedCliVersion = [version]$versionMatch.Groups[1].Value
if ($installedCliVersion -lt $minimumWorkerDefaultsCliVersion) {
  throw "Fable's Luna worker defaults require Codex CLI $minimumWorkerDefaultsCliVersion or newer; $CodexExecutable reports $installedCliVersion."
}

& $CodexExecutable @codexArgs
exit $LASTEXITCODE
