-- WP-04C.2b: ACTUS PULSE read-layer validation harness
-- Requires migrations through 20260329140000_wp04c_pulse_read_layer.sql
-- Run inside a transaction; rolls back fixture mutations.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp04c_pulse_validation_harness.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE wp04c_pulse_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.wp04c_pulse_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp04c_pulse_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'WP04C-Pulse case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

-- 20: SP period bounds half-open
DO $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  SELECT period_start_ts, period_end_exclusive_ts
  INTO v_start, v_end
  FROM webproc.pulse_period_bounds('2026-03-01'::date, '2026-03-01'::date);

  PERFORM pg_temp.wp04c_pulse_assert(
    20,
    'period bounds single day half-open',
    v_end > v_start
      AND (v_start AT TIME ZONE 'America/Sao_Paulo')::date = '2026-03-01'::date,
    format('start=%s end=%s', v_start, v_end)
  );
END;
$$;

-- 21: daily series zero-filled day count
DO $$
DECLARE
  v_days integer;
BEGIN
  SELECT count(*)::integer INTO v_days
  FROM webproc.pulse_daily_series('2026-03-01'::date, '2026-03-03'::date);

  PERFORM pg_temp.wp04c_pulse_assert(
    21,
    'daily series returns zero-filled calendar days',
    v_days = 3,
    format('expected 3 days got %s', v_days)
  );
END;
$$;

-- 22: author identity cannot resolve without visible process (no JWT — expect unknown)
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT display_name INTO v_name
  FROM webproc.pulse_author_identity('00000000-0000-0000-0000-000000000001'::uuid, 1);

  PERFORM pg_temp.wp04c_pulse_assert(
    22,
    'author identity blocked without authorized process context',
    v_name = 'Usuário desconhecido',
    coalesce(v_name, 'null')
  );
END;
$$;

-- 23: pulse_by_client rejects non-Actus (no auth context — expect exception)
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM webproc.pulse_by_client(
      'REGISTERED',
      '2026-01-01'::date,
      '2026-12-31'::date
    );
    PERFORM pg_temp.wp04c_pulse_assert(23, 'pulse_by_client actus-only guard', false, 'expected exception');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04c_pulse_assert(
        23,
        'pulse_by_client actus-only guard',
        SQLERRM LIKE '%pulse_by_client_actus_only%',
        SQLERRM
      );
  END;
END;
$$;

-- 24: PUBLIC cannot execute pulse_summary (revoke check)
DO $$
DECLARE
  v_can boolean;
BEGIN
  SELECT has_function_privilege(
    'public',
    'webproc.pulse_summary(date, date, uuid, text[], bigint, text)',
    'EXECUTE'
  ) INTO v_can;

  PERFORM pg_temp.wp04c_pulse_assert(
    24,
    'PUBLIC cannot execute pulse_summary',
    NOT v_can,
    v_can::text
  );
END;
$$;

-- 25: authenticated cannot execute pulse_filtered_processes (no direct SETOF RPC)
DO $$
DECLARE
  v_can boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'webproc.pulse_filtered_processes(date, date, uuid, text[], bigint)',
    'EXECUTE'
  ) INTO v_can;

  PERFORM pg_temp.wp04c_pulse_assert(
    25,
    'authenticated cannot execute pulse_filtered_processes',
    NOT v_can,
    v_can::text
  );
END;
$$;

-- 26: internal helpers not granted to authenticated (except author resolver chain)
DO $$
DECLARE
  v_period boolean;
  v_assert boolean;
BEGIN
  SELECT has_function_privilege(
    'authenticated',
    'webproc.pulse_period_bounds(date, date)',
    'EXECUTE'
  ) INTO v_period;

  SELECT has_function_privilege(
    'authenticated',
    'webproc.pulse_assert_cliente_filter_allowed(bigint)',
    'EXECUTE'
  ) INTO v_assert;

  PERFORM pg_temp.wp04c_pulse_assert(
    26,
    'authenticated cannot execute pulse_period_bounds or pulse_assert_cliente_filter_allowed',
    NOT v_period AND NOT v_assert,
    format('period=%s assert=%s', v_period, v_assert)
  );
END;
$$;

-- 27: PUBLIC cannot execute any Pulse public RPC
DO $$
DECLARE
  v_can boolean;
BEGIN
  SELECT bool_or(has_function_privilege('public', p.oid, 'EXECUTE'))
  INTO v_can
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'webproc'
    AND p.proname IN (
      'pulse_summary',
      'pulse_daily_series',
      'pulse_by_user',
      'pulse_by_client',
      'pulse_drilldown'
    );

  PERFORM pg_temp.wp04c_pulse_assert(
    27,
    'PUBLIC cannot execute Pulse public RPCs',
    NOT coalesce(v_can, false),
    coalesce(v_can, false)::text
  );
END;
$$;

-- 28: drilldown rejects partial cursor (one of pair set)
DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM webproc.pulse_drilldown(
      '2026-01-01'::date,
      '2026-12-31'::date,
      NULL,
      NULL,
      NULL,
      'REGISTERED',
      25,
      now(),
      NULL
    );
    PERFORM pg_temp.wp04c_pulse_assert(
      28,
      'pulse_drilldown rejects partial cursor',
      false,
      'expected pulse_invalid_drilldown_cursor'
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04c_pulse_assert(
        28,
        'pulse_drilldown rejects partial cursor',
        SQLERRM LIKE '%pulse_invalid_drilldown_cursor%',
        SQLERRM
      );
  END;
END;
$$;

-- 29: drilldown accepts both-null cursor (first page)
DO $$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*)::integer INTO v_rows
  FROM webproc.pulse_drilldown(
    '2026-01-01'::date,
    '2026-01-31'::date,
    NULL,
    NULL,
    NULL,
    'REGISTERED',
    5,
    NULL,
    NULL
  );

  PERFORM pg_temp.wp04c_pulse_assert(
    29,
    'pulse_drilldown accepts both-null cursor',
    v_rows >= 0,
    format('rows=%s', v_rows)
  );
END;
$$;

-- 30: drilldown accepts paired cursor (no exception)
DO $$
DECLARE
  v_rows integer;
BEGIN
  SELECT count(*)::integer INTO v_rows
  FROM webproc.pulse_drilldown(
    '2026-01-01'::date,
    '2026-01-31'::date,
    NULL,
    NULL,
    NULL,
    'REGISTERED',
    5,
    '2099-01-01 00:00:00+00'::timestamptz,
    9223372036854775807
  );

  PERFORM pg_temp.wp04c_pulse_assert(
    30,
    'pulse_drilldown accepts paired cursor',
    v_rows >= 0,
    format('rows=%s', v_rows)
  );
END;
$$;

-- Report
DO $$
DECLARE
  v_fail integer;
BEGIN
  SELECT count(*) INTO v_fail FROM wp04c_pulse_assertions WHERE NOT passed;
  RAISE NOTICE 'WP04C Pulse harness: % failures', v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'WP04C Pulse harness reported % failing case(s)', v_fail;
  END IF;
END;
$$;

ROLLBACK;
