-- PROTO-DOM.1a: allow authenticated to evaluate XOR CHECK on webproc.processos writes
--
-- processos_identificacao_xor_check invokes webproc_private.processo_identificacao_xor_ok.
-- PROTO-DOM.1 revoked EXECUTE from PUBLIC; PostgREST/Data API inserts run as role
-- authenticated and must EXECUTE the CHECK helper (pure validation, no data access).

GRANT EXECUTE ON FUNCTION webproc_private.processo_identificacao_xor_ok(text, text)
  TO authenticated;

COMMENT ON FUNCTION webproc_private.processo_identificacao_xor_ok(text, text) IS
  'PO invariant: exactly one of n_processo or exec_prov is non-empty after trim. '
  'EXECUTE granted to authenticated so CHECK on webproc.processos can be evaluated '
  'on direct INSERT/UPDATE from the Data API; function is IMMUTABLE and read-only.';
