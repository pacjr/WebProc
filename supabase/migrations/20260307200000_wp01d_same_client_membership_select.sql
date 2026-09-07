-- WP-01D: same-client membership identity visibility (read-only; avoids RLS recursion)
-- Depends on: 20260307180000_wp01_webproc_schema.sql, 20260307190000_wp01c_usuarios_clientes_nome.sql

CREATE SCHEMA IF NOT EXISTS webproc_private;

REVOKE ALL ON SCHEMA webproc_private FROM PUBLIC;
GRANT USAGE ON SCHEMA webproc_private TO authenticated;

CREATE OR REPLACE FUNCTION webproc_private.has_active_client_membership(p_cliente_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM webproc.usuarios_clientes uc
    WHERE uc.cliente_id = p_cliente_id
      AND uc.user_id = auth.uid()
      AND uc.ativo = true
  );
$$;

REVOKE ALL ON FUNCTION webproc_private.has_active_client_membership(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc_private.has_active_client_membership(bigint) TO authenticated;

DROP POLICY IF EXISTS "membership_select_own" ON webproc.usuarios_clientes;

CREATE POLICY "membership_select_same_client"
  ON webproc.usuarios_clientes
  FOR SELECT
  TO authenticated
  USING (
    ativo = true
    AND webproc_private.has_active_client_membership(cliente_id)
  );
