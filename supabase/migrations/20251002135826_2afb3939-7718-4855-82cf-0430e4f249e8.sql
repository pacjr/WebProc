-- Remove public read access from legal processes and documents tables
-- These policies expose sensitive legal information to unauthorized users

-- Drop the public read policy from t_processoweb
DROP POLICY IF EXISTS "Leitura pública" ON public.t_processoweb;

-- Drop the public read policy from t_docsprocessos
DROP POLICY IF EXISTS "Leitura pública" ON public.t_docsprocessos;

-- Also clean up duplicate policies (keeping the more descriptive ones)
DROP POLICY IF EXISTS "Cliente vê seus processos" ON public.t_processoweb;
DROP POLICY IF EXISTS "Cliente vê seus documentos" ON public.t_docsprocessos;

-- The remaining policies ensure users can only access their own data:
-- For t_processoweb: "Cliente vê seus próprios processos" (auth.uid() = user_id)
-- For t_docsprocessos: "Cliente vê seus próprios documentos" (checks ownership via t_processoweb)