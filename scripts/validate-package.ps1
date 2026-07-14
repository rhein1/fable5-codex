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
$latestRunFile = Join-Path $repo "benchmarks/results/latest-run.txt"
$rootReadme = Join-Path $repo "README.md"
$benchmarkReadme = Join-Path $repo "benchmarks/README.md"
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

function Get-FileSha256($Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

Assert-Exists $manifest
Assert-Exists $marketplace
Assert-Exists $schema
Assert-Exists $ecfReference
Assert-Exists $ecfTemplate
Assert-Exists $solUltraTemplate
Assert-Exists $reviewTemplate
Assert-Exists $latestRunFile
Assert-Exists $rootReadme
Assert-Exists $benchmarkReadme
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

$latestRunRelative = (Get-Content -LiteralPath $latestRunFile -Raw).Trim()
$latestRunDir = [System.IO.Path]::GetFullPath((Join-Path $repo $latestRunRelative))
$benchmarkResultsRoot = [System.IO.Path]::GetFullPath((Join-Path $repo "benchmarks/results"))
$trimSeparators = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
$benchmarkResultsPrefix = $benchmarkResultsRoot.TrimEnd($trimSeparators) + [System.IO.Path]::DirectorySeparatorChar
$latestRunPrefix = $latestRunDir.TrimEnd($trimSeparators) + [System.IO.Path]::DirectorySeparatorChar
if (-not $latestRunPrefix.StartsWith($benchmarkResultsPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Latest benchmark run resolves outside benchmarks/results: $latestRunRelative"
}
Assert-Exists $latestRunDir
$latestRunId = Split-Path -Leaf $latestRunDir
$rootReadmeText = Get-Content -LiteralPath $rootReadme -Raw
$benchmarkReadmeText = Get-Content -LiteralPath $benchmarkReadme -Raw
foreach ($chartName in @("summary", "metrics", "latency")) {
  $assetName = "fable5-benchmark-$chartName-$latestRunId.png"
  $versionedAsset = Join-Path $repo "assets/benchmarks/$assetName"
  $stableAsset = Join-Path $repo "assets/benchmarks/fable5-benchmark-$chartName.png"
  Assert-Exists $versionedAsset
  Assert-Exists $stableAsset
  if ((Get-FileSha256 $versionedAsset) -ne (Get-FileSha256 $stableAsset)) {
    throw "Run-specific benchmark asset does not match its stable counterpart: $assetName"
  }
  if (-not $rootReadmeText.Contains("assets/benchmarks/$assetName")) {
    throw "Root README must reference the run-specific benchmark asset: $assetName"
  }
  if (-not $benchmarkReadmeText.Contains("../assets/benchmarks/$assetName")) {
    throw "Benchmark README must reference the run-specific benchmark asset: $assetName"
  }
  if ($rootReadmeText.Contains("assets/benchmarks/fable5-benchmark-$chartName.png")) {
    throw "Root README must not reference the cache-prone stable benchmark filename: $chartName"
  }
  if ($benchmarkReadmeText.Contains("../assets/benchmarks/fable5-benchmark-$chartName.png")) {
    throw "Benchmark README must not reference the cache-prone stable benchmark filename: $chartName"
  }
}
$absoluteBenchmarkLinks = @(Get-ChildItem -LiteralPath $latestRunDir -Filter *.md -File | Select-String -Pattern '\(/?[A-Za-z]:/')
if ($absoluteBenchmarkLinks.Count -gt 0) {
  throw "Latest benchmark reports contain absolute Windows links: $($absoluteBenchmarkLinks[0].Path):$($absoluteBenchmarkLinks[0].LineNumber)"
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
