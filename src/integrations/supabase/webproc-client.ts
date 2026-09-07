import { supabase } from "@/integrations/supabase/client";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { WebProcDatabase } from "@/integrations/supabase/webproc-types";

type AppDatabase = Database & WebProcDatabase;

/** WebProc database access through the shared Supabase client and `webproc` schema. */
export function webprocDb() {
  return (supabase as SupabaseClient<AppDatabase>).schema("webproc");
}

export type WebProcDbResult<T> = {
  data: T | null;
  error: PostgrestError | null;
};
