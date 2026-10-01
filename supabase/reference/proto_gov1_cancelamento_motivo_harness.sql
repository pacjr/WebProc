-- PROTO-GOV.1 harness (transactional; ROLLBACK at end)
-- Run: npx supabase db query --linked -f supabase/reference/proto_gov1_cancelamento_motivo_harness.sql

BEGIN;

CREATE TEMP TABLE proto_gov1_assertions (
  case_id text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

GRANT ALL ON TABLE proto_gov1_assertions TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.proto_gov1_assert(
  p_case_id text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO proto_gov1_assertions (case_id, passed, detail)
  VALUES (
    p_case_id,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'PROTO-GOV.1 case % failed: %', p_case_id, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.proto_gov1_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.proto_gov1_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.proto_gov1_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.proto_gov1_dt_fatal_future()
RETURNS timestamptz
LANGUAGE sql
AS $$
  SELECT (
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7)::text || ' 00:00:00'
  )::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

DO $$
DECLARE
  v_user_a uuid;
  v_user_b uuid;
  v_cliente_id bigint;
  v_id_draft bigint;
  v_id_pending bigint;
  v_id_importado bigint;
  v_id_other bigint;
  v_cancel jsonb;
  v_err text;
  v_row webproc.processos%ROWTYPE;
  v_dt_snapshot_at_cancel timestamptz;
  v_dt_after_mutations timestamptz;
  v_save jsonb;
  v_update_count integer;
BEGIN
  SELECT uc.user_id, uc.cliente_id
  INTO v_user_a, v_cliente_id
  FROM webproc.usuarios_clientes uc
  INNER JOIN webproc.clientes c ON c.id = uc.cliente_id
  WHERE uc.ativo = true AND c.ativo = true
  ORDER BY uc.cliente_id, uc.user_id
  LIMIT 1;

  IF v_user_a IS NULL THEN
    RAISE EXCEPTION 'Harness setup failed: no active client membership on DEV';
  END IF;

  SELECT uc.user_id
  INTO v_user_b
  FROM webproc.usuarios_clientes uc
  WHERE uc.ativo = true
    AND uc.cliente_id = v_cliente_id
    AND uc.user_id IS DISTINCT FROM v_user_a
  LIMIT 1;

  IF v_user_b IS NULL THEN
    RAISE EXCEPTION 'Harness setup failed: need a second active member for case G';
  END IF;

  -- Draft fixture
  INSERT INTO webproc.processos (
    cliente_id, created_by, status, dt_fatal, instrucao, n_processo
  )
  VALUES (
    v_cliente_id,
    v_user_a,
    'EM_PREENCHIMENTO',
    pg_temp.proto_gov1_dt_fatal_future(),
    'Harness cancel draft',
    'GOV1-DRAFT-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_draft;

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_draft, 'LINK', 'https://example.com/gov1-draft', v_user_a);

  -- Pending fixture (draft -> protocolar)
  INSERT INTO webproc.processos (
    cliente_id, created_by, status, dt_fatal, instrucao, n_processo
  )
  VALUES (
    v_cliente_id,
    v_user_a,
    'EM_PREENCHIMENTO',
    pg_temp.proto_gov1_dt_fatal_future(),
    'Harness cancel pending',
    'GOV1-PEND-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_pending;

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_pending, 'LINK', 'https://example.com/gov1-pending', v_user_a);

  -- IMPORTADO fixture (invalid for cancel; harness-only status seed)
  INSERT INTO webproc.processos (
    cliente_id, created_by, status, dt_fatal, instrucao, n_processo
  )
  VALUES (
    v_cliente_id,
    v_user_a,
    'EM_PREENCHIMENTO',
    pg_temp.proto_gov1_dt_fatal_future(),
    'Harness no cancel',
    'GOV1-IMP-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_importado;

  PERFORM set_config('webproc.internal_status_transition', 'true', true);
  UPDATE webproc.processos
  SET status = 'IMPORTADO', importado_at = now()
  WHERE id_proc = v_id_importado;

  PERFORM pg_temp.proto_gov1_begin_authenticated(v_user_a);

  v_cancel := webproc.protocolar_processo(v_id_pending);
  IF (v_cancel ->> 'success') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Harness setup failed: protocolar pending fixture: %', v_cancel::text;
  END IF;

  -- A: NULL motivo
  BEGIN
    v_cancel := webproc.cancelar_processo(v_id_draft, NULL);
    PERFORM pg_temp.proto_gov1_assert('A', false, 'NULL motivo should raise');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.proto_gov1_assert(
        'A',
        v_err LIKE '%cancelamento_motivo_obrigatorio%',
        v_err
      );
  END;

  -- B: empty string
  BEGIN
    v_cancel := webproc.cancelar_processo(v_id_draft, '');
    PERFORM pg_temp.proto_gov1_assert('B', false, 'empty motivo should raise');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.proto_gov1_assert(
        'B',
        v_err LIKE '%cancelamento_motivo_obrigatorio%',
        v_err
      );
  END;

  -- C: whitespace only
  BEGIN
    v_cancel := webproc.cancelar_processo(v_id_draft, '   ');
    PERFORM pg_temp.proto_gov1_assert('C', false, 'whitespace motivo should raise');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.proto_gov1_assert(
        'C',
        v_err LIKE '%cancelamento_motivo_obrigatorio%',
        v_err
      );
  END;

  -- D: valid motivo EM_PREENCHIMENTO -> CANCELADO
  v_cancel := webproc.cancelar_processo(v_id_draft, '  Motivo draft válido  ');
  SELECT * INTO v_row FROM webproc.processos WHERE id_proc = v_id_draft;
  PERFORM pg_temp.proto_gov1_assert(
    'D',
    (v_cancel ->> 'success') = 'true'
      AND v_row.status = 'CANCELADO'
      AND v_row.motivo_cancelamento = 'Motivo draft válido'
      AND v_row.status_antes_cancelamento = 'EM_PREENCHIMENTO'
      AND v_row.cancelado_por = v_user_a
      AND v_row.cancelado_at IS NOT NULL
      AND v_row.dt_fatal IS NOT NULL
      AND v_row.origem_cancelamento = 'WEBPROC',
    format(
      'status=%s motivo=%s antes=%s',
      v_row.status,
      v_row.motivo_cancelamento,
      v_row.status_antes_cancelamento
    )
  );

  v_dt_snapshot_at_cancel := v_row.dt_fatal;

  -- E: valid motivo PENDENTE -> CANCELADO
  v_cancel := webproc.cancelar_processo(v_id_pending, 'Motivo pendente');
  SELECT * INTO v_row FROM webproc.processos WHERE id_proc = v_id_pending;
  PERFORM pg_temp.proto_gov1_assert(
    'E',
    (v_cancel ->> 'success') = 'true'
      AND v_row.status = 'CANCELADO'
      AND v_row.motivo_cancelamento = 'Motivo pendente'
      AND v_row.status_antes_cancelamento = 'PENDENTE',
    format('status=%s antes=%s', v_row.status, v_row.status_antes_cancelamento)
  );

  -- F: reason persisted (covered in D/E; explicit)
  PERFORM pg_temp.proto_gov1_assert(
    'F',
    EXISTS (
      SELECT 1
      FROM webproc.processos p
      WHERE p.id_proc IN (v_id_draft, v_id_pending)
        AND p.motivo_cancelamento IS NOT NULL
        AND trim(p.motivo_cancelamento) <> ''
    ),
    'motivo_cancelamento missing on cancelled rows'
  );

  -- G: unauthorized caller (user B, creator A)
  EXECUTE 'RESET ROLE';
  INSERT INTO webproc.processos (
    cliente_id, created_by, status, dt_fatal, instrucao, n_processo
  )
  VALUES (
    v_cliente_id,
    v_user_a,
    'EM_PREENCHIMENTO',
    pg_temp.proto_gov1_dt_fatal_future(),
    'Harness other user cancel',
    'GOV1-OTHER-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_other;

  PERFORM pg_temp.proto_gov1_begin_authenticated(v_user_b);

  BEGIN
    v_cancel := webproc.cancelar_processo(v_id_other, 'Tentativa não autorizada');
    PERFORM pg_temp.proto_gov1_assert('G', false, 'non-creator should be denied');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.proto_gov1_assert(
        'G',
        v_err LIKE '%not_process_creator%',
        v_err
      );
  END;

  PERFORM pg_temp.proto_gov1_begin_authenticated(v_user_a);

  -- H: invalid lifecycle IMPORTADO
  BEGIN
    v_cancel := webproc.cancelar_processo(v_id_importado, 'Não deve cancelar importado');
    PERFORM pg_temp.proto_gov1_assert('H', false, 'IMPORTADO cancel should raise');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.proto_gov1_assert(
        'H',
        v_err LIKE '%invalid_status_for_cancelar%',
        v_err
      );
  END;

  -- I: CANCELADO row — dt_fatal cannot change via CLIENT write paths
  PERFORM pg_temp.proto_gov1_begin_authenticated(v_user_a);

  SELECT * INTO v_row FROM webproc.processos WHERE id_proc = v_id_draft;

  BEGIN
    v_save := webproc.salvar_rascunho(
      v_id_draft,
      coalesce(v_row.n_processo, ''),
      coalesce(v_row.exec_prov, ''),
      coalesce(v_row.reclamante, ''),
      coalesce(v_row.reclamado, ''),
      coalesce(v_row.instrucao, ''),
      coalesce(v_row.obs, ''),
      pg_temp.proto_gov1_dt_fatal_future() + interval '14 days'
    );
    PERFORM pg_temp.proto_gov1_assert('I', false, 'salvar_rascunho on CANCELADO should raise');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      PERFORM pg_temp.proto_gov1_assert(
        'I',
        v_err LIKE '%invalid_status_for_save%',
        'salvar_rascunho: ' || v_err
      );
  END;

  UPDATE webproc.processos
  SET dt_fatal = pg_temp.proto_gov1_dt_fatal_future() + interval '21 days'
  WHERE id_proc = v_id_draft;

  GET DIAGNOSTICS v_update_count = ROW_COUNT;

  SELECT dt_fatal INTO v_dt_after_mutations
  FROM webproc.processos
  WHERE id_proc = v_id_draft;

  PERFORM pg_temp.proto_gov1_assert(
    'I-update',
    v_update_count = 0
      AND v_dt_after_mutations = v_dt_snapshot_at_cancel,
    format(
      'update_rows=%s dt_fatal_now=%s dt_fatal_at_cancel=%s',
      v_update_count,
      v_dt_after_mutations,
      v_dt_snapshot_at_cancel
    )
  );
END;
$$;

DO $$
DECLARE
  v_failed integer;
  r record;
BEGIN
  SELECT count(*) INTO v_failed FROM proto_gov1_assertions WHERE NOT passed;
  IF v_failed > 0 THEN
    FOR r IN SELECT case_id, detail FROM proto_gov1_assertions WHERE NOT passed ORDER BY case_id LOOP
      RAISE NOTICE 'FAIL %: %', r.case_id, r.detail;
    END LOOP;
    RAISE EXCEPTION 'PROTO-GOV.1 harness: % case(s) failed', v_failed;
  END IF;
  RAISE NOTICE 'PROTO-GOV.1 harness: all cases passed';
END;
$$;

ROLLBACK;
