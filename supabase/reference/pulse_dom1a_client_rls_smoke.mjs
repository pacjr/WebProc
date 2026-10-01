/**
 * PULSE-DOM.1a — authenticated CLIENT pulse_summary RLS smoke (DEV linked project).
 *
 * Usage (password never printed):
 *   $env:ACTUS_CONNECT_DEV_CLIENT_PASSWORD = '<client-password>'
 *   node supabase/reference/pulse_dom1a_client_rls_smoke.mjs
 *
 * Optional: ACTUS_CONNECT_DEV_ACTUS_PASSWORD for ACTUS operador scope check.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "https://cxrnptygbzqzobtdxpwo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4cm5wdHlnYnpxem9idGR4cHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNjMyODQsImV4cCI6MjA3NDczOTI4NH0.NKSBOM7rh4OwABUtzoGEM68Q3DGsCSU4PrKIGoLCUlQ";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function loadLocalCredentials() {
  const path = join(repoRoot, "docs", "dev-seed", "auth-credentials.local.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function resolvePassword(role) {
  if (role === "CLIENT") {
    return (
      process.env.ACTUS_CONNECT_DEV_CLIENT_PASSWORD ??
      loadLocalCredentials()?.CLIENT_password ??
      null
    );
  }
  if (role === "ACTUS") {
    return (
      process.env.ACTUS_CONNECT_DEV_ACTUS_PASSWORD ??
      loadLocalCredentials()?.ACTUS_OPERADOR_password ??
      null
    );
  }
  return null;
}

function todaySpIsoDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function smokeRole(role, email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { role, ok: false, detail: `sign_in_failed:${signInError.message}` };
  }

  const today = todaySpIsoDate();
  const webproc = client.schema("webproc");

  const { data: summary, error: rpcError } = await webproc.rpc("pulse_summary", {
    p_period_start: today,
    p_period_end: today,
    p_snapshot_mode: "ALL_IN_SCOPE",
  });

  if (rpcError) {
    await client.auth.signOut();
    return { role, ok: false, detail: `pulse_summary_failed:${rpcError.message}` };
  }

  const snap = summary?.snapshot;
  const hasCounts =
    snap &&
    typeof snap.fatal_today_count === "number" &&
    typeof snap.fatal_overdue_count === "number";

  if (!hasCounts) {
    await client.auth.signOut();
    return { role, ok: false, detail: "missing_fatal_count_fields" };
  }

  const { error: clienteGuardError } = await webproc.rpc("pulse_summary", {
    p_period_start: today,
    p_period_end: today,
    p_cliente_id: 999999999,
    p_snapshot_mode: "ALL_IN_SCOPE",
  });

  const guardOk =
    clienteGuardError &&
    (clienteGuardError.message.includes("pulse_cliente_id_not_allowed") ||
      clienteGuardError.code === "42501");

  if (role === "CLIENT" && !guardOk) {
    await client.auth.signOut();
    return {
      role,
      ok: false,
      detail: `cliente_id_guard_expected_denied got:${clienteGuardError?.message ?? "no_error"}`,
    };
  }

  const { count: visibleRows, error: listError } = await webproc
    .from("processos")
    .select("id_proc", { count: "exact", head: true });

  if (listError) {
    await client.auth.signOut();
    return { role, ok: false, detail: `processos_count_failed:${listError.message}` };
  }

  await client.auth.signOut();

  return {
    role,
    ok: true,
    detail: {
      fatal_today_count: snap.fatal_today_count,
      fatal_overdue_count: snap.fatal_overdue_count,
      visible_processos_head_count: visibleRows ?? null,
      cliente_id_guard: role === "CLIENT" ? "denied_as_expected" : "skipped_for_actus",
    },
  };
}

async function main() {
  const creds = loadLocalCredentials();
  const results = [];

  const clientEmail = creds?.CLIENT?.email ?? process.env.ACTUS_CONNECT_DEV_CLIENT_EMAIL;
  const clientPassword = resolvePassword("CLIENT");
  if (clientEmail && clientPassword) {
    results.push(await smokeRole("CLIENT", clientEmail, clientPassword));
  } else {
    results.push({ role: "CLIENT", ok: false, detail: "BLOCKED:missing_client_credentials" });
  }

  const actusEmail = creds?.ACTUS_OPERADOR?.email ?? process.env.ACTUS_CONNECT_DEV_ACTUS_EMAIL;
  const actusPassword = resolvePassword("ACTUS");
  if (actusEmail && actusPassword) {
    results.push(await smokeRole("ACTUS", actusEmail, actusPassword));
  } else {
    results.push({ role: "ACTUS", ok: false, detail: "SKIP:actus_credentials_not_configured" });
  }

  for (const r of results) {
    const status = r.ok ? "PASS" : r.detail?.startsWith("SKIP") ? "SKIP" : "FAIL";
    console.log(`${status} ${r.role}: ${JSON.stringify(r.detail)}`);
  }

  const clientResult = results.find((r) => r.role === "CLIENT");
  if (!clientResult?.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FAIL smoke_runner:", err.message);
  process.exitCode = 1;
});
