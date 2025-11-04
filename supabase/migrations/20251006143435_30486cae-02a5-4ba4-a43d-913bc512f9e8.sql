-- Criar bucket para anexos de processos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'process-attachments',
  'process-attachments', 
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain']
);

-- RLS Policy: Usuários podem ver seus próprios arquivos
CREATE POLICY "Users can view their own process attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'process-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS Policy: Usuários podem fazer upload de seus próprios arquivos
CREATE POLICY "Users can upload their own process attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'process-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- RLS Policy: Usuários podem deletar seus próprios arquivos
CREATE POLICY "Users can delete their own process attachments"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'process-attachments' AND
  auth.uid()::text = (storage.foldername(name))[1]
);