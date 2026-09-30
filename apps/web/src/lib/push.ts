import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  speak?: string; // spoken aloud when the notification is tapped
  tag?: string;
};

/** Send a push to every subscription a user has; prune dead endpoints. */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<number> {
  configure();
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", userId);
  if (!subs?.length) return 0;

  let sent = 0;
  const body = JSON.stringify(payload);
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } },
        body,
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return sent;
}
