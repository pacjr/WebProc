-- PROTO-GOV.1: mandatory cancellation reason + preserve pre-cancel lifecycle status on processos row.

ALTER TABLE webproc.processos
  ADD COLUMN IF NOT EXISTS status_antes_cancelamento text;

COMMENT ON COLUMN webproc.processos.status_antes_cancelamento IS
  'Lifecycle status immediately before cancelar_processo (EM_PREENCHIMENTO or PENDENTE).';

CREATE OR REPLACE FUNCTION webproc.cancelar_processo(
  p_id_proc bigint,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_previous_status text;
  v_cleanup_count integer;
  v_motivo_trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  v_motivo_trimmed := nullif(trim(p_motivo), '');

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

  IF v_process.status NOT IN ('EM_PREENCHIMENTO', 'PENDENTE') THEN
    RAISE EXCEPTION 'invalid_status_for_cancelar'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.status = 'CANCELADO' THEN
    RETURN jsonb_build_object(
      'success', true,
      'id_proc', v_process.id_proc,
      'status', v_process.status,
      'already_cancelado', true
    );
  END IF;

  IF v_motivo_trimmed IS NULL THEN
    RAISE EXCEPTION 'cancelamento_motivo_obrigatorio'
      USING ERRCODE = 'P0001';
  END IF;

  v_previous_status := v_process.status;

  PERFORM set_config('webproc.internal_status_transition', 'true', true);

  UPDATE webproc.processos
  SET
    status = 'CANCELADO',
    cancelado_at = now(),
    cancelado_por = auth.uid(),
    motivo_cancelamento = v_motivo_trimmed,
    status_antes_cancelamento = v_previous_status,
    origem_cancelamento = 'WEBPROC',
    updated_at = now()
  WHERE id_proc = p_id_proc
  RETURNING * INTO v_process;

  v_cleanup_count := webproc_private.mark_documentos_r2_cleanup_for_process(p_id_proc);

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', v_process.id_proc,
    'status', v_process.status,
    'cancelado_at', v_process.cancelado_at,
    'status_antes_cancelamento', v_process.status_antes_cancelamento,
    'r2_cleanup_marked', v_cleanup_count,
    'already_cancelado', false
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.cancelar_processo(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.cancelar_processo(bigint, text) TO authenticated;
