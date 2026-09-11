-- WP-03 Step 2B-Foundation — remote/local Actus mutation boundary smoke harness
--
-- Proves active Actus users have transversal READ but cannot mutate client process state.
-- Runs entirely inside one transaction; ROLLBACK leaves no permanent data.
--
-- Required identities (remote smoke):
--   CLIENT  748ad66d-399e-4ab9-9112-e2cde3555759  pedro@insightaisolutions.com.br
--   ACTUS   ba0c28e1-e4bb-4c8f-934f-a516939f7c8e  contato@insightaisolutions.com.br
--
-- Run locally:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp03b_actus_mutation_boundary_harness.sql
-- Run remotely:
--   powershell -NoProfile -ExecutionPolicy Bypass -File supabase/reference/run_wp03b_actus_remote_smoke.ps1

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE wp03b_actus_smoke_assertions (
  step_no text NOT NULL,
  step_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE TEMP TABLE wp03b_actus_smoke_attempts (
  mutation text NOT NULL,
  outcome text NOT NULL,
  detail text
);

-- Harness-only: tables are owned by the connecting role, but assertion/mutation
-- logging runs under SET LOCAL ROLE authenticated via SECURITY INVOKER helpers.
GRANT INSERT ON wp03b_actus_smoke_assertions TO authenticated;
GRANT INSERT ON wp03b_actus_smoke_attempts TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_assert(
  p_step_no text,
  p_step_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp03b_actus_smoke_assertions (step_no, step_name, passed, detail)
  VALUES (
    p_step_no,
    p_step_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );

  IF NOT p_condition THEN
    RAISE WARNING 'WP03B-Actus smoke % failed: % — %', p_step_no, p_step_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.wp03b_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_reset_auth_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_dt_fatal_for_business_date(p_deadline date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_deadline::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_today_sp()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('America/Sao_Paulo', now()))::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03b_record_attempt(
  p_mutation text,
  p_outcome text,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp03b_actus_smoke_attempts (mutation, outcome, detail)
  VALUES (p_mutation, p_outcome, coalesce(p_detail, ''));
END;
$$;

DO $$
DECLARE
  v_pedro uuid := '748ad66d-399e-4ab9-9112-e2cde3555759';
  v_actus uuid := 'ba0c28e1-e4bb-4c8f-934f-a516939f7c8e';
  v_marker text := 'WP03B-ACTUS-SMOKE-' || substr(gen_random_uuid()::text, 1, 8);
  v_draft_obs constant text := 'ORIGINAL';
  v_cliente_id bigint;
  v_membership_count integer;
  v_actus_membership_count integer;
  v_draft_id bigint;
  v_pending_id bigint;
  v_draft_doc_id uuid;
  v_pending_doc_id uuid;
  v_today date := pg_temp.wp03b_today_sp();
  v_dt_fatal timestamptz := pg_temp.wp03b_dt_fatal_for_business_date(v_today + 7);
  v_read_draft integer;
  v_read_pending integer;
  v_read_doc integer;
  v_blocked_object_key boolean := false;
  v_blocked_cleanup boolean := false;
  v_draft_obs_after text;
  v_draft_status_after text;
  v_pending_status_after text;
  v_draft_doc_count integer;
  v_result jsonb;
BEGIN
  IF to_regclass('webproc.usuarios_actus') IS NULL THEN
    RAISE EXCEPTION 'missing webproc.usuarios_actus — apply migration 20260307290000 first';
  END IF;

  SELECT count(*)
  INTO v_membership_count
  FROM webproc.usuarios_clientes uc
  WHERE uc.user_id = v_pedro
    AND uc.ativo = true;

  PERFORM pg_temp.wp03b_assert(
    'SETUP-1',
    'Pedro has active client membership',
    v_membership_count >= 1,
    format('memberships=%s', v_membership_count)
  );

  SELECT uc.cliente_id
  INTO v_cliente_id
  FROM webproc.usuarios_clientes uc
  WHERE uc.user_id = v_pedro
    AND uc.ativo = true
  ORDER BY uc.id
  LIMIT 1;

  SELECT count(*)
  INTO v_actus_membership_count
  FROM webproc.usuarios_clientes uc
  WHERE uc.user_id = v_actus
    AND uc.ativo = true;

  PERFORM pg_temp.wp03b_assert(
    'SETUP-2',
    'Actus identity does not rely on client membership',
    v_actus_membership_count = 0,
    format('client_memberships=%s', v_actus_membership_count)
  );

  INSERT INTO webproc.usuarios_actus (user_id, nome, email, papel, ativo)
  VALUES (v_actus, 'Actus Remote Smoke', 'contato@insightaisolutions.com.br', 'OPERADOR', true)
  ON CONFLICT (user_id) DO UPDATE
  SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    papel = EXCLUDED.papel,
    ativo = true,
    updated_at = now();

  PERFORM pg_temp.wp03b_begin_authenticated(v_actus);
  PERFORM pg_temp.wp03b_assert(
    'SETUP-3',
    'Actus user authorized through usuarios_actus',
    webproc_private.is_active_actus_user(),
    'is_active_actus_user returned false under authenticated Actus context'
  );
  PERFORM pg_temp.wp03b_reset_auth_context();

  PERFORM pg_temp.wp03b_begin_authenticated(v_pedro);

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    obs,
    instrucao,
    n_processo,
    dt_fatal
  )
  VALUES (
    v_cliente_id,
    v_pedro,
    'EM_PREENCHIMENTO',
    v_draft_obs,
    'WP03B smoke draft instrucao',
    v_marker || '-DRAFT',
    v_dt_fatal
  )
  RETURNING id_proc INTO v_draft_id;

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, nome, created_by)
  VALUES (
    v_draft_id,
    'LINK',
    'https://example.com/wp03b-smoke-draft',
    'Draft smoke doc',
    v_pedro
  )
  RETURNING id INTO v_draft_doc_id;

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    obs,
    instrucao,
    n_processo,
    dt_fatal
  )
  VALUES (
    v_cliente_id,
    v_pedro,
    'EM_PREENCHIMENTO',
    'PENDING-FIXTURE',
    'WP03B smoke pending instrucao',
    v_marker || '-PENDING',
    v_dt_fatal
  )
  RETURNING id_proc INTO v_pending_id;

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, nome, created_by)
  VALUES (
    v_pending_id,
    'LINK',
    'https://example.com/wp03b-smoke-pending',
    'Pending smoke doc',
    v_pedro
  )
  RETURNING id INTO v_pending_doc_id;

  SELECT webproc.protocolar_processo(v_pending_id) INTO v_result;

  PERFORM pg_temp.wp03b_reset_auth_context();

  PERFORM pg_temp.wp03b_assert(
    'SETUP-4',
    'Pedro protocolized disposable process to PENDENTE',
    (v_result ->> 'success') = 'true'
      AND (v_result ->> 'status') = 'PENDENTE',
    coalesce(v_result::text, 'null result')
  );

  PERFORM pg_temp.wp03b_begin_authenticated(v_actus);

  SELECT count(*) INTO v_read_draft
  FROM webproc.processos p
  WHERE p.id_proc = v_draft_id;

  SELECT count(*) INTO v_read_pending
  FROM webproc.processos p
  WHERE p.id_proc = v_pending_id;

  SELECT count(*) INTO v_read_doc
  FROM webproc.processo_documentos d
  WHERE d.id IN (v_draft_doc_id, v_pending_doc_id);

  PERFORM pg_temp.wp03b_assert(
    'READ-1',
    'Actus transversal read on EM_PREENCHIMENTO process',
    v_read_draft = 1,
    format('draft_count=%s', v_read_draft)
  );

  PERFORM pg_temp.wp03b_assert(
    'READ-2',
    'Actus transversal read on PENDENTE process',
    v_read_pending = 1,
    format('pending_count=%s', v_read_pending)
  );

  PERFORM pg_temp.wp03b_assert(
    'READ-3',
    'Actus transversal read on document metadata',
    v_read_doc = 2,
    format('doc_count=%s', v_read_doc)
  );

  BEGIN
    PERFORM object_key
    FROM webproc.processo_documentos d
    WHERE d.id = v_draft_doc_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked_object_key := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_blocked_object_key := true;
      ELSE
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM r2_cleanup_pending
    FROM webproc.processo_documentos d
    WHERE d.id = v_draft_doc_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked_cleanup := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_blocked_cleanup := true;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03b_assert(
    'READ-4',
    'Actus cannot SELECT object_key',
    v_blocked_object_key,
    'object_key unexpectedly readable'
  );

  PERFORM pg_temp.wp03b_assert(
    'READ-5',
    'Actus cannot SELECT r2_cleanup_pending',
    v_blocked_cleanup,
    'r2_cleanup_pending unexpectedly readable'
  );

  BEGIN
    SELECT webproc.salvar_rascunho(
      v_draft_id,
      v_marker || '-HACK',
      NULL,
      NULL,
      NULL,
      'Actus attempted edit',
      'HACKED',
      v_dt_fatal
    ) INTO v_result;
    PERFORM pg_temp.wp03b_record_attempt(
      'salvar_rascunho',
      CASE WHEN (v_result ->> 'success') = 'true' THEN 'RPC_SUCCESS' ELSE 'RPC_REJECTED' END,
      v_result::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp03b_record_attempt('salvar_rascunho', 'EXCEPTION', SQLERRM);
  END;

  BEGIN
    SELECT webproc.protocolar_processo(v_draft_id) INTO v_result;
    PERFORM pg_temp.wp03b_record_attempt(
      'protocolar_processo',
      CASE WHEN (v_result ->> 'success') = 'true' THEN 'RPC_SUCCESS' ELSE 'RPC_REJECTED' END,
      v_result::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp03b_record_attempt('protocolar_processo', 'EXCEPTION', SQLERRM);
  END;

  BEGIN
    SELECT webproc.cancelar_processo(v_draft_id, 'Actus cancel attempt') INTO v_result;
    PERFORM pg_temp.wp03b_record_attempt(
      'cancelar_processo',
      CASE WHEN (v_result ->> 'success') = 'true' THEN 'RPC_SUCCESS' ELSE 'RPC_REJECTED' END,
      v_result::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp03b_record_attempt('cancelar_processo', 'EXCEPTION', SQLERRM);
  END;

  BEGIN
    SELECT webproc.remover_documento(v_draft_doc_id) INTO v_result;
    PERFORM pg_temp.wp03b_record_attempt(
      'remover_documento',
      CASE WHEN (v_result ->> 'success') = 'true' THEN 'RPC_SUCCESS' ELSE 'RPC_REJECTED' END,
      v_result::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp03b_record_attempt('remover_documento', 'EXCEPTION', SQLERRM);
  END;

  BEGIN
    SELECT webproc.reabrir_processo(v_pending_id) INTO v_result;
    PERFORM pg_temp.wp03b_record_attempt(
      'reabrir_processo',
      CASE WHEN (v_result ->> 'success') = 'true' THEN 'RPC_SUCCESS' ELSE 'RPC_REJECTED' END,
      v_result::text
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp03b_record_attempt('reabrir_processo', 'EXCEPTION', SQLERRM);
  END;

  PERFORM pg_temp.wp03b_reset_auth_context();

  SELECT p.obs, p.status
  INTO v_draft_obs_after, v_draft_status_after
  FROM webproc.processos p
  WHERE p.id_proc = v_draft_id;

  SELECT p.status
  INTO v_pending_status_after
  FROM webproc.processos p
  WHERE p.id_proc = v_pending_id;

  SELECT count(*)
  INTO v_draft_doc_count
  FROM webproc.processo_documentos d
  WHERE d.id_proc = v_draft_id
    AND d.id = v_draft_doc_id;

  PERFORM pg_temp.wp03b_assert(
    'BOUNDARY-1',
    'Draft obs remains ORIGINAL after Actus mutation attempts',
    v_draft_obs_after = v_draft_obs,
    format('obs=%s', v_draft_obs_after)
  );

  PERFORM pg_temp.wp03b_assert(
    'BOUNDARY-2',
    'Draft remains EM_PREENCHIMENTO',
    v_draft_status_after = 'EM_PREENCHIMENTO',
    format('status=%s', v_draft_status_after)
  );

  PERFORM pg_temp.wp03b_assert(
    'BOUNDARY-3',
    'Draft document remains present',
    v_draft_doc_count = 1,
    format('doc_count=%s', v_draft_doc_count)
  );

  PERFORM pg_temp.wp03b_assert(
    'BOUNDARY-4',
    'Pending process remains PENDENTE',
    v_pending_status_after = 'PENDENTE',
    format('status=%s', v_pending_status_after)
  );

  PERFORM pg_temp.wp03b_assert(
    'BOUNDARY-5',
    'No Actus mutation RPC reported success',
    NOT EXISTS (
      SELECT 1
      FROM wp03b_actus_smoke_attempts a
      WHERE a.outcome = 'RPC_SUCCESS'
    ),
    (SELECT string_agg(a.mutation || ':' || a.outcome, '; ') FROM wp03b_actus_smoke_attempts a)
  );
END;
$$;

DO $$
DECLARE
  v_failed integer;
  r record;
BEGIN
  SELECT count(*) INTO v_failed
  FROM wp03b_actus_smoke_assertions
  WHERE NOT passed;

  RAISE NOTICE 'WP03B Actus smoke summary: % checks, % failed',
    (SELECT count(*) FROM wp03b_actus_smoke_assertions),
    v_failed;

  FOR r IN
    SELECT mutation, outcome, detail
    FROM wp03b_actus_smoke_attempts
    ORDER BY mutation
  LOOP
    RAISE NOTICE 'Attempt % => % (%)', r.mutation, r.outcome, r.detail;
  END LOOP;

  FOR r IN
    SELECT step_no, step_name, detail
    FROM wp03b_actus_smoke_assertions
    WHERE NOT passed
    ORDER BY step_no
  LOOP
    RAISE NOTICE 'FAIL %: % — %', r.step_no, r.step_name, r.detail;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'WP03B Actus mutation boundary smoke FAILED: % check(s)', v_failed;
  END IF;

  RAISE NOTICE 'WP03B Actus mutation boundary smoke PASSED';
END;
$$;

SELECT step_no, step_name, passed, detail
FROM wp03b_actus_smoke_assertions
ORDER BY step_no;

SELECT mutation, outcome, detail
FROM wp03b_actus_smoke_attempts
ORDER BY mutation;

ROLLBACK;
