-- WP-02A.1: authoritative draft save RPC
-- Trigger/lifecycle defense and protocolization remain in 20260307220000.

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

  IF p_dt_fatal IS NOT NULL
     AND p_dt_fatal IS DISTINCT FROM v_process.dt_fatal
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

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', p_id_proc
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.salvar_rascunho(bigint, text, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.salvar_rascunho(bigint, text, text, text, text, text, text, timestamptz) TO authenticated;
