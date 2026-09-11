-- WP-03 Step 2B-Foundation: Actus internal read access validation harness
-- Requires: local Supabase with all migrations applied (through 20260307290000).
-- Run: supabase/reference/run_wp02b_actus_read_validation.ps1
-- Or:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp02b_actus_read_validation_harness.sql
--
-- Assertions run under authenticated role + JWT claim context (not postgres alone).

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE wp02b_actus_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp02b_actus_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );

  IF NOT p_condition THEN
    RAISE WARNING 'WP02B-Actus case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.wp02b_actus_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_reset_auth_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_dt_fatal_for_business_date(p_deadline date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_deadline::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_make_draft_process(
  p_user uuid,
  p_cliente_codigo integer,
  p_marker text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente_id bigint;
  v_id_proc bigint;
BEGIN
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = p_cliente_codigo;
  INSERT INTO webproc.processos (
    cliente_id,
    created_by,
    status,
    dt_fatal,
    instrucao,
    n_processo,
    obs
  )
  VALUES (
    v_cliente_id,
    p_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp02b_actus_dt_fatal_for_business_date((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7),
    'Instrucao Actus harness',
    coalesce(p_marker, 'ACTUS-' || floor(random() * 1000000)::text),
    'Step 2B disposable fixture'
  )
  RETURNING id_proc INTO v_id_proc;
  RETURN v_id_proc;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp02b_actus_registrar_arquivo_trusted(
  p_user uuid,
  p_id_proc bigint,
  p_doc_id uuid DEFAULT gen_random_uuid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_prep jsonb;
  v_doc_id uuid := coalesce(p_doc_id, gen_random_uuid());
BEGIN
  v_prep := webproc.server_prepare_document_upload(
    p_id_proc,
    p_user,
    'Actus fixture',
    'fixture.pdf',
    'application/pdf',
    100,
    v_doc_id
  );
  PERFORM webproc.server_register_confirmed_document_upload(
    p_id_proc,
    p_user,
    'Actus fixture',
    'fixture.pdf',
    'application/pdf',
    100,
    v_doc_id
  );
  RETURN v_doc_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_actus_op uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  v_actus_admin uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  v_actus_inactive uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_cliente_a bigint;
  v_cliente_b bigint;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  VALUES
    (
      v_user_a,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'actus-harness-user-a@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_user_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'actus-harness-user-b@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_actus_op,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'actus-harness-operador@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_actus_admin,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'actus-harness-admin@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_actus_inactive,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'actus-harness-inactive@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990101, 'Actus Harness Client A')
  ON CONFLICT (codigo_cliente) DO NOTHING;

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990102, 'Actus Harness Client B')
  ON CONFLICT (codigo_cliente) DO NOTHING;

  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990101;
  SELECT id INTO v_cliente_b FROM webproc.clientes WHERE codigo_cliente = 990102;

  INSERT INTO webproc.usuarios_clientes (cliente_id, user_id, email, ativo)
  VALUES
    (v_cliente_a, v_user_a, 'actus-harness-user-a@example.com', true),
    (v_cliente_b, v_user_b, 'actus-harness-user-b@example.com', true);

  INSERT INTO webproc.usuarios_actus (user_id, nome, email, papel, ativo)
  VALUES
    (v_actus_op, 'Actus Operador', 'actus-harness-operador@example.com', 'OPERADOR', true),
    (v_actus_admin, 'Actus Admin', 'actus-harness-admin@example.com', 'ADMIN', true),
    (v_actus_inactive, 'Actus Inactive', 'actus-harness-inactive@example.com', 'OPERADOR', false);
END;
$$;

-- Shared fixture ids for later cases
CREATE TEMP TABLE wp02b_actus_fixture AS
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AS user_a,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid AS user_b,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid AS actus_op,
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid AS actus_admin,
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid AS actus_inactive,
  NULL::bigint AS proc_a_draft,
  NULL::bigint AS proc_a_pendente,
  NULL::bigint AS proc_b_draft,
  NULL::uuid AS doc_a_draft,
  NULL::uuid AS doc_b_draft;

UPDATE wp02b_actus_fixture f
SET
  proc_a_draft = pg_temp.wp02b_actus_make_draft_process(f.user_a, 990101, 'ACTUS-A-DRAFT'),
  proc_b_draft = pg_temp.wp02b_actus_make_draft_process(f.user_b, 990102, 'ACTUS-B-DRAFT');

UPDATE wp02b_actus_fixture f
SET doc_a_draft = pg_temp.wp02b_actus_registrar_arquivo_trusted(f.user_a, f.proc_a_draft),
    doc_b_draft = pg_temp.wp02b_actus_registrar_arquivo_trusted(f.user_b, f.proc_b_draft);

DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;

  PERFORM pg_temp.wp02b_actus_set_auth(f.user_b);
  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (f.proc_b_draft, 'LINK', 'https://example.com/actus-b-link', f.user_b);
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
END;
$$;

DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;

  PERFORM pg_temp.wp02b_actus_set_auth(f.user_a);
  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (f.proc_a_draft, 'LINK', 'https://example.com/actus-a', f.user_a);

  PERFORM webproc.protocolar_processo(f.proc_a_draft);
  PERFORM pg_temp.wp02b_actus_reset_auth_context();

  UPDATE wp02b_actus_fixture
  SET proc_a_pendente = f.proc_a_draft;
END;
$$;

-- Case 1: active client user still reads own client/process/docs
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_client_count integer;
  v_proc_count integer;
  v_doc_count integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;

  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.user_a);

  SELECT count(*) INTO v_client_count
  FROM webproc.clientes c
  WHERE c.codigo_cliente = 990101;

  SELECT count(*) INTO v_proc_count
  FROM webproc.processos p
  WHERE p.id_proc = f.proc_a_draft;

  SELECT count(*) INTO v_doc_count
  FROM webproc.processo_documentos d
  WHERE d.id = f.doc_a_draft;

  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    1,
    'active client user still reads own client/process/docs',
    v_client_count = 1 AND v_proc_count = 1 AND v_doc_count = 1
  );
