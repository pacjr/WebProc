-- PROTO-DOM.1: enforce protocol identification XOR (n_processo XOR exec_prov)

CREATE OR REPLACE FUNCTION webproc_private.processo_identificacao_xor_ok(
  p_n_processo text,
  p_exec_prov text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT (
    coalesce(nullif(trim(p_n_processo), ''), '') <> ''
    AND coalesce(nullif(trim(p_exec_prov), ''), '') = ''
  ) OR (
    coalesce(nullif(trim(p_n_processo), ''), '') = ''
    AND coalesce(nullif(trim(p_exec_prov), ''), '') <> ''
  );
$$;

COMMENT ON FUNCTION webproc_private.processo_identificacao_xor_ok(text, text) IS
  'PO invariant: exactly one of n_processo or exec_prov is non-empty after trim.';

REVOKE ALL ON FUNCTION webproc_private.processo_identificacao_xor_ok(text, text) FROM PUBLIC;

ALTER TABLE webproc.processos
  ADD CONSTRAINT processos_identificacao_xor_check
  CHECK (webproc_private.processo_identificacao_xor_ok(n_processo, exec_prov));

COMMENT ON CONSTRAINT processos_identificacao_xor_check ON webproc.processos IS
  'Structural XOR: n_processo XOR exec_prov (trim-normalized).';

-- ---------------------------------------------------------------------------
-- salvar_rascunho: fail-closed before UPDATE
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

  IF NOT webproc_private.processo_identificacao_xor_ok(p_n_processo, p_exec_prov) THEN
    RAISE EXCEPTION 'identificacao_xor_violation'
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
-- protocolar_processo: XOR replaces missing_processo_ou_execucao-only check
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

  IF NOT webproc_private.processo_identificacao_xor_ok(
    v_process.n_processo,
    v_process.exec_prov
  ) THEN
    RAISE EXCEPTION 'identificacao_xor_violation'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.dt_fatal IS NULL THEN
    RAISE EXCEPTION 'missing_dt_fatal'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(trim(v_process.instrucao), '') = '' THEN
    RAISE EXCEPTION 'missing_instrucao'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.process_has_active_documents(p_id_proc) THEN
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
