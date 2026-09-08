-- WP-02A: reopen pending process, dt_fatal business rule, lifecycle hardening

-- ---------------------------------------------------------------------------
-- dt_fatal business-date validation (America/Sao_Paulo)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.enforce_processo_mutation_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'created_by_immutable'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      RAISE EXCEPTION 'cliente_id_immutable'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF current_setting('webproc.internal_status_transition', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'status_transition_not_allowed'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'EM_PREENCHIMENTO' THEN
      RAISE EXCEPTION 'invalid_initial_status'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.dt_fatal IS NOT NULL
       AND (NEW.dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date
         < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'invalid_dt_fatal_past'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.dt_fatal IS DISTINCT FROM OLD.dt_fatal
       AND NEW.dt_fatal IS NOT NULL
       AND (NEW.dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date
         < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
      RAISE EXCEPTION 'invalid_dt_fatal_past'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS processos_enforce_mutation_rules ON webproc.processos;

CREATE TRIGGER processos_enforce_mutation_rules
  BEFORE INSERT OR UPDATE ON webproc.processos
  FOR EACH ROW
  EXECUTE FUNCTION webproc.enforce_processo_mutation_rules();

-- ---------------------------------------------------------------------------
-- Protocolization RPC (add dt_fatal business-date gate)
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

  IF (v_process.dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date
     < (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'invalid_dt_fatal_past'
      USING ERRCODE = 'P0001';
  END IF;

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

  PERFORM set_config('webproc.internal_status_transition', 'true', true);

  UPDATE webproc.processos
  SET
    status = 'PENDENTE',
    pendente_at = now(),
    updated_at = now()
  WHERE id_proc = p_id_proc
  RETURNING pendente_at INTO v_pendente_at;

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
-- Reopen RPC (authoritative PENDENTE -> EM_PREENCHIMENTO gate)
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
