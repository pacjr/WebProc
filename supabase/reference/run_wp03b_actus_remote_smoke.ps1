# WP-03 Step 2B-Foundation — remote Actus mutation boundary smoke runner
#
# Runs wp03b_actus_mutation_boundary_harness.sql against the linked Supabase project
# in one database session/transaction (ROLLBACK at end).
#
# Execution backends (first available):
#   1) host psql in PATH
#   2) Docker postgres:17-alpine psql (no host PostgreSQL install required)
#
# Usage:
#   $env:SUPABASE_DB_PASSWORD = '<database-password>'
#   powershell -NoProfile -ExecutionPolicy Bypass -File supabase/reference/run_wp03b_actus_remote_smoke.ps1
#
# Optional env overrides:
#   WP03B_SMOKE_PROJECT_REF (default: cxrnptygbzqzobtdxpwo)
#   WP03B_SMOKE_DB_URL      (password-free postgresql:// URL; password from env only)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root

$ProjectRef = if ($env:WP03B_SMOKE_PROJECT_REF) { $env:WP03B_SMOKE_PROJECT_REF } else { "cxrnptygbzqzobtdxpwo" }
$Harness = Join-Path $Root "supabase/reference/wp03b_actus_mutation_boundary_harness.sql"

function Resolve-PsqlPath {
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if ($psql) { return $psql.Source }
  return $null
}

function Resolve-DockerPath {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker) { return $docker.Source }
  return $null
}

function Resolve-RemoteDbConnection {
  $password = $env:SUPABASE_DB_PASSWORD
  if (-not $password) {
    $password = $env:PGPASSWORD
  }
  if (-not $password) {
    throw "Set SUPABASE_DB_PASSWORD (preferred) or PGPASSWORD. Password is never read from files or printed by this runner."
  }

  $url = $env:WP03B_SMOKE_DB_URL
  if (-not $url) {
    $poolerFile = Join-Path $Root "supabase/.temp/pooler-url"
    if (-not (Test-Path $poolerFile)) {
      throw "Missing pooler URL file: $poolerFile. Run supabase link first or set WP03B_SMOKE_DB_URL."
    }
    $url = (Get-Content -Raw $poolerFile).Trim()
  }

  try {
    $urlBuilder = [UriBuilder]$url
  }
  catch {
    throw "Invalid WP03B_SMOKE_DB_URL: not a valid URI."
  }

  if ($urlBuilder.Password) {
    throw "WP03B_SMOKE_DB_URL must not embed a password. Provide SUPABASE_DB_PASSWORD separately."
  }

  if ($url -notmatch '^postgresql://postgres\.[^@]+@') {
    throw "Unexpected pooler URL format. Expected postgres.<project-ref>@... from supabase/.temp/pooler-url."
  }

  return @{
    Url = $url
    Password = $password
  }
}

function Invoke-HarnessWithHostPsql {
  param(
    [string]$PsqlPath,
    [string]$HarnessPath,
    [string]$Url,
    [string]$Password
  )

  $previousPgPassword = $env:PGPASSWORD
  try {
    $env:PGPASSWORD = $Password

    Write-Host "==> Executing harness via host psql (single session; transaction rolls back)"
    & $PsqlPath $Url "-v" "ON_ERROR_STOP=1" "-f" $HarnessPath 2>&1 |
      ForEach-Object { Write-Host $_ }

    return [int]$LASTEXITCODE
  }
  finally {
    if ($null -eq $previousPgPassword) {
      Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    }
    else {
      $env:PGPASSWORD = $previousPgPassword
    }
  }
}

function Invoke-HarnessWithDockerPsql {
  param(
    [string]$DockerPath,
    [string]$HarnessPath,
    [string]$Url,
    [string]$Password
  )

  Write-Host "==> Executing harness via Docker postgres:17-alpine psql (single session; transaction rolls back)"
  Write-Host "    Host psql not found; using existing Docker without installing PostgreSQL locally."

  $mountSource = (Resolve-Path $HarnessPath).Path
  if ($mountSource -match '^[A-Za-z]:') {
    $mountSource = '/' + ($mountSource -replace '\\', '/' -replace ':', '')
  }

  & $DockerPath run --rm `
    -e "PGPASSWORD=$Password" `
    -v "${mountSource}:/work/harness.sql:ro" `
    postgres:17-alpine `
    psql $Url -v ON_ERROR_STOP=1 -f /work/harness.sql 2>&1 |
    ForEach-Object { Write-Host $_ }

  return [int]$LASTEXITCODE
}

Write-Host "WP03B Actus remote mutation boundary smoke"
Write-Host "Project ref: $ProjectRef"
Write-Host "Harness:     $Harness"

if (-not (Test-Path $Harness)) {
  throw "Harness not found: $Harness"
}

$conn = Resolve-RemoteDbConnection
$psqlPath = Resolve-PsqlPath
$dockerPath = Resolve-DockerPath

if (-not $psqlPath -and -not $dockerPath) {
  throw "No execution backend available. Install Docker Desktop or add psql to PATH."
}

Write-Host ""
$exitCode = 0
if ($psqlPath) {
  $exitCode = Invoke-HarnessWithHostPsql -PsqlPath $psqlPath -HarnessPath $Harness -Url $conn.Url -Password $conn.Password
}
else {
  $exitCode = Invoke-HarnessWithDockerPsql -DockerPath $dockerPath -HarnessPath $Harness -Url $conn.Url -Password $conn.Password
}

if ($exitCode -ne 0) {
  throw "Remote smoke harness failed with exit code $exitCode"
}

Write-Host ""
Write-Host "Remote smoke completed successfully (transaction rolled back)."
