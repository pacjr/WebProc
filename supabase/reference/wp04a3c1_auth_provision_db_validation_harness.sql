-- WP-04A.3c.1: Auth provisioning DB server contract validation harness
-- Requires migration 20260329160000_wp04a3c1_auth_provision_server_contract.sql
--
-- Run (linked DEV):
--   npx supabase@2.118.0 db query --linked --yes -f supabase/reference/wp04a3c1_auth_provision_db_validation_harness.sql

BEGIN;

CREATE TEMP TABLE wp04a3c1_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

GRANT INSERT ON wp04a3c1_assertions TO service_role;
GRANT INSERT ON wp04a3c1_assertions TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3c1_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp04a3c1_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'WP04A.3c.1 case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3c1_as_service_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3c1_as_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3c1_reset_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3c1_expect_msg(
  p_case_no integer,
  p_case_name text,
  p_msg_fragment text,
  p_sql text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.wp04a3c1_assert(p_case_no, p_case_name, false, 'expected exception');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04a3c1_assert(
        p_case_no,
        p_case_name,
        SQLERRM LIKE ('%' || p_msg_fragment || '%'),
        SQLERRM
      );
  END;
END;
$$;

DO $$
DECLARE
  v_admin uuid;
  v_operador uuid;
  v_client uuid;
  v_admin_email text;
  v_admin_papel_saved text;
  v_saved_operador_papel text;
  v_cliente_a bigint;
  v_cliente_b bigint;
  v_codigo_a bigint := 990003101;
  v_codigo_b bigint := 990003102;
  v_membership bigint;
  v_membership_b bigint;
  v_other_membership bigint;
  v_json jsonb;
  v_link_user uuid := 'a3c10001-0001-4001-8001-000000000001';
  v_link_user_b uuid := 'a3c10002-0002-4002-8002-000000000002';
  v_link_user_c uuid := 'a3c10003-0003-4003-8003-000000000003';
  v_can_exec boolean;
