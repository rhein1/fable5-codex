param(
  [string]$CanonicalPlugin = "",
  [string]$PersonalPlugin = "$HOME\plugins\fable5-codex"
)

$ErrorActionPreference = "Stop"

function Assert-PhysicalPluginPath([string]$Path) {
  $cursor = [System.IO.Path]::GetFullPath($Path)
  while ($cursor) {
    $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
    if ($item -and ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
      throw "Refusing plugin path with a reparse/link component: $cursor"
    }
    $ancestor = Split-Path -Parent $cursor
    if ($ancestor -eq $cursor) { break }
    $cursor = $ancestor
  }
}

function Test-PluginDescendant([string]$Parent, [string]$Child) {
  $relative = [System.IO.Path]::GetRelativePath($Parent, $Child)
  return $relative -ne '.' -and -not [System.IO.Path]::IsPathRooted($relative) -and -not $relative.StartsWith('..', [System.StringComparison]::Ordinal)
}

function Get-PluginInventory([string]$Root) {
  Assert-PhysicalPluginPath $Root
  Assert-PhysicalPluginPath (Join-Path $Root '.codex-plugin/plugin.json')
  $manifest = Get-Content -LiteralPath (Join-Path $Root '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
  if ($manifest.name -ne 'fable5-codex') { throw "Unexpected plugin manifest: $Root" }
  $pending = [System.Collections.Generic.Stack[string]]::new()
  $pending.Push($Root)
  $inventory = [System.Collections.Generic.List[string]]::new()
  $totalBytes = 0
  while ($pending.Count) {
    $directory = $pending.Pop()
    Assert-PhysicalPluginPath $directory
    foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
      if ($inventory.Count -ge 4096 -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw 'Plugin inventory limit or link encountered.'
      }
      $relative = [System.IO.Path]::GetRelativePath($Root, $item.FullName).Replace('\', '/')
      if ($item.PSIsContainer) {
        $inventory.Add("directory $relative")
        $pending.Push($item.FullName)
      } else {
        $totalBytes += $item.Length
        if ($totalBytes -gt 33554432) { throw 'Plugin inventory too large.' }
        $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
        $inventory.Add("file $relative $hash")
      }
    }
  }
  return ($inventory | Sort-Object -CaseSensitive) -join "`n"
}

function Move-PluginDirectory([string]$Source, [string]$Destination) {
  Assert-PhysicalPluginPath $Source
  Assert-PhysicalPluginPath $Destination
  [System.IO.Directory]::Move($Source, $Destination)
}

function Invoke-PersonalPluginSync([string]$CanonicalPlugin, [string]$PersonalPlugin) {
  if ([string]::IsNullOrWhiteSpace($CanonicalPlugin)) {
    $CanonicalPlugin = Join-Path (Split-Path -Parent $PSScriptRoot) 'plugins/fable5-codex'
  }
  $canonicalResolved = [System.IO.Path]::GetFullPath($CanonicalPlugin).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $personalResolved = [System.IO.Path]::GetFullPath($PersonalPlugin).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
  $expectedPersonalParent = [System.IO.Path]::GetFullPath((Join-Path $HOME 'plugins'))
  if (-not (Test-PluginDescendant $expectedPersonalParent $personalResolved) -or (Split-Path -Leaf $personalResolved) -ne 'fable5-codex') {
    throw "Refusing unexpected personal plugin destination: $personalResolved"
  }
  if ($canonicalResolved -eq $personalResolved -or (Test-PluginDescendant $canonicalResolved $personalResolved) -or (Test-PluginDescendant $personalResolved $canonicalResolved)) {
    throw 'Canonical and personal plugin paths must not overlap.'
  }
  Assert-PhysicalPluginPath $canonicalResolved
  Assert-PhysicalPluginPath $personalResolved
  $sourceInventory = Get-PluginInventory $canonicalResolved
  $existingInventory = if (Test-Path -LiteralPath $personalResolved) { Get-PluginInventory $personalResolved } else { $null }
  $parent = Split-Path -Parent $personalResolved
  Assert-PhysicalPluginPath $parent
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Assert-PhysicalPluginPath $parent
  $stage = Join-Path $parent ("fable5-codex.stage-" + [guid]::NewGuid().ToString('N'))
  $backup = Join-Path $parent ("fable5-codex.backup-" + [guid]::NewGuid().ToString('N'))
  try {
    Copy-Item -LiteralPath $canonicalResolved -Destination $stage -Recurse
    if ((Get-PluginInventory $stage) -cne $sourceInventory -or (Get-PluginInventory $canonicalResolved) -cne $sourceInventory) {
      throw 'Staged plugin or source changed during copy.'
    }
    Assert-PhysicalPluginPath $personalResolved
    Assert-PhysicalPluginPath $backup
    if ($null -ne $existingInventory) {
      if ((Get-PluginInventory $personalResolved) -cne $existingInventory) { throw 'Existing plugin changed during staging.' }
      Move-PluginDirectory $personalResolved $backup
    } elseif (Test-Path -LiteralPath $personalResolved) { throw 'Personal plugin appeared during staging.' }
    Assert-PhysicalPluginPath $stage
    Assert-PhysicalPluginPath $personalResolved
    Move-PluginDirectory $stage $personalResolved
    if ((Get-PluginInventory $personalResolved) -cne $sourceInventory) { throw 'Promoted plugin verification failed.' }
  } catch {
    $failure = $_
    if ((Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $personalResolved)) {
      Assert-PhysicalPluginPath $backup
      Assert-PhysicalPluginPath $personalResolved
      Move-PluginDirectory $backup $personalResolved
      if ((Get-PluginInventory $personalResolved) -cne $existingInventory) { throw "Rollback verification failed; inspect $personalResolved and $backup" }
    }
    throw "Plugin sync failed; inspect target $personalResolved, retained stage $stage and backup $backup. An occupied target is never removed for rollback. $failure"
  }
  Write-Host "Synced canonical plugin: $canonicalResolved -> $personalResolved"
  if ($null -ne $existingInventory) { Write-Host "Recoverable backup retained: $backup" }
}

if ($MyInvocation.InvocationName -ne '.') {
  Invoke-PersonalPluginSync -CanonicalPlugin $CanonicalPlugin -PersonalPlugin $PersonalPlugin
}
