-- WP-04B.0: is_active_connect_actus_admin capability probe validation
-- Requires migration 20260930160000_wp04b0_actus_admin_capability_probe.sql
--
-- Run (linked DEV):
--   npx supabase@2.118.0 db query --linked --yes -f supabase/reference/wp04b0_actus_admin_capability_harness.sql

BEGIN;

CREATE TEMP TABLE wp04b0_assertions (
  case_no integer NOT NULL,
  case_name text NOT NULL,
  passed boolean NOT NULL,
  detail text
);

GRANT INSERT ON wp04b0_assertions TO authenticated;
GRANT INSERT ON wp04b0_assertions TO service_role;

CREATE OR REPLACE FUNCTION pg_temp.wp04b0_assert(
  p_case_no integer,
  p_case_name text,
  p_condition boolean,
  p_detail text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO wp04b0_assertions (case_no, case_name, passed, detail)
  VALUES (
    p_case_no,
    p_case_name,
    p_condition,
    CASE WHEN p_condition THEN NULL ELSE coalesce(p_detail, 'assertion failed') END
  );
  IF NOT p_condition THEN
    RAISE WARNING 'WP04B.0 case % failed: % — %', p_case_no, p_case_name, coalesce(p_detail, 'assertion failed');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04b0_as_authenticated(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp04b0_reset_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
END;
$$;

DO $$
DECLARE
  v_operador uuid := 'ba0c28e1-e4bb-4c8f-934f-a516939f7c8e';
  v_client uuid := '748ad66d-399e-4ab9-9112-e2cde3555759';
  v_saved_papel text;
  v_is_admin boolean;
  v_is_actus boolean;
  v_count integer;
BEGIN
  SELECT ua.papel INTO v_saved_papel
  FROM webproc.usuarios_actus ua
  WHERE ua.user_id = v_operador;

  IF v_saved_papel IS NULL THEN
    RAISE EXCEPTION 'harness requires DEV operador usuarios_actus row for %', v_operador;
  END IF;

  -- Anonymous: no auth.uid()
  PERFORM pg_temp.wp04b0_reset_role();
  SELECT webproc.is_active_connect_actus_admin() INTO v_is_admin;
  PERFORM pg_temp.wp04b0_assert(1, 'anonymous admin probe false', v_is_admin IS NOT TRUE, v_is_admin::text);

  -- OPERADOR
  PERFORM pg_temp.wp04b0_as_authenticated(v_operador);
  SELECT webproc.is_active_connect_actus_admin() INTO v_is_admin;
  SELECT webproc.is_active_connect_actus_user() INTO v_is_actus;
  PERFORM pg_temp.wp04b0_assert(2, 'OPERADOR admin probe false', v_is_admin IS NOT TRUE, v_is_admin::text);
  PERFORM pg_temp.wp04b0_assert(3, 'OPERADOR connect actus true', v_is_actus IS TRUE, v_is_actus::text);
  PERFORM pg_temp.wp04b0_reset_role();

  -- Temporary ADMIN promotion
  UPDATE webproc.usuarios_actus SET papel = 'ADMIN' WHERE user_id = v_operador;

  PERFORM pg_temp.wp04b0_as_authenticated(v_operador);
  SELECT webproc.is_active_connect_actus_admin() INTO v_is_admin;
  SELECT webproc.is_active_connect_actus_user() INTO v_is_actus;
  PERFORM pg_temp.wp04b0_assert(4, 'ADMIN admin probe true', v_is_admin IS TRUE, v_is_admin::text);
  PERFORM pg_temp.wp04b0_assert(5, 'ADMIN connect actus true', v_is_actus IS TRUE, v_is_actus::text);

  BEGIN
    PERFORM webproc.admin_list_clientes();
    PERFORM pg_temp.wp04b0_assert(6, 'ADMIN admin_list_clientes allowed', true, NULL);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04b0_assert(6, 'ADMIN admin_list_clientes allowed', false, SQLERRM);
  END;

  PERFORM pg_temp.wp04b0_reset_role();

  UPDATE webproc.usuarios_actus SET papel = v_saved_papel WHERE user_id = v_operador;

  -- OPERADOR restored: admin RPC still denied
  PERFORM pg_temp.wp04b0_as_authenticated(v_operador);
  BEGIN
    PERFORM webproc.admin_list_clientes();
    PERFORM pg_temp.wp04b0_assert(7, 'OPERADOR admin_list_clientes denied', false, 'expected not_actus_admin');
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04b0_assert(
        7,
        'OPERADOR admin_list_clientes denied',
        SQLERRM LIKE '%not_actus_admin%',
        SQLERRM
      );
  END;
  PERFORM pg_temp.wp04b0_reset_role();

  -- CLIENT
  PERFORM pg_temp.wp04b0_as_authenticated(v_client);
  SELECT webproc.is_active_connect_actus_admin() INTO v_is_admin;
  SELECT webproc.is_active_connect_actus_user() INTO v_is_actus;
  PERFORM pg_temp.wp04b0_assert(8, 'CLIENT admin probe false', v_is_admin IS NOT TRUE, v_is_admin::text);
  PERFORM pg_temp.wp04b0_assert(9, 'CLIENT connect actus false', v_is_actus IS NOT TRUE, v_is_actus::text);
  PERFORM pg_temp.wp04b0_reset_role();

  -- authenticated cannot read usuarios_actus directly
  PERFORM pg_temp.wp04b0_as_authenticated(v_operador);
  BEGIN
    SELECT count(*) INTO v_count FROM webproc.usuarios_actus;
    PERFORM pg_temp.wp04b0_assert(10, 'no direct usuarios_actus select', false, 'select succeeded');
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM pg_temp.wp04b0_assert(10, 'no direct usuarios_actus select', true, NULL);
    WHEN OTHERS THEN
      PERFORM pg_temp.wp04b0_assert(10, 'no direct usuarios_actus select', true, SQLERRM);
  END;
  PERFORM pg_temp.wp04b0_reset_role();
END;
$$;

DO $$
DECLARE
  v_failed integer;
BEGIN
  SELECT count(*) INTO v_failed FROM wp04b0_assertions WHERE NOT passed;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'WP-04B.0 harness failed % case(s)', v_failed;
  END IF;
  RAISE NOTICE 'WP-04B.0 harness: all cases passed';
END;
$$;

SELECT case_no, case_name, passed, detail
FROM wp04b0_assertions
ORDER BY case_no;

ROLLBACK;
