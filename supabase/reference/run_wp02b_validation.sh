#!/usr/bin/env bash
# WP-02B validation harness — LOCAL ONLY
#
# DO NOT use plain `supabase db reset` or `supabase start` with migrations
# visible on a clean volume: the CLI auto-applies migrations and fails at
# 20251002135826 without the legacy baseline.
#
# Use the Windows runner (recommended on this project):
#   powershell -ExecutionPolicy Bypass -File supabase/reference/run_wp02b_validation.ps1
#
# Bash equivalent (manual): temporarily move supabase/migrations aside, then:
#   supabase stop --no-backup
#   mv supabase/migrations supabase/.local_validation_migrations_stash
#   supabase start
#   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/legacy_public_baseline_local.sql
#   mv supabase/.local_validation_migrations_stash supabase/migrations
#   supabase migration up --local
#   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp02b_validation_harness.sql
#
# This script is intentionally NOT auto-runnable until a bash runner with
# try/finally restore is added.

set -euo pipefail

echo "Use run_wp02b_validation.ps1 on Windows, or follow the manual steps above." >&2
exit 1
