import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceRoleKey, getSupabaseUrl } from './config.ts';
import { HttpError } from './http.ts';

export interface PrepareUploadResult {
  success: boolean;
  document_id: string;
  cliente_id: number;
  id_proc: number;
  object_key: string;
  nome: string | null;
  nome_arquivo: string;
  content_type: string;
  tamanho: number;
}

export interface RegisterUploadResult {
  success: boolean;
  already_registered?: boolean;
  document_id: string;
  id_proc: number;
  tipo: string;
  storage_state: string;
}

export interface ResolveDownloadTargetResult {
  success: boolean;
  document_id: string;
  id_proc: number;
  cliente_id: number;
  object_key: string;
  content_type: string;
  nome_arquivo: string;
  storage_state: string;
  tamanho: number;
}

function createWebprocServiceClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'webproc' },
  });
}

function mapDbError(error: { message?: string; details?: string; hint?: string }, fallback: string): HttpError {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' | ') || fallback;
  const lower = message.toLowerCase();

  if (lower.includes('membership_required')) {
    return new HttpError('Active client membership required', 403, 'membership_required');
  }
  if (lower.includes('not_process_creator')) {
    return new HttpError('Only the process creator may upload documents', 403, 'not_process_creator');
  }
  if (lower.includes('invalid_status_for_document_mutation')) {
    return new HttpError('Process is not open for document upload', 409, 'invalid_status');
  }
  if (lower.includes('arquivo_exceeds_max_size')) {
    return new HttpError('File exceeds maximum allowed size', 413, 'file_too_large');
  }
  if (lower.includes('invalid_content_type')) {
    return new HttpError('Unsupported content type', 400, 'invalid_content_type');
  }
  if (lower.includes('conflicting_document_id')) {
    return new HttpError('Conflicting document identity', 409, 'conflicting_document_id');
  }

  return new HttpError(message, 400, 'database_error');
}

function mapDownloadDbError(
  error: { message?: string; details?: string; hint?: string },
  fallback: string,
): HttpError {
  const message = [error.message, error.details, error.hint].filter(Boolean).join(' | ') || fallback;
  const lower = message.toLowerCase();

  if (lower.includes('not_authenticated')) {
    return new HttpError('Authentication required', 401, 'not_authenticated');
  }
  if (lower.includes('documento_not_found')) {
    return new HttpError('Document not found', 404, 'documento_not_found');
  }
  if (lower.includes('download_not_authorized')) {
    return new HttpError('Download not authorized', 403, 'download_not_authorized');
  }
  if (lower.includes('link_document_no_r2')) {
    return new HttpError('Link documents are not stored in R2', 409, 'link_document_no_r2');
  }
  if (lower.includes('document_bytes_unavailable')) {
    return new HttpError('Document bytes are no longer available', 410, 'document_bytes_unavailable');
  }
  if (lower.includes('invalid_storage_state_for_download')) {
    return new HttpError('Document is not available for download', 409, 'invalid_storage_state_for_download');
  }
  if (lower.includes('invalid_object_key_format')) {
    return new HttpError('Document storage invariant failed', 500, 'invalid_object_key_format');
  }

  return new HttpError('Download resolution failed', 500, 'download_resolution_failed');
}

export async function serverPrepareDocumentUpload(input: {
  id_proc: number;
  actor_user_id: string;
  nome: string | null;
  nome_arquivo: string;
  content_type: string;
  tamanho: number;
}): Promise<PrepareUploadResult> {
  const supabase = createWebprocServiceClient();
  const { data, error } = await supabase.rpc('server_prepare_document_upload', {
    p_id_proc: input.id_proc,
    p_actor_user_id: input.actor_user_id,
    p_nome: input.nome,
    p_nome_arquivo: input.nome_arquivo,
    p_content_type: input.content_type,
    p_tamanho: input.tamanho,
    p_document_id: null,
  });

  if (error) throw mapDbError(error, 'Prepare upload failed');
  if (!data?.success) throw new HttpError('Prepare upload failed', 400, 'prepare_failed');

  return data as PrepareUploadResult;
}

export async function serverRegisterConfirmedDocumentUpload(input: {
  id_proc: number;
  actor_user_id: string;
  nome: string | null;
  nome_arquivo: string;
  content_type: string;
  tamanho: number;
  document_id: string;
}): Promise<RegisterUploadResult> {
  const supabase = createWebprocServiceClient();
  const { data, error } = await supabase.rpc('server_register_confirmed_document_upload', {
    p_id_proc: input.id_proc,
    p_actor_user_id: input.actor_user_id,
    p_nome: input.nome,
    p_nome_arquivo: input.nome_arquivo,
    p_content_type: input.content_type,
    p_tamanho: input.tamanho,
    p_document_id: input.document_id,
  });

  if (error) throw mapDbError(error, 'Confirm upload failed');
  if (!data?.success) throw new HttpError('Confirm upload failed', 400, 'confirm_failed');

  return data as RegisterUploadResult;
}

export async function countStoredArquivoRows(idProc: number, documentId?: string): Promise<number> {
  const supabase = createWebprocServiceClient();
  let query = supabase
    .from('processo_documentos')
    .select('id', { count: 'exact', head: true })
    .eq('id_proc', idProc)
    .eq('tipo', 'ARQUIVO')
    .eq('storage_state', 'STORED');

  if (documentId) query = query.eq('id', documentId);

  const { count, error } = await query;
  if (error) throw mapDbError(error, 'Document lookup failed');
  return count ?? 0;
}

export async function serverResolveArquivoDownloadTarget(input: {
  document_id: string;
  actor_user_id: string;
}): Promise<ResolveDownloadTargetResult> {
  const supabase = createWebprocServiceClient();
  const { data, error } = await supabase.rpc('server_resolve_arquivo_download_target', {
    p_document_id: input.document_id,
    p_actor_user_id: input.actor_user_id,
  });

  if (error) throw mapDownloadDbError(error, 'Download resolution failed');
  if (!data?.success) {
    throw new HttpError('Download resolution failed', 500, 'download_resolution_failed');
  }

  return data as ResolveDownloadTargetResult;
}
