param(
  [string]$Model = "gpt-5.6-sol",
  [string]$ReasoningEffort = "ultra",
  [int]$TimeoutSeconds = 600,
  [string]$CodexExecutable = "codex",
  [string]$NodeExecutable = "node",
  [string]$ResultsRoot = "",
  [string]$AssetsRoot = "",
  [string]$RuntimeRoot = "",
  [string]$AuthFile = "",
  [string[]]$CaseId = @(),
  [switch]$AllowSubagents,
  [string]$ResumeRunId = "",
  [switch]$BaselineOnly,
  [switch]$PluginOnly,
  [string]$RenderSummaryPath = "",
  [switch]$SkipRuns
)

$ErrorActionPreference = "Stop"
if ($BaselineOnly -and $PluginOnly) {
  throw "BaselineOnly and PluginOnly cannot be used together"
}
if ($TimeoutSeconds -le 0) {
  throw "TimeoutSeconds must be greater than zero"
}
if ($SkipRuns) {
  throw "SkipRuns was removed because it could treat stale output as a successful run. Use ResumeRunId with BaselineOnly or PluginOnly instead."
}
if ([string]::IsNullOrWhiteSpace($RenderSummaryPath) -and [string]::IsNullOrWhiteSpace($AuthFile)) {
  throw "AuthFile is required for benchmark execution. Use a dedicated benchmark Codex login instead of the primary user auth file."
}

$repo = Split-Path -Parent $PSScriptRoot
$pluginSource = Join-Path $repo "plugins/fable5-codex"
$pluginManifestPath = Join-Path $pluginSource ".codex-plugin/plugin.json"
$scoreModule = Join-Path $PSScriptRoot "benchmark-score.mjs"
$scoreScript = Join-Path $PSScriptRoot "benchmark-score-cli.mjs"
$chartScript = Join-Path $PSScriptRoot "render-benchmark-charts.mjs"
$benchmarkWorker = Join-Path $PSScriptRoot "invoke-codex-benchmark.ps1"
if ([string]::IsNullOrWhiteSpace($ResultsRoot)) {
  $ResultsRoot = Join-Path $repo "benchmarks/results"
}

if (-not [string]::IsNullOrWhiteSpace($ResumeRunId) -and $ResumeRunId -notmatch '^\d{8}T\d{6}Z$') {
  throw "ResumeRunId must use yyyyMMddTHHmmssZ format"
}
$timestamp = if ([string]::IsNullOrWhiteSpace($ResumeRunId)) {
  (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
} else {
  $ResumeRunId
}
$assetsDir = if ([string]::IsNullOrWhiteSpace($AssetsRoot)) {
  Join-Path $repo "assets/benchmarks"
} else {
  [System.IO.Path]::GetFullPath($AssetsRoot)
}
if ([string]::IsNullOrWhiteSpace($RenderSummaryPath)) {
  $runDir = Join-Path $ResultsRoot $timestamp
  if ([string]::IsNullOrWhiteSpace($ResumeRunId)) {
    if (Test-Path -LiteralPath $runDir) {
      throw "Benchmark result directory already exists: $runDir"
    }
  } elseif (-not (Test-Path -LiteralPath $runDir)) {
    throw "Cannot resume missing result directory: $ResumeRunId"
  }

  $runtimeBase = if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
    Join-Path ([System.IO.Path]::GetTempPath()) "fable5-codex-benchmarks"
  } else {
    $RuntimeRoot
  }
  $runtimeInstanceId = "$timestamp-$([guid]::NewGuid().ToString('N'))"
  $runtimeDir = Join-Path $runtimeBase $runtimeInstanceId
  $workRoot = Join-Path $runtimeDir "workspace"
  $baselineHome = Join-Path $runtimeDir "codex-home-baseline"
  $pluginHome = Join-Path $runtimeDir "codex-home-plugin"
  $marketplaceRoot = Join-Path $runtimeDir "marketplace"
  $controlDir = Join-Path $runtimeDir "control"
} else {
  $renderSummaryResolved = (Resolve-Path -LiteralPath $RenderSummaryPath).Path
  $runDir = Split-Path -Parent $renderSummaryResolved
  $workRoot = $repo
  New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
}

$delegationPrompt = if ($AllowSubagents) {
  "Parallel subagents are allowed when useful. Record actual subagent use honestly."
} else {
  "This benchmark fixture is intentionally small. Do not use or spawn subagents; complete the task in the parent agent."
}

$cases = @(
  [pscustomobject]@{
    Id = "fact-check-status"
    Skill = "fable-fact-check"
    Fixture = "evals/fact-check-fixture"
    BaselinePrompt = @"
You are normal Codex using model $Model with no Fable-5 plugin. Fact-check evals/fact-check-fixture/STATUS.md against evals/fact-check-fixture/src/paymentAttempts.js and evals/fact-check-fixture/tests/paymentAttempts.test.js.
Report supported and unsupported claims with evidence. Do not edit files.
$delegationPrompt
"@
    PluginPrompt = @"
Use `$fable-fact-check. Doc: evals/fact-check-fixture/STATUS.md. Check every claim against evals/fact-check-fixture/src/paymentAttempts.js and evals/fact-check-fixture/tests/paymentAttempts.test.js. Include supported claims, unsupported claims, evidence paths, rejected candidates, coverage notes, and unknowns. Do not edit files.
$delegationPrompt
"@
    Expected = @(
      @{ Label = "complete claim is unsupported"; Patterns = @("complete", "unsupported|false|not supported|no evidence|missing") },
      @{ Label = "idempotent retries unsupported"; Patterns = @("idempot|retry", "unsupported|false|not supported|no evidence|missing|does not") },
      @{ Label = "status validation absent"; Patterns = @("status", "validat", "missing|absent|does not|no evidence|unsupported") },
      @{ Label = "duplicate retry test absent"; Patterns = @("duplicate", "test", "missing|absent|no evidence|unsupported") },
      @{ Label = "createPaymentAttempt claim supported"; Patterns = @("createpaymentattempt", "supported|true|exposes|export") }
    )
    Evidence = @("STATUS.md", "src/paymentAttempts.js", "tests/paymentAttempts.test.js", "createPaymentAttempt")
  },
  [pscustomobject]@{
    Id = "audit-payment-attempts"
    Skill = "fable-audit"
    Fixture = "evals/audit-fixture"
    BaselinePrompt = @"
You are normal Codex using model $Model with no Fable-5 plugin. Audit evals/audit-fixture for correctness and test risks. Focus on payment retry safety, duplicate attempt handling, and status validation. Do not edit files.
$delegationPrompt
"@
    PluginPrompt = @"
Use `$fable-audit. Scope: evals/audit-fixture. Focus: payment retry safety, duplicate attempt handling, status validation, test coverage, and source-backed proof. Include findings first, severity, evidence paths, rejected candidates, coverage gaps, and unknowns. Do not edit files.
$delegationPrompt
"@
    Expected = @(
      @{ Label = "duplicate/idempotency missing"; Patterns = @("duplicate|idempot|paymentkey|retry", "missing|absent|does not|not|unsafe|creates") },
      @{ Label = "status validation missing"; Patterns = @("status", "validat", "missing|absent|does not|not") },
      @{ Label = "module-level mutable store risk"; Patterns = @("attempts|module|global|state|mutable", "risk|leak|persist|shared|test") },
      @{ Label = "tests miss duplicate/status cases"; Patterns = @("test|coverage", "duplicate|status|missing|does not|only") }
    )
    Evidence = @("README.md", "src/paymentAttempts.js", "tests/paymentAttempts.test.js", "createPaymentAttempt", "listPaymentAttempts")
  },
  [pscustomobject]@{
    Id = "understand-toy-repo"
    Skill = "fable-understand"
    Fixture = "examples/toy-buggy-repo"
    BaselinePrompt = @"
You are normal Codex using model $Model with no Fable-5 plugin. Explain how examples/toy-buggy-repo stores payment attempts, how retries are supposed to work, and what the tests actually cover. Do not edit files.
$delegationPrompt
"@
    PluginPrompt = @"
Use `$fable-understand. Scope: examples/toy-buggy-repo. Question: explain how payment attempts are stored, how retries are supposed to work, whether the implementation matches the docs, and what the tests actually cover. Include file citations, coverage notes, rejected candidates, and unknowns. Do not edit files.
$delegationPrompt
"@
    Expected = @(
      @{ Label = "entrypoint identified"; Patterns = @("createpaymentattempt") },
      @{ Label = "serialized type identified"; Patterns = @("foopaymentattempt") },
      @{ Label = "retry/idempotency mismatch identified"; Patterns = @("retry|idempot", "missing|does not|not|mismatch|duplicate|new attempt") },
      @{ Label = "allPaymentAttempts behavior identified"; Patterns = @("allpaymentattempts|slice") },
      @{ Label = "tests only cover creation"; Patterns = @("testcreatesattempt|test", "only|creation|single|does not|missing") }
    )
    Evidence = @("README.md", "docs/api.md", "src/paymentAttempts.js", "tests/paymentAttempts.test.js", "createPaymentAttempt")
  }
)

$allCases = @($cases)
$allCaseIds = @($allCases.Id)
if ($CaseId.Count -gt 0) {
  $unknownCases = $CaseId | Where-Object { $_ -notin $cases.Id }
  if ($unknownCases.Count -gt 0) {
    throw "Unknown benchmark case(s): $($unknownCases -join ', ')"
  }
  $cases = @($cases | Where-Object { $_.Id -in $CaseId })
}

function Get-RelativePath([string]$basePath, [string]$targetPath) {
  $method = [System.IO.Path].GetMethod("GetRelativePath", [type[]]@([string], [string]))
  if ($method) {
    return [System.IO.Path]::GetRelativePath($basePath, $targetPath)
  }

  $baseFull = [System.IO.Path]::GetFullPath($basePath).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  $targetFull = [System.IO.Path]::GetFullPath($targetPath)
  $relativeUri = ([uri]$baseFull).MakeRelativeUri([uri]$targetFull)
  return [uri]::UnescapeDataString($relativeUri.ToString()) -replace '/', [System.IO.Path]::DirectorySeparatorChar
}

function Set-Utf8NoBom([string]$path, [string]$content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $encoding)
}

function Get-FileDigest([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Get-StringDigest([string]$value) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($value)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-DirectoryDigest([string]$path) {
  $entries = @(
    Get-ChildItem -LiteralPath $path -File -Recurse |
      Sort-Object FullName |
      ForEach-Object {
        $relative = Get-RelativePath $path $_.FullName
        $relative = $relative -replace '\\', '/'
        $hash = Get-FileDigest $_.FullName
        "$relative`t$hash"
      }
  )
  return Get-StringDigest ($entries -join "`n")
}

