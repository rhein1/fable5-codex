param(
  [string]$Model = "gpt-5.6-sol",
  [string]$ReasoningEffort = "ultra",
  [int]$TimeoutSeconds = 600,
  [string]$CodexExecutable = "codex",
  [string]$ResultsRoot = "",
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

$repo = Split-Path -Parent $PSScriptRoot
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
$assetsDir = Join-Path $repo "assets/benchmarks"
if ([string]::IsNullOrWhiteSpace($RenderSummaryPath)) {
  $runDir = Join-Path $ResultsRoot $timestamp
  $workRoot = Join-Path $repo "tmp/benchmarks/$timestamp"
  if ([string]::IsNullOrWhiteSpace($ResumeRunId)) {
    New-Item -ItemType Directory -Force -Path $runDir, $assetsDir, $workRoot | Out-Null
    Copy-Item -LiteralPath (Join-Path $repo "evals") -Destination (Join-Path $workRoot "evals") -Recurse
    Copy-Item -LiteralPath (Join-Path $repo "examples") -Destination (Join-Path $workRoot "examples") -Recurse
  } else {
    if (-not (Test-Path -LiteralPath $runDir) -or -not (Test-Path -LiteralPath $workRoot)) {
      throw "Cannot resume run without both result and work directories: $ResumeRunId"
    }
    New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
  }
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

if ($CaseId.Count -gt 0) {
  $unknownCases = $CaseId | Where-Object { $_ -notin $cases.Id }
  if ($unknownCases.Count -gt 0) {
    throw "Unknown benchmark case(s): $($unknownCases -join ', ')"
  }
  $cases = @($cases | Where-Object { $_.Id -in $CaseId })
}

function ConvertTo-SafeName([string]$value) {
  return ($value -replace "[^A-Za-z0-9._-]", "-").Trim("-")
}

function ConvertTo-PublicBenchmarkLinks([string]$outputPath) {
  $text = Get-Content -LiteralPath $outputPath -Raw
  $repoUri = ($repo -replace '\\', '/').TrimEnd('/')
  $workUri = ($workRoot -replace '\\', '/').TrimEnd('/')
  $outputDir = Split-Path -Parent $outputPath
  $rewritten = [regex]::Replace($text, '\((/?[A-Za-z]:/[^)\r\n]+)\)', {
    param($match)

    $target = $match.Groups[1].Value.TrimStart('/')
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
    $relativeLink = [System.IO.Path]::GetRelativePath($outputDir, $canonicalPath) -replace '\\', '/'
    $anchor = if ($line) { "#L$line" } else { "" }
    return "($relativeLink$anchor)"
  })

  if ($rewritten -ne $text) {
    $rewritten | Set-Content -LiteralPath $outputPath -Encoding UTF8 -NoNewline
  }
}

function Invoke-BenchmarkCase($case, [string]$mode, [string]$prompt) {
  $safe = ConvertTo-SafeName "$($case.Id)-$mode"
  $outFile = Join-Path $runDir "$safe.md"
  $logFile = Join-Path $runDir "$safe.log"
  if ($SkipRuns -and (Test-Path -LiteralPath $outFile)) {
    return [pscustomobject]@{ OutputPath = $outFile; LogPath = $logFile; Seconds = 0; ExitCode = 0 }
  }

  $args = @(
    "exec",
    "--model", $Model,
    "-c", "model_reasoning_effort=`"$ReasoningEffort`"",
    "--cd", $workRoot,
    "--skip-git-repo-check",
    "--dangerously-bypass-approvals-and-sandbox",
    "--ephemeral",
    "--color", "never",
    "--output-last-message", $outFile
  )
  if ($mode -eq "baseline") {
    $args += "--ignore-user-config"
  }

  $codexCommand = (Get-Command $CodexExecutable).Source
  $argsJson = $args | ConvertTo-Json -Compress
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $job = Start-Job -ScriptBlock {
    param([string]$Command, [string]$ArgsJson, [string]$Prompt)
    $CodexArgs = [string[]](ConvertFrom-Json -InputObject $ArgsJson)
    $output = & $Command @CodexArgs $Prompt 2>&1
    [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output = ($output | Out-String)
    }
  } -ArgumentList $codexCommand, $argsJson, $prompt

  if (-not (Wait-Job -Job $job -Timeout $TimeoutSeconds)) {
    Stop-Job -Job $job
    $exitCode = 124
    @(
      "TIMEOUT after $TimeoutSeconds seconds",
      "Command: codex $($args -join ' ')",
      "Mode: $mode",
      "Case: $($case.Id)"
    ) | Set-Content -LiteralPath $logFile -Encoding UTF8
  } else {
    $result = Receive-Job -Job $job
    $exitCode = [int]$result.ExitCode
    $result.Output | Set-Content -LiteralPath $logFile -Encoding UTF8
  }
  Remove-Job -Job $job -Force
  $timer.Stop()
  if ($exitCode -ne 0) {
    Write-Warning "codex exec failed for $($case.Id) / $mode with exit code $exitCode"
  }
  if (-not (Test-Path -LiteralPath $outFile)) {
    "" | Set-Content -LiteralPath $outFile -Encoding UTF8
  }
  ConvertTo-PublicBenchmarkLinks $outFile

  return [pscustomobject]@{
    OutputPath = $outFile
    LogPath = $logFile
    Seconds = [Math]::Round($timer.Elapsed.TotalSeconds, 1)
    ExitCode = $exitCode
  }
}

function Test-PatternSet([string]$text, $patterns) {
  foreach ($pattern in $patterns) {
    if ($text -notmatch "(?is)$pattern") {
      return $false
    }
  }
  return $true
}

function Score-Output($case, [string]$mode, $runInfo) {
  $raw = Get-Content -LiteralPath $runInfo.OutputPath -Raw
  $lower = $raw.ToLowerInvariant()

  $hits = @()
  foreach ($expected in $case.Expected) {
    if (Test-PatternSet $lower $expected.Patterns) {
      $hits += $expected.Label
    }
  }

  $evidenceHits = @()
  foreach ($marker in $case.Evidence) {
    if ($lower.Contains($marker.ToLowerInvariant())) {
      $evidenceHits += $marker
    }
  }

  $expectedCount = [Math]::Max(1, $case.Expected.Count)
  $evidenceCount = [Math]::Max(1, $case.Evidence.Count)
  $recall = 100.0 * $hits.Count / $expectedCount
  $evidence = 100.0 * $evidenceHits.Count / $evidenceCount
  $unknowns = if ($lower -match "(unknown|coverage|gap|not inspected|not tested|cannot confirm|unverified|missing evidence)") { 100.0 } else { 0.0 }
  $structure = if ($lower -match "(finding|severity|claim|evidence|recommend|fix|status|supported|unsupported)") { 100.0 } else { 0.0 }
  $composite = (0.60 * $recall) + (0.20 * $evidence) + (0.10 * $unknowns) + (0.10 * $structure)

  return [pscustomobject]@{
    run_id = $timestamp
    case_id = $case.Id
    fixture = $case.Fixture
    mode = $mode
    model = $Model
    reasoning_effort = $ReasoningEffort
    subagents_allowed = [bool]$AllowSubagents
    exit_code = $runInfo.ExitCode
    seconds = $runInfo.Seconds
    expected_count = $case.Expected.Count
    expected_hits = $hits.Count
    expected_hit_labels = ($hits -join "; ")
    evidence_count = $case.Evidence.Count
    evidence_hits = $evidenceHits.Count
    evidence_hit_labels = ($evidenceHits -join "; ")
    recall_pct = [Math]::Round($recall, 1)
    evidence_pct = [Math]::Round($evidence, 1)
    unknowns_pct = [Math]::Round($unknowns, 1)
    structure_pct = [Math]::Round($structure, 1)
    composite_pct = [Math]::Round($composite, 1)
    output_path = [System.IO.Path]::GetRelativePath($repo, $runInfo.OutputPath)
  }
}

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Fill-RoundedRect($g, [System.Drawing.Brush]$brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-RoundedRect $x $y $w $h $r
  try { $g.FillPath($brush, $p) } finally { $p.Dispose() }
}

function Draw-ChartShell($g, [string]$title, [string]$subtitle) {
  $bg = [System.Drawing.ColorTranslator]::FromHtml("#0c1222")
  $g.Clear($bg)
  $titleFont = New-Object System.Drawing.Font("Segoe UI", 44, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $subFont = New-Object System.Drawing.Font("Segoe UI", 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#F8FAFC"))
  $muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94A3B8"))
  try {
    $g.DrawString($title, $titleFont, $white, 72, 52)
    $g.DrawString($subtitle, $subFont, $muted, 76, 112)
  } finally {
    $titleFont.Dispose(); $subFont.Dispose(); $white.Dispose(); $muted.Dispose()
  }
}

function Draw-Legend($g, [float]$x, [float]$y) {
  $font = New-Object System.Drawing.Font("Segoe UI", 20, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E2E8F0"))
  $base = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#64748B"))
  $plugin = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E8613A"))
  try {
    $g.FillRectangle($base, $x, $y + 6, 22, 16)
    $g.DrawString("Normal $Model", $font, $white, $x + 32, $y)
    $g.FillRectangle($plugin, $x + 210, $y + 6, 22, 16)
    $g.DrawString("$Model + Fable-5", $font, $white, $x + 242, $y)
  } finally {
    $font.Dispose(); $white.Dispose(); $base.Dispose(); $plugin.Dispose()
  }
}

function Render-CaseChart($rows, [string]$path) {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap(1600, 900, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    Draw-ChartShell $g "Fable-5 benchmark snapshot" "Composite score by fixture. Same Codex model, baseline plugins disabled vs Fable skill invoked."
    Draw-Legend $g 1030 72
    $axisPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 255, 255), 1)
    $gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 232, 97, 58), 1)
    $labelFont = New-Object System.Drawing.Font("Segoe UI", 19, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $valueFont = New-Object System.Drawing.Font("Consolas", 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E2E8F0"))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94A3B8"))
    $baselineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#64748B"))
    $pluginBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E8613A"))
    try {
      $left = 120; $top = 190; $width = 1320; $height = 560
      for ($i = 0; $i -le 5; $i++) {
        $y = $top + $height - ($height * $i / 5)
        $g.DrawLine($gridPen, $left, $y, $left + $width, $y)
        $g.DrawString(([string]($i * 20)), $labelFont, $muted, 70, $y - 13)
      }
      $g.DrawLine($axisPen, $left, $top, $left, $top + $height)
      $g.DrawLine($axisPen, $left, $top + $height, $left + $width, $top + $height)

      $caseIds = @($rows | Select-Object -ExpandProperty case_id -Unique)
      $groupWidth = $width / $caseIds.Count
      for ($i = 0; $i -lt $caseIds.Count; $i++) {
        $caseId = $caseIds[$i]
        $baseRow = $rows | Where-Object { $_.case_id -eq $caseId -and $_.mode -eq "baseline" } | Select-Object -First 1
        $pluginRow = $rows | Where-Object { $_.case_id -eq $caseId -and $_.mode -eq "plugin" } | Select-Object -First 1
        $x0 = $left + ($groupWidth * $i) + 98
        $barW = 86
        foreach ($pair in @(@($baseRow, $baselineBrush, 0), @($pluginRow, $pluginBrush, 112))) {
          $row = $pair[0]
          if (-not $row) { continue }
          $score = [double]$row.composite_pct
          $barH = $height * $score / 100.0
          $x = $x0 + [float]$pair[2]
          $y = $top + $height - $barH
          Fill-RoundedRect $g $pair[1] $x $y $barW $barH 8
          $label = "{0:n0}" -f $score
          $g.DrawString($label, $valueFont, $white, $x + 23, $y - 30)
        }
        $g.DrawString($caseId, $labelFont, $white, $left + ($groupWidth * $i) + 48, $top + $height + 28)
      }

      $avgBase = ($rows | Where-Object { $_.mode -eq "baseline" } | Measure-Object -Property composite_pct -Average).Average
      $avgPlugin = ($rows | Where-Object { $_.mode -eq "plugin" } | Measure-Object -Property composite_pct -Average).Average
      $delta = $avgPlugin - $avgBase
      $noteFont = New-Object System.Drawing.Font("Segoe UI", 25, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      try {
        $deltaText = if ($delta -ge 0) { "+{0:n1}" -f $delta } else { "{0:n1}" -f $delta }
        $note = "Average composite: {0:n1} -> {1:n1}  ({2} pts)" -f $avgBase, $avgPlugin, $deltaText
        $g.DrawString($note, $noteFont, $white, 120, 812)
      } finally { $noteFont.Dispose() }
    } finally {
      $axisPen.Dispose(); $gridPen.Dispose(); $labelFont.Dispose(); $valueFont.Dispose()
      $white.Dispose(); $muted.Dispose(); $baselineBrush.Dispose(); $pluginBrush.Dispose()
    }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
}

function Render-MetricChart($rows, [string]$path) {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap(1600, 900, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    Draw-ChartShell $g "Where the plugin changes the output" "Average rubric subscores across all fixtures."
    Draw-Legend $g 1030 72
    $metrics = @(
      @{ Label = "Expected issue recall"; Field = "recall_pct" },
      @{ Label = "Evidence markers"; Field = "evidence_pct" },
      @{ Label = "Unknowns noted"; Field = "unknowns_pct" },
      @{ Label = "Structured report"; Field = "structure_pct" },
      @{ Label = "Composite"; Field = "composite_pct" }
    )
    $labelFont = New-Object System.Drawing.Font("Segoe UI", 23, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $valueFont = New-Object System.Drawing.Font("Consolas", 21, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E2E8F0"))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94A3B8"))
    $baselineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#64748B"))
    $pluginBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E8613A"))
    $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 255, 255, 255))
    try {
      $xLabel = 100; $xBar = 500; $barMax = 820; $y = 218
      foreach ($metric in $metrics) {
        $baseAvg = ($rows | Where-Object { $_.mode -eq "baseline" } | Measure-Object -Property $metric.Field -Average).Average
        $pluginAvg = ($rows | Where-Object { $_.mode -eq "plugin" } | Measure-Object -Property $metric.Field -Average).Average
        $g.DrawString($metric.Label, $labelFont, $white, $xLabel, $y - 4)
        Fill-RoundedRect $g $trackBrush $xBar $y $barMax 20 10
        Fill-RoundedRect $g $baselineBrush $xBar $y ($barMax * $baseAvg / 100.0) 20 10
        Fill-RoundedRect $g $trackBrush $xBar ($y + 36) $barMax 20 10
        Fill-RoundedRect $g $pluginBrush $xBar ($y + 36) ($barMax * $pluginAvg / 100.0) 20 10
        $g.DrawString(("{0:n0}" -f $baseAvg), $valueFont, $muted, $xBar + $barMax + 22, $y - 4)
        $g.DrawString(("{0:n0}" -f $pluginAvg), $valueFont, $white, $xBar + $barMax + 22, $y + 32)
        $y += 116
      }
    } finally {
      $labelFont.Dispose(); $valueFont.Dispose(); $white.Dispose(); $muted.Dispose()
      $baselineBrush.Dispose(); $pluginBrush.Dispose(); $trackBrush.Dispose()
    }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose(); $bmp.Dispose()
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
    exit_code = [int]$row.exit_code
    seconds = [double]$row.seconds
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
  }
}

function Render-LatencyChart($rows, [string]$path) {
  Add-Type -AssemblyName System.Drawing
  $bmp = New-Object System.Drawing.Bitmap(1600, 900, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    Draw-ChartShell $g "Quality gain has a latency cost" "Wall time by fixture. Same Sol Ultra config; toy fixtures explicitly disable subagents."
    Draw-Legend $g 1030 72
    $caseIds = @($rows | Select-Object -ExpandProperty case_id -Unique)
    $series = @()
    foreach ($caseId in $caseIds) {
      $baseSeconds = [double](($rows | Where-Object { $_.case_id -eq $caseId -and $_.mode -eq "baseline" } | Select-Object -First 1).seconds)
      $pluginSeconds = [double](($rows | Where-Object { $_.case_id -eq $caseId -and $_.mode -eq "plugin" } | Select-Object -First 1).seconds)
      $series += [pscustomobject]@{ Label = $caseId; Baseline = $baseSeconds; Plugin = $pluginSeconds }
    }
    $series += [pscustomobject]@{
      Label = "Average"
      Baseline = [double](($rows | Where-Object { $_.mode -eq "baseline" } | Measure-Object -Property seconds -Average).Average)
      Plugin = [double](($rows | Where-Object { $_.mode -eq "plugin" } | Measure-Object -Property seconds -Average).Average)
    }
    $maxObserved = ($series | ForEach-Object { [Math]::Max($_.Baseline, $_.Plugin) } | Measure-Object -Maximum).Maximum
    $scaleMax = [Math]::Max(60.0, [Math]::Ceiling(($maxObserved * 1.1) / 60.0) * 60.0)
    $labelFont = New-Object System.Drawing.Font("Segoe UI", 21, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $valueFont = New-Object System.Drawing.Font("Consolas", 20, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E2E8F0"))
    $muted = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#94A3B8"))
    $baselineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#64748B"))
    $pluginBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml("#E8613A"))
    $trackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 255, 255, 255))
    try {
      $xLabel = 90; $xBar = 500; $barMax = 820; $y = 220
      foreach ($item in $series) {
        $g.DrawString($item.Label, $labelFont, $white, $xLabel, $y + 10)
        Fill-RoundedRect $g $trackBrush $xBar $y $barMax 20 10
        Fill-RoundedRect $g $baselineBrush $xBar $y ($barMax * $item.Baseline / $scaleMax) 20 10
        Fill-RoundedRect $g $trackBrush $xBar ($y + 38) $barMax 20 10
        Fill-RoundedRect $g $pluginBrush $xBar ($y + 38) ($barMax * $item.Plugin / $scaleMax) 20 10
        $g.DrawString(("{0:n1}s" -f $item.Baseline), $valueFont, $muted, $xBar + $barMax + 22, $y - 4)
        $g.DrawString(("{0:n1}s" -f $item.Plugin), $valueFont, $white, $xBar + $barMax + 22, $y + 34)
        $y += 132
      }
      $g.DrawString(("Scale: 0-{0:n0} seconds" -f $scaleMax), $labelFont, $muted, $xBar, 790)
    } finally {
      $labelFont.Dispose(); $valueFont.Dispose(); $white.Dispose(); $muted.Dispose()
      $baselineBrush.Dispose(); $pluginBrush.Dispose(); $trackBrush.Dispose()
    }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose(); $bmp.Dispose()
  }
}

function Render-BenchmarkCharts($rows) {
  $runIds = @($rows | Select-Object -ExpandProperty run_id -Unique)
  if ($runIds.Count -ne 1 -or $runIds[0] -notmatch '^\d{8}T\d{6}Z$') {
    throw "Benchmark charts require exactly one valid run id"
  }

  $runId = $runIds[0]
  $charts = @(
    @{ Name = "summary"; Render = ${function:Render-CaseChart} },
    @{ Name = "metrics"; Render = ${function:Render-MetricChart} },
    @{ Name = "latency"; Render = ${function:Render-LatencyChart} }
  )
  foreach ($chart in $charts) {
    $stablePath = Join-Path $assetsDir "fable5-benchmark-$($chart.Name).png"
    & $chart.Render $rows $stablePath
    Copy-Item -LiteralPath $stablePath -Destination (Join-Path $assetsDir "fable5-benchmark-$($chart.Name)-$runId.png") -Force
  }
}

if (-not [string]::IsNullOrWhiteSpace($RenderSummaryPath)) {
  $rows = @(Import-Csv -LiteralPath $renderSummaryResolved | ForEach-Object { ConvertFrom-BenchmarkCsvRow $_ })
  Render-BenchmarkCharts $rows
  Write-Host "Rendered benchmark charts from: $renderSummaryResolved"
  return
}

$summaryCsv = Join-Path $runDir "summary.csv"
$summaryJson = Join-Path $runDir "summary.json"
$rows = if (-not [string]::IsNullOrWhiteSpace($ResumeRunId) -and (Test-Path -LiteralPath $summaryCsv)) {
  @(Import-Csv -LiteralPath $summaryCsv | ForEach-Object { ConvertFrom-BenchmarkCsvRow $_ })
} else {
  @()
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

$latestCsv = Join-Path $ResultsRoot "latest-summary.csv"
$latestJson = Join-Path $ResultsRoot "latest-summary.json"
$latestRun = Join-Path $ResultsRoot "latest-run.txt"

$rows | Export-Csv -LiteralPath $summaryCsv -NoTypeInformation -Encoding UTF8
$rows | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $summaryJson -Encoding UTF8
$rows | Export-Csv -LiteralPath $latestCsv -NoTypeInformation -Encoding UTF8
$rows | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $latestJson -Encoding UTF8
[System.IO.Path]::GetRelativePath($repo, $runDir) | Set-Content -LiteralPath $latestRun -Encoding UTF8

Render-BenchmarkCharts $rows

Write-Host "Benchmark complete."
Write-Host "Run dir: $runDir"
Write-Host "Summary: $summaryCsv"
Write-Host "Charts: $assetsDir"
