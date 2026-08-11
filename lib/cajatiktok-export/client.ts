import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireCajaTikTokExportEnv } from "@/lib/env";

export function getCajaTikTokClient() {
  const { supabaseUrl, supabaseServiceRoleKey } = requireCajaTikTokExportEnv();
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
