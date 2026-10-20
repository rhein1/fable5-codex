param(
  [ValidateSet("verify", "audit", "deep-review", "fact-check", "understand", "design-options", "sweep")]
  [string]$Mode = "verify",
  [string]$Scope = ".",
  [string]$Focus = "",
  [string]$Profile = "balanced",
  [string]$Model = "",
  [string]$ReasoningEffort = "",
  [string]$SubagentModel = "",
  [string]$SubagentReasoningEffort = "",
  [string]$ModelCatalogPath = "",
  [ValidateSet("quick", "deep")][string]$VerificationDepth = "quick",
  [string]$CodexExecutable = $(if ($env:OS -eq 'Windows_NT') { 'codex.exe' } else { 'codex' }),
  [switch]$Write,
  [switch]$Ecf,
  [switch]$Subagents,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$minimumWorkerDefaultsCliVersion = [version]"0.152.0"

if ($Mode -eq 'verify' -and $Write) { throw 'Verification is read-only; request a separate repair workflow.' }
if (-not $DryRun) {
  if (-not (Get-Command $CodexExecutable -ErrorAction SilentlyContinue)) { throw "Codex executable not found: $CodexExecutable" }
  $versionOutput = (& $CodexExecutable --version 2>&1 | Out-String).Trim()
  $versionExitCode = $LASTEXITCODE
  $versionMatch = [regex]::Match($versionOutput, '(?im)^\s*codex-cli\s+v?(\d+\.\d+\.\d+)(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?(?=\s|$)')
  if ($versionExitCode -ne 0 -or -not $versionMatch.Success) { throw 'Could not determine Codex CLI version.' }
  $installedCliVersion = [version]$versionMatch.Groups[1].Value
  if ($installedCliVersion -lt $minimumWorkerDefaultsCliVersion) { throw "Fable worker defaults require Codex CLI $minimumWorkerDefaultsCliVersion or newer; executable reports $installedCliVersion." }
}
$resolverArgs = @('--profile', $Profile, '--codex-executable', $CodexExecutable)
foreach ($entry in @(@('--model', $Model), @('--effort', $ReasoningEffort), @('--worker-model', $SubagentModel), @('--worker-effort', $SubagentReasoningEffort))) {
  if ($entry[1]) { $resolverArgs += $entry }
}
if ($DryRun) { $resolverArgs += '--dry-run' }
elseif ($ModelCatalogPath) { $resolverArgs += @('--catalog', $ModelCatalogPath) }
$resolvedJson = & node (Join-Path $PSScriptRoot 'model-support.mjs') @resolverArgs
if ($LASTEXITCODE -ne 0) { throw 'Fable model preflight failed; no inference was started.' }
$resolved = $resolvedJson | ConvertFrom-Json
$Model = $resolved.model
$ReasoningEffort = $resolved.reasoningEffort
$SubagentModel = $resolved.subagentModel
$SubagentReasoningEffort = $resolved.subagentReasoningEffort

$skillByMode = @{
  "verify" = '$fable-verify'
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
if ($Mode -eq 'verify') { $prompt = "$prompt Verification mode: $VerificationDepth. Verify completion without repairs or changes to the reviewed system." }
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
    profile = $Profile
    catalogChecked = $resolved.catalogChecked
    accessVerified = $false
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

& $CodexExecutable @codexArgs
exit $LASTEXITCODE
