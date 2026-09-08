-- WP-03 validation harness (45 cases)
-- Requires: local Supabase with all migrations applied (through 20260307280000).
-- Run: supabase/reference/run_wp03_validation.ps1
-- Or:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp03_validation_harness.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE wp03_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION pg_temp.wp03_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp03_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );

  IF NOT p_condition THEN
    RAISE WARNING 'WP03 case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_begin_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.wp03_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_reset_auth_context()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_dt_fatal_for_business_date(p_deadline date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_deadline::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_make_draft_process(
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
    pg_temp.wp03_dt_fatal_for_business_date((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7),
    'Instrucao WP03',
    'WP03-' || floor(random() * 1000000)::text
  )
  RETURNING id_proc INTO v_id_proc;
  RETURN v_id_proc;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_begin_service_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_prepare_upload_trusted(
  p_user uuid,
  p_id_proc bigint,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc.server_prepare_document_upload(
    p_id_proc,
    p_user,
    p_nome,
    p_nome_arquivo,
    p_content_type,
    p_tamanho,
    p_document_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_register_confirmed_trusted(
  p_user uuid,
  p_id_proc bigint,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc.server_register_confirmed_document_upload(
    p_id_proc,
    p_user,
    p_nome,
    p_nome_arquivo,
    p_content_type,
    p_tamanho,
    p_document_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp03_registrar_arquivo_trusted(
  p_user uuid,
  p_id_proc bigint,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_prep jsonb;
  v_doc_id uuid;
BEGIN
  v_prep := webproc.server_prepare_document_upload(
    p_id_proc,
    p_user,
    p_nome,
    p_nome_arquivo,
    p_content_type,
    p_tamanho,
    p_document_id
  );
  v_doc_id := (v_prep ->> 'document_id')::uuid;

  RETURN webproc.server_register_confirmed_document_upload(
    p_id_proc,
    p_user,
    p_nome,
    p_nome_arquivo,
    p_content_type,
    p_tamanho,
    v_doc_id
  );
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
      'wp03-user-a@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_user_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03-user-b@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_user_c,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp03-user-c@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990001, 'WP03 Client A');

  INSERT INTO webproc.clientes (codigo_cliente, nome)
  VALUES (990002, 'WP03 Client B');

  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;
  SELECT id INTO v_cliente_b FROM webproc.clientes WHERE codigo_cliente = 990002;

  INSERT INTO webproc.usuarios_clientes (cliente_id, user_id, email, ativo)
  VALUES
    (v_cliente_a, v_user_a, 'wp03-user-a@example.com', true),
    (v_cliente_a, v_user_c, 'wp03-user-c@example.com', true),
    (v_cliente_b, v_user_b, 'wp03-user-b@example.com', true);
END;
$$;

-- Case 1: same-client document read
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_link_id uuid;
  v_read_count integer;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/wp03-read', v_user_a)
  RETURNING id INTO v_link_id;

  SELECT count(*) INTO v_read_count
  FROM webproc.processo_documentos d
  WHERE d.id = v_link_id;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(1, 'same-client document read', v_read_count = 1);
END;
$$;

-- Case 2: cross-client document read denied
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_id_proc bigint;
  v_cross_count integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/wp03-cross', v_user_a);

  PERFORM pg_temp.wp03_begin_authenticated(v_user_b);
  SELECT count(*) INTO v_cross_count
  FROM webproc.processo_documentos d
  WHERE d.id_proc = v_id_proc;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(2, 'cross-client document read denied', v_cross_count = 0);
END;
$$;

-- Case 3: creator draft LINK insert remains valid
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_ok boolean := false;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  BEGIN
    INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
    VALUES (v_id_proc, 'LINK', 'https://example.com/wp03-link', v_user_a);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(3, 'creator draft LINK insert remains valid', v_ok);
END;
$$;

-- Case 4: trusted server ARQUIVO registration for authorized creator
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  v_result := pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a,
    v_id_proc,
    'Contrato',
    'contrato.pdf',
    'application/pdf',
    1024,
    v_doc_id
  );

  PERFORM pg_temp.wp03_assert(
    4,
    'trusted server ARQUIVO registration for authorized creator',
    (v_result ->> 'success') = 'true'
      AND (v_result ->> 'storage_state') = 'STORED'
  );
END;
$$;

-- Case 5: non-creator same-client ARQUIVO mutation denied
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_c uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_id_proc bigint;
  v_allowed boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  BEGIN
    PERFORM pg_temp.wp03_registrar_arquivo_trusted(
      v_user_c,
      v_id_proc,
      'Tentativa',
      'x.pdf',
      'application/pdf',
      100
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%not_process_creator%' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_assert(
    5,
    'non-creator same-client ARQUIVO mutation denied',
    NOT v_allowed
  );
END;
$$;

-- Case 6: inactive membership denied
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_allowed boolean := true;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  UPDATE webproc.usuarios_clientes
  SET ativo = false
  WHERE user_id = v_user_a AND cliente_id = v_cliente_a;

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
    VALUES (v_id_proc, 'LINK', 'https://example.com/inactive', v_user_a);
  EXCEPTION
    WHEN OTHERS THEN
      v_allowed := false;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();

  UPDATE webproc.usuarios_clientes
  SET ativo = true
  WHERE user_id = v_user_a AND cliente_id = v_cliente_a;

  PERFORM pg_temp.wp03_assert(6, 'inactive membership denied', NOT v_allowed);
END;
$$;

-- Case 7: ARQUIVO mutation denied after PENDENTE
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_allowed boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/proto', v_user_a);

  PERFORM webproc.protocolar_processo(v_id_proc);
  PERFORM pg_temp.wp03_reset_auth_context();

  BEGIN
    PERFORM pg_temp.wp03_registrar_arquivo_trusted(
      v_user_a,
      v_id_proc,
      'Tarde',
      'late.pdf',
      'application/pdf',
      100
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%invalid_status_for_document_mutation%' THEN
        v_allowed := false;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_assert(7, 'ARQUIVO mutation denied after PENDENTE', NOT v_allowed);
END;
$$;

-- Case 8: reopened process permits authorized mutation
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_result jsonb;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/reopen', v_user_a);

  PERFORM webproc.protocolar_processo(v_id_proc);
  PERFORM webproc.reabrir_processo(v_id_proc);
  PERFORM pg_temp.wp03_reset_auth_context();

  v_doc_id := gen_random_uuid();

  v_result := pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a,
    v_id_proc,
    'Pos reopen',
    'reopen.pdf',
    'application/pdf',
    512,
    v_doc_id
  );

  PERFORM pg_temp.wp03_assert(
    8,
    'reopened process permits authorized mutation',
    (v_result ->> 'success') = 'true'
  );
END;
$$;

-- Case 9: DOCUMENT_ADDED evidence
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_count integer;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, nome, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/added', 'Doc Added', v_user_a);

  SELECT count(*) INTO v_count
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'DOCUMENT_ADDED'
    AND e.event_data ->> 'tipo' = 'LINK';

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(9, 'DOCUMENT_ADDED evidence', v_count >= 1);
END;
$$;

-- Case 10: DOCUMENT_REMOVED evidence
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_link_id uuid;
  v_count integer;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/remove', v_user_a)
  RETURNING id INTO v_link_id;

  PERFORM webproc.remover_documento(v_link_id);

  SELECT count(*) INTO v_count
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'DOCUMENT_REMOVED'
    AND e.event_data ->> 'document_id' = v_link_id::text;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(10, 'DOCUMENT_REMOVED evidence', v_count = 1);
END;
$$;

-- Case 11: removed document no longer in processo_documentos
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_link_id uuid;
  v_remaining integer;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/gone', v_user_a)
  RETURNING id INTO v_link_id;

  PERFORM webproc.remover_documento(v_link_id);

  SELECT count(*) INTO v_remaining
  FROM webproc.processo_documentos d
  WHERE d.id = v_link_id;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(11, 'removed document no longer in processo_documentos', v_remaining = 0);
END;
$$;

-- Case 12: historical removal evidence remains
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_link_id uuid;
  v_event_count integer;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/history', v_user_a)
  RETURNING id INTO v_link_id;

  PERFORM webproc.remover_documento(v_link_id);

  SELECT count(*) INTO v_event_count
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type IN ('DOCUMENT_ADDED', 'DOCUMENT_REMOVED');

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(12, 'historical removal evidence remains', v_event_count >= 2);
END;
$$;

-- Case 13: repeated filenames do not collide at domain level
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc1 uuid;
  v_doc2 uuid;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  v_doc1 := gen_random_uuid();
  v_doc2 := gen_random_uuid();

  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, NULL, 'same.pdf', 'application/pdf', 100, v_doc1
  );
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, NULL, 'same.pdf', 'application/pdf', 200, v_doc2
  );
  PERFORM pg_temp.wp03_assert(
    13,
    'repeated/similar filenames do not collide at domain level',
    v_doc1 <> v_doc2
  );
END;
$$;

-- Case 14: n_processo duplication rules remain unaffected (sanity: process still insertable)
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc1 bigint;
  v_id_proc2 bigint;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc1 := pg_temp.wp03_make_draft_process(v_user_a);
  v_id_proc2 := pg_temp.wp03_make_draft_process(v_user_a);

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    14,
    'n_processo duplication rules remain unaffected',
    v_id_proc1 IS NOT NULL AND v_id_proc2 IS NOT NULL AND v_id_proc1 <> v_id_proc2
  );
END;
$$;

-- Case 15: protocol completeness counts LINK + ARQUIVO
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_proto jsonb;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  v_doc_id := gen_random_uuid();

  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Arquivo', 'a.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_proto := webproc.protocolar_processo(v_id_proc);

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    15,
    'protocol completeness counts active ARQUIVO',
    (v_proto ->> 'success') = 'true'
      AND (v_proto ->> 'status') = 'PENDENTE'
  );
