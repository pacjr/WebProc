-- PROTO-DOC.3: coordinated ARQUIVO removal + cancellation R2 cleanup (forward-only)

-- ---------------------------------------------------------------------------
-- Download: block cancelled protocols and pending R2 cleanup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.resolve_arquivo_download_target(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
  v_process webproc.processos%ROWTYPE;
  v_cliente_ativo boolean;
  v_authorized boolean := false;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_document
  FROM webproc.processo_documentos d
  WHERE d.id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO STRICT v_process
  FROM webproc.processos p
  WHERE p.id_proc = v_document.id_proc;

  IF v_process.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'invalid_status_for_download'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.r2_cleanup_pending THEN
    RAISE EXCEPTION 'document_cleanup_pending'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT c.ativo
  INTO v_cliente_ativo
  FROM webproc.clientes c
  WHERE c.id = v_process.cliente_id;

  IF webproc_private.actor_is_active_actus_user(p_actor_user_id) THEN
    v_authorized := true;
  ELSIF webproc_private.actor_has_active_client_membership(
    v_process.cliente_id,
    p_actor_user_id
  )
  AND coalesce(v_cliente_ativo, false) THEN
    v_authorized := true;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'download_not_authorized'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.tipo IS DISTINCT FROM 'ARQUIVO' THEN
    RAISE EXCEPTION 'link_document_no_r2'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.storage_state IS DISTINCT FROM 'STORED'
     AND v_document.storage_state IS DISTINCT FROM 'PERSISTED' THEN
    IF v_document.storage_state = 'PURGED' THEN
      RAISE EXCEPTION 'document_bytes_unavailable'
        USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'invalid_storage_state_for_download'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM webproc_private.assert_canonical_object_key(
    v_document.object_key,
    v_process.cliente_id,
    v_document.id_proc,
    v_document.id
  );

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document.id,
    'id_proc', v_document.id_proc,
    'cliente_id', v_process.cliente_id,
    'object_key', v_document.object_key,
    'content_type', v_document.content_type,
    'nome_arquivo', v_document.nome_arquivo,
    'storage_state', v_document.storage_state,
    'tamanho', v_document.tamanho
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Post-R2 purge for cancellation cleanup (retain row + governance metadata)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.confirm_arquivo_purged_after_r2(
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
  v_process webproc.processos%ROWTYPE;
  v_actor uuid;
BEGIN
  SELECT *
  INTO v_document
  FROM webproc.processo_documentos d
  WHERE d.id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'documento_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.tipo IS DISTINCT FROM 'ARQUIVO' THEN
    RAISE EXCEPTION 'invalid_document_type'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.storage_state = 'PURGED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'document_id', v_document.id,
      'storage_state', v_document.storage_state,
      'already_purged', true
    );
  END IF;

  IF NOT v_document.r2_cleanup_pending THEN
    RAISE EXCEPTION 'cleanup_not_pending'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.storage_state NOT IN ('STORED', 'PERSISTED') THEN
    RAISE EXCEPTION 'invalid_storage_state_for_purge'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos p
  WHERE p.id_proc = v_document.id_proc;

  v_actor := coalesce(v_process.cancelado_por, v_process.created_by);

  PERFORM webproc_private.record_document_event(
    v_document,
    'DOCUMENT_REMOVED',
    v_actor
  );

  UPDATE webproc.processo_documentos
  SET
    storage_state = 'PURGED',
    purged_at = now(),
    r2_cleanup_pending = false
  WHERE id = p_document_id
  RETURNING * INTO v_document;

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document.id,
    'storage_state', v_document.storage_state,
    'purged_at', v_document.purged_at,
    'already_purged', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.list_r2_cleanup_for_process(
  p_id_proc bigint,
  p_actor_user_id uuid
)
RETURNS TABLE (
  document_id uuid,
  object_key text,
  storage_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_process
  FROM webproc.processos p
  WHERE p.id_proc = p_id_proc;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'processo_not_found'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT webproc_private.actor_has_active_client_membership(
    v_process.cliente_id,
    p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.created_by IS DISTINCT FROM p_actor_user_id
     AND NOT webproc_private.actor_is_active_actus_user(p_actor_user_id) THEN
    RAISE EXCEPTION 'not_process_creator'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.object_key,
    d.storage_state
  FROM webproc.processo_documentos d
  WHERE d.id_proc = p_id_proc
    AND d.tipo = 'ARQUIVO'
    AND d.r2_cleanup_pending = true
    AND d.storage_state IN ('STORED', 'PERSISTED');
END;
$$;

CREATE OR REPLACE FUNCTION webproc.server_list_r2_cleanup_for_process(
  p_id_proc bigint,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'document_id', c.document_id,
    'object_key', c.object_key,
    'storage_state', c.storage_state
  )), '[]'::jsonb)
  INTO v_rows
  FROM webproc_private.list_r2_cleanup_for_process(p_id_proc, p_actor_user_id) c;

  RETURN jsonb_build_object(
    'success', true,
    'id_proc', p_id_proc,
    'candidates', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc.server_confirm_arquivo_purged_after_r2(
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.confirm_arquivo_purged_after_r2(p_document_id);
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.confirm_arquivo_purged_after_r2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.list_r2_cleanup_for_process(bigint, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION webproc.server_list_r2_cleanup_for_process(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_list_r2_cleanup_for_process(bigint, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_list_r2_cleanup_for_process(bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION webproc.server_confirm_arquivo_purged_after_r2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_confirm_arquivo_purged_after_r2(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_confirm_arquivo_purged_after_r2(uuid) TO service_role;

COMMENT ON FUNCTION webproc.server_confirm_arquivo_purged_after_r2(uuid) IS
  'PROTO-DOC.3: after successful R2 delete, mark ARQUIVO PURGED and record DOCUMENT_REMOVED (cancellation cleanup).';

-- ---------------------------------------------------------------------------
-- Active document predicate: pending R2 cleanup is non-operational
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.process_has_active_documents(p_id_proc bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM webproc.processo_documentos d
    WHERE d.id_proc = p_id_proc
      AND webproc_private.is_active_documento(d.tipo, d.storage_state)
      AND NOT (d.tipo = 'ARQUIVO' AND d.r2_cleanup_pending)
  );
$$;
