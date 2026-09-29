-- WP-04A.2d: Connect frontend Actus authorization probe (webproc API surface)
-- Wraps existing private helper; does not expose webproc_private via PostgREST.

CREATE OR REPLACE FUNCTION webproc.is_active_connect_actus_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT webproc_private.is_active_actus_user();
$$;

REVOKE ALL ON FUNCTION webproc.is_active_connect_actus_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.is_active_connect_actus_user() TO authenticated;

COMMENT ON FUNCTION webproc.is_active_connect_actus_user() IS
  'Connect post-login access: true when auth.uid() is an active Actus internal user (usuarios_actus). Frontend-safe wrapper.';