END;
$$;

-- Case 16: PERSISTED transition not available to authenticated users
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_allowed boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();

  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'X', 'x.pdf', 'application/pdf', 100, v_doc_id
  );

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/x', v_user_a);

  PERFORM webproc.protocolar_processo(v_id_proc);
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc_private.confirmar_transferencia_documento(v_doc_id, v_user_a);
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

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    16,
    'PERSISTED transition not available to ordinary client users',
    NOT v_allowed
  );
END;
$$;

-- Case 17: PURGED does not create user-visible operational evidence
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_before integer;
  v_after integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();

  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Purge', 'p.pdf', 'application/pdf', 100, v_doc_id
  );

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/p', v_user_a);

  PERFORM webproc.protocolar_processo(v_id_proc);
  PERFORM webproc_private.confirmar_transferencia_documento(v_doc_id, v_user_a);

  SELECT count(*) INTO v_before
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc;

  PERFORM webproc_private.purgar_documento_arquivo(v_doc_id);

  SELECT count(*) INTO v_after
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc;

  PERFORM pg_temp.wp03_assert(
    17,
    'PURGED technical state does not create user-visible operational evidence',
    v_after = v_before
  );
END;
$$;

-- Case 18: cancellation marks R2 cleanup candidates without requiring R2
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_cancel jsonb;
  v_candidates integer;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();

  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Cancel', 'c.pdf', 'application/pdf', 100, v_doc_id
  );

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/c', v_user_a);

  v_cancel := webproc.cancelar_processo(v_id_proc, 'Teste cancelamento');

  PERFORM pg_temp.wp03_reset_auth_context();

  SELECT count(*) INTO v_candidates
  FROM webproc_private.list_documentos_r2_cleanup_candidates() c
  WHERE c.id_proc = v_id_proc;

  PERFORM pg_temp.wp03_assert(
    18,
    'cancellation marks R2 cleanup candidates without requiring R2',
    (v_cancel ->> 'success') = 'true'
      AND (v_cancel ->> 'status') = 'CANCELADO'
      AND (v_cancel ->> 'r2_cleanup_marked')::integer >= 1
      AND v_candidates >= 1
  );