function Assert-NoReparseAncestors([string]$path, [string]$label) {
  $candidate = [System.IO.Path]::GetFullPath($path)
  while (-not (Test-Path -LiteralPath $candidate)) {
    $parent = Split-Path -Parent $candidate
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $candidate) {
      throw "Unable to resolve an existing ancestor for ${label}: $path"
    }
    $candidate = $parent
  }

  $item = Get-Item -LiteralPath $candidate -Force
  while ($null -ne $item) {
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "${label} must not contain a symbolic link or reparse point: $($item.FullName)"
    }
    $item = $item.Parent
  }
}

function Assert-RuntimePath([string]$path) {
  $baseWithoutSeparator = [System.IO.Path]::GetFullPath($runtimeBase).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $baseFull = $baseWithoutSeparator + [System.IO.Path]::DirectorySeparatorChar
  $pathFull = [System.IO.Path]::GetFullPath($path)
  $comparison = if ($env:OS -eq "Windows_NT") {
    [System.StringComparison]::OrdinalIgnoreCase
  } else {
    [System.StringComparison]::Ordinal
  }
  if (-not $pathFull.StartsWith($baseFull, $comparison)) {
    throw "Refusing benchmark runtime path outside configured root: $pathFull"
  }
  $expectedLeaf = '^' + [regex]::Escape($timestamp) + '-[a-f0-9]{32}$'
  if ((Split-Path -Leaf $pathFull) -notmatch $expectedLeaf) {
    throw "Refusing unexpected benchmark runtime directory: $pathFull"
  }
  $repoFull = [System.IO.Path]::GetFullPath($repo).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $repoPrefix = $repoFull + [System.IO.Path]::DirectorySeparatorChar
  if (
    [string]::Equals($baseWithoutSeparator, $repoFull, $comparison) -or
    $baseWithoutSeparator.StartsWith($repoPrefix, $comparison)
  ) {
    throw "Benchmark runtime root must be outside the repository: $baseWithoutSeparator"
  }
  Assert-NoReparseAncestors $baseWithoutSeparator "Benchmark runtime root"
  Assert-NoReparseAncestors $pathFull "Benchmark runtime directory"
  return $pathFull
}

function Protect-BenchmarkRuntime([string]$path) {
  if ($env:OS -eq "Windows_NT") {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $aclOutput = & (Join-Path $env:SystemRoot "System32/icacls.exe") $path /inheritance:r /grant:r "${identity}:(OI)(CI)F" /Q 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to restrict benchmark runtime permissions: $($aclOutput | Out-String)"
    }
  } else {
    & chmod 700 $path
    if ($LASTEXITCODE -ne 0) { throw "Failed to restrict benchmark runtime permissions" }
  }
}

function Initialize-BenchmarkRuntime {
  Assert-NoReparseAncestors $runtimeBase "Benchmark runtime root"
  New-Item -ItemType Directory -Force -Path $runtimeBase | Out-Null
  $runtimeFull = Assert-RuntimePath $runtimeDir
  if (Test-Path -LiteralPath $runtimeFull) {
    throw "Refusing to reuse an existing benchmark runtime directory: $runtimeFull"
  }

  New-Item -ItemType Directory -Path $runtimeFull | Out-Null
  Assert-NoReparseAncestors $runtimeFull "Benchmark runtime directory"
  Protect-BenchmarkRuntime $runtimeFull

  $marketplaceMetadataDir = Join-Path $marketplaceRoot ".agents/plugins"
  $marketplacePluginsDir = Join-Path $marketplaceRoot "plugins"
  New-Item -ItemType Directory -Force -Path @(
    $runDir,
    $assetsDir,
    $workRoot,
    $controlDir,
    $baselineHome,
    $pluginHome,
    $marketplaceMetadataDir,
    $marketplacePluginsDir
  ) | Out-Null

  Copy-Item -LiteralPath (Join-Path $repo "evals") -Destination (Join-Path $workRoot "evals") -Recurse
  Copy-Item -LiteralPath (Join-Path $repo "examples") -Destination (Join-Path $workRoot "examples") -Recurse
  Copy-Item -LiteralPath (Join-Path $repo ".agents/plugins/marketplace.json") -Destination (Join-Path $marketplaceMetadataDir "marketplace.json")
  Copy-Item -LiteralPath $pluginSource -Destination (Join-Path $marketplacePluginsDir "fable5-codex") -Recurse
}

