-- WP-03 Step 2B: secure document download authorization (database only)
-- Depends on: 20260307280000_wp03_documentos_domain.sql,
--             20260307290000_wp03b_actus_internal_read_access.sql
--
-- object_key is resolved only in server execution context after document_id authorization.
-- p_actor_user_id is trusted only when supplied by Edge after JWT validation (service_role facade).

-- ---------------------------------------------------------------------------
-- Actus actor helper (parameterized; for service_role RPC context)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.actor_is_active_actus_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM webproc.usuarios_actus ua
      WHERE ua.user_id = p_user_id
        AND ua.ativo = true
    );
$$;

REVOKE ALL ON FUNCTION webproc_private.actor_is_active_actus_user(uuid) FROM PUBLIC;

COMMENT ON FUNCTION webproc_private.actor_is_active_actus_user(uuid) IS
  'Returns true when p_user_id is an active Actus user. For server-side download authorization; not a mutation grant.';

-- ---------------------------------------------------------------------------
-- Private download resolver
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

REVOKE ALL ON FUNCTION webproc_private.resolve_arquivo_download_target(uuid, uuid) FROM PUBLIC;

COMMENT ON FUNCTION webproc_private.resolve_arquivo_download_target(uuid, uuid) IS
  'WP-03 Step 2B: authorize document_id and return server-only ARQUIVO download metadata including object_key. Not callable via Data API.';

-- ---------------------------------------------------------------------------
-- Server facade (service_role only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.server_resolve_arquivo_download_target(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.resolve_arquivo_download_target(
    p_document_id,
    p_actor_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.server_resolve_arquivo_download_target(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_resolve_arquivo_download_target(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_resolve_arquivo_download_target(uuid, uuid) TO service_role;

COMMENT ON FUNCTION webproc.server_resolve_arquivo_download_target(uuid, uuid) IS
  'WP-03 Step 2B server facade: resolve authorized ARQUIVO download target. service_role only; actor from Edge JWT.';
