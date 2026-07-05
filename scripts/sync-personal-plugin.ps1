param(
  [string]$CanonicalPlugin = "",
  [string]$PersonalPlugin = "$HOME\plugins\fable5-codex"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($CanonicalPlugin)) {
  $CanonicalPlugin = Join-Path $repoRoot "plugins\fable5-codex"
}

$canonicalResolved = [System.IO.Path]::GetFullPath($CanonicalPlugin)
$personalResolved = [System.IO.Path]::GetFullPath($PersonalPlugin)
$expectedPersonalParent = [System.IO.Path]::GetFullPath((Join-Path $HOME "plugins"))
$relativePersonalPath = [System.IO.Path]::GetRelativePath($expectedPersonalParent, $personalResolved)

if (-not (Test-Path -LiteralPath (Join-Path $canonicalResolved ".codex-plugin/plugin.json"))) {
  throw "Canonical plugin path is missing .codex-plugin/plugin.json: $canonicalResolved"
}

if (
  $relativePersonalPath -eq "." -or
  [System.IO.Path]::IsPathRooted($relativePersonalPath) -or
  $relativePersonalPath.StartsWith("..", [System.StringComparison]::Ordinal)
) {
  throw "Refusing to sync outside the expected personal plugins directory: $personalResolved"
}

if ((Split-Path -Leaf $personalResolved) -ne "fable5-codex") {
  throw "Refusing to sync to an unexpected plugin directory name: $personalResolved"
}

if ($canonicalResolved -eq $personalResolved) {
  throw "Canonical and personal plugin paths are the same: $canonicalResolved"
}

$parent = Split-Path -Parent $personalResolved
New-Item -ItemType Directory -Force -Path $parent | Out-Null

if (Test-Path -LiteralPath $personalResolved) {
  $existingManifest = Join-Path $personalResolved ".codex-plugin/plugin.json"
  if (-not (Test-Path -LiteralPath $existingManifest)) {
    throw "Refusing to remove a directory that does not look like a Codex plugin: $personalResolved"
  }
  Remove-Item -LiteralPath $personalResolved -Recurse -Force
}

Copy-Item -LiteralPath $canonicalResolved -Destination $personalResolved -Recurse

Write-Host "Synced canonical plugin:"
Write-Host "  from: $canonicalResolved"
Write-Host "  to:   $personalResolved"
