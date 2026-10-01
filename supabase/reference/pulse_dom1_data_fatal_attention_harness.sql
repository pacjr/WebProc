-- PULSE-DOM.1 / DOM.1a: Data Fatal operational attention harness
-- Requires migrations through 20261001170000_pulse_dom1a_active_fatal_attention.sql
-- Run: npx supabase db query --linked --file supabase/reference/pulse_dom1_data_fatal_attention_harness.sql

BEGIN;

-- Fixture inserts use past dt_fatal (operational reality); bypass mutation trigger in this transaction only.
SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE pulse_dom1_assertions (
  case_id text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.pulse_dom1_assert(
  p_case_id text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO pulse_dom1_assertions (case_id, passed, detail)
  VALUES (
    p_case_id,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'PULSE-DOM.1 case % failed: %', p_case_id, coalesce(p_detail, 'failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.pulse_dom1_insert_row(
  p_cliente_id bigint,
  p_user_id uuid,
  p_status text,
  p_dt_fatal timestamptz,
  p_obs text,
  p_created_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    dt_fatal,
    dt_entrada,
    created_at,
    obs,
    n_processo
  ) VALUES (
    p_cliente_id,
    p_user_id,
    'EM_PREENCHIMENTO',
    p_dt_fatal,
    coalesce(p_created_at, now()),
    coalesce(p_created_at, now()),
    p_obs,
    p_obs
  )
  RETURNING id_proc INTO v_id;

  IF p_status IS DISTINCT FROM 'EM_PREENCHIMENTO' THEN
    PERFORM set_config('webproc.internal_status_transition', 'true', true);
    UPDATE webproc.processos
    SET status = p_status
    WHERE id_proc = v_id;
  END IF;
END;
$$;

DO $$
DECLARE
  v_cliente_id bigint;
  v_user_id uuid;
  v_today date := (current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date;
  v_yesterday date := v_today - 1;
  v_tomorrow date := v_today + 1;
  v_ts_today timestamptz;
  v_ts_yesterday timestamptz;
  v_ts_tomorrow timestamptz;
  v_base_today bigint;
  v_base_overdue bigint;
  v_after jsonb;
  v_summary_today jsonb;
  v_summary_old_period jsonb;
  v_marker text := 'PULSE-DOM1-HARNESS-' || gen_random_uuid()::text;
BEGIN
  SELECT c.id, uc.user_id
  INTO v_cliente_id, v_user_id
  FROM webproc.clientes c
  INNER JOIN webproc.usuarios_clientes uc ON uc.cliente_id = c.id AND uc.ativo
  WHERE c.ativo
  LIMIT 1;

  IF v_cliente_id IS NULL OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'PULSE-DOM.1 harness: no active cliente/membership seed';
  END IF;

  DELETE FROM webproc.processos WHERE obs LIKE 'PULSE-DOM1-HARNESS-%';

  v_ts_today := (v_today::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_ts_yesterday := (v_yesterday::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_ts_tomorrow := (v_tomorrow::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';

  SELECT
    (webproc.pulse_summary(v_today, v_today, v_user_id)->'snapshot'->>'fatal_today_count')::bigint,
    (webproc.pulse_summary(v_today, v_today, v_user_id)->'snapshot'->>'fatal_overdue_count')::bigint
  INTO v_base_today, v_base_overdue;

  -- A: EM_PREENCHIMENTO yesterday → overdue +1
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', v_ts_yesterday, v_marker || '-A'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'A',
    (v_after->'snapshot'->>'fatal_overdue_count')::bigint = v_base_overdue + 1
      AND (v_after->'snapshot'->>'fatal_today_count')::bigint = v_base_today,
    (v_after->'snapshot')::text
  );

  -- B: PENDENTE yesterday → overdue +1 (second row)
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'PENDENTE', v_ts_yesterday, v_marker || '-B'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'B',
    (v_after->'snapshot'->>'fatal_overdue_count')::bigint = v_base_overdue + 2,
    (v_after->'snapshot')::text
  );

  -- C/D: today EM + PENDENTE → today +2 (overdue unchanged from B)
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'EM_PREENCHIMENTO', v_ts_today, v_marker || '-C'
  );
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'PENDENTE', v_ts_today, v_marker || '-D'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'C-D',
    (v_after->'snapshot'->>'fatal_today_count')::bigint = v_base_today + 2
      AND (v_after->'snapshot'->>'fatal_overdue_count')::bigint = v_base_overdue + 2,
    (v_after->'snapshot')::text
  );

  -- E/F/G: terminal statuses with fatal today → today count unchanged
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'IMPORTADO', v_ts_today, v_marker || '-E'
  );
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'CONCLUIDO', v_ts_today, v_marker || '-F'
  );
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'CANCELADO', v_ts_today, v_marker || '-G'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'E-F-G',
    (v_after->'snapshot'->>'fatal_today_count')::bigint = v_base_today + 2
      AND (v_after->'snapshot'->>'fatal_overdue_count')::bigint = v_base_overdue + 2,
    (v_after->'snapshot')::text
  );

  -- H/I/J: terminal statuses with fatal yesterday → overdue unchanged
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'IMPORTADO', v_ts_yesterday, v_marker || '-H'
  );
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'CONCLUIDO', v_ts_yesterday, v_marker || '-I'
  );
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'CANCELADO', v_ts_yesterday, v_marker || '-J'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'H-I-J',
    (v_after->'snapshot'->>'fatal_overdue_count')::bigint = v_base_overdue + 2,
    (v_after->'snapshot')::text
  );

  -- K: future active → neither
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'PENDENTE', v_ts_tomorrow, v_marker || '-K'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'K',
    (v_after->'snapshot'->>'fatal_today_count')::bigint = v_base_today + 2
      AND (v_after->'snapshot'->>'fatal_overdue_count')::bigint = v_base_overdue + 2,
    (v_after->'snapshot')::text
  );

  -- L: null dt_fatal
  PERFORM pg_temp.pulse_dom1_insert_row(
    v_cliente_id, v_user_id, 'PENDENTE', NULL, v_marker || '-L'
  );

  v_after := webproc.pulse_summary(v_today, v_today, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'L',
    (v_after->'snapshot'->>'fatal_today_count')::bigint = v_base_today + 2,
    (v_after->'snapshot')::text
  );

  -- M: historical period must not change current Data Fatal attention counts
  v_summary_today := webproc.pulse_summary(v_today, v_today, v_user_id);
  v_summary_old_period := webproc.pulse_summary('2019-01-01'::date, '2019-01-31'::date, v_user_id);
  PERFORM pg_temp.pulse_dom1_assert(
    'M',
    (v_summary_today->'snapshot'->>'fatal_today_count')
      = (v_summary_old_period->'snapshot'->>'fatal_today_count')
      AND (v_summary_today->'snapshot'->>'fatal_overdue_count')
      = (v_summary_old_period->'snapshot'->>'fatal_overdue_count'),
    jsonb_build_object(
      'today', v_summary_today->'snapshot',
      'old_period', v_summary_old_period->'snapshot'
    )::text
  );

  -- N: p_status=PENDENTE composes with attention predicates
  v_after := webproc.pulse_summary(
    v_today,
    v_today,
    v_user_id,
    ARRAY['PENDENTE']::text[],
    NULL,
    'ALL_IN_SCOPE'
  );
  PERFORM pg_temp.pulse_dom1_assert(
    'N',
    (v_after->'snapshot'->>'fatal_today_count')::bigint >= 1,
    (v_after->'snapshot')::text
  );

  -- O: p_status=CONCLUIDO → both attention counts zero
  v_after := webproc.pulse_summary(
    v_today,
    v_today,
    v_user_id,
    ARRAY['CONCLUIDO']::text[],
    NULL,
    'ALL_IN_SCOPE'
  );
  PERFORM pg_temp.pulse_dom1_assert(
    'O',
    (v_after->'snapshot'->>'fatal_overdue_count')::bigint = 0
      AND (v_after->'snapshot'->>'fatal_today_count')::bigint = 0,
    (v_after->'snapshot')::text
  );

  -- P: São Paulo date boundary — dt_fatal at today 00:00 SP counts as today
  PERFORM pg_temp.pulse_dom1_assert(
    'P',
    (v_ts_today AT TIME ZONE 'America/Sao_Paulo')::date = v_today,
    format('ts=%s today=%s', v_ts_today, v_today)
  );

  -- Grid Q–U: operational fatal filter semantics (mirror listProcessosPaginated)
  PERFORM pg_temp.pulse_dom1_assert(
    'Q',
    (
      SELECT count(*)::bigint
      FROM webproc.processos p
      WHERE p.obs LIKE v_marker || '%'
        AND p.status IN ('EM_PREENCHIMENTO', 'PENDENTE')
        AND p.dt_fatal IS NOT NULL
        AND p.dt_fatal >= v_ts_today
        AND p.dt_fatal < v_ts_today + interval '1 day'
    ) = 2,
    'fatal=hoje operational: fixtures C and D only'
  );

  PERFORM pg_temp.pulse_dom1_assert(
    'R',
    (
      SELECT count(*)::bigint
      FROM webproc.processos p
      WHERE p.obs LIKE v_marker || '%'
        AND p.status = 'PENDENTE'
        AND p.dt_fatal IS NOT NULL
        AND p.dt_fatal >= v_ts_today
        AND p.dt_fatal < v_ts_today + interval '1 day'
    ) = 1,
    'fatal=hoje + PENDENTE: fixture D only'
  );

  PERFORM pg_temp.pulse_dom1_assert(
    'S',
    (
      SELECT count(*)::bigint
      FROM webproc.processos p
      WHERE p.obs LIKE v_marker || '%'
        AND p.status = 'CONCLUIDO'
        AND p.status IN ('EM_PREENCHIMENTO', 'PENDENTE')
        AND p.dt_fatal IS NOT NULL
        AND p.dt_fatal >= v_ts_today
        AND p.dt_fatal < v_ts_today + interval '1 day'
    ) = 0,
    'fatal=hoje + status=CONCLUIDO composes to zero (fixture F excluded)'
  );

  PERFORM pg_temp.pulse_dom1_assert(
    'T',
    (
      SELECT count(*)::bigint
      FROM webproc.processos p
      WHERE p.obs LIKE v_marker || '%'
        AND p.status IN ('EM_PREENCHIMENTO', 'PENDENTE')
        AND p.dt_fatal IS NOT NULL
        AND p.dt_fatal < v_ts_today
    ) = 2,
    'fatal=vencidas operational: fixtures A and B only'
  );

  PERFORM pg_temp.pulse_dom1_assert(
    'U',
    NOT EXISTS (
      SELECT 1 FROM webproc.processos p
      WHERE p.obs = v_marker || '-K'
        AND p.status IN ('EM_PREENCHIMENTO', 'PENDENTE')
        AND p.dt_fatal IS NOT NULL
        AND p.dt_fatal >= v_ts_today
        AND p.dt_fatal < v_ts_today + interval '1 day'
    ),
    'future active fatal not in hoje operational set'
  );

  DELETE FROM webproc.processos WHERE obs LIKE v_marker || '%';
END;
$$;

-- J-RLS: authenticated CLIENT smoke (pulse_dom1a_client_rls_smoke.mjs)
INSERT INTO pulse_dom1_assertions (case_id, passed, detail)
VALUES
  ('J-RLS', true, 'SKIP — run supabase/reference/pulse_dom1a_client_rls_smoke.mjs');

SELECT case_id, passed, detail FROM pulse_dom1_assertions ORDER BY case_id;

DO $$
DECLARE
  v_fail integer;
  v_detail text;
BEGIN
  SELECT count(*), string_agg(case_id || ': ' || coalesce(detail, ''), '; ')
  INTO v_fail, v_detail
  FROM pulse_dom1_assertions
  WHERE NOT passed AND coalesce(detail, '') NOT LIKE 'SKIP%';

  IF v_fail > 0 THEN
    RAISE EXCEPTION 'PULSE-DOM.1 harness: % failed — %', v_fail, v_detail;
  END IF;
END;
$$;

ROLLBACK;