END;
$$;

-- Case 2: client cannot read another client's data
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_cross_proc integer;
  v_cross_doc integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;

  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.user_a);

  SELECT count(*) INTO v_cross_proc
  FROM webproc.processos p
  WHERE p.id_proc = f.proc_b_draft;

  SELECT count(*) INTO v_cross_doc
  FROM webproc.processo_documentos d
  WHERE d.id = f.doc_b_draft;

  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    2,
    'client cannot read another client''s data',
    v_cross_proc = 0 AND v_cross_doc = 0
  );
END;
$$;

-- Case 3: active Actus OPERADOR reads client A
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  SELECT count(*) INTO v_count FROM webproc.clientes c WHERE c.codigo_cliente = 990101;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(3, 'active Actus OPERADOR reads client A', v_count = 1);
END;
$$;

-- Case 4: active Actus OPERADOR reads client B
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  SELECT count(*) INTO v_count FROM webproc.clientes c WHERE c.codigo_cliente = 990102;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(4, 'active Actus OPERADOR reads client B', v_count = 1);
END;
$$;

-- Case 5: Actus reads EM_PREENCHIMENTO process
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  SELECT p.status INTO v_status
  FROM webproc.processos p
  WHERE p.id_proc = f.proc_b_draft;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    5,
    'Actus reads EM_PREENCHIMENTO process',
    v_status = 'EM_PREENCHIMENTO'
  );
END;
$$;

-- Case 6: Actus reads PENDENTE process
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  SELECT p.status INTO v_status
  FROM webproc.processos p
  WHERE p.id_proc = f.proc_a_pendente;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    6,
    'Actus reads PENDENTE process',
    v_status = 'PENDENTE'
  );
END;
$$;

