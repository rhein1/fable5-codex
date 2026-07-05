param(
  [string]$CanonicalPlugin = "C:\projects\fable5-codex\plugins\fable5-codex",
  [string]$PersonalPlugin = "$HOME\plugins\fable5-codex"
)

$ErrorActionPreference = "Stop"

$canonicalResolved = [System.IO.Path]::GetFullPath($CanonicalPlugin)
$personalResolved = [System.IO.Path]::GetFullPath($PersonalPlugin)
$expectedPersonalParent = [System.IO.Path]::GetFullPath((Join-Path $HOME "plugins"))

if (-not (Test-Path -LiteralPath (Join-Path $canonicalResolved ".codex-plugin/plugin.json"))) {
  throw "Canonical plugin path is missing .codex-plugin/plugin.json: $canonicalResolved"
}

if (-not $personalResolved.StartsWith($expectedPersonalParent, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to sync outside the expected personal plugins directory: $personalResolved"
}

if ($canonicalResolved -eq $personalResolved) {
  throw "Canonical and personal plugin paths are the same: $canonicalResolved"
}

$parent = Split-Path -Parent $personalResolved
New-Item -ItemType Directory -Force -Path $parent | Out-Null

if (Test-Path -LiteralPath $personalResolved) {
  Remove-Item -LiteralPath $personalResolved -Recurse -Force
}

Copy-Item -LiteralPath $canonicalResolved -Destination $personalResolved -Recurse

Write-Host "Synced canonical plugin:"
Write-Host "  from: $canonicalResolved"
Write-Host "  to:   $personalResolved"