END;
$$;

-- Case 19: WP-02B lifecycle regression (protocol + reopen still work)
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_proto jsonb;
  v_reopen jsonb;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/lifecycle', v_user_a);

  v_proto := webproc.protocolar_processo(v_id_proc);
  v_reopen := webproc.reabrir_processo(v_id_proc);

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    19,
    'existing WP-02/WP-02A/WP-02B lifecycle behavior does not regress',
    (v_proto ->> 'success') = 'true'
      AND (v_reopen ->> 'success') = 'true'
      AND (v_reopen ->> 'status') = 'EM_PREENCHIMENTO'
  );
END;
$$;

-- Case 20: private helper execution denied to authenticated unless explicitly granted
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_allowed boolean := false;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc_private.purgar_documento_arquivo(gen_random_uuid());
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

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    20,
    'private helper execution denied to authenticated users unless explicitly required',
    NOT v_allowed
  );
END;
$$;

-- Case 21: authenticated cannot invoke server upload facades
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_blocked_prepare boolean := true;
  v_blocked_register boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc.server_prepare_document_upload(
      v_id_proc, v_user_a, 'Hack', 'hack.pdf', 'application/pdf', 100
    );
    v_blocked_prepare := false;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM webproc.server_register_confirmed_document_upload(
      v_id_proc, v_user_a, 'Hack', 'hack.pdf', 'application/pdf', 100, gen_random_uuid()
    );
    v_blocked_register := false;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    21,
    'authenticated cannot invoke server upload facades',
    v_blocked_prepare AND v_blocked_register
  );
