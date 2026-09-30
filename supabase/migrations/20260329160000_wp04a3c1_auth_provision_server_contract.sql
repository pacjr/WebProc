-- WP-04A.3c.1: Auth provisioning DB server contract (service_role only)
-- Depends on: 20260329153000_wp04a3b_domain_admin_contract.sql
-- Does NOT call Supabase Auth Admin; Edge Function consumes these RPCs.

-- ---------------------------------------------------------------------------
-- Actus ADMIN assertion by explicit actor UUID (server / Edge JWT sub)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.assert_actus_admin_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM webproc.usuarios_actus ua
    WHERE ua.user_id = p_user_id
      AND ua.ativo = true
      AND ua.papel = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'not_actus_admin'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.assert_actus_admin_for_user(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.assert_actus_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  PERFORM webproc_private.assert_actus_admin_for_user(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.assert_actus_admin() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Dual-hat prohibition: active Actus identity must not link to client membership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.assert_no_actus_identity_conflict(
  p_auth_user_id uuid,
  p_membership_email text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := webproc_private.normalize_membership_email(p_membership_email);

  IF p_auth_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM webproc.usuarios_actus ua
    WHERE ua.ativo = true
      AND ua.user_id = p_auth_user_id
  ) THEN
    RAISE EXCEPTION 'actus_identity_conflict'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM webproc.usuarios_actus ua
    WHERE ua.ativo = true
      AND lower(trim(ua.email)) = v_email
  ) THEN
    RAISE EXCEPTION 'actus_identity_conflict'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.assert_no_actus_identity_conflict(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- server_prepare_client_membership_auth (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.server_prepare_client_membership_auth(
  p_membership_id bigint,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_membership webproc.usuarios_clientes%ROWTYPE;
  v_cliente_ativo boolean;
  v_email text;
BEGIN
  PERFORM webproc_private.assert_actus_admin_for_user(p_actor_user_id);

  SELECT uc.*
  INTO v_membership
  FROM webproc.usuarios_clientes uc
  WHERE uc.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_membership.ativo THEN
    RAISE EXCEPTION 'membership_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.ativo
  INTO v_cliente_ativo
  FROM webproc.clientes c
  WHERE c.id = v_membership.cliente_id;

  IF NOT FOUND OR NOT coalesce(v_cliente_ativo, false) THEN
    RAISE EXCEPTION 'client_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  v_email := webproc_private.normalize_membership_email(v_membership.email);

  PERFORM webproc_private.assert_no_actus_identity_conflict(NULL, v_email);

  RETURN jsonb_build_object(
    'success', true,
    'membership_id', v_membership.id,
    'normalized_email', v_email,
    'provisioning_state', webproc_private.membership_provisioning_state(
      v_membership.ativo,
      v_membership.user_id
    ),
    'existing_user_id', v_membership.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.server_prepare_client_membership_auth(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_prepare_client_membership_auth(bigint, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_prepare_client_membership_auth(bigint, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- server_link_client_membership_auth (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.server_link_client_membership_auth(
  p_membership_id bigint,
  p_actor_user_id uuid,
  p_auth_user_id uuid,
  p_auth_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_membership webproc.usuarios_clientes%ROWTYPE;
  v_cliente_ativo boolean;
  v_membership_email text;
  v_auth_email text;
  v_outcome text;
BEGIN
  PERFORM webproc_private.assert_actus_admin_for_user(p_actor_user_id);

  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_auth_user_id'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT uc.*
  INTO v_membership
  FROM webproc.usuarios_clientes uc
  WHERE uc.id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_membership.ativo THEN
    RAISE EXCEPTION 'membership_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.ativo
  INTO v_cliente_ativo
  FROM webproc.clientes c
  WHERE c.id = v_membership.cliente_id;

  IF NOT FOUND OR NOT coalesce(v_cliente_ativo, false) THEN
    RAISE EXCEPTION 'client_inactive'
      USING ERRCODE = 'P0001';
  END IF;

  v_membership_email := webproc_private.normalize_membership_email(v_membership.email);
  v_auth_email := webproc_private.normalize_membership_email(p_auth_email);

  IF v_auth_email IS DISTINCT FROM v_membership_email THEN
    RAISE EXCEPTION 'auth_email_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM webproc_private.assert_no_actus_identity_conflict(p_auth_user_id, v_membership_email);

  IF v_membership.user_id IS NOT NULL THEN
    IF v_membership.user_id = p_auth_user_id THEN
      v_outcome := 'ALREADY_LINKED';
    ELSE
      RAISE EXCEPTION 'membership_already_linked'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    PERFORM webproc_private.assert_no_other_active_client_membership(
      v_membership_email,
      p_auth_user_id,
      v_membership.id
    );

    UPDATE webproc.usuarios_clientes uc
    SET user_id = p_auth_user_id
    WHERE uc.id = v_membership.id
      AND uc.user_id IS NULL
    RETURNING * INTO v_membership;

    IF NOT FOUND THEN
      SELECT uc.*
      INTO v_membership
      FROM webproc.usuarios_clientes uc
      WHERE uc.id = p_membership_id;

      IF v_membership.user_id = p_auth_user_id THEN
        v_outcome := 'ALREADY_LINKED';
      ELSE
        RAISE EXCEPTION 'membership_already_linked'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      v_outcome := 'LINKED';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'membership_id', v_membership.id,
    'provisioning_state', webproc_private.membership_provisioning_state(
      v_membership.ativo,
      v_membership.user_id
    ),
    'outcome', v_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.server_link_client_membership_auth(bigint, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_link_client_membership_auth(bigint, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_link_client_membership_auth(bigint, uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION webproc_private.assert_actus_admin_for_user(uuid) IS
  'WP-04A.3c.1: Actus ADMIN gate by explicit auth user id (Edge JWT sub). Not callable via Data API.';

COMMENT ON FUNCTION webproc_private.assert_no_actus_identity_conflict(uuid, text) IS
  'WP-04A.3c.1: Reject client membership auth link when an active Actus identity matches auth user id or normalized membership email.';

COMMENT ON FUNCTION webproc.server_prepare_client_membership_auth(bigint, uuid) IS
  'WP-04A.3c.1: Validate membership auth provisioning eligibility before Auth Admin side effects. service_role only.';

COMMENT ON FUNCTION webproc.server_link_client_membership_auth(bigint, uuid, uuid, text) IS
  'WP-04A.3c.1: Link usuarios_clientes.user_id after server-side Auth identity verification. service_role only.';