function Install-IsolatedPlugin([string]$command) {
  $previousHome = $env:CODEX_HOME
  $setupLog = Join-Path $runDir "plugin-setup.log"
  try {
    $env:CODEX_HOME = $pluginHome
    $marketplaceOutput = & $command plugin marketplace add $marketplaceRoot --json 2>&1
    $marketplaceExit = $LASTEXITCODE
    $pluginOutput = if ($marketplaceExit -eq 0) {
      & $command plugin add fable5-codex@fable5-local --json 2>&1
    } else {
      @()
    }
    $pluginExit = if ($marketplaceExit -eq 0) { $LASTEXITCODE } else { $marketplaceExit }
    $setupText = (@($marketplaceOutput; $pluginOutput) | Out-String) -replace [regex]::Escape($runtimeDir), "<runtime>"
    $setupText | Set-Content -LiteralPath $setupLog -Encoding UTF8
    if ($marketplaceExit -ne 0) {
      throw "Failed to add the isolated Fable-5 marketplace; see $setupLog"
    }
    if ($pluginExit -ne 0) {
      throw "Failed to install Fable-5 in the isolated plugin home; see $setupLog"
    }

    $installed = (& $command plugin list --json 2>$null | ConvertFrom-Json).installed |
      Where-Object { $_.pluginId -eq "fable5-codex@fable5-local" -and $_.enabled }
    if (-not $installed) {
      throw "Isolated plugin verification failed; see $setupLog"
    }
  } finally {
    $env:CODEX_HOME = $previousHome
  }
}

function Copy-IsolatedAuth {
  $sourceAuth = $AuthFile
  if (-not (Test-Path -LiteralPath $sourceAuth -PathType Leaf)) {
    throw "Codex auth.json was not found. Run 'codex login' before starting an isolated benchmark."
  }

  foreach ($isolatedHome in @($baselineHome, $pluginHome)) {
    [void](Assert-RuntimePath $runtimeDir)
    Assert-NoReparseAncestors $isolatedHome "Isolated Codex home"
    $target = Join-Path $isolatedHome "auth.json"
    Copy-Item -LiteralPath $sourceAuth -Destination $target -Force
    if ($PSVersionTable.PSEdition -eq "Core" -and -not $IsWindows) {
      & chmod 600 $target
      if ($LASTEXITCODE -ne 0) { throw "Failed to restrict permissions on isolated auth material" }
    }
  }
}

function Remove-IsolatedAuth {
  foreach ($isolatedHome in @($baselineHome, $pluginHome)) {
    $target = Join-Path $isolatedHome "auth.json"
    if (Test-Path -LiteralPath $target -PathType Leaf) {
      Remove-Item -LiteralPath $target -Force
    }
    if (Test-Path -LiteralPath $target) {
      throw "Failed to remove isolated benchmark auth material: $target"
    }
  }
}

function Remove-BenchmarkRuntime {
  if ([string]::IsNullOrWhiteSpace($runtimeDir)) { return }
  $runtimeFull = Assert-RuntimePath $runtimeDir
  if (Test-Path -LiteralPath $runtimeFull) {
    Remove-Item -LiteralPath $runtimeFull -Recurse -Force
  }
}

function ConvertTo-SafeName([string]$value) {
  return ($value -replace "[^A-Za-z0-9._-]", "-").Trim("-")
}

function Write-RunEvent([string]$eventName) {
  $event = "{0}`t{1}" -f (Get-Date).ToUniversalTime().ToString("o"), $eventName
  Add-Content -LiteralPath (Join-Path $runDir "events.log") -Value $event -Encoding UTF8
}

function ConvertTo-PublicBenchmarkLinks([string]$outputPath) {
  $text = Get-Content -LiteralPath $outputPath -Raw
  $repoUri = ($repo -replace '\\', '/').TrimEnd('/')
  $workUri = ($workRoot -replace '\\', '/').TrimEnd('/')
  $outputDir = Split-Path -Parent $outputPath
  $rewritten = [regex]::Replace($text, '\(((?:file://)?(?:/?[A-Za-z]:[\\/]|/)[^)\r\n]+)\)', {
    param($match)

    $target = [uri]::UnescapeDataString($match.Groups[1].Value)
    $target = ($target -replace '^file://', '') -replace '\\', '/'
    if ($target -match '^/[A-Za-z]:/') {
      $target = $target.Substring(1)
    }
    $line = $null
    if ($target -match '^(.*):(\d+)$') {
      $target = $Matches[1]
      $line = $Matches[2]
    }

    $repoRelative = if ($target.StartsWith("$workUri/", [System.StringComparison]::OrdinalIgnoreCase)) {
      $target.Substring($workUri.Length + 1)
    } elseif ($target.StartsWith("$repoUri/", [System.StringComparison]::OrdinalIgnoreCase)) {
      $target.Substring($repoUri.Length + 1)
    } else {
      return $match.Value
    }

    $canonicalPath = Join-Path $repo ($repoRelative -replace '/', [System.IO.Path]::DirectorySeparatorChar)
    $relativeLink = Get-RelativePath $outputDir $canonicalPath
    $relativeLink = $relativeLink -replace '\\', '/'
    $anchor = if ($line) { "#L$line" } else { "" }
    return "($relativeLink$anchor)"
  })

  foreach ($rootPath in @($workRoot, $repo)) {
    $forwardRoot = ($rootPath -replace '\\', '/').TrimEnd('/')
    $backwardRoot = ($rootPath -replace '/', '\\').TrimEnd('\\')
    $encodedRoot = $forwardRoot.Replace(" ", "%20")
    foreach ($variant in @($forwardRoot, $backwardRoot, $encodedRoot) | Select-Object -Unique) {
      if ([string]::IsNullOrWhiteSpace($variant)) { continue }
      $rewritten = [regex]::Replace(
        $rewritten,
        [regex]::Escape($variant),
        ".",
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
      )
    }
  }
  $rewritten = $rewritten -replace 'file:///?\./', './'

  if ($rewritten -ne $text) {
    Set-Utf8NoBom $outputPath $rewritten
  }
}

function ConvertTo-ProcessArgument([string]$value) {
  if ($null -eq $value) { return '""' }
  $escaped = $value.Replace('"', '\"')
  return '"' + $escaped + '"'
}

function Get-BenchmarkPowerShellHost {
  foreach ($name in @("pwsh.exe", "powershell.exe", "pwsh", "powershell")) {
    $candidate = Join-Path $PSHOME $name
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }
  throw "Unable to locate a PowerShell host for the benchmark worker"
}

function Set-BenchmarkProcessEnvironment($startInfo) {
  $allowedNames = @(
    "PATH",
    "SystemRoot",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "HOME",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "LANG",
    "LC_ALL",
    "TZ",
    "TERM",
    "COLORTERM",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "all_proxy",
    "FABLE5_FAKE_LOG",
    "FABLE5_FAKE_EXEC_EXIT",
    "FABLE5_FAKE_DELAY_MS"
  )
  $values = @{}
  foreach ($name in $allowedNames) {
    $value = [System.Environment]::GetEnvironmentVariable($name)
    if ($null -ne $value) { $values[$name] = $value }
  }
  $startInfo.EnvironmentVariables.Clear()
  foreach ($entry in $values.GetEnumerator()) {
    $startInfo.EnvironmentVariables[$entry.Key] = [string]$entry.Value
  }
}

