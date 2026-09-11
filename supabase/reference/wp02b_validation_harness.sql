-- WP-02B validation harness
-- Requires: local Supabase with all migrations applied (through 20260307270000).
-- Run: supabase/reference/run_wp02b_validation.sh
-- Or:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp02b_validation_harness.sql
--
-- Temporal note: a deadline may not be newly declared in the past, but a
-- previously valid deadline may naturally become historical and remains a
-- valid operational fact that must not block protocolization.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE wp02b_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.wp02b_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp02b_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );

  IF NOT p_condition THEN
    RAISE WARNING 'WP02B case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_today_sp()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (timezone('America/Sao_Paulo', now()))::date;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_dt_fatal_for_business_date(p_deadline date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_deadline::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.wp02b_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_reset_auth_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_cliente_a bigint;
  v_cliente_b bigint;
BEGIN
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at
  )
  VALUES
    (
      v_user_a,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp02b-user-a@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      now(),
      now()
    ),
    (
      v_user_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp02b-user-b@example.com',
      crypt('password', gen_salt('bf')),
      now(),
      now(),
      now()
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990001, 'WP02B Client A');

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990002, 'WP02B Client B');

  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;
  SELECT id INTO v_cliente_b FROM webproc.clientes WHERE codigo_cliente = 990002;

  INSERT INTO webproc.usuarios_clientes (cliente_id, user_id, email, ativo)
  VALUES
    (v_cliente_a, v_user_a, 'wp02b-user-a@example.com', true),
    (v_cliente_b, v_user_b, 'wp02b-user-b@example.com', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 1: PROCESS_CREATED on direct INSERT
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_count integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);

  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status)
  VALUES (v_cliente_id, v_user, 'EM_PREENCHIMENTO')
  RETURNING id_proc INTO v_id_proc;

  SELECT count(*) INTO v_count
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'PROCESS_CREATED';

  PERFORM pg_temp.wp02b_assert(1, 'PROCESS_CREATED on direct INSERT', v_count = 1, 'expected 1 event');
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 2: D+1 initial situation + intervention
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_today date := pg_temp.wp02b_today_sp();
  v_business date := v_today;
  v_situation_count integer;
  v_intervention_count integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_today + 1)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT count(*) INTO v_situation_count
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc
    AND s.lifecycle_state = 'ACTIVE'
    AND s.situation_type = 'DEADLINE_APPROACHING_NOT_RELEASED'
    AND s.temporal_state = 'D+1';

  SELECT count(*) INTO v_intervention_count
  FROM webproc.operacional_intervencoes i
  INNER JOIN webproc.operacional_situacoes s ON s.situation_id = i.situation_id
  WHERE s.id_proc = v_id_proc
    AND s.lifecycle_state = 'ACTIVE';

  PERFORM pg_temp.wp02b_assert(
    2,
    'D+1 initial situation + intervention',
    v_situation_count = 1 AND v_intervention_count = 1,
    format('situations=%s interventions=%s', v_situation_count, v_intervention_count)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 3: D+1 repeated evaluation idempotency
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_today date := pg_temp.wp02b_today_sp();
  v_business date := v_today;
  v_active integer;
  v_material integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_today + 1)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);
  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT count(*) INTO v_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  SELECT count(*) INTO v_material
  FROM webproc.operacional_situacao_mudancas c
  WHERE c.id_proc = v_id_proc;

  PERFORM pg_temp.wp02b_assert(
    3,
    'D+1 repeated evaluation idempotency',
    v_active = 1 AND v_material = 1,
    format('active=%s material=%s', v_active, v_material)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 4: D+1 -> D0 calendar transition (same situation_id)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_today date := pg_temp.wp02b_today_sp();
  v_business_dplus1 date := v_today;
  v_business_d0 date := v_today + 1;
  v_first uuid;
  v_second uuid;
  v_changes integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business_d0)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business_dplus1);

  SELECT s.situation_id INTO v_first
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business_d0);

  SELECT s.situation_id INTO v_second
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  SELECT count(*) INTO v_changes
  FROM webproc.operacional_situacao_mudancas c
  WHERE c.id_proc = v_id_proc
    AND c.change_type = 'TEMPORAL_STATE_CHANGED';

  PERFORM pg_temp.wp02b_assert(
    4,
    'D+1 -> D0 calendar transition same situation_id',
    v_first = v_second AND v_changes = 1,
    format('first=%s second=%s changes=%s', v_first, v_second, v_changes)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 5: D0 -> EXPIRED
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_today date := pg_temp.wp02b_today_sp();
  v_deadline date := v_today;
  v_business_d0 date := v_today;
  v_business_exp date := v_today + 1;
  v_resolved integer;
  v_expired_active integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_deadline)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business_d0);
  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business_exp);

  SELECT count(*) INTO v_resolved
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc
    AND s.situation_type = 'DEADLINE_APPROACHING_NOT_RELEASED'
    AND s.lifecycle_state = 'RESOLVED'
    AND s.resolution_reason = 'DEADLINE_EXPIRED';

  SELECT count(*) INTO v_expired_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc
    AND s.situation_type = 'DEADLINE_EXPIRED_NOT_RELEASED'
    AND s.lifecycle_state = 'ACTIVE'
    AND s.temporal_state = 'EXPIRED';

  PERFORM pg_temp.wp02b_assert(
    5,
    'D0 -> EXPIRED transition',
    v_resolved = 1 AND v_expired_active = 1,
    format('resolved=%s expired_active=%s', v_resolved, v_expired_active)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 6: DEADLINE_CHANGED D0 -> D0 (new occurrence)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_business date := pg_temp.wp02b_today_sp();
  v_old timestamptz := pg_temp.wp02b_dt_fatal_for_business_date(v_business);
  v_new timestamptz := pg_temp.wp02b_dt_fatal_for_business_date(v_business) + interval '6 hours';
  v_first uuid;
  v_second uuid;
  v_result jsonb;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (v_cliente_id, v_user, 'EM_PREENCHIMENTO', v_old)
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT s.situation_id INTO v_first
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  SELECT webproc.salvar_rascunho(
    v_id_proc, 'NP-1', NULL, NULL, NULL, 'instrucao', NULL, v_new
  ) INTO v_result;

  SELECT s.situation_id INTO v_second
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  PERFORM pg_temp.wp02b_assert(
    6,
    'DEADLINE_CHANGED D0 -> D0 new occurrence',
    (v_result ->> 'success') = 'true'
      AND v_first IS NOT NULL
      AND v_second IS NOT NULL
      AND v_first <> v_second,
    format('first=%s second=%s', v_first, v_second)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 7: DEADLINE_CHANGED -> NULL
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_business date := pg_temp.wp02b_today_sp();
  v_result jsonb;
  v_active integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT webproc.salvar_rascunho(
    v_id_proc, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  ) INTO v_result;

  SELECT count(*) INTO v_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  PERFORM pg_temp.wp02b_assert(
    7,
    'DEADLINE_CHANGED -> NULL resolves without new occurrence',
    (v_result ->> 'success') = 'true' AND v_active = 0,
    format('active=%s', v_active)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 8: salvar_rascunho moving into D0 (ACT + intervention)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_business date := pg_temp.wp02b_today_sp();
  v_result jsonb;
  v_opa text;
  v_alert boolean;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status)
  VALUES (v_cliente_id, v_user, 'EM_PREENCHIMENTO')
  RETURNING id_proc INTO v_id_proc;

  SELECT webproc.salvar_rascunho(
    v_id_proc,
    'NP-2',
    NULL,
    NULL,
    NULL,
    'instr',
    NULL,
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  ) INTO v_result;

  v_opa := v_result #>> '{operational,opa}';
  v_alert := coalesce((v_result #>> '{operational,alert_available}')::boolean, false);

  PERFORM pg_temp.wp02b_assert(
    8,
    'salvar_rascunho into D0 synchronous ACT + intervention',
    (v_result ->> 'success') = 'true' AND v_opa = 'ACT' AND v_alert,
    format('opa=%s alert=%s', v_opa, v_alert)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cases 9-10: protocolar + idempotent retry
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_today date := pg_temp.wp02b_today_sp();
  v_business date := v_today;
  v_result jsonb;
  v_events integer;
  v_active integer;
  v_retry jsonb;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (
    cliente_id, created_by, status, n_processo, instrucao, dt_fatal
  )
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    'NP-PROTO',
    'instrucao',
    pg_temp.wp02b_dt_fatal_for_business_date(v_today + 1)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/doc', v_user);

  SELECT webproc.protocolar_processo(v_id_proc) INTO v_result;

  SELECT count(*) INTO v_events
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc AND e.event_type = 'PROTOCOLIZED';

  SELECT count(*) INTO v_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  PERFORM pg_temp.wp02b_assert(
    9,
    'protocolar records event and resolves active situations',
    (v_result ->> 'success') = 'true' AND v_events = 1 AND v_active = 0,
    format('events=%s active=%s', v_events, v_active)
  );

  SELECT webproc.protocolar_processo(v_id_proc) INTO v_retry;

  SELECT count(*) INTO v_events
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc AND e.event_type = 'PROTOCOLIZED';

  PERFORM pg_temp.wp02b_assert(
    10,
    'protocolar idempotent retry without duplicate event',
    (v_retry ->> 'already_protocolado') = 'true' AND v_events = 1,
    format('events=%s', v_events)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 11: reabrir at D0 creates new occurrence
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_business date := pg_temp.wp02b_today_sp();
  v_before uuid;
  v_after uuid;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (
    cliente_id, created_by, status, n_processo, instrucao, dt_fatal
  )
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    'NP-REOPEN',
    'instrucao',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT s.situation_id INTO v_before
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/reopen', v_user);

  PERFORM webproc.protocolar_processo(v_id_proc);
  PERFORM webproc.reabrir_processo(v_id_proc);

  SELECT s.situation_id INTO v_after
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  PERFORM pg_temp.wp02b_assert(
    11,
    'reabrir at D0 creates new occurrence',
    v_before IS NOT NULL AND v_after IS NOT NULL AND v_before <> v_after,
    format('before=%s after=%s', v_before, v_after)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 12: 20 repeated evaluations without redundant material changes
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_business date := pg_temp.wp02b_today_sp();
  i integer;
  v_active integer;
  v_material integer;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  FOR i IN 1..20 LOOP
    PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);
  END LOOP;

  SELECT count(*) INTO v_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc AND s.lifecycle_state = 'ACTIVE';

  SELECT count(*) INTO v_material
  FROM webproc.operacional_situacao_mudancas c
  WHERE c.id_proc = v_id_proc;

  PERFORM pg_temp.wp02b_assert(
    12,
    '20 repeated evaluations single occurrence',
    v_active = 1 AND v_material = 1,
    format('active=%s material=%s', v_active, v_material)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 13: long-expired draft included in batch candidate logic
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_declare_day date := webproc_private.business_date();
  v_deadline date := v_declare_day + 1;
  v_long_expired_day date := v_deadline + 30;
  v_dt_fatal timestamptz;
  v_candidate boolean;
  v_batch jsonb;
  v_expired_active integer;
  v_temporal text;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  v_dt_fatal := pg_temp.wp02b_dt_fatal_for_business_date(v_deadline);

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    v_dt_fatal
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_declare_day);
  PERFORM webproc_private.operational_situations_process(v_id_proc, v_long_expired_day);

  SELECT count(*) INTO v_expired_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc
    AND s.situation_type = 'DEADLINE_EXPIRED_NOT_RELEASED'
    AND s.lifecycle_state = 'ACTIVE'
    AND s.temporal_state = 'EXPIRED';

  v_temporal := webproc_private.compute_not_released_temporal_state(
    'EM_PREENCHIMENTO',
    v_dt_fatal,
    v_long_expired_day
  );

  SELECT EXISTS (
    SELECT 1
    FROM webproc.processos p
    WHERE p.id_proc = v_id_proc
      AND p.status = 'EM_PREENCHIMENTO'
      AND p.dt_fatal IS NOT NULL
      AND webproc_private.dt_fatal_business_date(p.dt_fatal) <= v_long_expired_day + 1
  ) INTO v_candidate;

  v_batch := webproc_private.evaluate_temporal_operational_batch(v_long_expired_day);

  PERFORM pg_temp.wp02b_assert(
    13,
    'long-expired draft in batch candidate set',
    v_candidate
      AND v_expired_active = 1
      AND v_temporal = 'EXPIRED'
      AND coalesce((v_batch ->> 'examined')::integer, 0) >= 1,
    format(
      'candidate=%s expired_active=%s temporal=%s batch=%s',
      v_candidate,
      v_expired_active,
      v_temporal,
      v_batch
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 14: RLS same-client read / cross-client denied
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_same_client integer;
  v_cross_client integer;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status)
  VALUES (v_cliente_a, v_user_a, 'EM_PREENCHIMENTO')
  RETURNING id_proc INTO v_id_proc;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);
  SELECT count(*) INTO v_same_client
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc;
  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_b);
  SELECT count(*) INTO v_cross_client
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc;
  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    14,
    'RLS same-client read allowed cross-client denied',
    v_same_client >= 1 AND v_cross_client = 0,
    format('same=%s cross=%s', v_same_client, v_cross_client)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 15: authenticated direct evidence DML denied
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_mutated boolean := false;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  SELECT p.id_proc
  INTO v_id_proc
  FROM webproc.processos p
  WHERE p.cliente_id = v_cliente_a
    AND p.created_by = v_user_a
  ORDER BY p.id_proc DESC
  LIMIT 1;

  IF v_id_proc IS NULL THEN
    INSERT INTO webproc.processos (cliente_id, created_by, status)
    VALUES (v_cliente_a, v_user_a, 'EM_PREENCHIMENTO')
    RETURNING id_proc INTO v_id_proc;
  END IF;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  BEGIN
    INSERT INTO webproc.operacional_eventos (
      id_proc,
      cliente_id,
      event_type,
      actor_user_id
    )
    VALUES (v_id_proc, v_cliente_a, 'PROCESS_CREATED', v_user_a);
    v_mutated := true;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_mutated := false;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_mutated := false;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    15,
    'authenticated cannot directly mutate evidence tables',
    NOT v_mutated,
    'direct insert unexpectedly succeeded'
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 16: presentation RPC semantics
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_business date := pg_temp.wp02b_today_sp();
  v_before integer;
  v_after integer;
  v_first timestamptz;
  v_last timestamptz;
  v_count integer;
  v_result jsonb;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal)
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT i.presentation_count INTO v_before
  FROM webproc.operacional_intervencoes i
  WHERE i.id_proc = v_id_proc
  LIMIT 1;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_business);

  SELECT i.presentation_count INTO v_after
  FROM webproc.operacional_intervencoes i
  WHERE i.id_proc = v_id_proc
  LIMIT 1;

  SELECT webproc.registrar_apresentacao_alerta(v_id_proc) INTO v_result;
  SELECT webproc.registrar_apresentacao_alerta(v_id_proc) INTO v_result;

  SELECT i.presentation_count, i.first_presented_at, i.last_presented_at
  INTO v_count, v_first, v_last
  FROM webproc.operacional_intervencoes i
  WHERE i.id_proc = v_id_proc
  LIMIT 1;

  PERFORM pg_temp.wp02b_assert(
    16,
    'presentation RPC increments without evaluator side effects',
    v_before = 0
      AND v_after = 0
      AND v_count = 2
      AND v_first IS NOT NULL
      AND v_last IS NOT NULL
      AND v_first <= v_last,
    format('before=%s after=%s count=%s', v_before, v_after, v_count)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 17: protocolize with naturally historical persisted dt_fatal
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_id bigint;
  v_id_proc bigint;
  v_today date := pg_temp.wp02b_today_sp();
  v_declared date := v_today + 1;
  v_declare_day date := v_today;
  v_expired_day date := v_today + 2;
  v_original_dt_fatal timestamptz;
  v_stored_dt_fatal timestamptz;
  v_result jsonb;
  v_expired_active integer;
  v_expired_resolved integer;
  v_events integer;
  v_temporal_at_expiry text;
BEGIN
  PERFORM pg_temp.wp02b_set_auth(v_user);
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = 990001;

  v_original_dt_fatal := pg_temp.wp02b_dt_fatal_for_business_date(v_declared);

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    n_processo,
    instrucao,
    dt_fatal
  )
  VALUES (
    v_cliente_id,
    v_user,
    'EM_PREENCHIMENTO',
    'NP-EXPIRED-PROTO',
    'instrucao valida',
    v_original_dt_fatal
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM webproc_private.operational_situations_process(v_id_proc, v_declare_day);
  PERFORM webproc_private.operational_situations_process(v_id_proc, v_expired_day);

  SELECT count(*) INTO v_expired_active
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc
    AND s.situation_type = 'DEADLINE_EXPIRED_NOT_RELEASED'
    AND s.lifecycle_state = 'ACTIVE'
    AND s.temporal_state = 'EXPIRED';

  v_temporal_at_expiry := webproc_private.compute_not_released_temporal_state(
    'EM_PREENCHIMENTO',
    v_original_dt_fatal,
    v_expired_day
  );

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/expired-proto', v_user);

  SELECT webproc.protocolar_processo(v_id_proc) INTO v_result;

  SELECT dt_fatal INTO v_stored_dt_fatal
  FROM webproc.processos
  WHERE id_proc = v_id_proc;

  SELECT count(*) INTO v_events
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'PROTOCOLIZED';

  SELECT count(*) INTO v_expired_resolved
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = v_id_proc
    AND s.situation_type = 'DEADLINE_EXPIRED_NOT_RELEASED'
    AND s.lifecycle_state = 'RESOLVED'
    AND s.resolution_reason = 'PROTOCOLIZED';

  PERFORM pg_temp.wp02b_assert(
    17,
    'protocolize allowed with naturally historical persisted dt_fatal',
    v_expired_active = 1
      AND v_temporal_at_expiry = 'EXPIRED'
      AND (v_result ->> 'success') = 'true'
      AND v_stored_dt_fatal = v_original_dt_fatal
      AND v_events = 1
      AND v_expired_resolved = 1,
    format(
      'expired_active=%s temporal=%s success=%s dt_fatal_unchanged=%s events=%s resolved=%s',
      v_expired_active,
      v_temporal_at_expiry,
      v_result ->> 'success',
      v_stored_dt_fatal = v_original_dt_fatal,
      v_events,
      v_expired_resolved
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 18: authenticated INSERT process succeeds (execution boundary)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_business date := (timezone('America/Sao_Paulo', now()))::date + 2;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    n_processo,
    instrucao,
    dt_fatal
  )
  VALUES (
    v_cliente_a,
    v_user_a,
    'EM_PREENCHIMENTO',
    'WP02B-AUTH-INSERT',
    'authenticated execution-boundary insert',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    18,
    'authenticated process INSERT succeeds',
    v_id_proc IS NOT NULL,
    'insert returned null id_proc'
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    PERFORM pg_temp.wp02b_assert(
      18,
      'authenticated process INSERT succeeds',
      false,
      format('sqlstate=%s message=%s', SQLSTATE, SQLERRM)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 19: PROCESS_CREATED recorded under authenticated INSERT
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_events integer;
  v_business date := (timezone('America/Sao_Paulo', now()))::date + 2;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    dt_fatal
  )
  VALUES (
    v_cliente_a,
    v_user_a,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  PERFORM pg_temp.wp02b_reset_auth_context();

  SELECT count(*) INTO v_events
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'PROCESS_CREATED';

  PERFORM pg_temp.wp02b_assert(
    19,
    'PROCESS_CREATED recorded on authenticated INSERT',
    v_events = 1,
    format('events=%s', v_events)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    PERFORM pg_temp.wp02b_assert(
      19,
      'PROCESS_CREATED recorded on authenticated INSERT',
      false,
      format('sqlstate=%s message=%s', SQLSTATE, SQLERRM)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 20: authenticated salvar_rascunho succeeds
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_business date := (timezone('America/Sao_Paulo', now()))::date + 1;
  v_result jsonb;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  INSERT INTO webproc.processos (cliente_id, created_by, status)
  VALUES (v_cliente_a, v_user_a, 'EM_PREENCHIMENTO')
  RETURNING id_proc INTO v_id_proc;

  SELECT webproc.salvar_rascunho(
    v_id_proc,
    'WP02B-AUTH-SAVE',
    NULL,
    'Reclamante',
    'Reclamado',
    'instrucao valida',
    'obs',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  ) INTO v_result;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    20,
    'authenticated salvar_rascunho succeeds',
    (v_result ->> 'success') = 'true'
      AND (v_result #>> '{operational,opa}') IS NOT NULL,
    format('result=%s', v_result)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    PERFORM pg_temp.wp02b_assert(
      20,
      'authenticated salvar_rascunho succeeds',
      false,
      format('sqlstate=%s message=%s', SQLSTATE, SQLERRM)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 21: authenticated get_operational_context succeeds
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_business date := (timezone('America/Sao_Paulo', now()))::date;
  v_result jsonb;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    dt_fatal
  )
  VALUES (
    v_cliente_a,
    v_user_a,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  SELECT webproc.get_operational_context(v_id_proc) INTO v_result;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    21,
    'authenticated get_operational_context succeeds',
    (v_result ->> 'id_proc')::bigint = v_id_proc
      AND (v_result #>> '{operational,opa}') = 'ACT',
    format('result=%s', v_result)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    PERFORM pg_temp.wp02b_assert(
      21,
      'authenticated get_operational_context succeeds',
      false,
      format('sqlstate=%s message=%s', SQLSTATE, SQLERRM)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 22: authenticated protocolar and reabrir succeed
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_business date := (timezone('America/Sao_Paulo', now()))::date;
  v_proto jsonb;
  v_reopen jsonb;
  v_status text;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    n_processo,
    instrucao,
    dt_fatal
  )
  VALUES (
    v_cliente_a,
    v_user_a,
    'EM_PREENCHIMENTO',
    'WP02B-AUTH-LIFE',
    'instrucao valida',
    pg_temp.wp02b_dt_fatal_for_business_date(v_business)
  )
  RETURNING id_proc INTO v_id_proc;

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/wp02b-auth-life', v_user_a);

  SELECT webproc.protocolar_processo(v_id_proc) INTO v_proto;
  SELECT webproc.reabrir_processo(v_id_proc) INTO v_reopen;

  SELECT status INTO v_status
  FROM webproc.processos
  WHERE id_proc = v_id_proc;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    22,
    'authenticated protocolar and reabrir succeed',
    (v_proto ->> 'success') = 'true'
      AND (v_reopen ->> 'success') = 'true'
      AND v_status = 'EM_PREENCHIMENTO',
    format('proto=%s reopen=%s status=%s', v_proto, v_reopen, v_status)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    PERFORM pg_temp.wp02b_assert(
      22,
      'authenticated protocolar and reabrir succeed',
      false,
      format('sqlstate=%s message=%s', SQLSTATE, SQLERRM)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 23: authenticated cannot EXECUTE private evidence mutators
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_allowed boolean := false;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  SELECT p.id_proc
  INTO v_id_proc
  FROM webproc.processos p
  WHERE p.cliente_id = v_cliente_a
    AND p.created_by = v_user_a
  ORDER BY p.id_proc DESC
  LIMIT 1;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc_private.record_operational_event(
      v_id_proc,
      v_cliente_a,
      'PROCESS_CREATED',
      v_user_a,
      jsonb_build_object('initial_status', 'EM_PREENCHIMENTO')
    );
    v_allowed := true;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_allowed := false;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    23,
    'authenticated cannot EXECUTE private evidence mutators',
    NOT v_allowed,
    'direct EXECUTE on record_operational_event unexpectedly succeeded'
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 24: authenticated direct evidence DML denied (insert/update/delete)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_intervention_id uuid;
  v_insert_ok boolean := false;
  v_update_ok boolean := false;
  v_delete_ok boolean := false;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  SELECT p.id_proc
  INTO v_id_proc
  FROM webproc.processos p
  WHERE p.cliente_id = v_cliente_a
    AND p.created_by = v_user_a
  ORDER BY p.id_proc DESC
  LIMIT 1;

  SELECT i.intervention_id
  INTO v_intervention_id
  FROM webproc.operacional_intervencoes i
  WHERE i.id_proc = v_id_proc
  LIMIT 1;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_a);

  BEGIN
    INSERT INTO webproc.operacional_eventos (
      id_proc, cliente_id, event_type, actor_user_id
    ) VALUES (v_id_proc, v_cliente_a, 'PROCESS_CREATED', v_user_a);
    v_insert_ok := true;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN IF SQLSTATE = '42501' THEN NULL; ELSE RAISE; END IF;
  END;

  IF v_intervention_id IS NOT NULL THEN
    BEGIN
      UPDATE webproc.operacional_intervencoes
      SET presentation_count = 999
      WHERE intervention_id = v_intervention_id;
      v_update_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN IF SQLSTATE = '42501' THEN NULL; ELSE RAISE; END IF;
    END;

    BEGIN
      DELETE FROM webproc.operacional_situacao_mudancas
      WHERE id_proc = v_id_proc;
      v_delete_ok := true;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
      WHEN OTHERS THEN IF SQLSTATE = '42501' THEN NULL; ELSE RAISE; END IF;
    END;
  END IF;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    24,
    'authenticated direct evidence DML denied',
    NOT v_insert_ok AND NOT v_update_ok AND NOT v_delete_ok,
    format('insert=%s update=%s delete=%s', v_insert_ok, v_update_ok, v_delete_ok)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Case 25: authenticated cross-client operational read denied
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_cross_count integer;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  SELECT p.id_proc
  INTO v_id_proc
  FROM webproc.processos p
  WHERE p.cliente_id = v_cliente_a
  ORDER BY p.id_proc DESC
  LIMIT 1;

  PERFORM pg_temp.wp02b_begin_authenticated(v_user_b);

  SELECT count(*) INTO v_cross_count
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc;

  PERFORM pg_temp.wp02b_reset_auth_context();

  PERFORM pg_temp.wp02b_assert(
    25,
    'authenticated cross-client operational read denied',
    v_cross_count = 0,
    format('cross_count=%s', v_cross_count)
  );
EXCEPTION
  WHEN OTHERS THEN
    PERFORM pg_temp.wp02b_reset_auth_context();
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_failed integer;
  r record;
BEGIN
  SELECT count(*) INTO v_failed
  FROM wp02b_assertions
  WHERE NOT passed;

  IF v_failed > 0 THEN
    FOR r IN
      SELECT case_no, case_name, detail
      FROM wp02b_assertions
      WHERE NOT passed
      ORDER BY case_no
    LOOP
      RAISE EXCEPTION 'WP02B case % failed (%): %', r.case_no, r.case_name, r.detail;
    END LOOP;
  END IF;

  RAISE NOTICE 'WP02B validation harness: all % cases passed', (SELECT count(*) FROM wp02b_assertions);
END;
$$;

SELECT case_no, case_name, passed, detail
FROM wp02b_assertions
ORDER BY case_no;

ROLLBACK;
