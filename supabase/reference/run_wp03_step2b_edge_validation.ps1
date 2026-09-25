# WP-03 Step 2B download Edge validation runner
param(
  [switch]$Edge
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
$nodeScript = Join-Path $repoRoot "scratch\wp03_step2b_download_validation.mjs"

if (-not (Test-Path $nodeScript)) {
  Write-Error "Missing validation script: $nodeScript"
  exit 1
}

$args = @($nodeScript)
if ($Edge) { $args += "--edge" }

node @args
exit $LASTEXITCODE
