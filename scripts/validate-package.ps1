$ErrorActionPreference = "Stop"

$validator = Join-Path $PSScriptRoot "validate-package.mjs"
& node $validator
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
