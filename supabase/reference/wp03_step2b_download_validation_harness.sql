-- WP-03 Step 2B: secure document download validation harness (15 cases)
-- Requires: local Supabase with migrations through 20260307300000.
-- Run: supabase/reference/run_wp03_step2b_download_validation.ps1
-- Or:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp03_step2b_download_validation_harness.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE wp03d_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.wp03d_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp03d_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );

  IF NOT p_condition THEN
    RAISE WARNING 'WP03D case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.wp03d_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_reset_auth_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_dt_fatal_for_business_date(p_deadline date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_deadline::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_make_draft_process(
  p_user uuid,
  p_cliente_codigo integer DEFAULT 990001
)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_cliente_id bigint;
  v_id_proc bigint;
BEGIN
  SELECT id INTO v_cliente_id FROM webproc.clientes WHERE codigo_cliente = p_cliente_codigo;
  INSERT INTO webproc.processos (cliente_id, created_by, status, dt_fatal, instrucao, n_processo)
  VALUES (
    v_cliente_id,
    p_user,
    'EM_PREENCHIMENTO',
    pg_temp.wp03d_dt_fatal_for_business_date((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7),
    'Instrucao WP03D',
    'WP03D-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_proc;
  RETURN v_id_proc;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_insert_link_trusted(
  p_user uuid,
  p_id_proc bigint,
  p_url text DEFAULT 'https://example.com/wp03d-link'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_link_id uuid := gen_random_uuid();
BEGIN
  -- Harness setup only: runs as migration/session owner, not as authenticated.
  INSERT INTO webproc.processo_documentos (
    id,
    id_proc,
    tipo,
    url,
    nome,
    created_by
  )
  VALUES (
    v_link_id,
    p_id_proc,
    'LINK',
    p_url,
    'Link fixture',
    p_user
  );
  RETURN v_link_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_registrar_arquivo_trusted(
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
  v_doc_id uuid := coalesce(p_doc_id, gen_random_uuid());
BEGIN
  PERFORM webproc.server_prepare_document_upload(
    p_id_proc,
    p_user,
    'WP03D fixture',
    'fixture.pdf',
    'application/pdf',
    100,
    v_doc_id
  );
  PERFORM webproc.server_register_confirmed_document_upload(
    p_id_proc,
    p_user,
    'WP03D fixture',
    'fixture.pdf',
    'application/pdf',
    100,
    v_doc_id
  );
  RETURN v_doc_id;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_resolve_download_trusted(
  p_actor_user_id uuid,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc.server_resolve_arquivo_download_target(p_document_id, p_actor_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03d_expect_exception(
  p_sqlstate text,
  p_message_like text,
  p_sql text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION
  WHEN OTHERS THEN
    RETURN SQLSTATE = p_sqlstate
      AND SQLERRM LIKE '%' || p_message_like || '%';
END;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_user_c uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_user_inactive uuid := '11111111-1111-1111-1111-111111111111';
  v_actus_op uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
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
      'wp03d-user-a@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_user_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03d-user-b@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_user_c,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03d-user-c@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_user_inactive,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03d-inactive-member@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_actus_op,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03d-actus-op@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_actus_inactive,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03d-actus-inactive@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990001, 'WP03D Client A')
  ON CONFLICT (codigo_cliente) DO NOTHING;

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990002, 'WP03D Client B')
  ON CONFLICT (codigo_cliente) DO NOTHING;

  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;
  SELECT id INTO v_cliente_b FROM webproc.clientes WHERE codigo_cliente = 990002;

  UPDATE webproc.clientes SET ativo = true WHERE id IN (v_cliente_a, v_cliente_b);

  INSERT INTO webproc.usuarios_clientes (cliente_id, user_id, email, ativo)
  VALUES
    (v_cliente_a, v_user_a, 'wp03d-user-a@example.com', true),
    (v_cliente_a, v_user_c, 'wp03d-user-c@example.com', true),
    (v_cliente_b, v_user_b, 'wp03d-user-b@example.com', true),
    (v_cliente_a, v_user_inactive, 'wp03d-inactive-member@example.com', false);

  INSERT INTO webproc.usuarios_actus (user_id, nome, email, papel, ativo)
  VALUES
    (v_actus_op, 'WP03D Actus Op', 'wp03d-actus-op@example.com', 'OPERADOR', true),
    (v_actus_inactive, 'WP03D Actus Inactive', 'wp03d-actus-inactive@example.com', 'OPERADOR', false);
END;
$$;

CREATE TEMP TABLE wp03d_fixture AS
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AS user_a,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid AS user_b,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid AS user_c,
  '11111111-1111-1111-1111-111111111111'::uuid AS user_inactive_member,
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid AS actus_op,
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid AS actus_inactive,
  NULL::bigint AS proc_a,
  NULL::bigint AS proc_b,
  NULL::uuid AS doc_stored,
  NULL::uuid AS doc_persisted,
  NULL::uuid AS doc_purged,
  NULL::uuid AS doc_link,
  NULL::uuid AS doc_b;

UPDATE wp03d_fixture f
SET
  proc_a = pg_temp.wp03d_make_draft_process(f.user_a, 990001),
  proc_b = pg_temp.wp03d_make_draft_process(f.user_b, 990002);

UPDATE wp03d_fixture f
SET doc_stored = pg_temp.wp03d_registrar_arquivo_trusted(f.user_a, f.proc_a);

DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_persisted_proc bigint;
  v_persisted_doc uuid;
  v_purged_proc bigint;
  v_purged_doc uuid;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;

  v_persisted_proc := pg_temp.wp03d_make_draft_process(f.user_a, 990001);
  v_persisted_doc := pg_temp.wp03d_registrar_arquivo_trusted(f.user_a, v_persisted_proc);

  PERFORM pg_temp.wp03d_begin_authenticated(f.user_a);
  PERFORM webproc.protocolar_processo(v_persisted_proc);
  PERFORM pg_temp.wp03d_reset_auth_context();
  PERFORM webproc_private.confirmar_transferencia_documento(v_persisted_doc, f.user_a);

  v_purged_proc := pg_temp.wp03d_make_draft_process(f.user_a, 990001);
  v_purged_doc := pg_temp.wp03d_registrar_arquivo_trusted(f.user_a, v_purged_proc);

  PERFORM pg_temp.wp03d_begin_authenticated(f.user_a);
  PERFORM webproc.protocolar_processo(v_purged_proc);
  PERFORM pg_temp.wp03d_reset_auth_context();
  PERFORM webproc_private.confirmar_transferencia_documento(v_purged_doc, f.user_a);
  PERFORM webproc_private.purgar_documento_arquivo(v_purged_doc);

  UPDATE wp03d_fixture
  SET
    doc_persisted = v_persisted_doc,
    doc_purged = v_purged_doc;

  IF (SELECT doc_persisted FROM wp03d_fixture) IS NULL THEN
    RAISE EXCEPTION 'fixture: expected PERSISTED document';
  END IF;
END;
$$;

DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_link_id uuid;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_link_id := pg_temp.wp03d_insert_link_trusted(f.user_a, f.proc_a);
  UPDATE wp03d_fixture SET doc_link = v_link_id;
END;
$$;

UPDATE wp03d_fixture f
SET doc_b = pg_temp.wp03d_registrar_arquivo_trusted(f.user_b, f.proc_b);

-- Case 1: creator client resolves STORED ARQUIVO
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_result := pg_temp.wp03d_resolve_download_trusted(f.user_a, f.doc_stored);
  PERFORM pg_temp.wp03d_assert(
    1,
    'creator client can resolve STORED ARQUIVO',
    v_result ->> 'success' = 'true'
      AND (v_result ->> 'document_id')::uuid = f.doc_stored
      AND v_result ->> 'storage_state' = 'STORED'
      AND coalesce(v_result ->> 'object_key', '') <> ''
  );
END;
$$;

-- Case 2: same-client active NON-CREATOR resolves same document
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_result := pg_temp.wp03d_resolve_download_trusted(f.user_c, f.doc_stored);
  PERFORM pg_temp.wp03d_assert(
    2,
    'same-client active NON-CREATOR can resolve same document',
    v_result ->> 'success' = 'true'
      AND (v_result ->> 'document_id')::uuid = f.doc_stored
  );
END;
$$;

-- Case 3: different-client actor denied
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'download_not_authorized',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.user_b,
      f.doc_stored
    )
  );
  PERFORM pg_temp.wp03d_assert(3, 'different-client actor denied', v_denied);
END;
$$;

-- Case 4: inactive client membership denied
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'download_not_authorized',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.user_inactive_member,
      f.doc_stored
    )
  );
  PERFORM pg_temp.wp03d_assert(4, 'inactive client membership denied', v_denied);
END;
$$;

-- Case 5: inactive cliente denied
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
  v_cliente_a bigint;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;
  UPDATE webproc.clientes SET ativo = false WHERE id = v_cliente_a;

  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'download_not_authorized',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.user_a,
      f.doc_stored
    )
  );

  UPDATE webproc.clientes SET ativo = true WHERE id = v_cliente_a;
  PERFORM pg_temp.wp03d_assert(5, 'inactive cliente denied', v_denied);
