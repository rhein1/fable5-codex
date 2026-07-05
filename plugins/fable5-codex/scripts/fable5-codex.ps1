param(
  [ValidateSet("audit", "deep-review", "fact-check", "understand", "design-options", "sweep")]
  [string]$Mode = "audit",
  [string]$Scope = ".",
  [string]$Focus = "",
  [switch]$Write
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
$approval = if ($Write) { "untrusted" } else { "never" }
$skill = $skillByMode[$Mode]

$prompt = "Use $skill. Scope: $Scope."
if ($Focus.Trim().Length -gt 0) {
  $prompt = "$prompt Focus: $Focus."
}

codex exec --sandbox $sandbox --ask-for-approval $approval $prompt

