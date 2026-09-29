-- WP-04A.3b: Domain administration contract validation harness
-- Requires migration 20260329153000_wp04a3b_domain_admin_contract.sql
-- Requires at least one webproc.usuarios_actus row with papel = 'ADMIN' (active).
--
-- Optional env for actor simulation (defaults match WP-03b DEV smoke UUIDs when present):
--   wp04a3b_actus_admin_user_id
--   wp04a3b_actus_operador_user_id
--   wp04a3b_client_user_id
--
-- Run:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/reference/wp04a3b_domain_admin_validation_harness.sql

BEGIN;

CREATE TEMP TABLE wp04a3b_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

GRANT INSERT ON wp04a3b_assertions TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3b_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp04a3b_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'WP04A.3b case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3b_set_auth(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3b_as_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.wp04a3b_set_auth(p_user_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3b_reset_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04a3b_expect_sqlstate(
  p_case_no integer,
  p_case_name text,
  p_sqlstate text,
  p_sql text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    PERFORM pg_temp.wp04a3b_assert(p_case_no, p_case_name, false, 'expected exception');
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE;
      PERFORM pg_temp.wp04a3b_assert(
        p_case_no,
        p_case_name,
        v_state = p_sqlstate,
        format('state=%s msg=%s', v_state, SQLERRM)
      );
  END;
END;
$$;

DO $$
DECLARE
  v_admin uuid;
  v_operador uuid;
  v_client uuid;
  v_saved_papel text;
  v_admin_papel_saved text;
  v_cliente_a bigint;
  v_cliente_b bigint;
  v_codigo_a bigint := 990003001;
  v_codigo_b bigint := 990003002;
  v_membership_a bigint;
  v_membership_b bigint;
  v_state text;
  v_has boolean;
  v_count integer;
