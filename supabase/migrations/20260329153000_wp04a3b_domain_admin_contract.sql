-- WP-04A.3b: Transitional Connect domain administration (Actus ADMIN only)
-- Depends on: webproc.clientes, webproc.usuarios_clientes, webproc.usuarios_actus (WP-03b)
-- Does NOT provision Supabase Auth identities.

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.normalize_membership_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_normalized text;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'invalid_email'
      USING ERRCODE = 'P0001';
  END IF;

  v_normalized := lower(trim(p_email));

  IF position('@' in v_normalized) = 0 THEN
    RAISE EXCEPTION 'invalid_email'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_normalized;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.normalize_membership_email(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.is_active_actus_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM webproc.usuarios_actus ua
    WHERE ua.user_id = auth.uid()
      AND ua.ativo = true
      AND ua.papel = 'ADMIN'
  );
$$;

REVOKE ALL ON FUNCTION webproc_private.is_active_actus_admin() FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.assert_actus_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.is_active_actus_admin() THEN
    RAISE EXCEPTION 'not_actus_admin'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.assert_actus_admin() FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.membership_provisioning_state(
  p_ativo boolean,
  p_user_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT CASE
    WHEN NOT p_ativo THEN 'INACTIVE'
    WHEN p_user_id IS NULL THEN 'PENDING_AUTH'
    ELSE 'ACTIVE'
  END;
$$;

REVOKE ALL ON FUNCTION webproc_private.membership_provisioning_state(boolean, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.assert_no_other_active_client_membership(
  p_email text,
  p_user_id uuid,
  p_exclude_membership_id bigint DEFAULT NULL
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
  v_email := webproc_private.normalize_membership_email(p_email);

  IF EXISTS (
    SELECT 1
    FROM webproc.usuarios_clientes uc
    WHERE uc.ativo = true
      AND (p_exclude_membership_id IS NULL OR uc.id <> p_exclude_membership_id)
      AND (
        lower(trim(uc.email)) = v_email
        OR (
          p_user_id IS NOT NULL
          AND uc.user_id IS NOT NULL
          AND uc.user_id = p_user_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'active_membership_other_client'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.assert_no_other_active_client_membership(text, uuid, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- admin_list_clientes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_list_clientes()
RETURNS TABLE (
  id bigint,
  codigo_cliente bigint,
  nome text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  RETURN QUERY
  SELECT c.id, c.codigo_cliente, c.nome, c.ativo, c.created_at, c.updated_at
  FROM webproc.clientes c
  ORDER BY c.nome ASC, c.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_list_clientes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_list_clientes() TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_cliente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_create_cliente(
  p_codigo_cliente bigint,
  p_nome text
)
RETURNS TABLE (
  id bigint,
  codigo_cliente bigint,
  nome text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_nome text;
  v_row webproc.clientes%ROWTYPE;
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  v_nome := trim(p_nome);
  IF v_nome IS NULL OR length(v_nome) = 0 THEN
    RAISE EXCEPTION 'invalid_cliente_nome'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_codigo_cliente IS NULL THEN
    RAISE EXCEPTION 'invalid_codigo_cliente'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO webproc.clientes (codigo_cliente, nome, ativo)
    VALUES (p_codigo_cliente, v_nome, true)
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'codigo_cliente_conflict'
        USING ERRCODE = 'P0001';
  END;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.codigo_cliente,
    v_row.nome,
    v_row.ativo,
    v_row.created_at,
    v_row.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_create_cliente(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_create_cliente(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_cliente (nome and/or ativo only — codigo_cliente is immutable)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_update_cliente(
  p_cliente_id bigint,
  p_nome text DEFAULT NULL,
  p_ativo boolean DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  codigo_cliente bigint,
  nome text,
  ativo boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_row webproc.clientes%ROWTYPE;
  v_nome text;
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  IF p_nome IS NULL AND p_ativo IS NULL THEN
    RAISE EXCEPTION 'invalid_update_payload'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row
  FROM webproc.clientes c
  WHERE c.id = p_cliente_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cliente_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  v_nome := v_row.nome;
  IF p_nome IS NOT NULL THEN
    v_nome := trim(p_nome);
    IF length(v_nome) = 0 THEN
      RAISE EXCEPTION 'invalid_cliente_nome'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE webproc.clientes c
  SET
    nome = v_nome,
    ativo = coalesce(p_ativo, c.ativo)
  WHERE c.id = p_cliente_id
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.codigo_cliente,
    v_row.nome,
    v_row.ativo,
    v_row.created_at,
    v_row.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_update_cliente(bigint, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_update_cliente(bigint, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_client_memberships
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_list_client_memberships(p_cliente_id bigint)
RETURNS TABLE (
  id bigint,
  cliente_id bigint,
  email text,
  nome text,
  user_id uuid,
  ativo boolean,
  provisioning_state text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  IF NOT EXISTS (SELECT 1 FROM webproc.clientes c WHERE c.id = p_cliente_id) THEN
    RAISE EXCEPTION 'cliente_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    uc.id,
    uc.cliente_id,
    uc.email,
    uc.nome,
    uc.user_id,
    uc.ativo,
    webproc_private.membership_provisioning_state(uc.ativo, uc.user_id),
    uc.created_at,
    uc.updated_at
  FROM webproc.usuarios_clientes uc
  WHERE uc.cliente_id = p_cliente_id
  ORDER BY uc.ativo DESC, lower(uc.email) ASC, uc.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_list_client_memberships(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_list_client_memberships(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_client_membership (create or reactivate same-client email)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_create_client_membership(
  p_cliente_id bigint,
  p_email text,
  p_nome text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  cliente_id bigint,
  email text,
  nome text,
  user_id uuid,
  ativo boolean,
  provisioning_state text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_email text;
  v_nome text;
  v_existing webproc.usuarios_clientes%ROWTYPE;
  v_row webproc.usuarios_clientes%ROWTYPE;
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  IF NOT EXISTS (SELECT 1 FROM webproc.clientes c WHERE c.id = p_cliente_id) THEN
    RAISE EXCEPTION 'cliente_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  v_email := webproc_private.normalize_membership_email(p_email);
  v_nome := nullif(trim(coalesce(p_nome, '')), '');

  SELECT * INTO v_existing
  FROM webproc.usuarios_clientes uc
  WHERE uc.cliente_id = p_cliente_id
    AND lower(trim(uc.email)) = v_email;

  IF FOUND THEN
    IF v_existing.ativo THEN
      RAISE EXCEPTION 'membership_email_conflict'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM webproc_private.assert_no_other_active_client_membership(
      v_email,
      v_existing.user_id,
      v_existing.id
    );

    UPDATE webproc.usuarios_clientes uc
    SET
      ativo = true,
      nome = coalesce(v_nome, uc.nome),
      email = v_email
    WHERE uc.id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    PERFORM webproc_private.assert_no_other_active_client_membership(v_email, NULL, NULL);

    INSERT INTO webproc.usuarios_clientes (cliente_id, email, nome, ativo, user_id)
    VALUES (p_cliente_id, v_email, v_nome, true, NULL)
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.cliente_id,
    v_row.email,
    v_row.nome,
    v_row.user_id,
    v_row.ativo,
    webproc_private.membership_provisioning_state(v_row.ativo, v_row.user_id),
    v_row.created_at,
    v_row.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_create_client_membership(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_create_client_membership(bigint, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_update_client_membership (safe metadata: nome only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_update_client_membership(
  p_membership_id bigint,
  p_nome text
)
RETURNS TABLE (
  id bigint,
  cliente_id bigint,
  email text,
  nome text,
  user_id uuid,
  ativo boolean,
  provisioning_state text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_nome text;
  v_row webproc.usuarios_clientes%ROWTYPE;
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  v_nome := nullif(trim(coalesce(p_nome, '')), '');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'invalid_membership_nome'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE webproc.usuarios_clientes uc
  SET nome = v_nome
  WHERE uc.id = p_membership_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.cliente_id,
    v_row.email,
    v_row.nome,
    v_row.user_id,
    v_row.ativo,
    webproc_private.membership_provisioning_state(v_row.ativo, v_row.user_id),
    v_row.created_at,
    v_row.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_update_client_membership(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_update_client_membership(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_client_membership_active (deactivate / reactivate)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.admin_set_client_membership_active(
  p_membership_id bigint,
  p_ativo boolean
)
RETURNS TABLE (
  id bigint,
  cliente_id bigint,
  email text,
  nome text,
  user_id uuid,
  ativo boolean,
  provisioning_state text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_row webproc.usuarios_clientes%ROWTYPE;
BEGIN
  PERFORM webproc_private.assert_actus_admin();

  SELECT * INTO v_row
  FROM webproc.usuarios_clientes uc
  WHERE uc.id = p_membership_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_ativo IS TRUE AND NOT v_row.ativo THEN
    PERFORM webproc_private.assert_no_other_active_client_membership(
      v_row.email,
      v_row.user_id,
      v_row.id
    );
  END IF;

  UPDATE webproc.usuarios_clientes uc
  SET ativo = p_ativo
  WHERE uc.id = p_membership_id
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT
    v_row.id,
    v_row.cliente_id,
    v_row.email,
    v_row.nome,
    v_row.user_id,
    v_row.ativo,
    webproc_private.membership_provisioning_state(v_row.ativo, v_row.user_id),
    v_row.created_at,
    v_row.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION webproc.admin_set_client_membership_active(bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.admin_set_client_membership_active(bigint, boolean) TO authenticated;

COMMENT ON FUNCTION webproc.admin_list_clientes IS
  'WP-04A.3b: Actus ADMIN list Connect clients for transitional provisioning.';

COMMENT ON FUNCTION webproc.admin_create_cliente IS
  'WP-04A.3b: Actus ADMIN create Connect client (codigo_cliente is mandatory legacy reference).';

COMMENT ON FUNCTION webproc.admin_update_cliente IS
  'WP-04A.3b: Actus ADMIN update client display name and/or active flag. codigo_cliente is immutable.';

COMMENT ON FUNCTION webproc.admin_list_client_memberships IS
  'WP-04A.3b: Actus ADMIN list client memberships with derived provisioning state.';

COMMENT ON FUNCTION webproc.admin_create_client_membership IS
  'WP-04A.3b: Actus ADMIN create PENDING_AUTH membership or reactivate inactive same-client email.';

COMMENT ON FUNCTION webproc.admin_update_client_membership IS
  'WP-04A.3b: Actus ADMIN update membership display name (nome) only.';

COMMENT ON FUNCTION webproc.admin_set_client_membership_active IS
  'WP-04A.3b: Actus ADMIN deactivate/reactivate membership (soft revoke; row preserved).';
