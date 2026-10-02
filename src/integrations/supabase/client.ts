import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function requireViteEnv(name: "VITE_SUPABASE_URL" | "VITE_SUPABASE_PUBLISHABLE_KEY"): string {
  const raw = import.meta.env[name];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error(
      `Missing required configuration: ${name}. Set it in .env for local development or in the hosting build environment.`,
    );
  }
  return raw.trim();
}

function parseSupabaseUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid VITE_SUPABASE_URL: must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Invalid VITE_SUPABASE_URL: must use HTTPS.");
  }
  if (!parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Invalid VITE_SUPABASE_URL: hostname must be a Supabase project URL.");
  }
  return parsed;
}

const SUPABASE_URL = parseSupabaseUrl(requireViteEnv("VITE_SUPABASE_URL")).toString().replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = requireViteEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