BEGIN
  SELECT ua.user_id, ua.papel INTO v_admin, v_admin_papel_saved
  FROM webproc.usuarios_actus ua
  WHERE ua.ativo = true
  ORDER BY ua.id
  LIMIT 1;

  PERFORM pg_temp.wp04a3b_assert(
    1,
    'fixture actus user exists (ADMIN promoted in txn if needed)',
    v_admin IS NOT NULL,
    'no active row in usuarios_actus'
  );

  IF v_admin IS NULL THEN
    RETURN;
  END IF;

  UPDATE webproc.usuarios_actus SET papel = 'ADMIN' WHERE user_id = v_admin;

  SELECT ua.user_id, ua.papel INTO v_operador, v_saved_papel
  FROM webproc.usuarios_actus ua
  WHERE ua.ativo = true AND ua.user_id <> v_admin
  ORDER BY ua.id
  LIMIT 1;

  SELECT uc.user_id INTO v_client
  FROM webproc.usuarios_clientes uc
  WHERE uc.ativo = true AND uc.user_id IS NOT NULL
  ORDER BY uc.id
  LIMIT 1;

  -- 10: anonymous denied
  PERFORM pg_temp.wp04a3b_reset_role();
  PERFORM pg_temp.wp04a3b_expect_sqlstate(
    10,
    'anonymous admin_list_clientes denied',
    'P0001',
    'SELECT count(*) FROM webproc.admin_list_clientes()'
  );

  -- 11: CLIENT denied
  IF v_client IS NOT NULL THEN
    PERFORM pg_temp.wp04a3b_as_authenticated(v_client);
    BEGIN
      PERFORM count(*) FROM webproc.admin_list_clientes();
      PERFORM pg_temp.wp04a3b_assert(11, 'CLIENT admin_list denied', false, 'no exception');
    EXCEPTION
      WHEN OTHERS THEN
        PERFORM pg_temp.wp04a3b_assert(
          11,
          'CLIENT admin_list denied',
          SQLERRM LIKE '%not_actus_admin%',
          SQLERRM
        );
    END;
    PERFORM pg_temp.wp04a3b_reset_role();
  ELSE
    PERFORM pg_temp.wp04a3b_assert(11, 'CLIENT admin_list denied', true, 'skipped — no client fixture');
  END IF;

  -- 12: OPERADOR denied (temporarily demote admin if no other actus user)
  IF v_operador IS NULL THEN
    UPDATE webproc.usuarios_actus SET papel = 'OPERADOR' WHERE user_id = v_admin;
    v_operador := v_admin;
  END IF;

  PERFORM pg_temp.wp04a3b_as_authenticated(v_operador);
  BEGIN
    PERFORM count(*) FROM webproc.admin_list_clientes();
    PERFORM pg_temp.wp04a3b_assert(12, 'OPERADOR admin_list denied', false, 'no exception');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04a3b_assert(
        12,
        'OPERADOR admin_list denied',
        SQLERRM LIKE '%not_actus_admin%',
        SQLERRM
      );
  END;
  PERFORM pg_temp.wp04a3b_reset_role();

  IF v_operador = v_admin THEN
    UPDATE webproc.usuarios_actus SET papel = 'ADMIN' WHERE user_id = v_admin;
  END IF;

  -- ADMIN flow
  PERFORM pg_temp.wp04a3b_as_authenticated(v_admin);

  DELETE FROM webproc.usuarios_clientes uc
  USING webproc.clientes c
  WHERE uc.cliente_id = c.id AND c.codigo_cliente IN (v_codigo_a, v_codigo_b);

  DELETE FROM webproc.clientes c WHERE c.codigo_cliente IN (v_codigo_a, v_codigo_b);

  SELECT id INTO v_cliente_a FROM webproc.admin_create_cliente(v_codigo_a, 'WP04A3b Client A');
  PERFORM pg_temp.wp04a3b_assert(20, 'ADMIN create client A', v_cliente_a IS NOT NULL, v_cliente_a::text);

  BEGIN
    PERFORM id FROM webproc.admin_create_cliente(v_codigo_a, 'Duplicate Code');
    PERFORM pg_temp.wp04a3b_assert(21, 'duplicate codigo_cliente rejected', false, 'no exception');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04a3b_assert(
        21,
        'duplicate codigo_cliente rejected',
        SQLERRM LIKE '%codigo_cliente_conflict%',
        SQLERRM
      );
  END;

  SELECT id INTO v_cliente_a FROM webproc.admin_update_cliente(v_cliente_a, 'WP04A3b Client A Updated', NULL);
  PERFORM pg_temp.wp04a3b_assert(22, 'ADMIN update client nome', true, NULL);

  PERFORM id FROM webproc.admin_update_cliente(v_cliente_a, NULL, false);
  PERFORM pg_temp.wp04a3b_assert(23, 'ADMIN deactivate client', true, NULL);

  PERFORM id FROM webproc.admin_update_cliente(v_cliente_a, NULL, true);
  PERFORM pg_temp.wp04a3b_assert(24, 'ADMIN reactivate client', true, NULL);

  SELECT id INTO v_cliente_b FROM webproc.admin_create_cliente(v_codigo_b, 'WP04A3b Client B');

  SELECT id INTO v_membership_a
  FROM webproc.admin_create_client_membership(v_cliente_a, 'Wp04A3b.User@Example.com', 'Pending User');

  SELECT provisioning_state INTO v_state
  FROM webproc.admin_list_client_memberships(v_cliente_a) m
  WHERE m.id = v_membership_a;

  PERFORM pg_temp.wp04a3b_assert(
    30,
    'create membership PENDING_AUTH',
    v_state = 'PENDING_AUTH',
    coalesce(v_state, 'null')
  );

  PERFORM id FROM webproc.admin_update_client_membership(v_membership_a, 'Pending User Updated');
  PERFORM pg_temp.wp04a3b_assert(31, 'update membership nome', true, NULL);

  BEGIN
    PERFORM id FROM webproc.admin_create_client_membership(v_cliente_a, 'wp04a3b.user@example.com', 'Dup');
    PERFORM pg_temp.wp04a3b_assert(32, 'active same-client email conflict', false, 'no exception');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04a3b_assert(
        32,
        'active same-client email conflict',
        SQLERRM LIKE '%membership_email_conflict%',
        SQLERRM
      );
  END;

  BEGIN
    PERFORM id FROM webproc.admin_create_client_membership(v_cliente_b, 'wp04a3b.user@example.com', 'Other Client');
    PERFORM pg_temp.wp04a3b_assert(33, 'active other-client email rejected', false, 'no exception');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04a3b_assert(
        33,
        'active other-client email rejected',
        SQLERRM LIKE '%active_membership_other_client%',
        SQLERRM
      );
  END;

  PERFORM id FROM webproc.admin_set_client_membership_active(v_membership_a, false);

  SELECT provisioning_state INTO v_state
  FROM webproc.admin_list_client_memberships(v_cliente_a) m
  WHERE m.id = v_membership_a;
  PERFORM pg_temp.wp04a3b_assert(34, 'deactivate membership INACTIVE', v_state = 'INACTIVE', v_state);

  SELECT id INTO v_membership_a
  FROM webproc.admin_create_client_membership(v_cliente_a, 'WP04A3b.User@Example.com', 'Reactivated');

  SELECT provisioning_state INTO v_state
  FROM webproc.admin_list_client_memberships(v_cliente_a) m
  WHERE m.id = v_membership_a;
  PERFORM pg_temp.wp04a3b_assert(35, 'reactivate same-client email', v_state = 'PENDING_AUTH', v_state);

  SELECT count(*) INTO v_count
  FROM webproc.admin_list_client_memberships(v_cliente_a) m
  WHERE m.id = v_membership_a;
  PERFORM pg_temp.wp04a3b_assert(36, 'historical row preserved (no delete)', v_count = 1, v_count::text);

  -- Client deactivation removes active resolution when user_id linked
  IF v_client IS NOT NULL THEN
    PERFORM pg_temp.wp04a3b_reset_role();
    UPDATE webproc.usuarios_clientes
    SET user_id = v_client, ativo = true
    WHERE id = v_membership_a;

    PERFORM pg_temp.wp04a3b_as_authenticated(v_admin);
    PERFORM id FROM webproc.admin_update_cliente(v_cliente_a, NULL, false);

    PERFORM pg_temp.wp04a3b_as_authenticated(v_client);
    SELECT EXISTS (
      SELECT 1
      FROM webproc.usuarios_clientes uc
      INNER JOIN webproc.clientes c ON c.id = uc.cliente_id
      WHERE uc.cliente_id = v_cliente_a
        AND uc.user_id = auth.uid()
        AND uc.ativo = true
        AND c.ativo = true
    ) INTO v_has;
    PERFORM pg_temp.wp04a3b_assert(
      40,
      'deactivated client fails Connect membership resolution',
      NOT v_has,
      v_has::text
    );
    PERFORM pg_temp.wp04a3b_as_authenticated(v_admin);
    PERFORM id FROM webproc.admin_update_cliente(v_cliente_a, NULL, true);
    PERFORM pg_temp.wp04a3b_as_authenticated(v_client);
    SELECT EXISTS (
      SELECT 1
      FROM webproc.usuarios_clientes uc
      INNER JOIN webproc.clientes c ON c.id = uc.cliente_id
      WHERE uc.cliente_id = v_cliente_a
        AND uc.user_id = auth.uid()
        AND uc.ativo = true
        AND c.ativo = true
    ) INTO v_has;
    PERFORM pg_temp.wp04a3b_assert(
      41,
      'reactivated client restores Connect membership resolution',
      v_has,
      v_has::text
    );
    PERFORM pg_temp.wp04a3b_reset_role();
    UPDATE webproc.usuarios_clientes SET user_id = NULL WHERE id = v_membership_a;
  ELSE
    PERFORM pg_temp.wp04a3b_assert(40, 'deactivated client fails membership resolution', true, 'skipped');
  END IF;

  PERFORM pg_temp.wp04a3b_reset_role();
  UPDATE webproc.usuarios_actus SET papel = v_admin_papel_saved WHERE user_id = v_admin;
END;
$$;

-- Summary
DO $$
DECLARE
  v_fail text;
BEGIN
  SELECT string_agg(case_no::text || ':' || case_name || '=' || coalesce(detail, ''), '; ' ORDER BY case_no)
  INTO v_fail
  FROM wp04a3b_assertions
  WHERE NOT passed;

  IF v_fail IS NOT NULL THEN
    RAISE EXCEPTION 'harness_failures: %', v_fail;
  END IF;
END;
$$;

SELECT
  case_no,
  case_name,
  passed,
  detail
FROM wp04a3b_assertions
ORDER BY case_no;

SELECT
  count(*) FILTER (WHERE NOT passed) AS failed_count,
  count(*) AS total
FROM wp04a3b_assertions;

ROLLBACK;