function Stop-BenchmarkProcessTree($process) {
  if ($process.HasExited) { return $true }
  $terminationRequested = $false
  $killTree = $process.GetType().GetMethod("Kill", [type[]]@([bool]))
  if ($killTree) {
    try {
      $killTree.Invoke($process, @($true)) | Out-Null
      $terminationRequested = $true
    } catch {
      $terminationRequested = $false
    }
  }
  if (-not $terminationRequested -and -not $process.HasExited) {
    if ($env:OS -eq "Windows_NT") {
      & (Join-Path $env:SystemRoot "System32/taskkill.exe") /PID $process.Id /T /F 2>$null | Out-Null
      $terminationRequested = $LASTEXITCODE -eq 0
    } else {
      try {
        $process.Kill()
        $terminationRequested = $true
      } catch {
        $terminationRequested = $false
      }
    }
  }
  if ($process.WaitForExit(5000)) { return $true }
  try {
    $process.Kill()
  } catch {
    return $false
  }
  return $process.WaitForExit(2000)
}

function Publish-StagedFiles($items, [string]$backupRoot) {
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $records = @()
  for ($index = 0; $index -lt $items.Count; $index++) {
    $item = $items[$index]
    $existed = Test-Path -LiteralPath $item.Destination -PathType Leaf
    $backup = Join-Path $backupRoot "$index.bak"
    if ($existed) {
      Copy-Item -LiteralPath $item.Destination -Destination $backup -Force
    }
    $records += [pscustomobject]@{
      Destination = $item.Destination
      Backup = $backup
      Existed = $existed
    }
  }

  try {
    foreach ($item in $items) {
      Copy-Item -LiteralPath $item.Source -Destination $item.Destination -Force
    }
  } catch {
    foreach ($record in $records) {
      try {
        if ($record.Existed) {
          Copy-Item -LiteralPath $record.Backup -Destination $record.Destination -Force
        } elseif (Test-Path -LiteralPath $record.Destination) {
          Remove-Item -LiteralPath $record.Destination -Force
        }
      } catch {
        Write-Warning "Failed to roll back published benchmark artifact: $($record.Destination)"
      }
    }
    throw
  }
}

