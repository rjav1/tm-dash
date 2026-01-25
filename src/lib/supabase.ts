import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase client for browser (uses anon key)
// The anon key is safe to expose - RLS protects the data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Check if Supabase is configured
export const isSupabaseConfigured = () => {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
};

// Lazy-initialize Supabase client to avoid errors during build
let _supabase: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
};

// Legacy export for compatibility - returns the client or throws during build
// Use getSupabase() for safer access
export const supabase: SupabaseClient = (() => {
  if (isSupabaseConfigured()) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  // Return a proxy that throws helpful errors if accessed without config
  return new Proxy({} as SupabaseClient, {
    get: () => {
      throw new Error("Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    },
  });
})();