-- Case 7: Actus reads document metadata across clients
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_count integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  SELECT count(*) INTO v_count
  FROM webproc.processo_documentos d
  WHERE d.id IN (f.doc_a_draft, f.doc_b_draft);
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    7,
    'Actus reads document metadata across clients',
    v_count = 2
  );
END;
$$;

-- Case 8: Actus cannot SELECT object_key
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  BEGIN
    PERFORM object_key
    FROM webproc.processo_documentos d
    WHERE d.id = f.doc_a_draft;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(8, 'Actus cannot SELECT object_key', v_blocked);
END;
$$;

-- Case 9: Actus cannot SELECT r2_cleanup_pending
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  BEGIN
    PERFORM r2_cleanup_pending
    FROM webproc.processo_documentos d
    WHERE d.id = f.doc_a_draft;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(9, 'Actus cannot SELECT r2_cleanup_pending', v_blocked);
END;
$$;

-- Case 10: Actus cannot create process through Actus status alone
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_cliente_b bigint;
  v_allowed boolean := true;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  SELECT id INTO v_cliente_b FROM webproc.clientes WHERE codigo_cliente = 990102;

  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  BEGIN
    INSERT INTO webproc.processos (
      cliente_id, created_by, status, dt_fatal, instrucao, n_processo
    )
    VALUES (
      v_cliente_b,
      f.actus_op,
      'EM_PREENCHIMENTO',
      pg_temp.wp02b_actus_dt_fatal_for_business_date((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7),
      'Blocked',
      'ACTUS-INSERT'
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_allowed := false;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    10,
    'Actus cannot create process through Actus status alone',
    NOT v_allowed
  );
END;
$$;

-- Case 11: Actus cannot edit another user's process
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_rows integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  UPDATE webproc.processos
  SET obs = 'Actus edit attempt'
  WHERE id_proc = f.proc_b_draft;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    11,
    'Actus cannot edit another user''s process',
    v_rows = 0
  );
END;
$$;

-- Case 12: Actus cannot protocolar
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_allowed boolean := true;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  BEGIN
    PERFORM webproc.protocolar_processo(f.proc_b_draft);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%membership_required%'
         OR SQLERRM LIKE '%not_process_creator%' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(12, 'Actus cannot protocolar', NOT v_allowed);
END;
$$;

-- Case 13: Actus cannot reabrir
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_allowed boolean := true;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  BEGIN
    PERFORM webproc.reabrir_processo(f.proc_a_pendente);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%membership_required%'
         OR SQLERRM LIKE '%not_process_creator%' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(13, 'Actus cannot reabrir', NOT v_allowed);
END;
$$;

-- Case 14: Actus cannot cancelar through Actus status alone
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_allowed boolean := true;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  BEGIN
    PERFORM webproc.cancelar_processo(f.proc_b_draft, 'Actus cancel attempt');
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%membership_required%'
         OR SQLERRM LIKE '%not_process_creator%' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    14,
    'Actus cannot cancelar through Actus status alone',
    NOT v_allowed
  );
END;
$$;

-- Case 15: Actus cannot add/remove documents through Actus status alone
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_insert_ok boolean := true;
  v_remove_ok boolean := true;
  v_link_id uuid;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);

  BEGIN
    INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
    VALUES (f.proc_b_draft, 'LINK', 'https://example.com/actus-add', f.actus_op);
  EXCEPTION
    WHEN OTHERS THEN
      v_insert_ok := false;
  END;

  SELECT id INTO v_link_id
  FROM webproc.processo_documentos d
  WHERE d.id_proc = f.proc_b_draft
    AND d.url = 'https://example.com/actus-b-link'
  LIMIT 1;

  BEGIN
    PERFORM webproc.remover_documento(v_link_id);
    v_remove_ok := true;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%membership_required%'
         OR SQLERRM LIKE '%not_process_creator%' THEN
        v_remove_ok := false;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    15,
    'Actus cannot add/remove documents through Actus status alone',
    NOT v_insert_ok AND NOT v_remove_ok
  );
END;
$$;

