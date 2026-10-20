param([Parameter(Mandatory = $true)][string]$OutputZip)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$plugin = [System.IO.Path]::GetFullPath((Join-Path $repo 'plugins/fable5-codex'))
$destination = [System.IO.Path]::GetFullPath($OutputZip)
if (-not [System.IO.Path]::IsPathRooted($OutputZip) -or (Test-Path -LiteralPath $destination)) { throw 'Use a new absolute ZIP output path.' }
if ($destination.StartsWith($plugin + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP output must be outside the plugin.' }
$manifest = Get-Content -LiteralPath (Join-Path $plugin '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($manifest.name -ne 'fable5-codex' -or -not $manifest.requires_local_executor -or $manifest.interface.shortDescription.Length -gt 30) { throw 'Invalid local-plugin submission metadata.' }
$inventory = @{}
$total = 0L
foreach ($entry in Get-ChildItem -LiteralPath $plugin -Force -Recurse) {
  if ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Links/reparse points are not distributable.' }
  $relative = [System.IO.Path]::GetRelativePath($plugin, $entry.FullName).Replace('\', '/')
  if ($relative -match '(^|/)(\.git|node_modules|auth\.json|credentials|sessions|\.env[^/]*)(/|$)') { throw 'Private/runtime paths must not enter the ZIP.' }
  if (-not $entry.PSIsContainer) {
    $total += $entry.Length
    if ($total -gt 80MB -or $inventory.Count -ge 1024) { throw 'Submission source exceeds bounded package limits.' }
    $inventory[$relative] = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
  }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($plugin, $destination, [System.IO.Compression.CompressionLevel]::Optimal, $false)
$archive = [System.IO.Compression.ZipFile]::OpenRead($destination)
try {
  $entries = @($archive.Entries | Where-Object { $_.Name })
  if ($entries.Count -ne $inventory.Count) { throw 'ZIP inventory count mismatch.' }
  foreach ($entry in $entries) {
    if (-not $inventory.ContainsKey($entry.FullName)) { throw 'ZIP contains an unexpected entry.' }
    $stream = $entry.Open()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $actual = [System.Convert]::ToHexString($sha.ComputeHash($stream)) } finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -ne $inventory[$entry.FullName]) { throw 'ZIP bytes differ from inspected source.' }
  }
} finally { $archive.Dispose() }
if ((Get-Item -LiteralPath $destination).Length -gt 100MB) { throw 'Compressed ZIP exceeds submission size limit.' }
[ordered]@{ version = $manifest.version; fileCount = $inventory.Count; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant(); uploaded = $false; approved = $false; published = $false } | ConvertTo-Json
