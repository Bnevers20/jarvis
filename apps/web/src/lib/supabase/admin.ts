import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS. SERVER ONLY (cron, cross-user reads).
 * Never import this into a client component or a user-facing request path.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