END;
$$;

-- Case 22: authenticated cannot invoke helper that returns object_key
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_allowed boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'R', 'r.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc.server_resolve_arquivo_removal_target(v_doc_id, v_user_a);
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

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    22,
    'authenticated cannot invoke helper that returns object_key',
    NOT v_allowed
  );
END;
$$;

-- Case 23: authenticated direct read does not expose object_key
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Hidden', 'hidden.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM object_key
    FROM webproc.processo_documentos d
    WHERE d.id = v_doc_id;
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

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    23,
    'authenticated direct document read does not expose object_key',
    v_blocked
  );
END;
$$;

-- Case 24: same-client user can still read allowed document metadata
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_nome_arquivo text;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Visivel', 'visible.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  SELECT d.nome_arquivo
  INTO v_nome_arquivo
  FROM webproc.processo_documentos d
  WHERE d.id = v_doc_id;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    24,
    'same-client user can still read allowed document metadata',
    v_nome_arquivo = 'visible.pdf'
  );
END;
$$;

-- Case 25: cross-client document metadata remains denied
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_id_proc bigint;
  v_doc_id uuid;
  v_cross_count integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Private', 'private.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_b);

  SELECT count(*) INTO v_cross_count
  FROM webproc.processo_documentos d
  WHERE d.id = v_doc_id;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    25,
    'cross-client document metadata remains denied',
    v_cross_count = 0
  );
END;
$$;

-- Case 26: client cannot register arbitrary attacker-controlled object_key
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    INSERT INTO webproc.processo_documentos (
      id_proc, tipo, object_key, nome_arquivo, content_type, tamanho, storage_state, created_by
    )
    VALUES (
      v_id_proc,
      'ARQUIVO',
      'webproc/1/999999/evil.pdf',
      'evil.pdf',
      'application/pdf',
      100,
      'STORED',
      v_user_a
    );
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

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    26,
    'client cannot register arbitrary attacker-controlled object_key',
    v_blocked
  );
END;
$$;

-- Case 27: canonical server object key contains no original filename
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_object_key text;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  SELECT (pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, NULL, 'secret-name.pdf', 'application/pdf', 100, v_doc_id
  ) ->> 'object_key')
  INTO v_object_key;

  PERFORM pg_temp.wp03_assert(
    27,
    'canonical server object key contains no original filename',
    v_object_key NOT LIKE '%secret-name.pdf%'
      AND v_object_key NOT LIKE '%.pdf%'
  );
END;
$$;

-- Case 28: identical original filenames have distinct infrastructure identity
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc1 uuid := gen_random_uuid();
  v_doc2 uuid := gen_random_uuid();
  v_key1 text;
  v_key2 text;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  SELECT (pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, NULL, 'dup.pdf', 'application/pdf', 100, v_doc1
  ) ->> 'object_key') INTO v_key1;

  SELECT (pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, NULL, 'dup.pdf', 'application/pdf', 200, v_doc2
  ) ->> 'object_key') INTO v_key2;

  PERFORM pg_temp.wp03_assert(
    28,
    'two files with identical original filename still have distinct infrastructure identity',
    v_key1 IS NOT NULL AND v_key2 IS NOT NULL AND v_key1 <> v_key2
  );
