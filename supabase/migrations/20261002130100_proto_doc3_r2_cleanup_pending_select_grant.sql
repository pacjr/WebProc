-- PROTO-DOC.3: expose r2_cleanup_pending to authenticated column-level SELECT grant

GRANT SELECT (r2_cleanup_pending) ON webproc.processo_documentos TO authenticated;
