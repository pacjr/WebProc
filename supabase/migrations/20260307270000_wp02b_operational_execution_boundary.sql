-- WP-02B.4: operational execution boundary (forward-only privilege correction)
--
-- Problem: webproc_private operational functions were SECURITY INVOKER with
-- REVOKE FROM PUBLIC. Authenticated INSERT/RPC paths invoke them with session
-- privileges, causing SQLSTATE 42501 on record_operational_event.
--
-- PostgreSQL nested-call rule:
--   SECURITY DEFINER caller -> SECURITY INVOKER callee checks the *session*
--   user's EXECUTE privileges (not the definer owner).
--
-- Minimal boundary: mark the authenticated-reachable operational closure as
-- SECURITY DEFINER (owner postgres), keep REVOKE FROM PUBLIC, never GRANT
-- EXECUTE TO authenticated.
--
-- Left SECURITY INVOKER:
--   evaluate_temporal_operational_batch — postgres/worker entry only.

ALTER FUNCTION webproc_private.business_date(timestamptz) SECURITY DEFINER;
ALTER FUNCTION webproc_private.dt_fatal_business_date(timestamptz) SECURITY DEFINER;
ALTER FUNCTION webproc_private.compute_not_released_temporal_state(text, timestamptz, date) SECURITY DEFINER;
ALTER FUNCTION webproc_private.record_operational_event(bigint, bigint, text, uuid, jsonb) SECURITY DEFINER;
ALTER FUNCTION webproc_private.insert_situacao_material_change(uuid, bigint, bigint, text, text, text, jsonb) SECURITY DEFINER;
ALTER FUNCTION webproc_private.resolve_active_deadline_situations(bigint, bigint, text) SECURITY DEFINER;
ALTER FUNCTION webproc_private.create_deadline_situation(bigint, bigint, text, text, date, timestamptz) SECURITY DEFINER;
ALTER FUNCTION webproc_private.ensure_deadline_intervention(uuid, bigint, bigint) SECURITY DEFINER;
ALTER FUNCTION webproc_private.build_operational_projection(bigint) SECURITY DEFINER;
ALTER FUNCTION webproc_private.operational_situations_process(bigint, date) SECURITY DEFINER;
ALTER FUNCTION webproc_private.on_processo_inserted() SECURITY DEFINER;

REVOKE ALL ON FUNCTION webproc_private.business_date(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.dt_fatal_business_date(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.compute_not_released_temporal_state(text, timestamptz, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.record_operational_event(bigint, bigint, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.insert_situacao_material_change(uuid, bigint, bigint, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.resolve_active_deadline_situations(bigint, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.create_deadline_situation(bigint, bigint, text, text, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.ensure_deadline_intervention(uuid, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.build_operational_projection(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.operational_situations_process(bigint, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION webproc_private.on_processo_inserted() FROM PUBLIC;

COMMENT ON FUNCTION webproc_private.on_processo_inserted() IS
  'WP-02B privileged trigger orchestrator: records PROCESS_CREATED under postgres owner; not granted to authenticated.';

COMMENT ON FUNCTION webproc_private.record_operational_event(bigint, bigint, text, uuid, jsonb) IS
  'WP-02B privileged evidence recorder; invoked only from DEFINER orchestration or authorized public RPCs.';
