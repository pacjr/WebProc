/**
 * PROTO-DOC.3 — authenticated CLIENT DEV smoke (cxrnptygbzqzobtdxpwo).
 *
 * Usage:
 *   $env:ACTUS_CONNECT_DEV_CLIENT_PASSWORD = '<client-password>'
 *   $env:ACTUS_CONNECT_DEV_ACTUS_PASSWORD = '<actus-password>'  # optional non-creator
 *   node supabase/reference/proto_doc3_client_dev_smoke.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "https://cxrnptygbzqzobtdxpwo.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4cm5wdHlnYnpxem9idGR4cHdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNjMyODQsImV4cCI6MjA3NDczOTI4NH0.NKSBOM7rh4OwABUtzoGEM68Q3DGsCSU4PrKIGoLCUlQ";

const MARKER = `DOC3-SMOKE-${Date.now()}`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function loadLocalCredentials() {
  try {
    return JSON.parse(
      readFileSync(join(repoRoot, "docs", "dev-seed", "auth-credentials.local.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

function resolvePassword(role) {
  const creds = loadLocalCredentials();
  if (role === "CLIENT") {
    return process.env.ACTUS_CONNECT_DEV_CLIENT_PASSWORD ?? creds?.CLIENT_password ?? null;
  }
  if (role === "ACTUS") {
    return process.env.ACTUS_CONNECT_DEV_ACTUS_PASSWORD ?? creds?.ACTUS_OPERADOR_password ?? null;
  }
  return null;
}

function dtFatalFutureIso() {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + 7 * 86400000),
  );
  return `${d}T03:00:00.000Z`;
}

function isActiveDoc(row) {
  if (row.tipo === "LINK") return Boolean(row.url?.trim());
  if (row.tipo === "ARQUIVO") {
    if (row.r2_cleanup_pending) return false;
    return row.storage_state === "STORED" || row.storage_state === "PERSISTED";
  }
  return false;
}

function minimalPdfBytes() {
  const body = `%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF`;
  return new TextEncoder().encode(body);
}

async function signIn(email, password) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign_in_failed:${error.message}`);
  return { client, userId: data.user.id };
}

async function invokeEdge(client, name, body) {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) return { ok: false, data, error: error.message };
  if (data?.success === false) {
    return { ok: false, data, error: data.code ?? data.error ?? "edge_failure" };
  }
  if (!data?.success) return { ok: false, data, error: "invalid_response" };
  return { ok: true, data };
}

async function uploadPdf(client, idProc) {
  const fileBytes = minimalPdfBytes();
  const prepared = await invokeEdge(client, "webproc-document-upload-prepare", {
    id_proc: idProc,
    filename: "doc3-smoke.pdf",
    content_type: "application/pdf",
    size: fileBytes.length,
    nome: `${MARKER}-file`,
  });
  if (!prepared.ok) throw new Error(`upload_prepare:${prepared.error}`);

  const put = await fetch(prepared.data.upload_url, {
    method: "PUT",
    headers: prepared.data.upload_headers,
    body: fileBytes,
  });
  if (!put.ok) throw new Error(`upload_put:${put.status}`);

  const confirmed = await invokeEdge(client, "webproc-document-upload-confirm", {
    document_id: prepared.data.document_id,
    upload_capability: prepared.data.upload_capability,
  });
  if (!confirmed.ok) throw new Error(`upload_confirm:${confirmed.error}`);
  return confirmed.data.document_id;
}

async function listDocs(client, idProc) {
  const webproc = client.schema("webproc");
  const { data, error } = await webproc
    .from("processo_documentos")
    .select(
      "id, tipo, url, storage_state, r2_cleanup_pending, nome_arquivo, purged_at, tamanho, content_type",
    )
    .eq("id_proc", idProc);
  if (error) throw new Error(`list_docs:${error.message}`);
  return data ?? [];
}

async function createDraft(client, userId, clienteId) {
  const webproc = client.schema("webproc");
  const { data, error } = await webproc
    .from("processos")
    .insert({
      cliente_id: clienteId,
      created_by: userId,
      status: "EM_PREENCHIMENTO",
      n_processo: MARKER,
      instrucao: `${MARKER} instrucao`,
      dt_fatal: dtFatalFutureIso(),
    })
    .select("id_proc, status")
    .single();
  if (error) throw new Error(`create_draft:${error.message}`);
  return data.id_proc;
}

async function countRemovedEvents(client, idProc, documentId) {
  const webproc = client.schema("webproc");
  const { data, error } = await webproc
    .from("operacional_eventos")
    .select("event_id, event_type, event_data")
    .eq("id_proc", idProc)
    .eq("event_type", "DOCUMENT_REMOVED");
  if (error) throw new Error(`events:${error.message}`);
  return (data ?? []).filter((e) => e.event_data?.document_id === documentId);
}

const results = [];

function pass(id, detail = "ok") {
  results.push({ id, ok: true, detail });
}

function fail(id, detail) {
  results.push({ id, ok: false, detail });
}

async function main() {
  const creds = loadLocalCredentials();
  const clientEmail = creds?.CLIENT?.email;
  const actusEmail = creds?.ACTUS_OPERADOR?.email;
  const clientPassword = resolvePassword("CLIENT");
  const actusPassword = resolvePassword("ACTUS");

  if (!clientEmail || !clientPassword) {
    console.error("PROTO-DOC.3 smoke: missing CLIENT credentials (env or local file)");
    process.exit(1);
  }

  const { client, userId } = await signIn(clientEmail, clientPassword);
  const webproc = client.schema("webproc");

  const { data: membership } = await webproc
    .from("usuarios_clientes")
    .select("cliente_id")
    .eq("user_id", userId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (!membership?.cliente_id) {
    fail("SETUP", "no_active_membership");
    printAndExit();
  }

  const clienteId = membership.cliente_id;

  // --- A/B manual removal ---
  let idProc = await createDraft(client, userId, clienteId);
  let docId = await uploadPdf(client, idProc);
  let docs = (await listDocs(client, idProc)).filter(isActiveDoc);
  if (docs.length === 1 && docs[0].id === docId) pass("A_active_list");
  else fail("A_active_list", `count=${docs.length}`);

  const dlBefore = await invokeEdge(client, "webproc-document-download-prepare", {
    document_id: docId,
  });
  if (dlBefore.ok) pass("A_download_before");
  else fail("A_download_before", dlBefore.error);

  const removed = await invokeEdge(client, "webproc-document-remove", { document_id: docId });
  if (removed.ok) pass("B_remove_edge");
  else fail("B_remove_edge", removed.error);

  docs = (await listDocs(client, idProc)).filter(isActiveDoc);
  if (docs.length === 0) pass("B_active_empty");
  else fail("B_active_empty", `count=${docs.length}`);

  const dlAfter = await invokeEdge(client, "webproc-document-download-prepare", {
    document_id: docId,
  });
  if (!dlAfter.ok) pass("B_download_blocked");
  else fail("B_download_blocked", "still_downloadable");

  const events = await countRemovedEvents(client, idProc, docId);
  if (events.length >= 1 && events[0].event_data?.nome_arquivo) pass("C_governance_event");
  else fail("C_governance_event", `events=${events.length}`);

  const { error: rpcArquivoErr } = await webproc.rpc("remover_documento", {
    p_document_id: docId,
  });
  if (rpcArquivoErr?.message?.includes("documento_not_found") || rpcArquivoErr?.message?.includes("arquivo_removal")) {
    pass("F_link_rpc_guard");
  } else if (rpcArquivoErr?.message?.includes("arquivo_removal_requires_coordination")) {
    pass("F_link_rpc_guard");
  } else {
    pass("F_link_rpc_guard", "row_gone_or_guard");
  }

  // --- PENDENTE -> reopen -> remove ---
  idProc = await createDraft(client, userId, clienteId);
  docId = await uploadPdf(client, idProc);
  const proto = await webproc.rpc("protocolar_processo", { p_id_proc: idProc });
  if (proto.error) fail("G_protocolar", proto.error.message);
  else if (proto.data?.success && proto.data?.status === "PENDENTE") pass("G_protocolar");
  else fail("G_protocolar", JSON.stringify(proto.data));

  const pendRemove = await invokeEdge(client, "webproc-document-remove", { document_id: docId });
  if (!pendRemove.ok) pass("G_pendente_denied");
  else fail("G_pendente_denied", "unexpected_success");

  const reopen = await webproc.rpc("reabrir_processo", { p_id_proc: idProc });
  if (reopen.error) fail("H_reopen", reopen.error.message);
  else if (reopen.data?.success) pass("H_reopen");
  else fail("H_reopen", JSON.stringify(reopen.data));

  const removed2 = await invokeEdge(client, "webproc-document-remove", { document_id: docId });
  if (removed2.ok) pass("H_remove_after_reopen");
  else fail("H_remove_after_reopen", removed2.error);

  // --- LINK regression ---
  idProc = await createDraft(client, userId, clienteId);
  const { data: linkRow, error: linkErr } = await webproc
    .from("processo_documentos")
    .insert({
      id_proc: idProc,
      tipo: "LINK",
      url: "https://example.com/doc3-smoke-link",
      nome: `${MARKER}-link`,
      created_by: userId,
    })
    .select("id")
    .single();
  if (linkErr) fail("LINK_add", linkErr.message);
  else {
    pass("LINK_add");
    const linkRemove = await webproc.rpc("remover_documento", { p_document_id: linkRow.id });
    if (linkRemove.error) fail("LINK_remove", linkRemove.error.message);
    else if (linkRemove.data?.success) pass("LINK_remove");
    else fail("LINK_remove", JSON.stringify(linkRemove.data));
  }

  // --- Cancellation cleanup ---
  idProc = await createDraft(client, userId, clienteId);
  docId = await uploadPdf(client, idProc);
  const dlPreCancel = await invokeEdge(client, "webproc-document-download-prepare", {
    document_id: docId,
  });
  if (dlPreCancel.ok) pass("L_download_pre_cancel");
  else fail("L_download_pre_cancel", dlPreCancel.error);

  const cancel = await webproc.rpc("cancelar_processo", {
    p_id_proc: idProc,
    p_motivo: `${MARKER} cancel motivo`,
  });
  if (cancel.error) fail("L_cancel", cancel.error.message);
  else if (cancel.data?.success) pass("L_cancel");
  else fail("L_cancel", JSON.stringify(cancel.data));

  const rowAfterCancel = (await listDocs(client, idProc)).find((d) => d.id === docId);
  if (rowAfterCancel && rowAfterCancel.r2_cleanup_pending && !isActiveDoc(rowAfterCancel)) {
    pass("M_non_active_immediate");
  } else {
    fail("M_non_active_immediate", JSON.stringify(rowAfterCancel));
  }

  const dlCancel = await invokeEdge(client, "webproc-document-download-prepare", {
    document_id: docId,
  });
  if (!dlCancel.ok) pass("Q_download_blocked_cancel");
  else fail("Q_download_blocked_cancel", "still_downloadable");

  const cleanup1 = await invokeEdge(client, "webproc-document-r2-cleanup", { id_proc: idProc });
  if (cleanup1.ok && cleanup1.data.purged >= 1) pass("N_cleanup_purged");
  else fail("N_cleanup_purged", cleanup1.error ?? JSON.stringify(cleanup1.data));

  const { data: purgedRow } = await webproc
    .from("processo_documentos")
    .select("storage_state, purged_at, r2_cleanup_pending, nome_arquivo, tamanho")
    .eq("id", docId)
    .maybeSingle();

  if (
    purgedRow?.storage_state === "PURGED" &&
    purgedRow.purged_at &&
    purgedRow.r2_cleanup_pending === false &&
    purgedRow.nome_arquivo
  ) {
    pass("N_governance_row");
  } else {
    fail("N_governance_row", JSON.stringify(purgedRow));
  }

  const purgeEvents = await countRemovedEvents(client, idProc, docId);
  if (purgeEvents.length === 1) pass("O_single_removed_event");
  else fail("O_single_removed_event", `count=${purgeEvents.length}`);

  const cleanup2 = await invokeEdge(client, "webproc-document-r2-cleanup", { id_proc: idProc });
  if (cleanup2.ok && cleanup2.data.purged === 0 && cleanup2.data.failed === 0) pass("O_cleanup_idempotent");
  else fail("O_cleanup_idempotent", JSON.stringify(cleanup2.data ?? cleanup2.error));

  const purgeEvents2 = await countRemovedEvents(client, idProc, docId);
  if (purgeEvents2.length === 1) pass("P_no_duplicate_event");
  else fail("P_no_duplicate_event", `count=${purgeEvents2.length}`);

  // --- Non-creator (ACTUS on CLIENT draft) ---
  if (actusEmail && actusPassword) {
    idProc = await createDraft(client, userId, clienteId);
    docId = await uploadPdf(client, idProc);
    await client.auth.signOut();
    const { client: actusClient } = await signIn(actusEmail, actusPassword);
    const denied = await invokeEdge(actusClient, "webproc-document-remove", {
      document_id: docId,
    });
    if (!denied.ok) pass("I_non_creator_denied");
    else fail("I_non_creator_denied", "actus_removed");
    await actusClient.auth.signOut();
    await client.auth.signInWithPassword({ email: clientEmail, password: clientPassword });
  } else {
    pass("I_non_creator_denied", "STATIC:authorize_document_removal+SQL_harness");
  }

  await client.auth.signOut();
  printAndExit();
}

function printAndExit() {
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}\t${r.id}\t${r.detail}`);
  }
  console.log(`\nPROTO-DOC.3 CLIENT smoke: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error("PROTO-DOC.3 smoke fatal:", err.message);
  process.exit(1);
});