END;
$$;

-- Case 6: active Actus actor resolves transversally
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_result := pg_temp.wp03d_resolve_download_trusted(f.actus_op, f.doc_b);
  PERFORM pg_temp.wp03d_assert(
    6,
    'active Actus actor can resolve transversally',
    v_result ->> 'success' = 'true'
      AND (v_result ->> 'document_id')::uuid = f.doc_b
  );
END;
$$;

-- Case 7: inactive Actus actor denied
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'download_not_authorized',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.actus_inactive,
      f.doc_stored
    )
  );
  PERFORM pg_temp.wp03d_assert(7, 'inactive Actus actor denied', v_denied);
END;
$$;

-- Case 8: LINK rejected
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'link_document_no_r2',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.user_a,
      f.doc_link
    )
  );
  PERFORM pg_temp.wp03d_assert(8, 'LINK rejected', v_denied);
END;
$$;

-- Case 9: PURGED rejected
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'document_bytes_unavailable',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.user_a,
      f.doc_purged
    )
  );
  PERFORM pg_temp.wp03d_assert(9, 'PURGED rejected', v_denied);
END;
$$;

-- Case 10: PERSISTED ARQUIVO allowed
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_result := pg_temp.wp03d_resolve_download_trusted(f.user_a, f.doc_persisted);
  PERFORM pg_temp.wp03d_assert(
    10,
    'PERSISTED ARQUIVO allowed',
    v_result ->> 'success' = 'true'
      AND v_result ->> 'storage_state' = 'PERSISTED'
  );
