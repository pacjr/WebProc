import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';
import { getServiceRoleKey, getSupabaseUrl } from './config.ts';
import { HttpError } from './http.ts';

export async function requireAuthenticatedUser(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError('Unauthorized', 401, 'unauthorized');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new HttpError('Unauthorized', 401, 'unauthorized');
  }

  const supabase = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError('Unauthorized', 401, 'unauthorized');
  }

  return data.user;
}
