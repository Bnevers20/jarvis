import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function owner(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    return { supabase, user: null };
  }
  return { supabase, user };
}

/** Save (or refresh) this device's web-push subscription. */
export async function POST(req: NextRequest) {
  const { supabase, user } = await owner(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const sub = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh: string; auth: string };
  };
  if (!sub.endpoint || !sub.keys) {
    return new NextResponse("Invalid subscription", { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      keys: sub.keys,
      ua: req.headers.get("user-agent"),
    },
    { onConflict: "endpoint" },
  );
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Remove this device's subscription. */
export async function DELETE(req: NextRequest) {
  const { supabase, user } = await owner(req);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) {
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  }
  return NextResponse.json({ ok: true });
}
