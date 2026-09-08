# WP-02B local validation runner (Windows / PowerShell)
#
# LOCAL VALIDATION ONLY — does not apply anything remotely.
#
# Problem:
#   `supabase start` on a clean local volume auto-applies repository migrations
#   before any manual baseline can run, failing at 20251002135826.
#
# Strategy:
#   1) stop --no-backup
#   2) temporarily move supabase/migrations out of the CLI search path
#   3) start (empty DB, no repo migrations applied)
#   4) apply legacy_public_baseline_local.sql
#   5) restore supabase/migrations
#   6) migration up --local
#   7) wp02b_validation_harness.sql (BEGIN ... ROLLBACK)
#
# Safety:
#   try/finally always restores supabase/migrations if it was relocated.

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$DbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
$MigrationsDir = Join-Path $Root "supabase/migrations"
$MigrationsStash = Join-Path $Root "supabase/.local_validation_migrations_stash"
$Baseline = Join-Path $Root "supabase/reference/legacy_public_baseline_local.sql"
$Harness = Join-Path $Root "supabase/reference/wp02b_validation_harness.sql"

$script:MigrationsRelocated = $false
$script:ExitCode = 0

function Write-Phase {
  param([string]$Message)
  Write-Host ""
  Write-Host "===== $Message ====="
}

function Invoke-External {
  param(
    [string]$Label,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Host ""
  Write-Host "==> $Label"
  Write-Host "    $FilePath $($Arguments -join ' ')"

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Resolve-PsqlPath {
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if ($psql) {
    return $psql.Source
  }
  return $null
}

function Invoke-SqlFile {
  param(
    [string]$Label,
    [string]$SqlFilePath
  )

  $psqlPath = Resolve-PsqlPath
  if ($psqlPath) {
    Invoke-External -Label $Label -FilePath $psqlPath -Arguments @(
      $DbUrl, "-v", "ON_ERROR_STOP=1", "-f", $SqlFilePath
    )
    return
  }

  Write-Host ""
  Write-Host "==> $Label (via supabase db execute --local)"
  Get-Content -Raw -Path $SqlFilePath | supabase db execute --local
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Move-MigrationsToStash {
  if (Test-Path $MigrationsStash) {
    throw @"
Temporary migration stash already exists:
  $MigrationsStash

A previous validation run may have been interrupted before restore.
Do not delete migration files.
Restore manually, then re-run:
  Move-Item -Path '$MigrationsStash' -Destination '$MigrationsDir'
"@
  }

  if (-not (Test-Path $MigrationsDir)) {
    throw "Expected migrations directory is missing: $MigrationsDir"
  }

  Write-Phase "Phase 2: Relocate repository migrations (hide from supabase start)"
  Write-Host "From: $MigrationsDir"
  Write-Host "To:   $MigrationsStash"
  Move-Item -Path $MigrationsDir -Destination $MigrationsStash
  $script:MigrationsRelocated = $true
}

function Restore-MigrationsFromStash {
  if (-not $script:MigrationsRelocated) {
    return
  }

  Write-Phase "Phase 5: Restore repository migrations directory"
  if (-not (Test-Path $MigrationsStash)) {
    throw "Migration stash missing during restore: $MigrationsStash"
  }
  if (Test-Path $MigrationsDir) {
    throw "Cannot restore migrations; destination already exists: $MigrationsDir"
  }

  Move-Item -Path $MigrationsStash -Destination $MigrationsDir
  $script:MigrationsRelocated = $false
}

function Test-MigrationsDirectoryRestored {
  if (-not (Test-Path $MigrationsDir)) {
    throw "CRITICAL: supabase/migrations was not restored: $MigrationsDir"
  }
  if (Test-Path $MigrationsStash) {
    throw "CRITICAL: migration stash still present after restore: $MigrationsStash"
  }
}

Write-Host "WP-02B LOCAL VALIDATION RUNNER"
Write-Host "Repository root: $Root"

try {
  Write-Phase "Phase 1: Stop local Supabase (no backup)"
  Invoke-External -Label "Stop local Supabase" -FilePath "supabase" -Arguments @("stop", "--no-backup")

  Move-MigrationsToStash

  Write-Phase "Phase 3: Start local Supabase (no repository migrations visible)"
  Invoke-External -Label "Start local Supabase" -FilePath "supabase" -Arguments @("start")

  Write-Phase "Phase 4: Apply LOCAL-ONLY legacy public baseline"
  if (-not (Test-Path $Baseline)) {
    throw "Baseline script not found: $Baseline"
  }
  Invoke-SqlFile -Label "Apply legacy_public_baseline_local.sql" -SqlFilePath $Baseline

  Restore-MigrationsFromStash
  Test-MigrationsDirectoryRestored

  Write-Phase "Phase 6: Apply repository migrations (chronological through 20260307260000)"
  Invoke-External -Label "Apply repository migrations" -FilePath "supabase" -Arguments @(
    "migration", "up", "--local"
  )

  Write-Phase "Phase 7: Run WP-02B validation harness (rolls back test data)"
  if (-not (Test-Path $Harness)) {
    throw "Harness script not found: $Harness"
  }
  Invoke-SqlFile -Label "Run wp02b_validation_harness.sql" -SqlFilePath $Harness

  Write-Host ""
  Write-Host "WP-02B local validation completed successfully."
}
catch {
  $script:ExitCode = 1
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  if ($script:MigrationsRelocated) {
    Write-Host ""
    Write-Host "===== Finally: restore repository migrations directory ====="
    try {
      if ((Test-Path $MigrationsStash) -and -not (Test-Path $MigrationsDir)) {
        Move-Item -Path $MigrationsStash -Destination $MigrationsDir
        $script:MigrationsRelocated = $false
        Write-Host "Restored supabase/migrations from stash."
      }
      elseif ((Test-Path $MigrationsStash) -and (Test-Path $MigrationsDir)) {
        Write-Host "WARNING: both migrations directory and stash exist; manual review required." -ForegroundColor Yellow
        Write-Host "  migrations: $MigrationsDir"
        Write-Host "  stash:      $MigrationsStash"
        $script:ExitCode = 1
      }
    }
    catch {
      Write-Host "CRITICAL: failed to restore migrations in finally block: $($_.Exception.Message)" -ForegroundColor Red
      $script:ExitCode = 1
    }
  }

  try {
    Test-MigrationsDirectoryRestored
    Write-Host "Verified: supabase/migrations is restored."
  }
  catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    $script:ExitCode = 1
  }
}

if ($script:ExitCode -ne 0) {
  exit $script:ExitCode
}
