-- WP-02B.2: operational domain capabilities (private evaluators/recorders + process trigger)

-- ---------------------------------------------------------------------------
-- Temporal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.business_date(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT (coalesce(p_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

CREATE OR REPLACE FUNCTION webproc_private.dt_fatal_business_date(p_dt_fatal timestamptz)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
  SELECT (p_dt_fatal AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

CREATE OR REPLACE FUNCTION webproc_private.compute_not_released_temporal_state(
  p_status text,
  p_dt_fatal timestamptz,
  p_business_date date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_deadline_date date;
BEGIN
  IF p_status IS DISTINCT FROM 'EM_PREENCHIMENTO' OR p_dt_fatal IS NULL THEN
    RETURN NULL;
  END IF;

  v_deadline_date := webproc_private.dt_fatal_business_date(p_dt_fatal);

  IF p_business_date < v_deadline_date - 1 THEN
    RETURN NULL;
  ELSIF p_business_date = v_deadline_date - 1 THEN
    RETURN 'D+1';
  ELSIF p_business_date = v_deadline_date THEN
    RETURN 'D0';
  ELSE
    RETURN 'EXPIRED';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.business_date(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.dt_fatal_business_date(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.compute_not_released_temporal_state(text, timestamptz, date) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Immutable event recorder
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
-- Situation lifecycle helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.insert_situacao_material_change(
  p_situation_id uuid,
  p_id_proc bigint,
  p_cliente_id bigint,
  p_change_type text,
  p_previous_value text,
  p_new_value text,
  p_change_data jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE sql
SET search_path = webproc, webproc_private, pg_temp
AS $$
  INSERT INTO webproc.operacional_situacao_mudancas (
    situation_id,
    id_proc,
    cliente_id,
    change_type,
    previous_value,
    new_value,
    change_data
  )
  VALUES (
    p_situation_id,
    p_id_proc,
    p_cliente_id,
    p_change_type,
    p_previous_value,
    p_new_value,
    coalesce(p_change_data, '{}'::jsonb)
  )
  RETURNING change_id;
$$;

REVOKE ALL ON FUNCTION webproc_private.insert_situacao_material_change(uuid, bigint, bigint, text, text, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.resolve_active_deadline_situations(
  p_id_proc bigint,
  p_cliente_id bigint,
  p_resolution_reason text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_situation webproc.operacional_situacoes%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR v_situation IN
    SELECT *
    FROM webproc.operacional_situacoes s
    WHERE s.id_proc = p_id_proc
      AND s.lifecycle_state = 'ACTIVE'
      AND s.situation_type IN (
        'DEADLINE_APPROACHING_NOT_RELEASED',
        'DEADLINE_EXPIRED_NOT_RELEASED'
      )
    FOR UPDATE
  LOOP
    UPDATE webproc.operacional_situacoes
    SET
      lifecycle_state = 'RESOLVED',
      resolved_at = now(),
      resolution_reason = p_resolution_reason,
      last_evaluated_at = now()
    WHERE situation_id = v_situation.situation_id;

    PERFORM webproc_private.insert_situacao_material_change(
      v_situation.situation_id,
      p_id_proc,
      p_cliente_id,
      'SITUATION_RESOLVED',
      'ACTIVE',
      'RESOLVED',
      jsonb_build_object(
        'resolution_reason', p_resolution_reason,
        'temporal_state', v_situation.temporal_state,
        'situation_type', v_situation.situation_type
      )
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.resolve_active_deadline_situations(bigint, bigint, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.create_deadline_situation(
  p_id_proc bigint,
  p_cliente_id bigint,
  p_situation_type text,
  p_temporal_state text,
  p_business_date date,
  p_dt_fatal timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_situation_id uuid;
BEGIN
  INSERT INTO webproc.operacional_situacoes (
    id_proc,
    cliente_id,
    situation_type,
    lifecycle_state,
    temporal_state,
    context
  )
  VALUES (
    p_id_proc,
    p_cliente_id,
    p_situation_type,
    'ACTIVE',
    p_temporal_state,
    jsonb_build_object(
      'declared_dt_fatal', p_dt_fatal,
      'business_date_at_detection', p_business_date
    )
  )
  RETURNING situation_id INTO v_situation_id;

  PERFORM webproc_private.insert_situacao_material_change(
    v_situation_id,
    p_id_proc,
    p_cliente_id,
    'SITUATION_CREATED',
    NULL,
    p_temporal_state,
    jsonb_build_object(
      'situation_type', p_situation_type,
      'temporal_state', p_temporal_state
    )
  );

  RETURN v_situation_id;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.create_deadline_situation(bigint, bigint, text, text, date, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION webproc_private.ensure_deadline_intervention(
  p_situation_id uuid,
  p_id_proc bigint,
  p_cliente_id bigint
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_intervention_id uuid;
BEGIN
  INSERT INTO webproc.operacional_intervencoes (
    situation_id,
    id_proc,
    cliente_id,
    intervention_type,
    channel
  )
  VALUES (
    p_situation_id,
    p_id_proc,
    p_cliente_id,
    'DEADLINE_ALERT',
    'WEBPROC'
  )
  ON CONFLICT (situation_id, intervention_type, channel) DO NOTHING;

  SELECT i.intervention_id
  INTO v_intervention_id
  FROM webproc.operacional_intervencoes i
  WHERE i.situation_id = p_situation_id
    AND i.intervention_type = 'DEADLINE_ALERT'
    AND i.channel = 'WEBPROC';

  RETURN v_intervention_id;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.ensure_deadline_intervention(uuid, bigint, bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- OPA projection (not persisted)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.build_operational_projection(p_id_proc bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_business_date date;
  v_temporal_state text;
  v_opa text;
  v_alert_available boolean := false;
  v_intervention_id uuid;
  v_active_types text[] := ARRAY[]::text[];
BEGIN
  SELECT *
  INTO v_process
  FROM webproc.processos
  WHERE id_proc = p_id_proc;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_business_date := webproc_private.business_date();
  v_temporal_state := webproc_private.compute_not_released_temporal_state(
    v_process.status,
    v_process.dt_fatal,
    v_business_date
  );

  IF v_process.status = 'EM_PREENCHIMENTO' AND v_temporal_state = 'D+1' THEN
    v_opa := 'PREDICT';
  ELSIF v_process.status = 'EM_PREENCHIMENTO'
        AND v_temporal_state IN ('D0', 'EXPIRED') THEN
    v_opa := 'ACT';
  ELSIF v_process.status = 'EM_PREENCHIMENTO' THEN
    v_opa := 'OBSERVE';
  ELSE
    v_opa := 'OBSERVE';
    v_temporal_state := NULL;
  END IF;

  SELECT coalesce(array_agg(s.situation_type ORDER BY s.situation_type), ARRAY[]::text[])
  INTO v_active_types
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = p_id_proc
    AND s.lifecycle_state = 'ACTIVE'
    AND s.situation_type IN (
      'DEADLINE_APPROACHING_NOT_RELEASED',
      'DEADLINE_EXPIRED_NOT_RELEASED'
    )
    AND s.temporal_state IN ('D+1', 'D0', 'EXPIRED');

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

  v_alert_available := v_intervention_id IS NOT NULL;

  RETURN jsonb_build_object(
    'opa', v_opa,
    'temporal_state', v_temporal_state,
    'not_released_to_actus', v_process.status = 'EM_PREENCHIMENTO',
    'alert_available', v_alert_available,
    'intervention_id', v_intervention_id,
    'active_situation_types', to_jsonb(v_active_types)
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.build_operational_projection(bigint) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Core evaluator
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.operational_situations_process(
  p_id_proc bigint,
  p_business_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_process webproc.processos%ROWTYPE;
  v_business_date date;
  v_temporal_state text;
  v_approaching webproc.operacional_situacoes%ROWTYPE;
  v_expired webproc.operacional_situacoes%ROWTYPE;
  v_situation_id uuid;
  v_created boolean := false;
  v_material_changes integer := 0;
BEGIN
  IF p_business_date IS NULL THEN
    v_business_date := webproc_private.business_date();
  ELSE
    v_business_date := p_business_date;
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

  v_temporal_state := webproc_private.compute_not_released_temporal_state(
    v_process.status,
    v_process.dt_fatal,
    v_business_date
  );

  SELECT *
  INTO v_approaching
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = p_id_proc
    AND s.lifecycle_state = 'ACTIVE'
    AND s.situation_type = 'DEADLINE_APPROACHING_NOT_RELEASED'
  FOR UPDATE;

  SELECT *
  INTO v_expired
  FROM webproc.operacional_situacoes s
  WHERE s.id_proc = p_id_proc
    AND s.lifecycle_state = 'ACTIVE'
    AND s.situation_type = 'DEADLINE_EXPIRED_NOT_RELEASED'
  FOR UPDATE;

  IF v_temporal_state = 'EXPIRED' THEN
    IF v_approaching.situation_id IS NOT NULL THEN
      UPDATE webproc.operacional_situacoes
      SET
        lifecycle_state = 'RESOLVED',
        resolved_at = now(),
        resolution_reason = 'DEADLINE_EXPIRED',
        last_evaluated_at = now()
      WHERE situation_id = v_approaching.situation_id;

      PERFORM webproc_private.insert_situacao_material_change(
        v_approaching.situation_id,
        p_id_proc,
        v_process.cliente_id,
        'SITUATION_RESOLVED',
        'ACTIVE',
        'RESOLVED',
        jsonb_build_object(
          'resolution_reason', 'DEADLINE_EXPIRED',
          'temporal_state', v_approaching.temporal_state,
          'situation_type', v_approaching.situation_type
        )
      );

      v_material_changes := v_material_changes + 1;
    END IF;

    IF v_expired.situation_id IS NULL THEN
      v_situation_id := webproc_private.create_deadline_situation(
        p_id_proc,
        v_process.cliente_id,
        'DEADLINE_EXPIRED_NOT_RELEASED',
        'EXPIRED',
        v_business_date,
        v_process.dt_fatal
      );
      v_created := true;
      v_material_changes := v_material_changes + 1;
    ELSE
      UPDATE webproc.operacional_situacoes
      SET last_evaluated_at = now()
      WHERE situation_id = v_expired.situation_id;

      v_situation_id := v_expired.situation_id;
    END IF;

    PERFORM webproc_private.ensure_deadline_intervention(
      v_situation_id,
      p_id_proc,
      v_process.cliente_id
    );

  ELSIF v_temporal_state IN ('D+1', 'D0') THEN
    IF v_expired.situation_id IS NOT NULL THEN
      PERFORM webproc_private.resolve_active_deadline_situations(
        p_id_proc,
        v_process.cliente_id,
        'DEADLINE_CHANGED'
      );
      v_material_changes := v_material_changes + 1;
      v_expired := NULL;
    END IF;

    SELECT *
    INTO v_approaching
    FROM webproc.operacional_situacoes s
    WHERE s.id_proc = p_id_proc
      AND s.lifecycle_state = 'ACTIVE'
      AND s.situation_type = 'DEADLINE_APPROACHING_NOT_RELEASED'
    FOR UPDATE;

    IF v_approaching.situation_id IS NULL THEN
      v_situation_id := webproc_private.create_deadline_situation(
        p_id_proc,
        v_process.cliente_id,
        'DEADLINE_APPROACHING_NOT_RELEASED',
        v_temporal_state,
        v_business_date,
        v_process.dt_fatal
      );
      v_created := true;
      v_material_changes := v_material_changes + 1;
    ELSIF v_approaching.temporal_state IS DISTINCT FROM v_temporal_state THEN
      PERFORM webproc_private.insert_situacao_material_change(
        v_approaching.situation_id,
        p_id_proc,
        v_process.cliente_id,
        'TEMPORAL_STATE_CHANGED',
        v_approaching.temporal_state,
        v_temporal_state,
        jsonb_build_object(
          'situation_type', v_approaching.situation_type
        )
      );

      UPDATE webproc.operacional_situacoes
      SET
        temporal_state = v_temporal_state,
        last_evaluated_at = now()
      WHERE situation_id = v_approaching.situation_id;

      v_material_changes := v_material_changes + 1;
      v_situation_id := v_approaching.situation_id;
    ELSE
      UPDATE webproc.operacional_situacoes
      SET last_evaluated_at = now()
      WHERE situation_id = v_approaching.situation_id;

      v_situation_id := v_approaching.situation_id;
    END IF;

    PERFORM webproc_private.ensure_deadline_intervention(
      v_situation_id,
      p_id_proc,
      v_process.cliente_id
    );

  ELSE
    IF v_approaching.situation_id IS NOT NULL OR v_expired.situation_id IS NOT NULL THEN
      PERFORM webproc_private.resolve_active_deadline_situations(
        p_id_proc,
        v_process.cliente_id,
        'DEADLINE_CHANGED'
      );
      v_material_changes := v_material_changes + 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id_proc', p_id_proc,
    'business_date', v_business_date,
    'temporal_state', v_temporal_state,
    'created', v_created,
    'material_changes', v_material_changes
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.operational_situations_process(bigint, date) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Temporal batch worker entry point
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.evaluate_temporal_operational_batch(
  p_business_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
DECLARE
  v_business_date date;
  v_id_proc bigint;
  v_examined integer := 0;
  v_transitioned integer := 0;
  v_skipped_locked integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF p_business_date IS NULL THEN
    v_business_date := webproc_private.business_date();
  ELSE
    v_business_date := p_business_date;
  END IF;

  FOR v_id_proc IN
    SELECT p.id_proc
    FROM webproc.processos p
    WHERE p.status = 'EM_PREENCHIMENTO'
      AND p.dt_fatal IS NOT NULL
      AND webproc_private.dt_fatal_business_date(p.dt_fatal) <= v_business_date + 1
    ORDER BY p.id_proc
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_examined := v_examined + 1;
      v_result := webproc_private.operational_situations_process(v_id_proc, v_business_date);

      IF coalesce((v_result ->> 'material_changes')::integer, 0) > 0
         OR coalesce(v_result ->> 'created', 'false')::boolean THEN
        v_transitioned := v_transitioned + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object(
            'id_proc', v_id_proc,
            'error', SQLERRM
          )
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'business_date', v_business_date,
    'examined', v_examined,
    'transitioned', v_transitioned,
    'skipped_locked', v_skipped_locked,
    'errors', v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.evaluate_temporal_operational_batch(date) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- PROCESS_CREATED trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION webproc_private.on_processo_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = webproc, webproc_private, pg_temp
AS $$
BEGIN
  PERFORM webproc_private.record_operational_event(
    NEW.id_proc,
    NEW.cliente_id,
    'PROCESS_CREATED',
    NEW.created_by,
    jsonb_build_object(
      'initial_status', NEW.status,
      'initial_dt_fatal', NEW.dt_fatal
    )
  );

  PERFORM webproc_private.operational_situations_process(NEW.id_proc);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION webproc_private.on_processo_inserted() FROM PUBLIC;

DROP TRIGGER IF EXISTS processos_record_operational_created ON webproc.processos;

CREATE TRIGGER processos_record_operational_created
  AFTER INSERT ON webproc.processos
  FOR EACH ROW
  EXECUTE FUNCTION webproc_private.on_processo_inserted();