END;
$$;

-- Case 11: missing document rejected
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'documento_not_found',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(%L, %L)',
      f.user_a,
      '00000000-0000-0000-0000-000000000099'::uuid
    )
  );
  PERFORM pg_temp.wp03d_assert(11, 'missing document rejected', v_denied);
END;
$$;

-- Case 12: NULL actor rejected
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_denied boolean;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  v_denied := pg_temp.wp03d_expect_exception(
    'P0001',
    'not_authenticated',
    format(
      'SELECT pg_temp.wp03d_resolve_download_trusted(NULL, %L)',
      f.doc_stored
    )
  );
  PERFORM pg_temp.wp03d_assert(12, 'NULL actor rejected', v_denied);
END;
$$;

-- Case 13: authenticated cannot execute server facade directly
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_blocked boolean := true;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  PERFORM pg_temp.wp03d_begin_authenticated(f.user_a);
  BEGIN
    PERFORM webproc.server_resolve_arquivo_download_target(f.doc_stored, f.user_a);
    v_blocked := false;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        NULL;
      ELSE
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.wp03d_reset_auth_context();
  PERFORM pg_temp.wp03d_assert(
    13,
    'authenticated cannot execute server facade directly',
    v_blocked
  );
END;
$$;

-- Case 14: authenticated still cannot SELECT object_key
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_blocked boolean := false;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;
  PERFORM pg_temp.wp03d_begin_authenticated(f.user_a);
  BEGIN
    PERFORM object_key
    FROM webproc.processo_documentos d
    WHERE d.id = f.doc_stored;
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
  PERFORM pg_temp.wp03d_reset_auth_context();
  PERFORM pg_temp.wp03d_assert(
    14,
    'authenticated still cannot SELECT object_key',
    v_blocked
  );
END;
$$;

-- Case 15: existing upload/removal behavior remains unaffected
DO $$
DECLARE
  f wp03d_fixture%ROWTYPE;
  v_prep jsonb;
  v_removal_denied boolean := false;
  v_removal_allowed boolean := false;
BEGIN
  SELECT * INTO f FROM wp03d_fixture;

  v_prep := webproc.server_prepare_document_upload(
    f.proc_a,
    f.user_a,
    'Upload regression',
    'regression.pdf',
    'application/pdf',
    50,
    NULL
  );

  BEGIN
    PERFORM webproc.server_resolve_arquivo_removal_target(f.doc_stored, f.user_c);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%not_process_creator%' THEN
        v_removal_denied := true;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM webproc.server_resolve_arquivo_removal_target(f.doc_stored, f.user_a);
  v_removal_allowed := true;

  PERFORM pg_temp.wp03d_assert(
    15,
    'existing upload/removal behavior remains unaffected',
    v_prep ->> 'success' = 'true'
      AND coalesce(v_prep ->> 'object_key', '') <> ''
      AND v_removal_denied
      AND v_removal_allowed
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
  SELECT count(*) INTO v_failed FROM wp03d_assertions WHERE NOT passed;

  RAISE NOTICE 'WP03 Step 2B download validation summary: % cases, % failed',
    (SELECT count(*) FROM wp03d_assertions),
    v_failed;

  FOR r IN
    SELECT case_no, case_name, detail
    FROM wp03d_assertions
    WHERE NOT passed
    ORDER BY case_no
  LOOP
    RAISE NOTICE 'FAIL case %: % — %', r.case_no, r.case_name, r.detail;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'WP03 Step 2B download validation failed: % case(s)', v_failed;
  END IF;
END;
$$;

ROLLBACK;