BEGIN
  SELECT ua.user_id, ua.email, ua.papel
  INTO v_admin, v_admin_email, v_admin_papel_saved
  FROM webproc.usuarios_actus ua
  WHERE ua.ativo = true
  ORDER BY ua.id
  LIMIT 1;

  PERFORM pg_temp.wp04a3c1_assert(
    0,
    'fixture actus user exists',
    v_admin IS NOT NULL,
    'no active usuarios_actus row'
  );

  IF v_admin IS NULL THEN
    RETURN;
  END IF;

  UPDATE webproc.usuarios_actus SET papel = 'ADMIN' WHERE user_id = v_admin;

  SELECT ua.user_id, ua.papel
  INTO v_operador, v_saved_operador_papel
  FROM webproc.usuarios_actus ua
  WHERE ua.ativo = true AND ua.user_id <> v_admin
  ORDER BY ua.id
  LIMIT 1;

  SELECT uc.user_id INTO v_client
  FROM webproc.usuarios_clientes uc
  WHERE uc.ativo = true AND uc.user_id IS NOT NULL
  ORDER BY uc.id
  LIMIT 1;

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  VALUES
    (
      v_link_user,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp04a3c1-link-user@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_link_user_b,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp04a3c1-link-user-b@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    ),
    (
      v_link_user_c,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'wp04a3c1-collision@example.com',
      crypt('password', gen_salt('bf')),
      now(), now(), now()
    )
  ON CONFLICT (id) DO NOTHING;

  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);

  DELETE FROM webproc.usuarios_clientes uc
  USING webproc.clientes c
  WHERE uc.cliente_id = c.id AND c.codigo_cliente IN (v_codigo_a, v_codigo_b);

  DELETE FROM webproc.clientes c WHERE c.codigo_cliente IN (v_codigo_a, v_codigo_b);

  SELECT id INTO v_cliente_a FROM webproc.admin_create_cliente(v_codigo_a, 'WP04A3c1 Client A');
  SELECT id INTO v_cliente_b FROM webproc.admin_create_cliente(v_codigo_b, 'WP04A3c1 Client B');

  SELECT id INTO v_membership
  FROM webproc.admin_create_client_membership(
    v_cliente_a,
    '  WP04A3C1.Link-User@Example.COM  ',
    'Link Target'
  );

  PERFORM pg_temp.wp04a3c1_reset_role();

  -- 1 ADMIN prepare pending membership
  PERFORM pg_temp.wp04a3c1_as_service_role();
  v_json := webproc.server_prepare_client_membership_auth(v_membership, v_admin);
  PERFORM pg_temp.wp04a3c1_assert(
    1,
    'ADMIN prepare pending membership',
    v_json->>'success' = 'true'
      AND (v_json->>'provisioning_state') = 'PENDING_AUTH'
      AND (v_json->>'normalized_email') = 'wp04a3c1.link-user@example.com'
      AND v_json->>'existing_user_id' IS NULL,
    v_json::text
  );

  -- 2 OPERADOR denied
  IF v_operador IS NULL THEN
    UPDATE webproc.usuarios_actus SET papel = 'OPERADOR' WHERE user_id = v_admin;
    v_operador := v_admin;
  END IF;
  PERFORM pg_temp.wp04a3c1_expect_msg(
    2,
    'OPERADOR prepare denied',
    'not_actus_admin',
    format(
      'SELECT webproc.server_prepare_client_membership_auth(%s, %L::uuid)',
      v_membership,
      v_operador
    )
  );
  IF v_operador = v_admin THEN
    UPDATE webproc.usuarios_actus SET papel = 'ADMIN' WHERE user_id = v_admin;
  END IF;

  -- 3 CLIENT actor denied
  IF v_client IS NOT NULL THEN
    PERFORM pg_temp.wp04a3c1_expect_msg(
      3,
      'CLIENT actor prepare denied',
      'not_actus_admin',
      format(
        'SELECT webproc.server_prepare_client_membership_auth(%s, %L::uuid)',
        v_membership,
        v_client
      )
    );
  ELSE
    PERFORM pg_temp.wp04a3c1_assert(3, 'CLIENT actor prepare denied', true, 'skipped — no client fixture');
  END IF;

  -- 4 anonymous/null actor denied
  PERFORM pg_temp.wp04a3c1_expect_msg(
    4,
    'null actor prepare denied',
    'not_authenticated',
    format(
      'SELECT webproc.server_prepare_client_membership_auth(%s, NULL::uuid)',
      v_membership
    )
  );

  -- 5 membership not found
  PERFORM pg_temp.wp04a3c1_expect_msg(
    5,
    'membership not found',
    'membership_not_found',
    format(
      'SELECT webproc.server_prepare_client_membership_auth(%s, %L::uuid)',
      999999999,
      v_admin
    )
  );

  -- 6 inactive membership
  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);
  PERFORM id FROM webproc.admin_set_client_membership_active(v_membership, false);
  PERFORM pg_temp.wp04a3c1_reset_role();
  PERFORM pg_temp.wp04a3c1_as_service_role();
  PERFORM pg_temp.wp04a3c1_expect_msg(
    6,
    'inactive membership prepare denied',
    'membership_inactive',
    format(
      'SELECT webproc.server_prepare_client_membership_auth(%s, %L::uuid)',
      v_membership,
      v_admin
    )
  );
  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);
  PERFORM id FROM webproc.admin_set_client_membership_active(v_membership, true);
  PERFORM pg_temp.wp04a3c1_reset_role();
  PERFORM pg_temp.wp04a3c1_as_service_role();

  -- 7 inactive client
  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);
  PERFORM id FROM webproc.admin_update_cliente(v_cliente_a, NULL, false);
  PERFORM pg_temp.wp04a3c1_reset_role();
  PERFORM pg_temp.wp04a3c1_as_service_role();
  PERFORM pg_temp.wp04a3c1_expect_msg(
    7,
    'inactive client prepare denied',
    'client_inactive',
    format(
      'SELECT webproc.server_prepare_client_membership_auth(%s, %L::uuid)',
      v_membership,
      v_admin
    )
  );
  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);
  PERFORM id FROM webproc.admin_update_cliente(v_cliente_a, NULL, true);
  PERFORM pg_temp.wp04a3c1_reset_role();
  PERFORM pg_temp.wp04a3c1_as_service_role();

  -- 8 email normalization (prepare)
  v_json := webproc.server_prepare_client_membership_auth(v_membership, v_admin);
  PERFORM pg_temp.wp04a3c1_assert(
    8,
    'email normalization on prepare',
    (v_json->>'normalized_email') = 'wp04a3c1.link-user@example.com',
    v_json->>'normalized_email'
  );

  -- 9 auth email mismatch
  PERFORM pg_temp.wp04a3c1_expect_msg(
    9,
    'auth email mismatch',
    'auth_email_mismatch',
    format(
      $sql$SELECT webproc.server_link_client_membership_auth(%s, %L::uuid, %L::uuid, %L)$sql$,
      v_membership,
      v_admin,
      v_link_user,
      'wrong-email@example.com'
    )
  );

  -- 10 successful link
  v_json := webproc.server_link_client_membership_auth(
    v_membership,
    v_admin,
    v_link_user,
    'wp04a3c1.link-user@example.com'
  );
  PERFORM pg_temp.wp04a3c1_assert(
    10,
    'successful link',
    v_json->>'success' = 'true'
      AND (v_json->>'outcome') = 'LINKED'
      AND (v_json->>'provisioning_state') = 'ACTIVE',
    v_json::text
  );

  -- 11 repeat same link → ALREADY_LINKED
  v_json := webproc.server_link_client_membership_auth(
    v_membership,
    v_admin,
    v_link_user,
    'wp04a3c1.link-user@example.com'
  );
  PERFORM pg_temp.wp04a3c1_assert(
    11,
    'repeat link ALREADY_LINKED',
    (v_json->>'outcome') = 'ALREADY_LINKED',
    v_json::text
  );

  -- 12 different auth id after link → membership_already_linked
  PERFORM pg_temp.wp04a3c1_expect_msg(
    12,
    'different auth id membership_already_linked',
    'membership_already_linked',
    format(
      $sql$SELECT webproc.server_link_client_membership_auth(%s, %L::uuid, %L::uuid, %L)$sql$,
      v_membership,
      v_admin,
      v_link_user_b,
      'wp04a3c1.link-user@example.com'
    )
  );

  -- Reset membership for collision tests
  UPDATE webproc.usuarios_clientes SET user_id = NULL WHERE id = v_membership;

  -- 13 one-active-client collision by email (admin_create blocks duplicate email;
  -- link RPC must still enforce when another active row exists)
  INSERT INTO webproc.usuarios_clientes (cliente_id, email, nome, ativo, user_id)
  VALUES (v_cliente_b, 'wp04a3c1.link-user@example.com', 'Forced Other Client', true, NULL)
  RETURNING id INTO v_other_membership;

  PERFORM pg_temp.wp04a3c1_expect_msg(
    13,
    'one-active-client collision by email',
    'active_membership_other_client',
    format(
      $sql$SELECT webproc.server_link_client_membership_auth(%s, %L::uuid, %L::uuid, %L)$sql$,
      v_membership,
      v_admin,
      v_link_user,
      'wp04a3c1.link-user@example.com'
    )
  );

  DELETE FROM webproc.usuarios_clientes WHERE id = v_other_membership;

  -- 14 one-active-client collision by user_id
  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);
  SELECT id INTO v_membership_b
  FROM webproc.admin_create_client_membership(
    v_cliente_b,
    'wp04a3c1.collision@example.com',
    'Client B Pending'
  );
  PERFORM pg_temp.wp04a3c1_reset_role();
  UPDATE webproc.usuarios_clientes SET user_id = v_link_user_c WHERE id = v_membership;
  PERFORM pg_temp.wp04a3c1_as_service_role();
  PERFORM pg_temp.wp04a3c1_expect_msg(
    14,
    'one-active-client collision by user_id',
    'active_membership_other_client',
    format(
      $sql$SELECT webproc.server_link_client_membership_auth(%s, %L::uuid, %L::uuid, %L)$sql$,
      v_membership_b,
      v_admin,
      v_link_user_c,
      'wp04a3c1.collision@example.com'
    )
  );
  UPDATE webproc.usuarios_clientes SET user_id = NULL WHERE id = v_membership;

  -- 15 ACTUS identity collision (email matches active Actus row)
  PERFORM pg_temp.wp04a3c1_as_authenticated(v_admin);
  SELECT id INTO v_membership
  FROM webproc.admin_create_client_membership(
    v_cliente_a,
    v_admin_email,
    'Actus Email Collision'
  );
  PERFORM pg_temp.wp04a3c1_reset_role();
  PERFORM pg_temp.wp04a3c1_as_service_role();
  PERFORM pg_temp.wp04a3c1_expect_msg(
    15,
    'ACTUS identity collision on prepare',
    'actus_identity_conflict',
    format(
      'SELECT webproc.server_prepare_client_membership_auth(%s, %L::uuid)',
      v_membership,
      v_admin
    )
  );
  PERFORM pg_temp.wp04a3c1_expect_msg(
    151,
    'ACTUS identity collision on link by user_id',
    'actus_identity_conflict',
    format(
      $sql$SELECT webproc.server_link_client_membership_auth(%s, %L::uuid, %L::uuid, %L)$sql$,
      v_membership,
      v_admin,
      v_admin,
      v_admin_email
    )
  );

  -- 16 PUBLIC cannot execute server RPCs
  PERFORM pg_temp.wp04a3c1_reset_role();
  SELECT has_function_privilege(
    'public',
    'webproc.server_prepare_client_membership_auth(bigint, uuid)',
    'EXECUTE'
  ) INTO v_can_exec;
  PERFORM pg_temp.wp04a3c1_assert(16, 'PUBLIC cannot execute prepare', NOT v_can_exec, v_can_exec::text);

  -- 17 authenticated cannot execute server RPCs
  SELECT has_function_privilege(
    'authenticated',
    'webproc.server_prepare_client_membership_auth(bigint, uuid)',
    'EXECUTE'
  ) INTO v_can_exec;
  PERFORM pg_temp.wp04a3c1_assert(
    17,
    'authenticated cannot execute prepare',
    NOT v_can_exec,
    v_can_exec::text
  );
  SELECT has_function_privilege(
    'authenticated',
    'webproc.server_link_client_membership_auth(bigint, uuid, uuid, text)',
    'EXECUTE'
  ) INTO v_can_exec;
  PERFORM pg_temp.wp04a3c1_assert(
    17,
    'authenticated cannot execute link',
    NOT v_can_exec,
    v_can_exec::text
  );

  -- 18 service_role can execute
  SELECT has_function_privilege(
    'service_role',
    'webproc.server_prepare_client_membership_auth(bigint, uuid)',
    'EXECUTE'
  ) INTO v_can_exec;
  PERFORM pg_temp.wp04a3c1_assert(18, 'service_role can execute prepare', v_can_exec, v_can_exec::text);
  SELECT has_function_privilege(
    'service_role',
    'webproc.server_link_client_membership_auth(bigint, uuid, uuid, text)',
    'EXECUTE'
  ) INTO v_can_exec;
  PERFORM pg_temp.wp04a3c1_assert(18, 'service_role can execute link', v_can_exec, v_can_exec::text);

  -- 19 private helpers unavailable to authenticated
  SELECT has_function_privilege(
    'authenticated',
    'webproc_private.assert_actus_admin_for_user(uuid)',
    'EXECUTE'
  ) INTO v_can_exec;
  PERFORM pg_temp.wp04a3c1_assert(
    19,
    'private assert_actus_admin_for_user not executable by authenticated',
    NOT v_can_exec,
    v_can_exec::text
  );

  UPDATE webproc.usuarios_actus SET papel = v_admin_papel_saved WHERE user_id = v_admin;
END;
$$;

DO $$
DECLARE
  v_fail text;
BEGIN
  SELECT string_agg(case_no::text || ':' || case_name || '=' || coalesce(detail, ''), '; ' ORDER BY case_no)
  INTO v_fail
  FROM wp04a3c1_assertions
  WHERE NOT passed;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'harness_failures: %', v_fail;
  END IF;
END;
$$;

SELECT case_no, case_name, passed, detail
FROM wp04a3c1_assertions
ORDER BY case_no;

SELECT
  count(*) FILTER (WHERE NOT passed) AS failed_count,
  count(*) AS total
FROM wp04a3c1_assertions;

ROLLBACK;