-- Case 16: inactive Actus user loses transversal access
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_client_count integer;
  v_proc_count integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_inactive);

  SELECT count(*) INTO v_client_count
  FROM webproc.clientes c
  WHERE c.codigo_cliente IN (990101, 990102);

  SELECT count(*) INTO v_proc_count
  FROM webproc.processos p
  WHERE p.id_proc IN (f.proc_a_draft, f.proc_b_draft);

  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    16,
    'inactive Actus user loses transversal access',
    v_client_count = 0 AND v_proc_count = 0
  );
END;
$$;

-- Case 17: ordinary client cannot enumerate usuarios_actus
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.user_a);
  BEGIN
    PERFORM count(*) FROM webproc.usuarios_actus;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    17,
    'ordinary client cannot enumerate usuarios_actus',
    v_blocked
  );
END;
$$;

-- Case 18: ADMIN has same domain read scope as OPERADOR
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_admin_clients integer;
  v_admin_procs integer;
  v_admin_docs integer;
  v_op_clients integer;
  v_op_procs integer;
  v_op_docs integer;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;

  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_admin);
  SELECT count(*) INTO v_admin_clients FROM webproc.clientes c WHERE c.codigo_cliente IN (990101, 990102);
  SELECT count(*) INTO v_admin_procs FROM webproc.processos p WHERE p.id_proc IN (f.proc_a_draft, f.proc_b_draft, f.proc_a_pendente);
  SELECT count(*) INTO v_admin_docs FROM webproc.processo_documentos d WHERE d.id IN (f.doc_a_draft, f.doc_b_draft);
  PERFORM pg_temp.wp02b_actus_reset_auth_context();

  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_op);
  SELECT count(*) INTO v_op_clients FROM webproc.clientes c WHERE c.codigo_cliente IN (990101, 990102);
  SELECT count(*) INTO v_op_procs FROM webproc.processos p WHERE p.id_proc IN (f.proc_a_draft, f.proc_b_draft, f.proc_a_pendente);
  SELECT count(*) INTO v_op_docs FROM webproc.processo_documentos d WHERE d.id IN (f.doc_a_draft, f.doc_b_draft);
  PERFORM pg_temp.wp02b_actus_reset_auth_context();

  PERFORM pg_temp.wp02b_actus_assert(
    18,
    'ADMIN has same domain read scope as OPERADOR',
    v_admin_clients = v_op_clients
      AND v_admin_procs = v_op_procs
      AND v_admin_docs = v_op_docs
      AND v_admin_clients = 2
      AND v_admin_docs = 2
  );
END;
$$;

-- Case 19: ADMIN does not gain domain mutation bypass
DO $$
DECLARE
  f wp02b_actus_fixture%ROWTYPE;
  v_allowed boolean := true;
BEGIN
  SELECT * INTO f FROM wp02b_actus_fixture;
  PERFORM pg_temp.wp02b_actus_begin_authenticated(f.actus_admin);
  BEGIN
    PERFORM webproc.protocolar_processo(f.proc_b_draft);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%membership_required%'
         OR SQLERRM LIKE '%not_process_creator%' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp02b_actus_reset_auth_context();
  PERFORM pg_temp.wp02b_actus_assert(
    19,
    'ADMIN does not gain domain mutation bypass',
    NOT v_allowed
  );
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
  SELECT count(*) INTO v_failed FROM wp02b_actus_assertions WHERE NOT passed;

  RAISE NOTICE 'WP02B-Actus validation summary: % cases, % failed',
    (SELECT count(*) FROM wp02b_actus_assertions),
    v_failed;

  FOR r IN
    SELECT case_no, case_name, detail
    FROM wp02b_actus_assertions
    WHERE NOT passed
    ORDER BY case_no
  LOOP
    RAISE NOTICE 'FAIL case %: % — %', r.case_no, r.case_name, r.detail;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'WP02B-Actus validation failed: % case(s)', v_failed;
  END IF;
END;
$$;

ROLLBACK;
