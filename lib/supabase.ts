import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://jqmfarvzkrrovicfqyvj.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_UWFR5j4lqb1VDUSMXdkzQg_dY3Z3Khp";

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
