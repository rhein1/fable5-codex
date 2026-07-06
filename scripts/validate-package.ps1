$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$plugin = Join-Path $repo "plugins/fable5-codex"
$manifest = Join-Path $plugin ".codex-plugin/plugin.json"
$marketplace = Join-Path $repo ".agents/plugins/marketplace.json"
$schema = Join-Path $plugin "schemas/fable5.schema.json"
$ecfReference = Join-Path $plugin "references/ecf-run-contract.md"
$ecfTemplate = Join-Path $plugin "templates/fable-ecf-run-contract.json"
$requiredSkills = @(
  "fable-audit",
  "fable-deep-review",
  "fable-fact-check",
  "fable-understand",
  "fable-design-options",
  "fable-sweep"
)

function Assert-Exists($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing required path: $Path"
  }
}

Assert-Exists $manifest
Assert-Exists $marketplace
Assert-Exists $schema
Assert-Exists $ecfReference
Assert-Exists $ecfTemplate

$manifestJson = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if ($manifestJson.name -ne "fable5-codex") {
  throw "Unexpected plugin name: $($manifestJson.name)"
}
if ($manifestJson.version -ne "0.3.0-alpha") {
  throw "Unexpected plugin version: $($manifestJson.version)"
}
if ($manifestJson.skills -ne "./skills/") {
  throw "Unexpected skills path: $($manifestJson.skills)"
}
if ($manifestJson.homepage -ne "https://agoragentic.com") {
  throw "Unexpected homepage: $($manifestJson.homepage)"
}
if ($manifestJson.interface.websiteURL -ne "https://agoragentic.com") {
  throw "Unexpected interface.websiteURL: $($manifestJson.interface.websiteURL)"
}

$marketplaceJson = Get-Content -LiteralPath $marketplace -Raw | ConvertFrom-Json
$entry = $marketplaceJson.plugins | Where-Object { $_.name -eq "fable5-codex" } | Select-Object -First 1
if (-not $entry) {
  throw "Marketplace does not include fable5-codex"
}
if ($entry.source.path -ne "./plugins/fable5-codex") {
  throw "Marketplace source.path must be ./plugins/fable5-codex, got $($entry.source.path)"
}
$resolved = [System.IO.Path]::GetFullPath((Join-Path $repo $entry.source.path))
if ($resolved -ne [System.IO.Path]::GetFullPath($plugin)) {
  throw "Marketplace source.path resolves to $resolved, expected $plugin"
}

Get-Content -LiteralPath $schema -Raw | ConvertFrom-Json | Out-Null
Get-Content -LiteralPath $ecfTemplate -Raw | ConvertFrom-Json | Out-Null

foreach ($skill in $requiredSkills) {
  $skillFile = Join-Path $plugin "skills/$skill/SKILL.md"
  Assert-Exists $skillFile
  $text = Get-Content -LiteralPath $skillFile -Raw
  if ($text -notmatch "(?s)^---\s*.*name:\s*$skill\b.*description:\s*.+?---") {
    throw "Skill frontmatter is missing name/description for $skill"
  }
}

python -c "import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path(r'$plugin/custom-agents').glob('*.toml')]; print('custom agent toml ok')"

Write-Host "Fable-5 package validation passed."
