-- WP-04C.2b: ACTUS PULSE read layer (SECURITY INVOKER aggregates + narrow author labels)
-- Depends on: webproc.processos RLS, webproc.is_active_connect_actus_user (20260329120000)

-- ---------------------------------------------------------------------------
-- Period bounds (America/Sao_Paulo business dates, half-open timestamptz)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_period_bounds(
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  period_start_ts timestamptz,
  period_end_exclusive_ts timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT
    (p_period_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    ((p_period_end + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo';
$$;

REVOKE ALL ON FUNCTION webproc.pulse_period_bounds(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.pulse_period_bounds(date, date) FROM authenticated;

-- ---------------------------------------------------------------------------
-- CLIENT must not supply cliente_id filter
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_assert_cliente_filter_allowed(p_cliente_id bigint)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_cliente_id_not_allowed'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_assert_cliente_filter_allowed(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.pulse_assert_cliente_filter_allowed(bigint) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Author context: INVOKER-visible process row required (anti directory lookup)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_caller_can_see_author_context(
  p_user_id uuid,
  p_cliente_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM webproc.processos p
    WHERE p.created_by = p_user_id
      AND p.cliente_id = p_cliente_id
  );
$$;

REVOKE ALL ON FUNCTION webproc.pulse_caller_can_see_author_context(uuid, bigint) FROM PUBLIC;
-- authenticated EXECUTE required: pulse_author_identity (DEFINER) must call this INVOKER gate so
-- processos RLS is evaluated as the session user, not the function owner.
GRANT EXECUTE ON FUNCTION webproc.pulse_caller_can_see_author_context(uuid, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION webproc.pulse_author_identity(
  p_user_id uuid,
  p_cliente_id bigint
)
RETURNS TABLE (
  display_name text,
  membership_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_nome text;
  v_email text;
  v_ativo boolean;
BEGIN
  IF NOT webproc.pulse_caller_can_see_author_context(p_user_id, p_cliente_id) THEN
    display_name := 'Usuário desconhecido';
    membership_active := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT uc.nome, uc.email, uc.ativo
  INTO v_nome, v_email, v_ativo
  FROM webproc.usuarios_clientes uc
  WHERE uc.user_id = p_user_id
    AND uc.cliente_id = p_cliente_id
  ORDER BY uc.ativo DESC, uc.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    display_name := 'Usuário desconhecido';
    membership_active := false;
    RETURN NEXT;
    RETURN;
  END IF;

  display_name := coalesce(
    nullif(trim(v_nome), ''),
    nullif(split_part(v_email, '@', 1), ''),
    'Usuário'
  );

  IF NOT v_ativo THEN
    display_name := display_name || ' (inativo)';
  END IF;

  membership_active := v_ativo;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_author_identity(uuid, bigint) FROM PUBLIC;
-- authenticated EXECUTE required: pulse_by_user / pulse_drilldown (INVOKER) invoke this via
-- CROSS JOIN LATERAL; the session role must hold EXECUTE on the callee.
GRANT EXECUTE ON FUNCTION webproc.pulse_author_identity(uuid, bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Shared row filter (authorized scope + optional filters; status = current)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_filtered_processes(
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL
)
RETURNS SETOF webproc.processos
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  PERFORM webproc.pulse_assert_cliente_filter_allowed(p_cliente_id);

  RETURN QUERY
  SELECT p.*
  FROM webproc.processos p
  WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    AND (p_created_by IS NULL OR p.created_by = p_created_by)
    AND (
      p_status IS NULL
      OR cardinality(p_status) = 0
      OR p.status = ANY (p_status)
    );
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_filtered_processes(date, date, uuid, text[], bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.pulse_filtered_processes(date, date, uuid, text[], bigint) FROM authenticated;

-- ---------------------------------------------------------------------------
-- pulse_summary
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_summary(
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL,
  p_snapshot_mode text DEFAULT 'ALL_IN_SCOPE'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_end_excl timestamptz;
  v_registered bigint;
  v_protocolled bigint;
  v_imported bigint;
  v_status_counts jsonb;
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_cliente_id_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  IF p_snapshot_mode NOT IN ('ALL_IN_SCOPE', 'REGISTERED_IN_PERIOD') THEN
    RAISE EXCEPTION 'pulse_invalid_snapshot_mode';
  END IF;

  SELECT
    (p_period_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    ((p_period_end + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
  INTO v_start, v_end_excl;

  SELECT count(*)::bigint INTO v_registered
  FROM webproc.processos p
  WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    AND (p_created_by IS NULL OR p.created_by = p_created_by)
    AND (
      p_status IS NULL
      OR cardinality(p_status) = 0
      OR p.status = ANY (p_status)
    )
    AND p.created_at >= v_start AND p.created_at < v_end_excl;

  SELECT count(*)::bigint INTO v_protocolled
  FROM webproc.processos p
  WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    AND (p_created_by IS NULL OR p.created_by = p_created_by)
    AND (
      p_status IS NULL
      OR cardinality(p_status) = 0
      OR p.status = ANY (p_status)
    )
    AND p.pendente_at IS NOT NULL
    AND p.pendente_at >= v_start AND p.pendente_at < v_end_excl;

  SELECT count(*)::bigint INTO v_imported
  FROM webproc.processos p
  WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    AND (p_created_by IS NULL OR p.created_by = p_created_by)
    AND (
      p_status IS NULL
      OR cardinality(p_status) = 0
      OR p.status = ANY (p_status)
    )
    AND p.importado_at IS NOT NULL
    AND p.importado_at >= v_start AND p.importado_at < v_end_excl;

  IF p_snapshot_mode = 'REGISTERED_IN_PERIOD' THEN
    SELECT coalesce(jsonb_object_agg(s.status, s.cnt), '{}'::jsonb)
    INTO v_status_counts
    FROM (
      SELECT p.status, count(*)::bigint AS cnt
      FROM webproc.processos p
      WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
        AND (p_created_by IS NULL OR p.created_by = p_created_by)
        AND (
          p_status IS NULL
          OR cardinality(p_status) = 0
          OR p.status = ANY (p_status)
        )
        AND p.created_at >= v_start AND p.created_at < v_end_excl
      GROUP BY p.status
    ) s;
  ELSE
    SELECT coalesce(jsonb_object_agg(s.status, s.cnt), '{}'::jsonb)
    INTO v_status_counts
    FROM (
      SELECT p.status, count(*)::bigint AS cnt
      FROM webproc.processos p
      WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
        AND (p_created_by IS NULL OR p.created_by = p_created_by)
        AND (
          p_status IS NULL
          OR cardinality(p_status) = 0
          OR p.status = ANY (p_status)
        )
      GROUP BY p.status
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'scope_label', 'Demandas no Actus Connect',
    'period', jsonb_build_object(
      'start', p_period_start,
      'end', p_period_end,
      'timezone', 'America/Sao_Paulo'
    ),
    'lifecycle_in_period', jsonb_build_object(
      'registered_count', v_registered,
      'protocolled_count', v_protocolled,
      'imported_count', v_imported
    ),
    'snapshot', jsonb_build_object(
      'mode', p_snapshot_mode,
      'status_counts', v_status_counts
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_summary(date, date, uuid, text[], bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.pulse_summary(date, date, uuid, text[], bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- pulse_daily_series (zero-filled calendar days)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_daily_series(
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL
)
RETURNS TABLE (
  business_date date,
  registered_count bigint,
  protocolled_count bigint,
  imported_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_cliente_id_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH bounds AS (
    SELECT
      (p_period_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo' AS start_ts,
      ((p_period_end + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo' AS end_ts
  ),
  days AS (
    SELECT generate_series(p_period_start, p_period_end, interval '1 day')::date AS business_date
  ),
  scoped AS (
    SELECT p.*
    FROM webproc.processos p
    WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
      AND (p_created_by IS NULL OR p.created_by = p_created_by)
      AND (
        p_status IS NULL
        OR cardinality(p_status) = 0
        OR p.status = ANY (p_status)
      )
  ),
  reg AS (
    SELECT (s.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::bigint AS c
    FROM scoped s, bounds b
    WHERE s.created_at >= b.start_ts AND s.created_at < b.end_ts
    GROUP BY 1
  ),
  prot AS (
    SELECT (s.pendente_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::bigint AS c
    FROM scoped s, bounds b
    WHERE s.pendente_at IS NOT NULL
      AND s.pendente_at >= b.start_ts AND s.pendente_at < b.end_ts
    GROUP BY 1
  ),
  imp AS (
    SELECT (s.importado_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*)::bigint AS c
    FROM scoped s, bounds b
    WHERE s.importado_at IS NOT NULL
      AND s.importado_at >= b.start_ts AND s.importado_at < b.end_ts
    GROUP BY 1
  )
  SELECT
    d.business_date,
    coalesce(reg.c, 0),
    coalesce(prot.c, 0),
    coalesce(imp.c, 0)
  FROM days d
  LEFT JOIN reg ON reg.d = d.business_date
  LEFT JOIN prot ON prot.d = d.business_date
  LEFT JOIN imp ON imp.d = d.business_date
  ORDER BY d.business_date;
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_daily_series(date, date, uuid, text[], bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.pulse_daily_series(date, date, uuid, text[], bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- pulse_by_user (ACTUS: cliente_id + created_by; CLIENT: created_by only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_by_user(
  p_metric_basis text,
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL
)
RETURNS TABLE (
  cliente_id bigint,
  user_id uuid,
  display_name text,
  membership_active boolean,
  count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_end_excl timestamptz;
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_cliente_id_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  IF p_metric_basis NOT IN ('REGISTERED', 'PROTOCOLLED', 'IMPORTED') THEN
    RAISE EXCEPTION 'pulse_invalid_metric_basis';
  END IF;

  SELECT
    (p_period_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    ((p_period_end + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
  INTO v_start, v_end_excl;

  RETURN QUERY
  WITH scoped AS (
    SELECT p.*
    FROM webproc.processos p
    WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
      AND (p_created_by IS NULL OR p.created_by = p_created_by)
      AND (
        p_status IS NULL
        OR cardinality(p_status) = 0
        OR p.status = ANY (p_status)
      )
  ),
  filtered AS (
    SELECT s.*
    FROM scoped s
    WHERE
      CASE p_metric_basis
        WHEN 'REGISTERED' THEN
          s.created_at >= v_start AND s.created_at < v_end_excl
        WHEN 'PROTOCOLLED' THEN
          s.pendente_at IS NOT NULL
          AND s.pendente_at >= v_start AND s.pendente_at < v_end_excl
        WHEN 'IMPORTED' THEN
          s.importado_at IS NOT NULL
          AND s.importado_at >= v_start AND s.importado_at < v_end_excl
      END
  ),
  grouped AS (
    SELECT
      f.cliente_id,
      f.created_by AS user_id,
      count(*)::bigint AS cnt
    FROM filtered f
    GROUP BY f.cliente_id, f.created_by
  )
  SELECT
    g.cliente_id,
    g.user_id,
    ai.display_name,
    ai.membership_active,
    g.cnt
  FROM grouped g
  CROSS JOIN LATERAL webproc.pulse_author_identity(g.user_id, g.cliente_id) ai
  ORDER BY g.cnt DESC, ai.display_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_by_user(text, date, date, uuid, text[], bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.pulse_by_user(text, date, date, uuid, text[], bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- pulse_by_client (ACTUS only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_by_client(
  p_metric_basis text,
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL
)
RETURNS TABLE (
  cliente_id bigint,
  cliente_nome text,
  cliente_ativo boolean,
  count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_end_excl timestamptz;
BEGIN
  IF NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_by_client_actus_only'
      USING ERRCODE = '42501';
  END IF;

  IF p_metric_basis NOT IN ('REGISTERED', 'PROTOCOLLED', 'IMPORTED') THEN
    RAISE EXCEPTION 'pulse_invalid_metric_basis';
  END IF;

  SELECT
    (p_period_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    ((p_period_end + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
  INTO v_start, v_end_excl;

  RETURN QUERY
  WITH scoped AS (
    SELECT p.*
    FROM webproc.processos p
    WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
      AND (p_created_by IS NULL OR p.created_by = p_created_by)
      AND (
        p_status IS NULL
        OR cardinality(p_status) = 0
        OR p.status = ANY (p_status)
      )
  ),
  filtered AS (
    SELECT s.*
    FROM scoped s
    WHERE
      CASE p_metric_basis
        WHEN 'REGISTERED' THEN
          s.created_at >= v_start AND s.created_at < v_end_excl
        WHEN 'PROTOCOLLED' THEN
          s.pendente_at IS NOT NULL
          AND s.pendente_at >= v_start AND s.pendente_at < v_end_excl
        WHEN 'IMPORTED' THEN
          s.importado_at IS NOT NULL
          AND s.importado_at >= v_start AND s.importado_at < v_end_excl
      END
  )
  SELECT
    c.id,
    c.nome,
    c.ativo,
    count(*)::bigint
  FROM filtered f
  INNER JOIN webproc.clientes c ON c.id = f.cliente_id
  GROUP BY c.id, c.nome, c.ativo
  ORDER BY count(*) DESC, c.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_by_client(text, date, date, uuid, text[], bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.pulse_by_client(text, date, date, uuid, text[], bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- pulse_drilldown (keyset pagination)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.pulse_drilldown(
  p_period_start date,
  p_period_end date,
  p_created_by uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_cliente_id bigint DEFAULT NULL,
  p_lifecycle_basis text DEFAULT 'REGISTERED',
  p_limit integer DEFAULT 25,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id_proc bigint DEFAULT NULL
)
RETURNS TABLE (
  id_proc bigint,
  cliente_id bigint,
  cliente_nome text,
  created_at timestamptz,
  pendente_at timestamptz,
  importado_at timestamptz,
  status text,
  created_by uuid,
  author_display_name text,
  author_membership_active boolean,
  n_processo text,
  exec_prov text,
  reclamante text,
  dt_fatal timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_end_excl timestamptz;
  v_limit integer;
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_cliente_id_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  IF p_lifecycle_basis NOT IN ('REGISTERED', 'PROTOCOLLED', 'IMPORTED') THEN
    RAISE EXCEPTION 'pulse_invalid_metric_basis';
  END IF;

  IF (p_cursor_created_at IS NULL) <> (p_cursor_id_proc IS NULL) THEN
    RAISE EXCEPTION 'pulse_invalid_drilldown_cursor';
  END IF;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);

  SELECT
    (p_period_start::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo',
    ((p_period_end + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Sao_Paulo'
  INTO v_start, v_end_excl;

  RETURN QUERY
  WITH scoped AS (
    SELECT p.*
    FROM webproc.processos p
    WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
      AND (p_created_by IS NULL OR p.created_by = p_created_by)
      AND (
        p_status IS NULL
        OR cardinality(p_status) = 0
        OR p.status = ANY (p_status)
      )
  ),
  filtered AS (
    SELECT s.*
    FROM scoped s
    WHERE
      CASE p_lifecycle_basis
        WHEN 'REGISTERED' THEN
          s.created_at >= v_start AND s.created_at < v_end_excl
        WHEN 'PROTOCOLLED' THEN
          s.pendente_at IS NOT NULL
          AND s.pendente_at >= v_start AND s.pendente_at < v_end_excl
        WHEN 'IMPORTED' THEN
          s.importado_at IS NOT NULL
          AND s.importado_at >= v_start AND s.importado_at < v_end_excl
      END
  ),
  ordered AS (
    SELECT f.*
    FROM filtered f
    WHERE (
      p_cursor_created_at IS NULL
      OR (f.created_at, f.id_proc) < (p_cursor_created_at, p_cursor_id_proc)
    )
    ORDER BY f.created_at DESC, f.id_proc DESC
    LIMIT v_limit
  )
  SELECT
    o.id_proc,
    o.cliente_id,
    c.nome,
    o.created_at,
    o.pendente_at,
    o.importado_at,
    o.status,
    o.created_by,
    ai.display_name,
    ai.membership_active,
    o.n_processo,
    o.exec_prov,
    o.reclamante,
    o.dt_fatal
  FROM ordered o
  INNER JOIN webproc.clientes c ON c.id = o.cliente_id
  CROSS JOIN LATERAL webproc.pulse_author_identity(o.created_by, o.cliente_id) ai
  ORDER BY o.created_at DESC, o.id_proc DESC;
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_drilldown(
  date, date, uuid, text[], bigint, text, integer, timestamptz, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.pulse_drilldown(
  date, date, uuid, text[], bigint, text, integer, timestamptz, bigint
) TO authenticated;

COMMENT ON FUNCTION webproc.pulse_summary IS
  'ACTUS PULSE: lifecycle-in-period counts + current-status snapshot (Connect demand facts only).';
