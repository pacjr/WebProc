-- WP-01C: operational identity on client membership (additive; does not modify WP-01 objects)

ALTER TABLE webproc.usuarios_clientes
  ADD COLUMN IF NOT EXISTS nome text NULL;
