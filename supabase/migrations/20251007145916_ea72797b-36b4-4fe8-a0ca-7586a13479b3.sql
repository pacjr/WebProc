-- Create table for file metadata
CREATE TABLE IF NOT EXISTS public.arquivos_enviados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_proc INTEGER NOT NULL REFERENCES public.t_processoweb(id_proc) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  data_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  data_expiracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  status TEXT NOT NULL DEFAULT 'armazenado' CHECK (status IN ('armazenado', 'baixado', 'expirado')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.arquivos_enviados ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own files
CREATE POLICY "Usuários podem ver seus próprios arquivos"
ON public.arquivos_enviados
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can insert their own files
CREATE POLICY "Usuários podem inserir seus próprios arquivos"
ON public.arquivos_enviados
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own files
CREATE POLICY "Usuários podem deletar seus próprios arquivos"
ON public.arquivos_enviados
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_arquivos_enviados_id_proc ON public.arquivos_enviados(id_proc);
CREATE INDEX idx_arquivos_enviados_user_id ON public.arquivos_enviados(user_id);
CREATE INDEX idx_arquivos_enviados_status ON public.arquivos_enviados(status);
CREATE INDEX idx_arquivos_enviados_data_expiracao ON public.arquivos_enviados(data_expiracao);