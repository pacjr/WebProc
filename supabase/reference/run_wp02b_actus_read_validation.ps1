# WP-03 Step 2B-Foundation local validation runner (Windows / PowerShell)
#
# LOCAL VALIDATION ONLY — does not apply anything remotely.
#
# Clean-room strategy (same as WP-02B / WP-03):
#   1) stop --no-backup
#   2) hide supabase/migrations during supabase start
#   3) apply legacy_public_baseline_local.sql
#   4) restore migrations + migration up --local (through 20260307290000)
#   5) wp02b_validation_harness.sql
#   6) wp03_validation_harness.sql
#   7) wp02b_actus_read_validation_harness.sql

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$DbUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
$MigrationsDir = Join-Path $Root "supabase/migrations"
$MigrationsStash = Join-Path $Root "supabase/.local_validation_migrations_stash"
$Baseline = Join-Path $Root "supabase/reference/legacy_public_baseline_local.sql"
$HarnessWp02b = Join-Path $Root "supabase/reference/wp02b_validation_harness.sql"
$HarnessWp03 = Join-Path $Root "supabase/reference/wp03_validation_harness.sql"
$HarnessActus = Join-Path $Root "supabase/reference/wp02b_actus_read_validation_harness.sql"

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

function Get-DbContainerName {
  $name = docker ps --format "{{.Names}}" | Select-String "supabase_db" | Select-Object -First 1
  if (-not $name) {
    throw "Supabase DB container not found. Run supabase start first."
  }
  return $name.ToString().Trim()
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
  Write-Host "==> $Label (via docker exec psql)"
  $container = Get-DbContainerName
  $remotePath = "/tmp/" + [IO.Path]::GetFileName($SqlFilePath)
  docker cp $SqlFilePath "${container}:${remotePath}"
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed copying SQL into container"
  }
  docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f $remotePath
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

function Move-MigrationsToStash {
  if (Test-Path $MigrationsStash) {
    throw "Temporary migration stash already exists: $MigrationsStash"
  }

  Write-Phase "Relocate repository migrations"
  Move-Item -Path $MigrationsDir -Destination $MigrationsStash
  $script:MigrationsRelocated = $true
}

function Restore-MigrationsFromStash {
  if (-not $script:MigrationsRelocated) {
    return
  }

  Write-Phase "Restore repository migrations directory"
  Move-Item -Path $MigrationsStash -Destination $MigrationsDir
  $script:MigrationsRelocated = $false
}

Write-Host "WP-03 Step 2B-Foundation LOCAL VALIDATION RUNNER"
Write-Host "Repository root: $Root"

try {
  Write-Phase "Phase 1: Stop local Supabase (no backup)"
  Invoke-External -Label "Stop local Supabase" -FilePath "supabase" -Arguments @("stop", "--no-backup")

  Move-MigrationsToStash

  Write-Phase "Phase 2: Start local Supabase (no repository migrations visible)"
  $projectId = (Get-Content (Join-Path $Root "supabase/.temp/project-ref") -ErrorAction SilentlyContinue)
  if ($projectId) {
    docker rm -f "supabase_vector_$projectId" 2>$null | Out-Null
  }
  Invoke-External -Label "Start local Supabase" -FilePath "supabase" -Arguments @("start")

  Write-Phase "Phase 3: Apply LOCAL-ONLY legacy public baseline"
  Invoke-SqlFile -Label "Apply legacy_public_baseline_local.sql" -SqlFilePath $Baseline

  Restore-MigrationsFromStash

  Write-Phase "Phase 4: Apply repository migrations (through 20260307290000)"
  Invoke-External -Label "Apply repository migrations" -FilePath "supabase" -Arguments @(
    "migration", "up", "--local"
  )

  Write-Phase "Phase 5: Run WP-02B regression harness"
  Invoke-SqlFile -Label "Run wp02b_validation_harness.sql" -SqlFilePath $HarnessWp02b

  Write-Phase "Phase 6: Run WP-03 regression harness"
  Invoke-SqlFile -Label "Run wp03_validation_harness.sql" -SqlFilePath $HarnessWp03

  Write-Phase "Phase 7: Run Step 2B Actus read harness"
  Invoke-SqlFile -Label "Run wp02b_actus_read_validation_harness.sql" -SqlFilePath $HarnessActus

  Write-Host ""
  Write-Host "Step 2B-Foundation local validation completed successfully."
}
catch {
  $script:ExitCode = 1
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
  if ($script:MigrationsRelocated) {
    try {
      if ((Test-Path $MigrationsStash) -and -not (Test-Path $MigrationsDir)) {
        Move-Item -Path $MigrationsStash -Destination $MigrationsDir
        $script:MigrationsRelocated = $false
      }
    }
    catch {
      Write-Host "CRITICAL: failed to restore migrations: $($_.Exception.Message)" -ForegroundColor Red
      $script:ExitCode = 1
    }
  }
}

if ($script:ExitCode -ne 0) {
  exit $script:ExitCode
}
