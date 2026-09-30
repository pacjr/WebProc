-- PROTO-DOM.1 / PROTO-DOM.1a harness (transactional; ROLLBACK at end)
-- Run: npx supabase db query --linked -f supabase/reference/proto_dom1_identificacao_xor_harness.sql
--
-- Uses SET LOCAL ROLE authenticated (not JWT claims alone) to match Data API writes.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.proto_dom1_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.proto_dom1_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.proto_dom1_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.proto_dom1_begin_anon()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$;

DO $$
DECLARE
  v_user_id uuid;
  v_cliente_id bigint;
  v_id_proc bigint;
  v_err text;
  v_failures text[] := ARRAY[]::text[];
  v_private_select_ok boolean := false;
BEGIN
  SELECT uc.user_id, uc.cliente_id
  INTO v_user_id, v_cliente_id
  FROM webproc.usuarios_clientes uc
  INNER JOIN webproc.clientes c ON c.id = uc.cliente_id
  WHERE uc.ativo = true AND c.ativo = true
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Harness setup failed: no active client membership on DEV';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'webproc_private.processo_identificacao_xor_ok(text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'PROTO-DOM.1a precondition failed: authenticated lacks EXECUTE on processo_identificacao_xor_ok';
  END IF;

  -- A: authenticated + n_processo only INSERT
  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status, n_processo)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-N-001')
    RETURNING id_proc INTO v_id_proc;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    v_failures := array_append(v_failures, 'A auth insert n_processo only: ' || v_err);
  END;

  -- B: authenticated + exec_prov only INSERT
  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status, exec_prov)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-EP-001')
    RETURNING id_proc INTO v_id_proc;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    v_failures := array_append(v_failures, 'B auth insert exec_prov only: ' || v_err);
  END;

  -- C: authenticated + neither -> CHECK denial
  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO')
    RETURNING id_proc INTO v_id_proc;
    v_failures := array_append(v_failures, 'C auth insert both empty: expected denial');
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_failures := array_append(v_failures, 'C auth insert both empty: ' || v_err);
  END;

  -- D: authenticated + both populated -> CHECK denial
  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (
      cliente_id, created_by, status, n_processo, exec_prov
    )
    VALUES (
      v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-BOTH-N', 'HARNESS-BOTH-E'
    )
    RETURNING id_proc INTO v_id_proc;
    v_failures := array_append(v_failures, 'D auth insert both populated: expected denial');
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_failures := array_append(v_failures, 'D auth insert both populated: ' || v_err);
  END;

  -- E: anon must not INSERT processos (RLS / role boundary)
  PERFORM pg_temp.proto_dom1_begin_anon();
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status, n_processo)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-ANON-N')
    RETURNING id_proc INTO v_id_proc;
    v_failures := array_append(v_failures, 'E anon insert: expected denial');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- F: authenticated still cannot read webproc_private tables directly
  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    PERFORM 1 FROM webproc_private.operational_events LIMIT 1;
    v_private_select_ok := true;
  EXCEPTION WHEN insufficient_privilege THEN
    v_private_select_ok := false;
  WHEN OTHERS THEN
    v_private_select_ok := false;
  END;
  IF v_private_select_ok THEN
    v_failures := array_append(
      v_failures,
      'F authenticated direct webproc_private SELECT: expected denial'
    );
  END IF;

  -- G: salvar_rascunho XOR + structural UPDATE (authenticated context)
  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status, n_processo)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-SAVE-N')
    RETURNING id_proc INTO v_id_proc;

    PERFORM webproc.salvar_rascunho(
      v_id_proc,
      'HARNESS-SAVE-N',
      'HARNESS-SAVE-E',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    );
    v_failures := array_append(
      v_failures,
      'G salvar both populated: expected identificacao_xor_violation'
    );
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err NOT LIKE '%identificacao_xor_violation%' THEN
        v_failures := array_append(v_failures, 'G salvar both populated: ' || v_err);
      END IF;
  END;

  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status, exec_prov)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-SAVE-EP-OLD')
    RETURNING id_proc INTO v_id_proc;

    PERFORM webproc.salvar_rascunho(
      v_id_proc,
      NULL,
      'HARNESS-SAVE-EP-NEW',
      'Reclamante harness',
      NULL,
      NULL,
      NULL,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    v_failures := array_append(v_failures, 'G salvar exec only: ' || v_err);
  END;

  PERFORM pg_temp.proto_dom1_begin_authenticated(v_user_id);
  BEGIN
    INSERT INTO webproc.processos (cliente_id, created_by, status, n_processo)
    VALUES (v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', 'HARNESS-UPD-N')
    RETURNING id_proc INTO v_id_proc;

    UPDATE webproc.processos
    SET exec_prov = 'HARNESS-UPD-E'
    WHERE id_proc = v_id_proc;

    v_failures := array_append(v_failures, 'G update structural both: expected check_violation');
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_failures := array_append(v_failures, 'G update structural both: ' || v_err);
  END;

  IF coalesce(array_length(v_failures, 1), 0) > 0 THEN
    RAISE EXCEPTION 'PROTO-DOM.1/1a harness failures: %', array_to_string(v_failures, '; ');
  END IF;

  RAISE NOTICE 'PROTO-DOM.1/1a harness: all cases PASS';
END;
$$;

ROLLBACK;