END;
$$;

-- Case 29: client removal contract remains document_id-based for LINK
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_link_id uuid;
  v_result jsonb;
BEGIN
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/remove-by-id', v_user_a)
  RETURNING id INTO v_link_id;

  v_result := webproc.remover_documento(v_link_id);

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    29,
    'client removal contract remains document_id-based',
    (v_result ->> 'success') = 'true'
      AND (v_result ->> 'document_id') = v_link_id::text
  );
END;
$$;

-- Case 30: private/internal R2 coordination helpers denied to authenticated
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid;
  v_allowed boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  v_doc_id := gen_random_uuid();
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Z', 'z.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc.server_finalize_arquivo_removal(v_doc_id, v_user_a);
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

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    30,
    'private/internal R2 coordination helpers remain denied to authenticated',
    NOT v_allowed
  );
END;
$$;

-- Case 31: upload preparation creates NO processo_documentos row
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_before integer;
  v_after integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  SELECT count(*) INTO v_before
  FROM webproc.processo_documentos d
  WHERE d.id_proc = v_id_proc;

  PERFORM pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, 'Prep', 'prep.pdf', 'application/pdf', 100
  );

  SELECT count(*) INTO v_after
  FROM webproc.processo_documentos d
  WHERE d.id_proc = v_id_proc;

  PERFORM pg_temp.wp03_assert(
    31,
    'upload preparation creates NO processo_documentos row',
    v_before = v_after
  );
END;
$$;

-- Case 32: upload preparation returns canonical identity/key to service_role
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_cliente_id bigint;
  v_doc_id uuid := gen_random_uuid();
  v_result jsonb;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  SELECT cliente_id INTO v_cliente_id FROM webproc.processos WHERE id_proc = v_id_proc;
  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_begin_service_role();

  v_result := webproc.server_prepare_document_upload(
    v_id_proc, v_user_a, NULL, 'prep.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    32,
    'upload preparation returns canonical document identity/key only to trusted server role',
    (v_result ->> 'success') = 'true'
      AND (v_result ->> 'document_id') = v_doc_id::text
      AND (v_result ->> 'object_key') = format('webproc/%s/%s/%s', v_cliente_id, v_id_proc, v_doc_id)
  );
END;
$$;

-- Case 33: authenticated cannot call upload preparation facade
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_blocked boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc.server_prepare_document_upload(
      v_id_proc, v_user_a, 'X', 'x.pdf', 'application/pdf', 100
    );
    v_blocked := false;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    33,
    'authenticated cannot call upload preparation facade',
    v_blocked
  );
END;
$$;

-- Case 34: authenticated cannot call confirmed-upload registration facade
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_blocked boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM webproc.server_register_confirmed_document_upload(
      v_id_proc, v_user_a, 'X', 'x.pdf', 'application/pdf', 100, gen_random_uuid()
    );
    v_blocked := false;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    34,
    'authenticated cannot call confirmed-upload registration facade',
    v_blocked
  );
END;
$$;

-- Case 35: service_role can call required server facades
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_prep jsonb;
  v_reg jsonb;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_begin_service_role();

  v_prep := webproc.server_prepare_document_upload(
    v_id_proc, v_user_a, 'SR', 'sr.pdf', 'application/pdf', 100, v_doc_id
  );
  v_reg := webproc.server_register_confirmed_document_upload(
    v_id_proc, v_user_a, 'SR', 'sr.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    35,
    'service_role can call required server facades',
    (v_prep ->> 'success') = 'true'
      AND (v_reg ->> 'success') = 'true'
      AND (v_reg ->> 'storage_state') = 'STORED'
  );
END;
$$;

-- Case 36: confirmed registration creates exactly one STORED current document
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_count integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  PERFORM pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, 'One', 'one.pdf', 'application/pdf', 100, v_doc_id
  );
  PERFORM pg_temp.wp03_register_confirmed_trusted(
    v_user_a, v_id_proc, 'One', 'one.pdf', 'application/pdf', 100, v_doc_id
  );

  SELECT count(*) INTO v_count
  FROM webproc.processo_documentos d
  WHERE d.id = v_doc_id
    AND d.tipo = 'ARQUIVO'
    AND d.storage_state = 'STORED';

  PERFORM pg_temp.wp03_assert(
    36,
    'confirmed registration creates exactly one STORED current document',
    v_count = 1
  );
