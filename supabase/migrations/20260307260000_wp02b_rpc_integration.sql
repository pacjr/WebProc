-- WP-02B.3: RPC integration (lifecycle hooks + operational read/presentation)

-- ---------------------------------------------------------------------------
-- salvar_rascunho (extend with operational reassessment)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.salvar_rascunho(
  p_id_proc bigint,
  p_n_processo text,
  p_exec_prov text,
  p_reclamante text,
  p_reclamado text,
  p_instrucao text,
  p_obs text,
  p_dt_fatal timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_old_dt_fatal timestamptz;
  v_operational jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos
  WHERE id_proc = p_id_proc
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.has_active_client_membership(v_process.cliente_id) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_process_creator'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.status IS DISTINCT FROM 'EM_PREENCHIMENTO' THEN
    RAISE EXCEPTION 'invalid_status_for_save'
      USING ERRCODE = 'P0001';
  END IF;

  v_old_dt_fatal := v_process.dt_fatal;

  IF p_dt_fatal IS NOT NULL
     AND p_dt_fatal IS DISTINCT FROM v_old_dt_fatal
     AND (p_dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date
       < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_dt_fatal_past',
      'id_proc', p_id_proc
    );
  END IF;

  UPDATE webproc.processos
  SET
    n_processo = nullif(trim(p_n_processo), ''),
    exec_prov = nullif(trim(p_exec_prov), ''),
    reclamante = nullif(trim(p_reclamante), ''),
    reclamado = nullif(trim(p_reclamado), ''),
    instrucao = nullif(trim(p_instrucao), ''),
    obs = nullif(trim(p_obs), ''),
    dt_fatal = p_dt_fatal,
    updated_at = now()
  WHERE id_proc = p_id_proc;

  IF p_dt_fatal IS DISTINCT FROM v_old_dt_fatal THEN
    PERFORM webproc_private.record_operational_event(
      p_id_proc,
      v_process.cliente_id,
      'DEADLINE_CHANGED',
      auth.uid(),
      jsonb_build_object(
        'previous_dt_fatal', v_old_dt_fatal,
        'new_dt_fatal', p_dt_fatal
      )
    );

    PERFORM webproc_private.resolve_active_deadline_situations(
      p_id_proc,
      v_process.cliente_id,
      'DEADLINE_CHANGED'
    );
  END IF;

  PERFORM webproc_private.operational_situations_process(p_id_proc);
  v_operational := webproc_private.build_operational_projection(p_id_proc);

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', p_id_proc,
    'operational', v_operational
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.salvar_rascunho(bigint, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.salvar_rascunho(bigint, text, text, text, text, text, text, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------------
-- protocolar_processo (extend with operational evidence)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.protocolar_processo(p_id_proc bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_pendente_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos
  WHERE id_proc = p_id_proc
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.has_active_client_membership(v_process.cliente_id) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_process_creator'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.status = 'PENDENTE' THEN
    RETURN jsonb_build_object(
      'success', true,
      'id_proc', v_process.id_proc,
      'status', v_process.status,
      'pendente_at', v_process.pendente_at,
      'already_protocolado', true
    );
  END IF;

  IF v_process.status IS DISTINCT FROM 'EM_PREENCHIMENTO' THEN
    RAISE EXCEPTION 'invalid_status_for_protocolar'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(trim(v_process.n_processo), '') = ''
     AND coalesce(trim(v_process.exec_prov), '') = '' THEN
    RAISE EXCEPTION 'missing_processo_ou_execucao'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.dt_fatal IS NULL THEN
    RAISE EXCEPTION 'missing_dt_fatal'
      USING ERRCODE = 'P0001';
  END IF;

  -- Declaration rule: new/ changed past dt_fatal is rejected on INSERT/UPDATE.
  -- A persisted dt_fatal that was valid when declared may naturally become
  -- historical through passage of time and must not block protocolization.

  IF coalesce(trim(v_process.instrucao), '') = '' THEN
    RAISE EXCEPTION 'missing_instrucao'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM webproc.processo_documentos d
    WHERE d.id_proc = p_id_proc
      AND d.tipo IN ('LINK', 'ARQUIVO')
  ) THEN
    RAISE EXCEPTION 'missing_documento'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM webproc_private.record_operational_event(
    p_id_proc,
    v_process.cliente_id,
    'PROTOCOLIZED',
    auth.uid(),
    jsonb_build_object(
      'previous_status', v_process.status,
      'new_status', 'PENDENTE'
    )
  );

  PERFORM webproc_private.resolve_active_deadline_situations(
    p_id_proc,
    v_process.cliente_id,
    'PROTOCOLIZED'
  );

  PERFORM set_config('webproc.internal_status_transition', 'true', true);

  UPDATE webproc.processos
  SET
    status = 'PENDENTE',
    pendente_at = now(),
    updated_at = now()
  WHERE id_proc = p_id_proc
  RETURNING pendente_at INTO v_pendente_at;

  PERFORM webproc_private.operational_situations_process(p_id_proc);

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', p_id_proc,
    'status', 'PENDENTE',
    'pendente_at', v_pendente_at,
    'already_protocolado', false
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.protocolar_processo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.protocolar_processo(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- reabrir_processo (extend with operational evidence)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.reabrir_processo(p_id_proc bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos
  WHERE id_proc = p_id_proc
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.has_active_client_membership(v_process.cliente_id) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not_process_creator'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.status = 'EM_PREENCHIMENTO' THEN
    RETURN jsonb_build_object(
      'success', true,
      'id_proc', v_process.id_proc,
      'status', v_process.status,
      'pendente_at', v_process.pendente_at,
      'already_open', true
    );
  END IF;

  IF v_process.status IS DISTINCT FROM 'PENDENTE' THEN
    RAISE EXCEPTION 'invalid_status_for_reabrir'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('webproc.internal_status_transition', 'true', true);

  UPDATE webproc.processos
  SET
    status = 'EM_PREENCHIMENTO',
    pendente_at = NULL,
    updated_at = now()
  WHERE id_proc = p_id_proc;

  PERFORM webproc_private.record_operational_event(
    p_id_proc,
    v_process.cliente_id,
    'REOPENED',
    auth.uid(),
    jsonb_build_object(
      'previous_status', v_process.status,
      'new_status', 'EM_PREENCHIMENTO'
    )
  );

  PERFORM webproc_private.operational_situations_process(p_id_proc);

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', p_id_proc,
    'status', 'EM_PREENCHIMENTO',
    'pendente_at', NULL,
    'already_open', false
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.reabrir_processo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.reabrir_processo(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Read: operational context (current alert projection)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.get_operational_context(p_id_proc bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_projection jsonb;
  v_alert jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos
  WHERE id_proc = p_id_proc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.has_active_client_membership(v_process.cliente_id) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  v_projection := webproc_private.build_operational_projection(p_id_proc);

  SELECT jsonb_build_object(
    'intervention_id', i.intervention_id,
    'available_at', i.available_at,
    'first_presented_at', i.first_presented_at,
    'last_presented_at', i.last_presented_at,
    'presentation_count', i.presentation_count,
    'situation_id', s.situation_id,
    'situation_type', s.situation_type,
    'temporal_state', s.temporal_state
  )
  INTO v_alert
  FROM webproc.operacional_situacoes s
  INNER JOIN webproc.operacional_intervencoes i
    ON i.situation_id = s.situation_id
   AND i.intervention_type = 'DEADLINE_ALERT'
   AND i.channel = 'WEBPROC'
  WHERE s.id_proc = p_id_proc
    AND s.lifecycle_state = 'ACTIVE'
    AND s.temporal_state IN ('D+1', 'D0', 'EXPIRED')
  ORDER BY
    CASE s.temporal_state
      WHEN 'EXPIRED' THEN 1
      WHEN 'D0' THEN 2
      WHEN 'D+1' THEN 3
      ELSE 4
    END
  LIMIT 1;

  RETURN jsonb_build_object(
    'id_proc', p_id_proc,
    'operational', v_projection,
    'current_alert', v_alert
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.get_operational_context(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.get_operational_context(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Read: operational timeline
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.get_operational_timeline(p_id_proc bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_cliente_id bigint;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT p.cliente_id
  INTO v_cliente_id
  FROM webproc.processos p
  WHERE p.id_proc = p_id_proc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.has_active_client_membership(v_cliente_id) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY (item ->> 'occurred_at') DESC), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'kind', 'event',
      'occurred_at', e.occurred_at,
      'event_id', e.event_id,
      'event_type', e.event_type,
      'actor_user_id', e.actor_user_id,
      'event_data', e.event_data
    ) AS item
    FROM webproc.operacional_eventos e
    WHERE e.id_proc = p_id_proc

    UNION ALL

    SELECT jsonb_build_object(
      'kind', 'situation_change',
      'occurred_at', c.occurred_at,
      'change_id', c.change_id,
      'situation_id', c.situation_id,
      'change_type', c.change_type,
      'previous_value', c.previous_value,
      'new_value', c.new_value,
      'change_data', c.change_data
    ) AS item
    FROM webproc.operacional_situacao_mudancas c
    WHERE c.id_proc = p_id_proc
  ) timeline;

  RETURN jsonb_build_object(
    'id_proc', p_id_proc,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.get_operational_timeline(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.get_operational_timeline(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Presentation recording
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.registrar_apresentacao_alerta(p_id_proc bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_intervention_id uuid;
  v_row webproc.operacional_intervencoes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos
  WHERE id_proc = p_id_proc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.has_active_client_membership(v_process.cliente_id) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT i.intervention_id
  INTO v_intervention_id
  FROM webproc.operacional_situacoes s
  INNER JOIN webproc.operacional_intervencoes i
    ON i.situation_id = s.situation_id
   AND i.intervention_type = 'DEADLINE_ALERT'
   AND i.channel = 'WEBPROC'
  WHERE s.id_proc = p_id_proc
    AND s.lifecycle_state = 'ACTIVE'
    AND s.temporal_state IN ('D+1', 'D0', 'EXPIRED')
  ORDER BY
    CASE s.temporal_state
      WHEN 'EXPIRED' THEN 1
      WHEN 'D0' THEN 2
      WHEN 'D+1' THEN 3
      ELSE 4
    END
  LIMIT 1;

  IF v_intervention_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'alert_not_available',
      'id_proc', p_id_proc
    );
  END IF;

  UPDATE webproc.operacional_intervencoes i
  SET
    first_presented_at = coalesce(i.first_presented_at, now()),
    last_presented_at = now(),
    presentation_count = i.presentation_count + 1
  WHERE i.intervention_id = v_intervention_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', p_id_proc,
    'intervention_id', v_row.intervention_id,
    'presentation_count', v_row.presentation_count,
    'first_presented_at', v_row.first_presented_at,
    'last_presented_at', v_row.last_presented_at
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.registrar_apresentacao_alerta(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.registrar_apresentacao_alerta(bigint) TO authenticated;
