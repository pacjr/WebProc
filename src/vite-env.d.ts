/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project API URL (https://<project-ref>.supabase.co) — public, build-time. */
  readonly VITE_SUPABASE_URL: string;
  /** Browser-safe Supabase anon/publishable key — public, build-time. Never service_role. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** Optional project ref for tooling/docs; not used by the Supabase client initializer. */
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_SITE_PUBLIC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
