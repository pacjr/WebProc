-- WP-03.1: document domain model, governed capabilities, operational evidence (database only)
-- WP-03.1B (same migration, unapplied remotely): infrastructure boundary correction —
-- object_key is server-internal; not exposed to authenticated clients or caller-supplied paths.
-- WP-03.1C (same migration, unapplied remotely): upload sequencing + service_role server facade —
-- STORED means R2 verified; prepare returns identity/key without inserting metadata.

-- ---------------------------------------------------------------------------
-- Schema extensions: webproc.processo_documentos
-- ---------------------------------------------------------------------------

ALTER TABLE webproc.processo_documentos
  ADD COLUMN storage_state text,
  ADD COLUMN persisted_at timestamptz,
  ADD COLUMN purged_at timestamptz,
  ADD COLUMN r2_cleanup_pending boolean NOT NULL DEFAULT false;

ALTER TABLE webproc.processo_documentos
  DROP CONSTRAINT IF EXISTS processo_documentos_link_arquivo_check;

ALTER TABLE webproc.processo_documentos
  ADD CONSTRAINT processo_documentos_storage_state_check CHECK (
    storage_state IS NULL
    OR storage_state IN ('STORED', 'PERSISTED', 'PURGED')
  );

ALTER TABLE webproc.processo_documentos
  ADD CONSTRAINT processo_documentos_link_arquivo_check CHECK (
    (
      tipo = 'LINK'
      AND url IS NOT NULL
      AND object_key IS NULL
      AND storage_state IS NULL
      AND persisted_at IS NULL
      AND purged_at IS NULL
      AND r2_cleanup_pending = false
    )
    OR (
      tipo = 'ARQUIVO'
      AND object_key IS NOT NULL
      AND url IS NULL
      AND storage_state IS NOT NULL
    )
  );

ALTER TABLE webproc.processo_documentos
  ADD CONSTRAINT processo_documentos_arquivo_size_check CHECK (
    tamanho IS NULL
    OR tamanho <= 104857600
  );

ALTER TABLE webproc.processo_documentos
  ADD CONSTRAINT processo_documentos_arquivo_persisted_check CHECK (
    storage_state IS DISTINCT FROM 'PERSISTED'
    OR persisted_at IS NOT NULL
  );

ALTER TABLE webproc.processo_documentos
  ADD CONSTRAINT processo_documentos_arquivo_purged_check CHECK (
    storage_state IS DISTINCT FROM 'PURGED'
    OR purged_at IS NOT NULL
  );

CREATE INDEX processo_documentos_active_lookup_idx
  ON webproc.processo_documentos (id_proc, tipo, storage_state);

CREATE INDEX processo_documentos_r2_cleanup_idx
  ON webproc.processo_documentos (id_proc)
  WHERE r2_cleanup_pending = true
    AND tipo = 'ARQUIVO'
    AND storage_state IN ('STORED', 'PERSISTED');

-- ---------------------------------------------------------------------------
-- Operational evidence: extend event types
-- ---------------------------------------------------------------------------

ALTER TABLE webproc.operacional_eventos
  DROP CONSTRAINT operacional_eventos_event_type_check;

ALTER TABLE webproc.operacional_eventos
  ADD CONSTRAINT operacional_eventos_event_type_check CHECK (
    event_type IN (
      'PROCESS_CREATED',
      'DEADLINE_CHANGED',
      'PROTOCOLIZED',
      'REOPENED',
      'DOCUMENT_ADDED',
      'DOCUMENT_REMOVED',
      'DOCUMENT_TRANSFER_CONFIRMED'
    )
  );

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.documento_max_file_bytes()
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT 104857600::bigint;
$$;

COMMENT ON FUNCTION webproc_private.documento_max_file_bytes() IS
  'WP-03 initial technical file size limit (100 MiB). Adjust via forward migration of this function; Edge/server enforcement remains primary.';

