import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (login, MFA enrollment, client-side auth calls). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
