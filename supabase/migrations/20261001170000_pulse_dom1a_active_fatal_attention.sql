-- PULSE-DOM.1a: align fatal_today_count with active operational statuses (EM_PREENCHIMENTO, PENDENTE).
-- Forward-only; 20261001163000 remains historical record on DEV.

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
  v_fatal_today bigint;
  v_fatal_overdue bigint;
  v_today_sp date;
BEGIN
  IF p_cliente_id IS NOT NULL AND NOT webproc.is_active_connect_actus_user() THEN
    RAISE EXCEPTION 'pulse_cliente_id_not_allowed'
      USING ERRCODE = '42501';
  END IF;

  IF p_snapshot_mode NOT IN ('ALL_IN_SCOPE', 'REGISTERED_IN_PERIOD') THEN
    RAISE EXCEPTION 'pulse_invalid_snapshot_mode';
  END IF;

  v_today_sp := (current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date;

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

  -- Operational attention: active status + Data Fatal (scope filters only; not period-bound)
  SELECT count(*)::bigint INTO v_fatal_today
  FROM webproc.processos p
  WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    AND (p_created_by IS NULL OR p.created_by = p_created_by)
    AND (
      p_status IS NULL
      OR cardinality(p_status) = 0
      OR p.status = ANY (p_status)
    )
    AND p.dt_fatal IS NOT NULL
    AND p.status IN ('EM_PREENCHIMENTO', 'PENDENTE')
    AND (p.dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date = v_today_sp;

  SELECT count(*)::bigint INTO v_fatal_overdue
  FROM webproc.processos p
  WHERE (p_cliente_id IS NULL OR p.cliente_id = p_cliente_id)
    AND (p_created_by IS NULL OR p.created_by = p_created_by)
    AND (
      p_status IS NULL
      OR cardinality(p_status) = 0
      OR p.status = ANY (p_status)
    )
    AND p.dt_fatal IS NOT NULL
    AND p.status IN ('EM_PREENCHIMENTO', 'PENDENTE')
    AND (p.dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date < v_today_sp;

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
      'status_counts', v_status_counts,
      'fatal_today_count', v_fatal_today,
      'fatal_overdue_count', v_fatal_overdue
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.pulse_summary(date, date, uuid, text[], bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.pulse_summary(date, date, uuid, text[], bigint, text) TO authenticated;

COMMENT ON FUNCTION webproc.pulse_summary IS
  'ACTUS PULSE: lifecycle-in-period + snapshot + Data Fatal operational attention (active EM/PENDENTE only).';
