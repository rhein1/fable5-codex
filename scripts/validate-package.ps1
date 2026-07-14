$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$plugin = Join-Path $repo "plugins/fable5-codex"
$packageFile = Join-Path $repo "package.json"
$installer = Join-Path $repo "bin/install.mjs"
$manifest = Join-Path $plugin ".codex-plugin/plugin.json"
$marketplace = Join-Path $repo ".agents/plugins/marketplace.json"
$schema = Join-Path $plugin "schemas/fable5.schema.json"
$ecfReference = Join-Path $plugin "references/ecf-run-contract.md"
$ecfTemplate = Join-Path $plugin "templates/fable-ecf-run-contract.json"
$solUltraTemplate = Join-Path $plugin "templates/sol-ultra.config.toml"
$reviewTemplate = Join-Path $plugin "templates/fable-review-contract.md"
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
Assert-Exists $solUltraTemplate
Assert-Exists $reviewTemplate
Assert-Exists $packageFile
Assert-Exists $installer

$manifestJson = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if ($manifestJson.name -ne "fable5-codex") {
  throw "Unexpected plugin name: $($manifestJson.name)"
}
if ([string]::IsNullOrWhiteSpace($manifestJson.version)) {
  throw "Plugin version must not be empty"
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
foreach ($prompt in $manifestJson.interface.defaultPrompt) {
  if ($prompt.Length -gt 128) {
    throw "Plugin default prompts must be at most 128 characters: $prompt"
  }
}

$packageJson = Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json
if ($packageJson.name -ne "fable5-codex") {
  throw "Unexpected package name: $($packageJson.name)"
}
if ($packageJson.version -ne $manifestJson.version) {
  throw "Package version $($packageJson.version) does not match plugin version $($manifestJson.version)"
}
if ($packageJson.bin."fable5-codex" -ne "bin/install.mjs") {
  throw "Package bin.fable5-codex must be bin/install.mjs"
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
node $installer --dry-run --no-codex-add | Out-Null

foreach ($skill in $requiredSkills) {
  $skillFile = Join-Path $plugin "skills/$skill/SKILL.md"
  Assert-Exists $skillFile
  $text = Get-Content -LiteralPath $skillFile -Raw
  if ($text -notmatch "(?s)^---\s*.*name:\s*$skill\b.*description:\s*.+?---") {
    throw "Skill frontmatter is missing name/description for $skill"
  }
  if (
    $text -notmatch "gpt-5\.6-sol" -or
    $text -notmatch 'model_reasoning_effort\s*=\s*"ultra"' -or
    $text -notmatch "parallel delegation" -or
    $text -notmatch "single-agent multi-lens"
  ) {
    throw "Skill is missing the Sol Ultra delegation/fallback policy: $skill"
  }
}

python -c "import pathlib,tomllib; [tomllib.loads(p.read_text()) for p in pathlib.Path(r'$plugin/custom-agents').glob('*.toml')]; print('custom agent toml ok')"
python -c "import pathlib,tomllib; data=tomllib.loads(pathlib.Path(r'$solUltraTemplate').read_text()); assert data['model'] == 'gpt-5.6-sol'; assert data['model_reasoning_effort'] == 'ultra'; print('Sol Ultra config ok')"

$wrapperDryRun = & (Join-Path $plugin "scripts/fable5-codex.ps1") -DryRun | ConvertFrom-Json
if ($wrapperDryRun.model -ne "gpt-5.6-sol" -or $wrapperDryRun.reasoningEffort -ne "ultra") {
  throw "PowerShell wrapper must default to gpt-5.6-sol with ultra reasoning"
}

Write-Host "Fable-5 package validation passed."
