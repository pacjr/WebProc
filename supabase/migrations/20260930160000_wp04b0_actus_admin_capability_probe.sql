-- WP-04B.0: Frontend-safe Actus ADMIN capability probe (navigation/gating only).
-- Does not replace assert_actus_admin() on administrative mutations.

CREATE OR REPLACE FUNCTION webproc.is_active_connect_actus_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT webproc_private.is_active_actus_admin();
$$;

REVOKE ALL ON FUNCTION webproc.is_active_connect_actus_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.is_active_connect_actus_admin() TO authenticated;

COMMENT ON FUNCTION webproc.is_active_connect_actus_admin() IS
  'Connect ADMIN capability probe: true when auth.uid() is an active Actus usuarios_actus row with papel ADMIN. UX/gating only; not authorization for admin_* mutations.';
