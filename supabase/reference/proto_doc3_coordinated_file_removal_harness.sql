-- PROTO-DOC.3: coordinated file removal & cancellation cleanup (DB gates)
-- Requires migrations through 20261002120000_proto_doc3_coordinated_file_removal.sql
-- Edge/R2 E2E (manual remove, cancel cleanup): invoke webproc-document-remove / webproc-document-r2-cleanup on DEV after deploy.
-- Run: npx supabase db query --linked -f supabase/reference/proto_doc3_coordinated_file_removal_harness.sql

BEGIN;

CREATE TEMP TABLE doc3_assertions (
  case_id text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

GRANT ALL ON TABLE doc3_assertions TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.doc3_assert(
  p_case_id text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO doc3_assertions (case_id, passed, detail)
  VALUES (
    p_case_id,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'DOC3 % failed: %', p_case_id, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_set_auth(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_begin_authenticated(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_temp.doc3_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_reset_auth()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_expect(p_message_like text, p_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLERRM LIKE '%' || p_message_like || '%';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_dt_fatal_future()
RETURNS timestamptz LANGUAGE sql AS $$
  SELECT (
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7)::text || ' 00:00:00'
  )::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_make_draft(p_user uuid, p_cliente_id bigint)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
  v_id_proc bigint;
BEGIN
  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal, instrucao, n_processo)
  VALUES (
    p_cliente_id,
    p_user,
    'EM_PREENCHIMENTO',
    pg_temp.doc3_dt_fatal_future(),
    'DOC3 harness',
    'DOC3-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_proc;
  RETURN v_id_proc;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.doc3_insert_arquivo(
  p_user uuid,
  p_id_proc bigint
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_doc uuid := gen_random_uuid();
BEGIN
  PERFORM webproc.server_prepare_document_upload(
    p_id_proc, p_user, 'DOC3', 'doc3.pdf', 'application/pdf', 100, v_doc
  );
  PERFORM webproc.server_register_confirmed_document_upload(
    p_id_proc, p_user, 'DOC3', 'doc3.pdf', 'application/pdf', 100, v_doc
  );
  RETURN v_doc;
END;
$$;

DO $$
DECLARE
  v_user_a uuid;
  v_cliente_id bigint;
  v_id_proc bigint;
  v_doc uuid;
  v_removed jsonb;
  v_event_count int;
  v_id_pending bigint;
  v_doc_pending uuid;
  v_proto jsonb;
BEGIN
  SELECT uc.user_id, uc.cliente_id
  INTO v_user_a, v_cliente_id
  FROM webproc.usuarios_clientes uc
  WHERE uc.ativo = true
  ORDER BY uc.cliente_id, uc.user_id
  LIMIT 1;

  IF v_user_a IS NULL THEN
    RAISE EXCEPTION 'DOC3 harness: no active client membership fixture';
  END IF;

  v_id_proc := pg_temp.doc3_make_draft(v_user_a, v_cliente_id);
  v_doc := pg_temp.doc3_insert_arquivo(v_user_a, v_id_proc);

  -- F: LINK path unchanged — remover_documento rejects ARQUIVO
  PERFORM pg_temp.doc3_begin_authenticated(v_user_a);
  PERFORM pg_temp.doc3_assert(
    'F_arquivo_rpc_rejected',
    pg_temp.doc3_expect('arquivo_removal_requires_coordination', format(
      'SELECT webproc.remover_documento(%L::uuid)', v_doc
    )),
    'remover_documento must still reject ARQUIVO'
  );
  PERFORM pg_temp.doc3_reset_auth();

  -- G: PENDENTE denies removal authorization
  v_id_pending := pg_temp.doc3_make_draft(v_user_a, v_cliente_id);
  v_doc_pending := pg_temp.doc3_insert_arquivo(v_user_a, v_id_pending);
  PERFORM pg_temp.doc3_begin_authenticated(v_user_a);
  v_proto := webproc.protocolar_processo(v_id_pending);
  PERFORM pg_temp.doc3_reset_auth();
  PERFORM pg_temp.doc3_assert(
    'G_setup_protocolar',
    coalesce((v_proto->>'success')::boolean, false),
    coalesce(v_proto::text, 'protocolar failed')
  );
  PERFORM pg_temp.doc3_assert(
    'G_pendente_removal_denied',
    pg_temp.doc3_expect('invalid_status_for_document_mutation', format(
      'SELECT webproc.server_resolve_arquivo_removal_target(%L::uuid, %L::uuid)',
      v_doc_pending, v_user_a
    )),
    'PENDENTE must block removal resolve'
  );

  -- Manual path (DB finalize after simulated R2): event + row delete
  PERFORM webproc.server_finalize_arquivo_removal(v_doc, v_user_a);
  SELECT count(*) INTO v_event_count
  FROM webproc.operacional_eventos e
  WHERE e.event_data->>'document_id' = v_doc::text
    AND e.event_type = 'DOCUMENT_REMOVED';
  PERFORM pg_temp.doc3_assert(
    'E_governance_event_after_manual',
    v_event_count >= 1,
    'DOCUMENT_REMOVED event expected'
  );
  PERFORM pg_temp.doc3_assert(
    'C_row_deleted_manual',
    NOT EXISTS (SELECT 1 FROM webproc.processo_documentos WHERE id = v_doc),
    'manual removal deletes row'
  );

  -- Cancellation cleanup gates
  v_id_proc := pg_temp.doc3_make_draft(v_user_a, v_cliente_id);
  v_doc := pg_temp.doc3_insert_arquivo(v_user_a, v_id_proc);

  PERFORM pg_temp.doc3_begin_authenticated(v_user_a);
  v_removed := webproc.cancelar_processo(v_id_proc, 'DOC3 harness cancel');
  PERFORM pg_temp.doc3_reset_auth();

  PERFORM pg_temp.doc3_assert(
    'L_cancel_succeeds',
    coalesce((v_removed->>'success')::boolean, false),
    coalesce(v_removed->>'error', 'cancel failed')
  );

  PERFORM pg_temp.doc3_assert(
    'M_cleanup_pending_set',
    EXISTS (
      SELECT 1 FROM webproc.processo_documentos
      WHERE id = v_doc AND r2_cleanup_pending = true AND storage_state = 'STORED'
    ),
    'cancel marks r2_cleanup_pending'
  );

  PERFORM pg_temp.doc3_assert(
    'M_not_active_while_cleanup_pending',
    NOT webproc_private.process_has_active_documents(v_id_proc),
    'process_has_active_documents false when cleanup pending'
  );

  PERFORM pg_temp.doc3_assert(
    'Q_download_blocked_cancelled',
    pg_temp.doc3_expect('invalid_status_for_download', format(
      'SELECT webproc.server_resolve_arquivo_download_target(%L::uuid, %L::uuid)',
      v_doc, v_user_a
    )),
    'download blocked for cancelled protocol'
  );


  -- Purge confirm (simulated post-R2)
  PERFORM webproc.server_confirm_arquivo_purged_after_r2(v_doc);
  PERFORM webproc.server_confirm_arquivo_purged_after_r2(v_doc);

  PERFORM pg_temp.doc3_assert(
    'O_idempotent_purge',
    EXISTS (
      SELECT 1 FROM webproc.processo_documentos
      WHERE id = v_doc AND storage_state = 'PURGED' AND r2_cleanup_pending = false
    ),
    'PURGED after confirm'
  );

  SELECT count(*) INTO v_event_count
  FROM webproc.operacional_eventos e
  WHERE e.event_data->>'document_id' = v_doc::text
    AND e.event_type = 'DOCUMENT_REMOVED';
  PERFORM pg_temp.doc3_assert(
    'P_single_purge_event',
    v_event_count = 1,
    'idempotent confirm must not duplicate DOCUMENT_REMOVED'
  );
END;
$$;

DO $$
DECLARE
  v_failed int;
BEGIN
  SELECT count(*) INTO v_failed FROM doc3_assertions WHERE NOT passed;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'PROTO-DOC.3 harness: % case(s) failed — see doc3_assertions', v_failed;
  END IF;
  RAISE NOTICE 'PROTO-DOC.3 harness: all DB gate cases passed';
END;
$$;

ROLLBACK;