CREATE OR REPLACE FUNCTION webproc_private.documento_allowed_content_types()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION webproc_private.validate_arquivo_policy(
  p_content_type text,
  p_tamanho bigint,
  p_nome_arquivo text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF coalesce(trim(p_nome_arquivo), '') = '' THEN
    RAISE EXCEPTION 'missing_nome_arquivo'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_tamanho IS NULL OR p_tamanho <= 0 THEN
    RAISE EXCEPTION 'invalid_tamanho'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_tamanho > webproc_private.documento_max_file_bytes() THEN
    RAISE EXCEPTION 'arquivo_exceeds_max_size'
      USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(trim(p_content_type), '') = ''
     OR NOT (lower(trim(p_content_type)) = ANY (webproc_private.documento_allowed_content_types())) THEN
    RAISE EXCEPTION 'invalid_content_type'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.generate_document_object_key(
  p_cliente_id bigint,
  p_id_proc bigint,
  p_document_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT format(
    'webproc/%s/%s/%s',
    p_cliente_id,
    p_id_proc,
    p_document_id
  );
$$;

CREATE OR REPLACE FUNCTION webproc_private.assert_canonical_object_key(
  p_object_key text,
  p_cliente_id bigint,
  p_id_proc bigint,
  p_document_id uuid
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF p_object_key IS DISTINCT FROM webproc_private.generate_document_object_key(
    p_cliente_id,
    p_id_proc,
    p_document_id
  ) THEN
    RAISE EXCEPTION 'invalid_object_key_format'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

ALTER TABLE webproc.processo_documentos
  ADD CONSTRAINT processo_documentos_object_key_format_check CHECK (
    object_key IS NULL
    OR object_key ~ '^webproc/[0-9]+/[0-9]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

CREATE OR REPLACE FUNCTION webproc_private.is_active_documento(
  p_tipo text,
  p_storage_state text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT
    p_tipo = 'LINK'
    OR (
      p_tipo = 'ARQUIVO'
      AND p_storage_state IN ('STORED', 'PERSISTED')
    );
$$;

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
  );
$$;

CREATE OR REPLACE FUNCTION webproc_private.build_document_event_data(
  p_document webproc.processo_documentos
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN jsonb_strip_nulls(
    jsonb_build_object(
      'document_id', p_document.id,
      'id_proc', p_document.id_proc,
      'tipo', p_document.tipo,
      'nome', p_document.nome,
      'nome_arquivo', p_document.nome_arquivo,
      'tamanho', p_document.tamanho,
      'url', CASE WHEN p_document.tipo = 'LINK' THEN p_document.url ELSE NULL END
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.record_document_event(
  p_document webproc.processo_documentos,
  p_event_type text,
  p_actor_user_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.record_operational_event(
    p_document.id_proc,
    (
      SELECT p.cliente_id
      FROM webproc.processos p
      WHERE p.id_proc = p_document.id_proc
    ),
    p_event_type,
    p_actor_user_id,
    webproc_private.build_document_event_data(p_document)
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.actor_has_active_client_membership(
  p_cliente_id bigint,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM webproc.usuarios_clientes uc
    WHERE uc.cliente_id = p_cliente_id
      AND uc.user_id = p_user_id
      AND uc.ativo = true
  );
$$;

CREATE OR REPLACE FUNCTION webproc_private.authorize_document_removal(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS webproc.processo_documentos
LANGUAGE plpgsql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
  v_process webproc.processos%ROWTYPE;
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

  IF NOT webproc_private.actor_has_active_client_membership(
    v_process.cliente_id,
    p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.created_by IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'not_process_creator'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.status IS DISTINCT FROM 'EM_PREENCHIMENTO' THEN
    RAISE EXCEPTION 'invalid_status_for_document_mutation'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_document;
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.mark_documentos_r2_cleanup_for_process(p_id_proc bigint)
RETURNS integer
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE webproc.processo_documentos d
  SET r2_cleanup_pending = true
  WHERE d.id_proc = p_id_proc
    AND d.tipo = 'ARQUIVO'
    AND d.storage_state IN ('STORED', 'PERSISTED')
    AND d.r2_cleanup_pending = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.list_documentos_r2_cleanup_candidates()
RETURNS TABLE (
  document_id uuid,
  id_proc bigint,
  cliente_id bigint,
  object_key text,
  storage_state text,
  r2_cleanup_pending boolean
)
LANGUAGE sql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT
    d.id,
    d.id_proc,
    p.cliente_id,
    d.object_key,
    d.storage_state,
    d.r2_cleanup_pending
  FROM webproc.processo_documentos d
  INNER JOIN webproc.processos p ON p.id_proc = d.id_proc
  WHERE d.tipo = 'ARQUIVO'
    AND d.r2_cleanup_pending = true
    AND d.storage_state IN ('STORED', 'PERSISTED');
$$;

CREATE OR REPLACE FUNCTION webproc_private.confirmar_transferencia_documento(
  p_document_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
  v_process webproc.processos%ROWTYPE;
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

  SELECT *
  INTO v_process
  FROM webproc.processos p
  WHERE p.id_proc = v_document.id_proc;

  IF v_process.status NOT IN ('PENDENTE', 'IMPORTADO', 'CONCLUIDO') THEN
    RAISE EXCEPTION 'invalid_status_for_transfer_confirmation'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_document.storage_state IS DISTINCT FROM 'STORED' THEN
    RAISE EXCEPTION 'invalid_storage_state_for_transfer_confirmation'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE webproc.processo_documentos
  SET
    storage_state = 'PERSISTED',
    persisted_at = now()
  WHERE id = p_document_id
  RETURNING * INTO v_document;

  PERFORM webproc_private.record_document_event(
    v_document,
    'DOCUMENT_TRANSFER_CONFIRMED',
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document.id,
    'storage_state', v_document.storage_state,
    'persisted_at', v_document.persisted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.purgar_documento_arquivo(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
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

  IF v_document.storage_state IS DISTINCT FROM 'PERSISTED' THEN
    RAISE EXCEPTION 'invalid_storage_state_for_purge'
      USING ERRCODE = 'P0001';
  END IF;

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
    'purged_at', v_document.purged_at
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.documento_max_file_bytes() FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.documento_allowed_content_types() FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.generate_document_object_key(bigint, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.assert_canonical_object_key(text, bigint, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.validate_arquivo_policy(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.is_active_documento(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.process_has_active_documents(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.build_document_event_data(webproc.processo_documentos) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.record_document_event(webproc.processo_documentos, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.actor_has_active_client_membership(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.authorize_document_removal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.mark_documentos_r2_cleanup_for_process(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.list_documentos_r2_cleanup_candidates() FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.confirmar_transferencia_documento(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.purgar_documento_arquivo(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Extend operational event recorder
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.record_operational_event(
  p_id_proc bigint,
  p_cliente_id bigint,
  p_event_type text,
  p_actor_user_id uuid,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_event_id bigint;
BEGIN
  IF p_event_type = 'PROCESS_CREATED' THEN
    IF coalesce(p_event_data ->> 'initial_status', '') <> 'EM_PREENCHIMENTO' THEN
      RAISE EXCEPTION 'invalid_process_created_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_event_type = 'DEADLINE_CHANGED' THEN
    IF NOT (p_event_data ? 'previous_dt_fatal') OR NOT (p_event_data ? 'new_dt_fatal') THEN
      RAISE EXCEPTION 'invalid_deadline_changed_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_event_type = 'PROTOCOLIZED' THEN
    IF coalesce(p_event_data ->> 'previous_status', '') <> 'EM_PREENCHIMENTO'
       OR coalesce(p_event_data ->> 'new_status', '') <> 'PENDENTE' THEN
      RAISE EXCEPTION 'invalid_protocolized_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_event_type = 'REOPENED' THEN
    IF coalesce(p_event_data ->> 'previous_status', '') <> 'PENDENTE'
       OR coalesce(p_event_data ->> 'new_status', '') <> 'EM_PREENCHIMENTO' THEN
      RAISE EXCEPTION 'invalid_reopened_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_event_type = 'DOCUMENT_ADDED' THEN
    IF coalesce(p_event_data ->> 'document_id', '') = ''
       OR coalesce(p_event_data ->> 'tipo', '') = '' THEN
      RAISE EXCEPTION 'invalid_document_added_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_event_type = 'DOCUMENT_REMOVED' THEN
    IF coalesce(p_event_data ->> 'document_id', '') = ''
       OR coalesce(p_event_data ->> 'tipo', '') = '' THEN
      RAISE EXCEPTION 'invalid_document_removed_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_event_type = 'DOCUMENT_TRANSFER_CONFIRMED' THEN
    IF coalesce(p_event_data ->> 'document_id', '') = ''
       OR coalesce(p_event_data ->> 'tipo', '') = '' THEN
      RAISE EXCEPTION 'invalid_document_transfer_confirmed_payload'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_event_type'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO webproc.operacional_eventos (
    id_proc,
    cliente_id,
    event_type,
    actor_user_id,
    event_data
  )
  VALUES (
    p_id_proc,
    p_cliente_id,
    p_event_type,
    p_actor_user_id,
    coalesce(p_event_data, '{}'::jsonb)
  )
  RETURNING event_id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.record_operational_event(bigint, bigint, text, uuid, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Document evidence trigger (LINK direct inserts)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.on_documento_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  IF NEW.tipo = 'LINK' THEN
    PERFORM webproc_private.record_document_event(
      NEW,
      'DOCUMENT_ADDED',
      NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.on_documento_inserted() FROM PUBLIC;

DROP TRIGGER IF EXISTS processo_documentos_record_document_added ON webproc.processo_documentos;

CREATE TRIGGER processo_documentos_record_document_added
  AFTER INSERT ON webproc.processo_documentos
  FOR EACH ROW
  EXECUTE FUNCTION webproc_private.on_documento_inserted();

-- ---------------------------------------------------------------------------
-- RLS: route removals through governed RPCs
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "processo_documentos_delete_creator_draft" ON webproc.processo_documentos;

REVOKE DELETE ON webproc.processo_documentos FROM authenticated;

-- ---------------------------------------------------------------------------
-- Client-visible column grants (hide infrastructure columns from authenticated)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE webproc.processo_documentos FROM authenticated;

GRANT SELECT (
  id,
  id_proc,
  tipo,
  nome,
  url,
  nome_arquivo,
  content_type,
  tamanho,
  storage_state,
  persisted_at,
  purged_at,
  created_by,
  created_at
) ON webproc.processo_documentos TO authenticated;

GRANT INSERT (
  id_proc,
  tipo,
  nome,
  url,
  created_by
) ON webproc.processo_documentos TO authenticated;

-- ---------------------------------------------------------------------------
-- Trusted-server document capabilities (NOT granted to authenticated)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.authorize_arquivo_upload(
  p_id_proc bigint,
  p_actor_user_id uuid,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint
)
RETURNS webproc.processos
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
  INTO STRICT v_process
  FROM webproc.processos p
  WHERE p.id_proc = p_id_proc;

  IF NOT webproc_private.actor_has_active_client_membership(
    v_process.cliente_id,
    p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'membership_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.created_by IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'not_process_creator'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_process.status IS DISTINCT FROM 'EM_PREENCHIMENTO' THEN
    RAISE EXCEPTION 'invalid_status_for_document_mutation'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM webproc_private.validate_arquivo_policy(
    p_content_type,
    p_tamanho,
    p_nome_arquivo
  );

  RETURN v_process;
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.prepare_document_upload(
  p_id_proc bigint,
  p_actor_user_id uuid,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_document_id uuid;
  v_object_key text;
BEGIN
  v_process := webproc_private.authorize_arquivo_upload(
    p_id_proc,
    p_actor_user_id,
    p_nome_arquivo,
    p_content_type,
    p_tamanho
  );

  v_document_id := coalesce(p_document_id, gen_random_uuid());

  IF EXISTS (
    SELECT 1
    FROM webproc.processo_documentos d
    WHERE d.id = v_document_id
  ) THEN
    RAISE EXCEPTION 'conflicting_document_id'
      USING ERRCODE = 'P0001';
  END IF;

  v_object_key := webproc_private.generate_document_object_key(
    v_process.cliente_id,
    p_id_proc,
    v_document_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document_id,
    'cliente_id', v_process.cliente_id,
    'id_proc', p_id_proc,
    'object_key', v_object_key,
    'nome', nullif(trim(p_nome), ''),
    'nome_arquivo', trim(p_nome_arquivo),
    'content_type', lower(trim(p_content_type)),
    'tamanho', p_tamanho
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.register_confirmed_document_upload(
  p_id_proc bigint,
  p_actor_user_id uuid,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_existing webproc.processo_documentos%ROWTYPE;
  v_object_key text;
  v_document webproc.processo_documentos%ROWTYPE;
  v_nome text := nullif(trim(p_nome), '');
  v_nome_arquivo text := trim(p_nome_arquivo);
  v_content_type text := lower(trim(p_content_type));
BEGIN
  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'missing_document_id'
      USING ERRCODE = 'P0001';
  END IF;

  v_process := webproc_private.authorize_arquivo_upload(
    p_id_proc,
    p_actor_user_id,
    p_nome_arquivo,
    p_content_type,
    p_tamanho
  );

  v_object_key := webproc_private.generate_document_object_key(
    v_process.cliente_id,
    p_id_proc,
    p_document_id
  );

  SELECT *
  INTO v_existing
  FROM webproc.processo_documentos d
  WHERE d.id = p_document_id;

  IF FOUND THEN
    IF v_existing.id_proc = p_id_proc
       AND v_existing.tipo = 'ARQUIVO'
       AND v_existing.storage_state = 'STORED'
       AND v_existing.object_key = v_object_key
       AND v_existing.nome_arquivo = v_nome_arquivo
       AND v_existing.content_type = v_content_type
       AND v_existing.tamanho = p_tamanho
       AND v_existing.created_by = p_actor_user_id
       AND v_existing.nome IS NOT DISTINCT FROM v_nome
    THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_registered', true,
        'document_id', v_existing.id,
        'id_proc', v_existing.id_proc,
        'tipo', v_existing.tipo,
        'storage_state', v_existing.storage_state
      );
    END IF;

    RAISE EXCEPTION 'conflicting_document_id'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO webproc.processo_documentos (
    id,
    id_proc,
    tipo,
    nome,
    object_key,
    nome_arquivo,
    content_type,
    tamanho,
    storage_state,
    created_by
  )
  VALUES (
    p_document_id,
    p_id_proc,
    'ARQUIVO',
    v_nome,
    v_object_key,
    v_nome_arquivo,
    v_content_type,
    p_tamanho,
    'STORED',
    p_actor_user_id
  )
  RETURNING * INTO v_document;

  PERFORM webproc_private.record_document_event(
    v_document,
    'DOCUMENT_ADDED',
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_registered', false,
    'document_id', v_document.id,
    'id_proc', v_document.id_proc,
    'tipo', v_document.tipo,
    'storage_state', v_document.storage_state
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.resolve_arquivo_removal_target(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
BEGIN
  v_document := webproc_private.authorize_document_removal(p_document_id, p_actor_user_id);

  IF v_document.tipo IS DISTINCT FROM 'ARQUIVO' THEN
    RAISE EXCEPTION 'invalid_document_type'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document.id,
    'id_proc', v_document.id_proc,
    'object_key', v_document.object_key,
    'content_type', v_document.content_type,
    'nome_arquivo', v_document.nome_arquivo
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc_private.finalizar_remocao_documento(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
BEGIN
  v_document := webproc_private.authorize_document_removal(p_document_id, p_actor_user_id);

  IF v_document.tipo IS DISTINCT FROM 'ARQUIVO' THEN
    RAISE EXCEPTION 'invalid_document_type'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM webproc_private.record_document_event(
    v_document,
    'DOCUMENT_REMOVED',
    p_actor_user_id
  );

  DELETE FROM webproc.processo_documentos
  WHERE id = p_document_id;

  RETURN jsonb_build_object(
    'success', true,
    'document_id', p_document_id,
    'tipo', v_document.tipo
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.authorize_arquivo_upload(bigint, uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.resolve_arquivo_removal_target(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.finalizar_remocao_documento(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Server-only facade (webproc schema; callable via PostgREST as service_role)
-- p_actor_user_id is trusted only in this execution context — Edge MUST derive
-- it from validated JWT, never from an unauthenticated browser-supplied value.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.server_prepare_document_upload(
  p_id_proc bigint,
  p_actor_user_id uuid,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.prepare_document_upload(
    p_id_proc,
    p_actor_user_id,
    p_nome,
    p_nome_arquivo,
    p_content_type,
    p_tamanho,
    p_document_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc.server_register_confirmed_document_upload(
  p_id_proc bigint,
  p_actor_user_id uuid,
  p_nome text,
  p_nome_arquivo text,
  p_content_type text,
  p_tamanho bigint,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.register_confirmed_document_upload(
    p_id_proc,
    p_actor_user_id,
    p_nome,
    p_nome_arquivo,
    p_content_type,
    p_tamanho,
    p_document_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc.server_resolve_arquivo_removal_target(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.resolve_arquivo_removal_target(
    p_document_id,
    p_actor_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION webproc.server_finalize_arquivo_removal(
  p_document_id uuid,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  RETURN webproc_private.finalizar_remocao_documento(
    p_document_id,
    p_actor_user_id
  );
END;
$$;

GRANT USAGE ON SCHEMA webproc TO service_role;

REVOKE ALL ON FUNCTION webproc.server_prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION webproc.server_register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) TO service_role;

REVOKE ALL ON FUNCTION webproc.server_resolve_arquivo_removal_target(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_resolve_arquivo_removal_target(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_resolve_arquivo_removal_target(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION webproc.server_finalize_arquivo_removal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc.server_finalize_arquivo_removal(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION webproc.server_finalize_arquivo_removal(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Public domain capabilities (browser-safe; document_id oriented)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc.remover_documento(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_document webproc.processo_documentos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = 'P0001';
  END IF;

  v_document := webproc_private.authorize_document_removal(p_document_id, auth.uid());

  IF v_document.tipo = 'ARQUIVO' THEN
    RAISE EXCEPTION 'arquivo_removal_requires_coordination'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM webproc_private.record_document_event(
    v_document,
    'DOCUMENT_REMOVED',
    auth.uid()
  );

  DELETE FROM webproc.processo_documentos
  WHERE id = p_document_id;

  RETURN jsonb_build_object(
    'success', true,
    'document_id', p_document_id,
    'tipo', v_document.tipo
  );
END;
$$;

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
  v_cleanup_count integer;
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

  PERFORM set_config('webproc.internal_status_transition', 'true', true);

  UPDATE webproc.processos
  SET
    status = 'CANCELADO',
    cancelado_at = now(),
    cancelado_por = auth.uid(),
    motivo_cancelamento = nullif(trim(p_motivo), ''),
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
    'r2_cleanup_marked', v_cleanup_count,
    'already_cancelado', false
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc.remover_documento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.remover_documento(uuid) TO authenticated;

REVOKE ALL ON FUNCTION webproc.cancelar_processo(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.cancelar_processo(bigint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Lifecycle RPCs: active document completeness
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

REVOKE ALL ON FUNCTION webproc.protocolar_processo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.protocolar_processo(bigint) TO authenticated;

REVOKE ALL ON FUNCTION webproc.reabrir_processo(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webproc.reabrir_processo(bigint) TO authenticated;

-- ---------------------------------------------------------------------------
-- WP-03 private execution boundary (DEFINER for authenticated closure)
-- ---------------------------------------------------------------------------

ALTER FUNCTION webproc_private.documento_max_file_bytes() SECURITY DEFINER;
ALTER FUNCTION webproc_private.documento_allowed_content_types() SECURITY DEFINER;
ALTER FUNCTION webproc_private.generate_document_object_key(bigint, bigint, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.assert_canonical_object_key(text, bigint, bigint, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.validate_arquivo_policy(text, bigint, text) SECURITY DEFINER;
ALTER FUNCTION webproc_private.is_active_documento(text, text) SECURITY DEFINER;
ALTER FUNCTION webproc_private.process_has_active_documents(bigint) SECURITY DEFINER;
ALTER FUNCTION webproc_private.build_document_event_data(webproc.processo_documentos) SECURITY DEFINER;
ALTER FUNCTION webproc_private.record_document_event(webproc.processo_documentos, text, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.actor_has_active_client_membership(bigint, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.authorize_document_removal(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.authorize_arquivo_upload(bigint, uuid, text, text, bigint) SECURITY DEFINER;
ALTER FUNCTION webproc_private.prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.mark_documentos_r2_cleanup_for_process(bigint) SECURITY DEFINER;
ALTER FUNCTION webproc_private.resolve_arquivo_removal_target(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.finalizar_remocao_documento(uuid, uuid) SECURITY DEFINER;
ALTER FUNCTION webproc_private.on_documento_inserted() SECURITY DEFINER;

REVOKE ALL ON FUNCTION webproc_private.documento_max_file_bytes() FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.documento_allowed_content_types() FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.generate_document_object_key(bigint, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.assert_canonical_object_key(text, bigint, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.validate_arquivo_policy(text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.is_active_documento(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.process_has_active_documents(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.build_document_event_data(webproc.processo_documentos) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.record_document_event(webproc.processo_documentos, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.actor_has_active_client_membership(bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.authorize_document_removal(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.authorize_arquivo_upload(bigint, uuid, text, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.mark_documentos_r2_cleanup_for_process(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.resolve_arquivo_removal_target(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.finalizar_remocao_documento(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.on_documento_inserted() FROM PUBLIC;

COMMENT ON FUNCTION webproc.remover_documento(uuid) IS
  'WP-03: governed LINK removal with DOCUMENT_REMOVED evidence. ARQUIVO removal is document_id-based through trusted Edge/server coordination.';

COMMENT ON FUNCTION webproc.server_prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) IS
  'WP-03 server facade: authorize upload and return canonical document_id/object_key without inserting metadata. service_role only; actor from Edge JWT.';

COMMENT ON FUNCTION webproc.server_register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) IS
  'WP-03 server facade: insert STORED ARQUIVO and DOCUMENT_ADDED after Edge verifies R2 object. Idempotent on retry. service_role only.';

COMMENT ON FUNCTION webproc.server_resolve_arquivo_removal_target(uuid, uuid) IS
  'WP-03 server facade: ARQUIVO removal lookup returning object_key to Edge only. service_role only.';

COMMENT ON FUNCTION webproc.server_finalize_arquivo_removal(uuid, uuid) IS
  'WP-03 server facade: finalize ARQUIVO metadata removal after R2 DELETE. service_role only.';

COMMENT ON FUNCTION webproc_private.prepare_document_upload(bigint, uuid, text, text, text, bigint, uuid) IS
  'WP-03 internal: upload authorization/key preparation without processo_documentos insert.';

COMMENT ON FUNCTION webproc_private.register_confirmed_document_upload(bigint, uuid, text, text, text, bigint, uuid) IS
  'WP-03 internal: confirmed upload registration (STORED + DOCUMENT_ADDED). Not callable via Data API.';

COMMENT ON FUNCTION webproc_private.resolve_arquivo_removal_target(uuid, uuid) IS
  'WP-03 internal ARQUIVO removal lookup. Returns object_key only to server execution context.';

COMMENT ON FUNCTION webproc_private.finalizar_remocao_documento(uuid, uuid) IS
  'WP-03 internal ARQUIVO metadata removal after external R2 delete succeeds.';

COMMENT ON FUNCTION webproc_private.purgar_documento_arquivo(uuid) IS
  'WP-03 technical purge after FlowProc persistence. No user-visible operational event.';

COMMENT ON FUNCTION webproc_private.confirmar_transferencia_documento(uuid, uuid) IS
  'WP-03 FlowProc persistence confirmation (deferred auth to WP-04). Not granted to authenticated.';