function Invoke-WithPublicationLock([scriptblock]$action) {
  New-Item -ItemType Directory -Force -Path $ResultsRoot | Out-Null
  $lockPath = Join-Path $ResultsRoot ".latest-publish.lock"
  $lockStream = $null
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  while ($null -eq $lockStream) {
    try {
      $lockStream = [System.IO.File]::Open(
        $lockPath,
        [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
      )
    } catch [System.IO.IOException] {
      if ([DateTime]::UtcNow -ge $deadline) {
        throw "Timed out waiting for the benchmark latest-publication lock"
      }
      Start-Sleep -Milliseconds 100
    }
  }

  try {
    & $action
  } finally {
    try {
      $lockStream.Dispose()
    } catch {
      Write-Warning "Failed to release the benchmark latest-publication lock cleanly"
    }
  }
}

function Invoke-BenchmarkCase($case, [string]$mode, [string]$prompt) {
  $safe = ConvertTo-SafeName "$($case.Id)-$mode"
  $outFile = Join-Path $runDir "$safe.md"
  $logFile = Join-Path $runDir "$safe.log"
  foreach ($stalePath in @($outFile, $logFile)) {
    if (Test-Path -LiteralPath $stalePath) {
      Remove-Item -LiteralPath $stalePath -Force
    }
  }

  $args = @(
    "--ask-for-approval", "never",
    "-c", "shell_environment_policy.inherit=none",
    "exec",
    "--model", $Model,
    "-c", "model_reasoning_effort=`"$ReasoningEffort`"",
    "--cd", $workRoot,
    "--skip-git-repo-check",
    "--sandbox", "read-only",
    "--ignore-rules",
    "--ephemeral",
    "--color", "never",
    "--output-last-message", $outFile
  )

  $codexHome = if ($mode -eq "baseline") { $baselineHome } else { $pluginHome }
  $requestFile = Join-Path $controlDir "$safe-request.json"
  $promptFile = Join-Path $controlDir "$safe-prompt.txt"
  $prompt | Set-Content -LiteralPath $promptFile -Encoding UTF8 -NoNewline
  [ordered]@{
    command = $codexCommand
    arguments = $args
    codex_home = $codexHome
    prompt_path = $promptFile
    log_path = $logFile
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $requestFile -Encoding UTF8

  $workerArguments = @("-NoProfile", "-NonInteractive")
  if ($env:OS -eq "Windows_NT") {
    $workerArguments += @("-ExecutionPolicy", "Bypass")
  }
  $workerArguments += @("-File", $benchmarkWorker, "-RequestPath", $requestFile)
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = Get-BenchmarkPowerShellHost
  $startInfo.Arguments = (($workerArguments | ForEach-Object { ConvertTo-ProcessArgument $_ }) -join " ")
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  Set-BenchmarkProcessEnvironment $startInfo

  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) {
      throw "Failed to start benchmark worker"
    }
    $completed = $process.WaitForExit($TimeoutSeconds * 1000)
    if (-not $completed) {
      if (-not (Stop-BenchmarkProcessTree $process)) {
        throw "Benchmark worker did not terminate within the bounded grace period after timeout"
      }
      $exitCode = 124
    } else {
      $exitCode = [int]$process.ExitCode
    }
  } finally {
    $process.Dispose()
  }
  Write-RunEvent "case_process_complete case=$($case.Id) mode=$mode exit_code=$exitCode"
  if ($exitCode -eq 124) {
    @(
      "TIMEOUT after $TimeoutSeconds seconds",
      "Command: codex $($args -join ' ')",
      "Mode: $mode",
      "Case: $($case.Id)"
    ) | Set-Content -LiteralPath $logFile -Encoding UTF8
  }
  $timer.Stop()
  if ($exitCode -ne 0) {
    Write-Warning "codex exec failed for $($case.Id) / $mode with exit code $exitCode"
  }
  if (-not (Test-Path -LiteralPath $outFile -PathType Leaf)) {
    "" | Set-Content -LiteralPath $outFile -Encoding UTF8
  }
  if ($exitCode -eq 0) {
    ConvertTo-PublicBenchmarkLinks $outFile
  }
  Write-RunEvent "case_artifacts_complete case=$($case.Id) mode=$mode"

  return [pscustomobject]@{
    OutputPath = $outFile
    LogPath = $logFile
    Seconds = [Math]::Round($timer.Elapsed.TotalSeconds, 1)
    ExitCode = $exitCode
  }
}

function Score-Output($case, [string]$mode, $runInfo) {
  Write-RunEvent "score_start case=$($case.Id) mode=$mode"
  $raw = if (Test-Path -LiteralPath $runInfo.OutputPath -PathType Leaf) {
    [System.IO.File]::ReadAllText($runInfo.OutputPath)
  } else {
    ""
  }
  Write-RunEvent "score_output_read case=$($case.Id) mode=$mode"
  $request = @{
    exitCode = [int]$runInfo.ExitCode
    text = $raw
    expected = @($case.Expected)
    evidence = @($case.Evidence)
  } | ConvertTo-Json -Depth 5 -Compress
  Write-RunEvent "score_request_serialized case=$($case.Id) mode=$mode"
  $scoreJson = $request | & $nodeCommand $scoreScript
  if ($LASTEXITCODE -ne 0) {
    throw "Benchmark scorer failed for $($case.Id) / $mode"
  }
  Write-RunEvent "score_process_complete case=$($case.Id) mode=$mode"
  $score = $scoreJson | ConvertFrom-Json
  $hits = @($score.expectedHits)
  $evidenceHits = @($score.evidenceHits)

  return [pscustomobject]@{
    run_id = $timestamp
    case_id = $case.Id
    fixture = $case.Fixture
    mode = $mode
    model = $Model
    reasoning_effort = $ReasoningEffort
    subagents_allowed = [bool]$AllowSubagents
    status = [string]$score.status
    exit_code = $runInfo.ExitCode
    seconds = $runInfo.Seconds
    codex_cli_version = $codexCliVersion
    node_version = $nodeVersion
    plugin_version = if ($mode -eq "plugin") { $pluginVersion } else { "" }
    plugin_digest_sha256 = if ($mode -eq "plugin") { $pluginDigest } else { "" }
    config_isolation = "isolated_codex_home"
    sandbox_mode = "read-only"
    approval_policy = "never"
    expected_count = $case.Expected.Count
    expected_hits = $hits.Count
    expected_hit_labels = ($hits -join "; ")
    evidence_count = $case.Evidence.Count
    evidence_hits = $evidenceHits.Count
    evidence_hit_labels = ($evidenceHits -join "; ")
    recall_pct = [Math]::Round([double]$score.recallPct, 1)
    evidence_pct = [Math]::Round([double]$score.evidencePct, 1)
    unknowns_pct = [Math]::Round([double]$score.unknownsPct, 1)
    structure_pct = [Math]::Round([double]$score.structurePct, 1)
    composite_pct = [Math]::Round([double]$score.compositePct, 1)
    output_path = (Get-RelativePath $repo $runInfo.OutputPath) -replace '\\', '/'
    output_digest_sha256 = Get-FileDigest $runInfo.OutputPath
  }
}

function ConvertFrom-BenchmarkCsvRow($row) {
  return [pscustomobject]@{
    run_id = [string]$row.run_id
    case_id = [string]$row.case_id
    fixture = [string]$row.fixture
    mode = [string]$row.mode
    model = [string]$row.model
    reasoning_effort = [string]$row.reasoning_effort
    subagents_allowed = [System.Convert]::ToBoolean($row.subagents_allowed)
    status = if ([string]::IsNullOrWhiteSpace([string]$row.status)) {
      if ([int]$row.exit_code -eq 0) { "passed" } else { "failed" }
    } else {
      [string]$row.status
    }
    exit_code = [int]$row.exit_code
    seconds = [double]$row.seconds
    codex_cli_version = [string]$row.codex_cli_version
    node_version = [string]$row.node_version
    plugin_version = [string]$row.plugin_version
    plugin_digest_sha256 = [string]$row.plugin_digest_sha256
    config_isolation = [string]$row.config_isolation
    sandbox_mode = [string]$row.sandbox_mode
    approval_policy = [string]$row.approval_policy
    expected_count = [int]$row.expected_count
    expected_hits = [int]$row.expected_hits
    expected_hit_labels = [string]$row.expected_hit_labels
    evidence_count = [int]$row.evidence_count
    evidence_hits = [int]$row.evidence_hits
    evidence_hit_labels = [string]$row.evidence_hit_labels
    recall_pct = [double]$row.recall_pct
    evidence_pct = [double]$row.evidence_pct
    unknowns_pct = [double]$row.unknowns_pct
    structure_pct = [double]$row.structure_pct
    composite_pct = [double]$row.composite_pct
    output_path = [string]$row.output_path
    output_digest_sha256 = [string]$row.output_digest_sha256
  }
}

function Render-BenchmarkCharts(
  $rows,
  $additionalPublishItems = @(),
  [scriptblock]$beforePublish = $null
) {
  $runIds = @($rows | Select-Object -ExpandProperty run_id -Unique)
  if ($runIds.Count -ne 1 -or $runIds[0] -notmatch '^\d{8}T\d{6}Z$') {
    throw "Benchmark charts require exactly one valid run id"
  }
  $models = @($rows | Select-Object -ExpandProperty model -Unique)
  $reasoningEfforts = @($rows | Select-Object -ExpandProperty reasoning_effort -Unique)
  $subagentModes = @($rows | Select-Object -ExpandProperty subagents_allowed -Unique)
  if (
    $models.Count -ne 1 -or
    [string]::IsNullOrWhiteSpace([string]$models[0]) -or
    $reasoningEfforts.Count -ne 1 -or
    [string]::IsNullOrWhiteSpace([string]$reasoningEfforts[0]) -or
    $subagentModes.Count -ne 1
  ) {
    throw "Benchmark charts require one matched model, reasoning effort, and subagent policy"
  }
  $chartModel = [string]$models[0]
  if ($rows.Count -ne ($allCaseIds.Count * 2)) {
    throw "Benchmark charts require exactly one baseline and plugin row for every case"
  }
  $failedRows = @($rows | Where-Object { $_.exit_code -ne 0 -or $_.status -ne "passed" })
  if ($failedRows.Count -gt 0) {
    throw "Benchmark charts cannot be rendered from failed executions"
  }
  foreach ($row in $rows) {
    if (
      $row.config_isolation -ne "isolated_codex_home" -or
      $row.sandbox_mode -ne "read-only" -or
      $row.approval_policy -ne "never" -or
      [string]::IsNullOrWhiteSpace([string]$row.codex_cli_version) -or
      [string]::IsNullOrWhiteSpace([string]$row.node_version)
    ) {
      throw "Benchmark charts require alpha.3 isolated execution metadata"
    }
    if ($row.mode -eq "baseline" -and (
      -not [string]::IsNullOrWhiteSpace([string]$row.plugin_version) -or
      -not [string]::IsNullOrWhiteSpace([string]$row.plugin_digest_sha256)
    )) {
      throw "Baseline benchmark rows cannot contain plugin build metadata"
    }
    if ($row.mode -eq "plugin" -and (
      [string]::IsNullOrWhiteSpace([string]$row.plugin_version) -or
      [string]::IsNullOrWhiteSpace([string]$row.plugin_digest_sha256)
    )) {
      throw "Plugin benchmark rows require version and digest metadata"
    }
  }
  foreach ($requiredCase in $allCaseIds) {
    foreach ($requiredMode in @("baseline", "plugin")) {
      $matches = @($rows | Where-Object { $_.case_id -eq $requiredCase -and $_.mode -eq $requiredMode })
      if ($matches.Count -ne 1) {
        throw "Benchmark charts require one successful $requiredMode row for $requiredCase"
      }
    }
  }

  $runId = $runIds[0]
  $chartNames = @("summary", "metrics", "latency")
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + [System.IO.Path]::DirectorySeparatorChar
  $stageRoot = Join-Path $tempRoot ("fable5-chart-stage-" + [guid]::NewGuid().ToString("N"))
  $stageFull = [System.IO.Path]::GetFullPath($stageRoot)
  if (
    -not $stageFull.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $stageFull) -notmatch '^fable5-chart-stage-[a-f0-9]{32}$'
  ) {
    throw "Refusing unexpected chart staging path: $stageFull"
  }

  New-Item -ItemType Directory -Force -Path $stageFull | Out-Null
  try {
    $chartInput = Join-Path $stageFull "summary.json"
    Set-Utf8NoBom $chartInput ($rows | ConvertTo-Json -Depth 6)
    $chartOutput = & $nodeCommand $chartScript --input $chartInput --output-dir $stageFull --model $chartModel 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "Benchmark chart renderer failed: $($chartOutput | Out-String)"
    }
    $publishItems = @()
    foreach ($chartName in $chartNames) {
      $stagedPath = Join-Path $stageFull "fable5-benchmark-$chartName.png"
      if (-not (Test-Path -LiteralPath $stagedPath -PathType Leaf)) {
        throw "Benchmark chart renderer omitted $chartName"
      }
      $publishItems += [pscustomobject]@{
        Source = $stagedPath
        Destination = Join-Path $assetsDir "fable5-benchmark-$chartName-$runId.png"
      }
      $publishItems += [pscustomobject]@{
        Source = $stagedPath
        Destination = Join-Path $assetsDir "fable5-benchmark-$chartName.png"
      }
    }
    $publishItems += @($additionalPublishItems)
    Invoke-WithPublicationLock {
      if ($null -ne $beforePublish) {
        & $beforePublish
      }
      Publish-StagedFiles $publishItems (Join-Path $stageFull "backups")
    }
  } finally {
    if (Test-Path -LiteralPath $stageFull) {
      try {
        Remove-Item -LiteralPath $stageFull -Recurse -Force
      } catch {
        Write-Warning "Failed to remove benchmark chart staging directory: $stageFull"
      }
    }
  }
}

function Write-RunManifest(
  [string]$status,
  [bool]$publishedLatest,
  [string]$targetPath = "",
  [object[]]$manifestRows = @()
) {
  $invocationSelectedModes = if ($BaselineOnly) {
    @("baseline")
  } elseif ($PluginOnly) {
    @("plugin")
  } else {
    @("baseline", "plugin")
  }
  $completedCases = @($manifestRows | ForEach-Object { $_.case_id } | Sort-Object -Unique)
  $completedModes = @($manifestRows | ForEach-Object { $_.mode } | Sort-Object -Unique)
  $manifestJson = [ordered]@{
    schema_version = 2
    run_id = $timestamp
    status = $status
    published_as_latest = $publishedLatest
    model = $Model
    reasoning_effort = $ReasoningEffort
    timeout_seconds = $TimeoutSeconds
    codex_cli_version = $codexCliVersion
    node_version = $nodeVersion
    plugin_version = $pluginVersion
    plugin_digest_sha256 = $pluginDigest
    fixture_digest_sha256 = $fixtureDigest
    harness_digest_sha256 = $harnessDigest
    summary_digest_sha256 = if (Test-Path -LiteralPath $summaryCsv -PathType Leaf) {
      Get-FileDigest $summaryCsv
    } else {
      ""
    }
    source_commit = $sourceCommit
    source_worktree_dirty = $sourceWorktreeDirty
    resumed = -not [string]::IsNullOrWhiteSpace($ResumeRunId)
    invocation_selected_cases = @($cases.Id)
    invocation_selected_modes = [string[]]$invocationSelectedModes
    completed_cases = [string[]]$completedCases
    completed_modes = [string[]]$completedModes
    completed_row_count = $manifestRows.Count
    subagents_allowed = [bool]$AllowSubagents
    execution = [ordered]@{
      workspace = "ephemeral fixture copy outside the repository"
      config = "separate newly created CODEX_HOME per arm; no user config inherited"
      baseline = "auth only; no marketplace or Fable-5 plugin"
      plugin = "auth plus only fable5-codex@fable5-local from the recorded digest"
      sandbox = "read-only"
      approval_policy = "never"
      user_and_project_rules = "ignored"
      process_environment = "minimal allowlist; secret-shaped caller variables removed"
      model_shell_environment = "shell_environment_policy.inherit=none"
      auth_material = "copied ephemerally, removed before publication, and covered by guarded runtime cleanup"
    }
  } | ConvertTo-Json -Depth 8
  $manifestTarget = if ([string]::IsNullOrWhiteSpace($targetPath)) {
    Join-Path $runDir "run.json"
  } else {
    $targetPath
  }
  Set-Utf8NoBom $manifestTarget $manifestJson
}

if (-not (Test-Path -LiteralPath $chartScript -PathType Leaf)) {
  throw "Missing benchmark chart renderer: $chartScript"
}

$nodeCommand = (Get-Command $NodeExecutable -ErrorAction Stop).Source
$nodeVersionOutput = (& $nodeCommand --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersionOutput -notmatch 'v?(\d+\.\d+\.\d+)') {
  throw "Unable to determine Node version from '$NodeExecutable --version'"
}
$nodeVersion = $Matches[1]
if ([version]$nodeVersion -lt [version]"18.0.0") {
  throw "Benchmark scoring and charting require Node 18 or newer; found $nodeVersion at $nodeCommand"
}

if (-not [string]::IsNullOrWhiteSpace($RenderSummaryPath)) {
  $latestRunPath = Join-Path $ResultsRoot "latest-run.txt"
  if (-not (Test-Path -LiteralPath $latestRunPath -PathType Leaf)) {
    throw "RenderSummaryPath requires an existing latest-run.txt"
  }
  $latestRunRelative = (Get-Content -LiteralPath $latestRunPath -Raw).Trim()
  $latestRunDir = [System.IO.Path]::GetFullPath((Join-Path $repo $latestRunRelative))
  $resultsRootFull = [System.IO.Path]::GetFullPath($ResultsRoot).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $latestRunParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $latestRunDir)).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $pathComparison = if ($env:OS -eq "Windows_NT") {
    [System.StringComparison]::OrdinalIgnoreCase
  } else {
    [System.StringComparison]::Ordinal
  }
  if (-not [string]::Equals($latestRunParent, $resultsRootFull, $pathComparison)) {
    throw "latest-run.txt must resolve to a direct child of ResultsRoot"
  }
  $latestRunId = Split-Path -Leaf $latestRunDir
  $latestManifestPath = Join-Path $latestRunDir "run.json"
  if (-not (Test-Path -LiteralPath $latestManifestPath -PathType Leaf)) {
    throw "RenderSummaryPath cannot regenerate a legacy run without run.json"
  }
  $latestManifest = Get-Content -LiteralPath $latestManifestPath -Raw | ConvertFrom-Json
  if (
    [int]$latestManifest.schema_version -ne 2 -or
    [string]$latestManifest.run_id -ne $latestRunId -or
    [string]$latestManifest.status -ne "complete" -or
    -not [bool]$latestManifest.published_as_latest -or
    [string]$latestManifest.summary_digest_sha256 -cne (Get-FileDigest $renderSummaryResolved)
  ) {
    throw "RenderSummaryPath must be the attested summary for the currently published latest run"
  }
  $rows = @(Import-Csv -LiteralPath $renderSummaryResolved | ForEach-Object { ConvertFrom-BenchmarkCsvRow $_ })
  if (@($rows.run_id | Select-Object -Unique).Count -ne 1 -or $rows[0].run_id -ne $latestRunId) {
    throw "RenderSummaryPath run id does not match latest-run.txt"
  }
  if (
    [string]$latestManifest.model -cne [string]$rows[0].model -or
    [string]$latestManifest.reasoning_effort -cne [string]$rows[0].reasoning_effort -or
    [bool]$latestManifest.subagents_allowed -ne [bool]$rows[0].subagents_allowed
  ) {
    throw "RenderSummaryPath configuration does not match the attested latest run"
  }
  $revalidateLatestBeforePublish = {
    $currentLatestRelative = (Get-Content -LiteralPath $latestRunPath -Raw).Trim()
    $currentLatestDir = [System.IO.Path]::GetFullPath((Join-Path $repo $currentLatestRelative))
    if (-not [string]::Equals($currentLatestDir, $latestRunDir, $pathComparison)) {
      throw "The latest benchmark run changed before chart publication"
    }
    $currentManifest = Get-Content -LiteralPath $latestManifestPath -Raw | ConvertFrom-Json
    if (
      [int]$currentManifest.schema_version -ne 2 -or
      [string]$currentManifest.run_id -ne $latestRunId -or
      [string]$currentManifest.status -ne "complete" -or
      -not [bool]$currentManifest.published_as_latest -or
      [string]$currentManifest.summary_digest_sha256 -cne (Get-FileDigest $renderSummaryResolved) -or
      [string]$currentManifest.model -cne [string]$rows[0].model -or
      [string]$currentManifest.reasoning_effort -cne [string]$rows[0].reasoning_effort -or
      [bool]$currentManifest.subagents_allowed -ne [bool]$rows[0].subagents_allowed
    ) {
      throw "The latest benchmark attestation changed before chart publication"
    }
  }
  Render-BenchmarkCharts $rows @() $revalidateLatestBeforePublish
  Write-Host "Rendered latest benchmark charts from: $renderSummaryResolved"
  return
}

if (-not (Test-Path -LiteralPath $pluginManifestPath -PathType Leaf)) {
  throw "Missing plugin manifest: $pluginManifestPath"
}
if (-not (Test-Path -LiteralPath $scoreScript -PathType Leaf)) {
  throw "Missing benchmark scorer: $scoreScript"
}
if (-not (Test-Path -LiteralPath $scoreModule -PathType Leaf)) {
  throw "Missing benchmark score module: $scoreModule"
}
if (-not (Test-Path -LiteralPath $benchmarkWorker -PathType Leaf)) {
  throw "Missing benchmark worker: $benchmarkWorker"
}

$codexCommand = (Get-Command $CodexExecutable -ErrorAction Stop).Source
$codexVersionOutput = (& $codexCommand --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $codexVersionOutput -notmatch '(\d+\.\d+\.\d+)') {
  throw "Unable to determine Codex CLI version from '$CodexExecutable --version'"
}
$codexCliVersion = $Matches[1]
if ($Model -match '^gpt-5\.6-' -and [version]$codexCliVersion -lt [version]"0.144.0") {
  throw "Model $Model requires Codex CLI 0.144.0 or newer; found $codexCliVersion at $codexCommand"
}

$pluginManifest = Get-Content -LiteralPath $pluginManifestPath -Raw | ConvertFrom-Json
$pluginVersion = [string]$pluginManifest.version
$pluginDigest = Get-DirectoryDigest $pluginSource
$fixtureDigest = Get-StringDigest (@(
  "evals`t$(Get-DirectoryDigest (Join-Path $repo 'evals'))",
  "examples`t$(Get-DirectoryDigest (Join-Path $repo 'examples'))"
) -join "`n")
$harnessDigest = Get-StringDigest (@(
  "run-benchmarks.ps1`t$(Get-FileDigest $MyInvocation.MyCommand.Path)",
  "invoke-codex-benchmark.ps1`t$(Get-FileDigest $benchmarkWorker)",
  "benchmark-score.mjs`t$(Get-FileDigest $scoreModule)",
  "benchmark-score-cli.mjs`t$(Get-FileDigest $scoreScript)",
  "render-benchmark-charts.mjs`t$(Get-FileDigest $chartScript)"
) -join "`n")
$sourceCommit = "unavailable"
$sourceWorktreeDirty = $false
if (Test-Path -LiteralPath (Join-Path $repo ".git")) {
  try {
    $commitOutput = (& git -C $repo rev-parse HEAD 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($commitOutput)) {
      $sourceCommit = $commitOutput
    }
    $statusOutput = (& git -C $repo status --porcelain 2>$null | Out-String)
    if ($LASTEXITCODE -eq 0) {
      $sourceWorktreeDirty = -not [string]::IsNullOrWhiteSpace($statusOutput)
    }
  } catch {
    $sourceCommit = "unavailable"
    $sourceWorktreeDirty = $false
  }
}

$summaryCsv = Join-Path $runDir "summary.csv"
$summaryJson = Join-Path $runDir "summary.json"
$latestCsv = Join-Path $ResultsRoot "latest-summary.csv"
$latestJson = Join-Path $ResultsRoot "latest-summary.json"
$latestRun = Join-Path $ResultsRoot "latest-run.txt"
$runManifestPath = Join-Path $runDir "run.json"

if (-not [string]::IsNullOrWhiteSpace($ResumeRunId)) {
  if (-not (Test-Path -LiteralPath $summaryCsv -PathType Leaf)) {
    throw "Cannot resume without an existing summary.csv: $ResumeRunId"
  }
  if (-not (Test-Path -LiteralPath $runManifestPath -PathType Leaf)) {
    throw "Cannot resume a pre-alpha.3 run without an attested run.json: $ResumeRunId"
  }
  $resumeManifest = Get-Content -LiteralPath $runManifestPath -Raw | ConvertFrom-Json
  if ([int]$resumeManifest.schema_version -ne 2) {
    throw "Unsupported resume manifest schema for $ResumeRunId"
  }
  if ([bool]$resumeManifest.published_as_latest -or [string]$resumeManifest.status -eq "complete") {
    throw "Completed or published benchmark runs cannot be selectively resumed: $ResumeRunId"
  }
  if ([string]$resumeManifest.status -notin @("failed", "partial", "running")) {
    throw "Unsupported resumable benchmark status '$($resumeManifest.status)' for $ResumeRunId"
  }
  $recordedSummaryDigest = [string]$resumeManifest.summary_digest_sha256
  $actualSummaryDigest = Get-FileDigest $summaryCsv
  if (
    [string]::IsNullOrWhiteSpace($recordedSummaryDigest) -or
    $recordedSummaryDigest -cne $actualSummaryDigest
  ) {
    throw "Resume summary digest mismatch for $ResumeRunId"
  }

  $resumeChecks = @(
    @{ Name = "run_id"; Actual = [string]$resumeManifest.run_id; Expected = $timestamp },
    @{ Name = "model"; Actual = [string]$resumeManifest.model; Expected = $Model },
    @{ Name = "reasoning_effort"; Actual = [string]$resumeManifest.reasoning_effort; Expected = $ReasoningEffort },
    @{ Name = "timeout_seconds"; Actual = [string]$resumeManifest.timeout_seconds; Expected = [string]$TimeoutSeconds },
    @{ Name = "codex_cli_version"; Actual = [string]$resumeManifest.codex_cli_version; Expected = $codexCliVersion },
    @{ Name = "node_version"; Actual = [string]$resumeManifest.node_version; Expected = $nodeVersion },
    @{ Name = "plugin_version"; Actual = [string]$resumeManifest.plugin_version; Expected = $pluginVersion },
    @{ Name = "plugin_digest_sha256"; Actual = [string]$resumeManifest.plugin_digest_sha256; Expected = $pluginDigest },
    @{ Name = "fixture_digest_sha256"; Actual = [string]$resumeManifest.fixture_digest_sha256; Expected = $fixtureDigest },
    @{ Name = "harness_digest_sha256"; Actual = [string]$resumeManifest.harness_digest_sha256; Expected = $harnessDigest },
    @{ Name = "subagents_allowed"; Actual = ([bool]$resumeManifest.subagents_allowed).ToString(); Expected = ([bool]$AllowSubagents).ToString() }
  )
  foreach ($check in $resumeChecks) {
    if ($check.Actual -cne $check.Expected) {
      throw "Resume configuration mismatch for $($check.Name): recorded '$($check.Actual)', requested '$($check.Expected)'"
    }
  }
}

$runLockPath = Join-Path $ResultsRoot ".run-$timestamp.lock"
$runLockStream = $null
$runLockAcquired = $false
$publicationCommitted = $false
$rows = @()

try {
  New-Item -ItemType Directory -Force -Path $ResultsRoot | Out-Null
  try {
    $runLockStream = [System.IO.File]::Open(
      $runLockPath,
      [System.IO.FileMode]::OpenOrCreate,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::None
    )
    $runLockAcquired = $true
  } catch [System.IO.IOException] {
    throw "Benchmark run $timestamp is already active"
  }
  if ([string]::IsNullOrWhiteSpace($ResumeRunId) -and (Test-Path -LiteralPath $runDir)) {
    throw "Benchmark result directory already exists: $runDir"
  }

  Initialize-BenchmarkRuntime
  Install-IsolatedPlugin $codexCommand
  Copy-IsolatedAuth
  Write-RunManifest "running" $false

  $rows = if (-not [string]::IsNullOrWhiteSpace($ResumeRunId) -and (Test-Path -LiteralPath $summaryCsv)) {
    @(Import-Csv -LiteralPath $summaryCsv | ForEach-Object { ConvertFrom-BenchmarkCsvRow $_ })
  } else {
    @()
  }
  if (-not [string]::IsNullOrWhiteSpace($ResumeRunId)) {
    $seenRowKeys = @{}
    foreach ($row in $rows) {
      $rowKey = "$($row.case_id):$($row.mode)"
      if ($seenRowKeys.ContainsKey($rowKey)) {
        throw "Duplicate existing summary row during resume: $rowKey"
      }
      $seenRowKeys[$rowKey] = $true
      $caseDefinition = $allCases | Where-Object { $_.Id -eq $row.case_id } | Select-Object -First 1
      if (
        $row.run_id -ne $timestamp -or
        -not $caseDefinition -or
        $row.mode -notin @("baseline", "plugin") -or
        $row.fixture -ne $caseDefinition.Fixture -or
        $row.model -ne $Model -or
        $row.reasoning_effort -ne $ReasoningEffort -or
        $row.subagents_allowed -ne [bool]$AllowSubagents -or
        $row.codex_cli_version -ne $codexCliVersion -or
        $row.node_version -ne $nodeVersion -or
        $row.config_isolation -ne "isolated_codex_home" -or
        $row.sandbox_mode -ne "read-only" -or
        $row.approval_policy -ne "never" -or
        $row.expected_count -ne $caseDefinition.Expected.Count -or
        $row.evidence_count -ne $caseDefinition.Evidence.Count
      ) {
        throw "Existing summary row does not match the attested resume configuration: $($row.case_id) / $($row.mode)"
      }
      if ($row.mode -eq "plugin" -and (
        $row.plugin_version -ne $pluginVersion -or
        $row.plugin_digest_sha256 -ne $pluginDigest
      )) {
        throw "Existing plugin row does not match the attested plugin build: $($row.case_id)"
      }
      if ($row.mode -eq "baseline" -and (
        -not [string]::IsNullOrWhiteSpace($row.plugin_version) -or
        -not [string]::IsNullOrWhiteSpace($row.plugin_digest_sha256)
      )) {
        throw "Existing baseline row unexpectedly contains plugin build metadata: $($row.case_id)"
      }

      $expectedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $runDir "$($row.case_id)-$($row.mode).md"))
      $recordedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $repo $row.output_path))
      $pathComparison = if ($env:OS -eq "Windows_NT") {
        [System.StringComparison]::OrdinalIgnoreCase
      } else {
        [System.StringComparison]::Ordinal
      }
      if (-not [string]::Equals($recordedOutputPath, $expectedOutputPath, $pathComparison)) {
        throw "Existing summary output path mismatch during resume: $rowKey"
      }
      if (-not (Test-Path -LiteralPath $expectedOutputPath -PathType Leaf)) {
        throw "Existing benchmark output is missing during resume: $rowKey"
      }
      $actualOutputDigest = Get-FileDigest $expectedOutputPath
      if (
        [string]::IsNullOrWhiteSpace($row.output_digest_sha256) -or
        $row.output_digest_sha256 -cne $actualOutputDigest
      ) {
        throw "Resume output digest mismatch for $rowKey"
      }
    }
  }
  foreach ($case in $cases) {
    if (-not $PluginOnly) {
      Write-Host "Running $($case.Id) baseline..."
      $baseline = Invoke-BenchmarkCase $case "baseline" $case.BaselinePrompt
      $rows = @($rows | Where-Object { -not ($_.case_id -eq $case.Id -and $_.mode -eq "baseline") })
      $rows += Score-Output $case "baseline" $baseline
    }

    if (-not $BaselineOnly) {
      Write-Host "Running $($case.Id) plugin..."
      $plugin = Invoke-BenchmarkCase $case "plugin" $case.PluginPrompt
      $rows = @($rows | Where-Object { -not ($_.case_id -eq $case.Id -and $_.mode -eq "plugin") })
      $rows += Score-Output $case "plugin" $plugin
    }
  }

  Remove-IsolatedAuth
  Write-RunEvent "auth_material_removed"

  $rows | Export-Csv -LiteralPath $summaryCsv -NoTypeInformation -Encoding UTF8
  Set-Utf8NoBom $summaryJson ($rows | ConvertTo-Json -Depth 6)
  Write-RunManifest "running" $false "" $rows

  $failedRows = @($rows | Where-Object { $_.exit_code -ne 0 -or $_.status -ne "passed" })
  if ($failedRows.Count -gt 0) {
    Write-RunManifest "failed" $false "" $rows
    throw "Benchmark run contains $($failedRows.Count) failed execution(s); latest summaries and charts were not changed"
  }

  $complete = $rows.Count -eq ($allCaseIds.Count * 2)
  foreach ($requiredCase in $allCaseIds) {
    foreach ($requiredMode in @("baseline", "plugin")) {
      if (@($rows | Where-Object { $_.case_id -eq $requiredCase -and $_.mode -eq $requiredMode }).Count -ne 1) {
        $complete = $false
      }
    }
  }

  if ($complete) {
    $latestStage = Join-Path $controlDir "latest-publish"
    New-Item -ItemType Directory -Force -Path $latestStage | Out-Null
    $pendingCsv = Join-Path $latestStage "latest-summary.csv"
    $pendingJson = Join-Path $latestStage "latest-summary.json"
    $pendingRun = Join-Path $latestStage "latest-run.txt"
    $pendingManifest = Join-Path $latestStage "run.json"
    $rows | Export-Csv -LiteralPath $pendingCsv -NoTypeInformation -Encoding UTF8
    Set-Utf8NoBom $pendingJson ($rows | ConvertTo-Json -Depth 6)
    Set-Utf8NoBom $pendingRun (((Get-RelativePath $repo $runDir) -replace '\\', '/') + "`n")
    Write-RunManifest "complete" $true $pendingManifest $rows
    $latestPublishItems = @(
      [pscustomobject]@{ Source = $pendingCsv; Destination = $latestCsv },
      [pscustomobject]@{ Source = $pendingJson; Destination = $latestJson },
      [pscustomobject]@{ Source = $pendingManifest; Destination = $runManifestPath },
      [pscustomobject]@{ Source = $pendingRun; Destination = $latestRun }
    )
    Render-BenchmarkCharts $rows $latestPublishItems
    $publicationCommitted = $true
    Write-Host "Benchmark complete and promoted as latest."
    Write-Host "Charts: $assetsDir"
  } else {
    Write-RunManifest "partial" $false "" $rows
    Write-Host "Benchmark partial run complete; latest summaries and charts were not changed."
  }

  Write-Host "Run dir: $runDir"
  Write-Host "Summary: $summaryCsv"
} catch {
  if ($runLockAcquired -and -not $publicationCommitted -and (Test-Path -LiteralPath $runDir -PathType Container)) {
    Write-RunManifest "failed" $false "" $rows
  } elseif ($publicationCommitted) {
    Write-Warning "An error occurred after the latest benchmark publication committed; preserving the complete manifest"
  }
  throw
} finally {
  if ($runLockAcquired) {
    try {
      Remove-BenchmarkRuntime
    } finally {
      try {
        $runLockStream.Dispose()
      } finally {
        if (Test-Path -LiteralPath $runLockPath -PathType Leaf) {
          try {
            Remove-Item -LiteralPath $runLockPath -Force
          } catch {
            Write-Warning "Failed to remove benchmark run lock: $runLockPath"
          }
        }
      }
    }
  }
}