END;
$$;

-- Case 37: DOCUMENT_ADDED appears only after confirmed registration
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_before integer;
  v_after_prepare integer;
  v_after_register integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  SELECT count(*) INTO v_before
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'DOCUMENT_ADDED'
    AND e.event_data ->> 'document_id' = v_doc_id::text;

  PERFORM pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, 'Ev', 'ev.pdf', 'application/pdf', 100, v_doc_id
  );

  SELECT count(*) INTO v_after_prepare
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'DOCUMENT_ADDED'
    AND e.event_data ->> 'document_id' = v_doc_id::text;

  PERFORM pg_temp.wp03_register_confirmed_trusted(
    v_user_a, v_id_proc, 'Ev', 'ev.pdf', 'application/pdf', 100, v_doc_id
  );

  SELECT count(*) INTO v_after_register
  FROM webproc.operacional_eventos e
  WHERE e.id_proc = v_id_proc
    AND e.event_type = 'DOCUMENT_ADDED'
    AND e.event_data ->> 'document_id' = v_doc_id::text;

  PERFORM pg_temp.wp03_assert(
    37,
    'DOCUMENT_ADDED appears only after confirmed registration',
    v_before = 0 AND v_after_prepare = 0 AND v_after_register = 1
  );
END;
$$;

-- Case 38: abandoned preparation leaves no current document metadata
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_count integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  PERFORM pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, 'Abandon', 'abandon.pdf', 'application/pdf', 100, v_doc_id
  );

  SELECT count(*) INTO v_count
  FROM webproc.processo_documentos d
  WHERE d.id = v_doc_id;

  PERFORM pg_temp.wp03_assert(
    38,
    'abandoned preparation leaves no current document metadata',
    v_count = 0
  );
END;
$$;

-- Case 39: retry of identical confirmed registration is idempotent/safe
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_first jsonb;
  v_second jsonb;
  v_count integer;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  PERFORM pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, 'Retry', 'retry.pdf', 'application/pdf', 100, v_doc_id
  );
  v_first := pg_temp.wp03_register_confirmed_trusted(
    v_user_a, v_id_proc, 'Retry', 'retry.pdf', 'application/pdf', 100, v_doc_id
  );
  v_second := pg_temp.wp03_register_confirmed_trusted(
    v_user_a, v_id_proc, 'Retry', 'retry.pdf', 'application/pdf', 100, v_doc_id
  );

  SELECT count(*) INTO v_count
  FROM webproc.processo_documentos d
  WHERE d.id = v_doc_id;

  PERFORM pg_temp.wp03_assert(
    39,
    'retry of identical confirmed registration is idempotent/safe',
    (v_first ->> 'success') = 'true'
      AND (v_second ->> 'success') = 'true'
      AND (v_second ->> 'already_registered') = 'true'
      AND v_count = 1
  );
END;
$$;

