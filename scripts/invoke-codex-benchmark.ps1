param(
  [Parameter(Mandatory = $true)]
  [string]$RequestPath
)

$ErrorActionPreference = "Stop"

try {
  $request = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json
  $env:CODEX_HOME = [string]$request.codex_home
  $arguments = [string[]]@($request.arguments)
  $prompt = Get-Content -LiteralPath ([string]$request.prompt_path) -Raw
  $output = $prompt | & ([string]$request.command) @arguments - 2>&1
  $exitCode = $LASTEXITCODE
  ($output | Out-String) | Set-Content -LiteralPath ([string]$request.log_path) -Encoding UTF8
  if ($null -eq $exitCode) {
    $exitCode = if ($?) { 0 } else { 1 }
  }
  exit ([int]$exitCode)
} catch {
  $_ | Out-String | Set-Content -LiteralPath ([string]$request.log_path) -Encoding UTF8
  exit 1
}
