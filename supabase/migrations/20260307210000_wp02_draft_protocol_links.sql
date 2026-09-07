-- WP-02: draft editing, links, protocolization (additive; does not modify prior migrations)

-- ---------------------------------------------------------------------------
-- Private helpers (avoid RLS recursion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.is_process_creator_draft(p_id_proc bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM webproc.processos p
    WHERE p.id_proc = p_id_proc
      AND p.created_by = auth.uid()
      AND p.status = 'EM_PREENCHIMENTO'
      AND webproc_private.has_active_client_membership(p.cliente_id)
  );
$$;

REVOKE ALL ON FUNCTION webproc_private.is_process_creator_draft(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc_private.is_process_creator_draft(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- Process mutation integrity (status / immutable fields)
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS processos_enforce_mutation_rules ON webproc.processos;

CREATE TRIGGER processos_enforce_mutation_rules
  BEFORE UPDATE ON webproc.processos
  FOR EACH ROW
  EXECUTE FUNCTION webproc.enforce_processo_mutation_rules();

-- Restrict client UPDATE to draft rows only; block direct status transition
DROP POLICY IF EXISTS "processos_update_creator" ON webproc.processos;

CREATE POLICY "processos_update_creator_draft"
  ON webproc.processos
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    AND status = 'EM_PREENCHIMENTO'
    AND webproc_private.has_active_client_membership(cliente_id)
  )
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'EM_PREENCHIMENTO'
    AND webproc_private.has_active_client_membership(cliente_id)
  );

-- ---------------------------------------------------------------------------
-- processo_documentos write policies
-- ---------------------------------------------------------------------------

GRANT INSERT, DELETE ON webproc.processo_documentos TO authenticated;

CREATE POLICY "processo_documentos_insert_creator_draft"
  ON webproc.processo_documentos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND tipo = 'LINK'
    AND url IS NOT NULL
    AND object_key IS NULL
    AND webproc_private.is_process_creator_draft(id_proc)
  );

CREATE POLICY "processo_documentos_delete_creator_draft"
  ON webproc.processo_documentos
  FOR DELETE
  TO authenticated
  USING (
    webproc_private.is_process_creator_draft(id_proc)
  );

-- ---------------------------------------------------------------------------
-- Protocolization RPC (authoritative EM_PREENCHIMENTO -> PENDENTE gate)
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