-- Case 40: conflicting reuse of document_id fails
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  PERFORM pg_temp.wp03_prepare_upload_trusted(
    v_user_a, v_id_proc, 'First', 'first.pdf', 'application/pdf', 100, v_doc_id
  );
  PERFORM pg_temp.wp03_register_confirmed_trusted(
    v_user_a, v_id_proc, 'First', 'first.pdf', 'application/pdf', 100, v_doc_id
  );

  BEGIN
    PERFORM pg_temp.wp03_register_confirmed_trusted(
      v_user_a, v_id_proc, 'Different', 'other.pdf', 'application/pdf', 200, v_doc_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%conflicting_document_id%' THEN
        v_failed := true;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_assert(
    40,
    'conflicting reuse of document_id fails',
    v_failed
  );
END;
$$;

-- Case 41: server facade still enforces actor active membership
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cliente_a bigint;
  v_id_proc bigint;
  v_blocked boolean := false;
BEGIN
  SELECT id INTO v_cliente_a FROM webproc.clientes WHERE codigo_cliente = 990001;

  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();

  UPDATE webproc.usuarios_clientes
  SET ativo = false
  WHERE user_id = v_user_a AND cliente_id = v_cliente_a;

  PERFORM pg_temp.wp03_begin_service_role();

  BEGIN
    PERFORM webproc.server_prepare_document_upload(
      v_id_proc, v_user_a, 'X', 'x.pdf', 'application/pdf', 100
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%membership_required%' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();

  UPDATE webproc.usuarios_clientes
  SET ativo = true
  WHERE user_id = v_user_a AND cliente_id = v_cliente_a;

  PERFORM pg_temp.wp03_assert(
    41,
    'server facade still enforces actor active membership',
    v_blocked
  );
END;
$$;

-- Case 42: server facade still enforces actor is process creator
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_user_c uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_id_proc bigint;
  v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_begin_service_role();

  BEGIN
    PERFORM webproc.server_prepare_document_upload(
      v_id_proc, v_user_c, 'X', 'x.pdf', 'application/pdf', 100
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%not_process_creator%' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    42,
    'server facade still enforces actor is process creator',
    v_blocked
  );
END;
$$;

-- Case 43: server facade still enforces EM_PREENCHIMENTO
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);

  INSERT INTO webproc.processo_documentos (id_proc, tipo, url, created_by)
  VALUES (v_id_proc, 'LINK', 'https://example.com/proto43', v_user_a);

  PERFORM webproc.protocolar_processo(v_id_proc);
  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_begin_service_role();

  BEGIN
    PERFORM webproc.server_prepare_document_upload(
      v_id_proc, v_user_a, 'Late', 'late.pdf', 'application/pdf', 100
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%invalid_status_for_document_mutation%' THEN
        v_blocked := true;
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    43,
    'server facade still enforces EM_PREENCHIMENTO',
    v_blocked
  );
END;
$$;

-- Case 44: server facade responses do not expose infrastructure data to authenticated paths
DO $$
DECLARE
  v_user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_id_proc bigint;
  v_doc_id uuid := gen_random_uuid();
  v_blocked_select boolean := false;
  v_blocked_rpc boolean := true;
BEGIN
  PERFORM pg_temp.wp03_set_auth(v_user_a);
  v_id_proc := pg_temp.wp03_make_draft_process(v_user_a);
  PERFORM pg_temp.wp03_registrar_arquivo_trusted(
    v_user_a, v_id_proc, 'Infra', 'infra.pdf', 'application/pdf', 100, v_doc_id
  );

  PERFORM pg_temp.wp03_begin_authenticated(v_user_a);

  BEGIN
    PERFORM object_key
    FROM webproc.processo_documentos d
    WHERE d.id = v_doc_id;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_blocked_select := true;
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        v_blocked_select := true;
      ELSE
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM webproc.server_resolve_arquivo_removal_target(v_doc_id, v_user_a);
    v_blocked_rpc := false;
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN OTHERS THEN
      IF SQLSTATE <> '42501' THEN
        RAISE;
      END IF;
  END;

  PERFORM pg_temp.wp03_reset_auth_context();
  PERFORM pg_temp.wp03_assert(
    44,
    'no server-only infrastructure data exposed through authenticated paths',
    v_blocked_select AND v_blocked_rpc
  );
END;
$$;

-- Case 45: original WP-03 boundary cases 1-30 remain covered (sanity marker)
DO $$
BEGIN
  PERFORM pg_temp.wp03_assert(
    45,
    'original WP-03 boundary cases 1-30 remain covered by this harness run',
    (SELECT count(*) FROM wp03_assertions WHERE case_no BETWEEN 1 AND 30 AND passed) = 30
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
  SELECT count(*) INTO v_failed FROM wp03_assertions WHERE NOT passed;

  RAISE NOTICE 'WP-03 validation summary: % cases, % failed',
    (SELECT count(*) FROM wp03_assertions),
    v_failed;

  FOR r IN
    SELECT case_no, case_name, detail
    FROM wp03_assertions
    WHERE NOT passed
    ORDER BY case_no
  LOOP
    RAISE NOTICE 'FAIL case %: % — %', r.case_no, r.case_name, r.detail;
  END LOOP;

  IF v_failed > 0 THEN
    RAISE EXCEPTION 'WP-03 validation failed: % case(s)', v_failed;
  END IF;
END;
$$;

ROLLBACK;
