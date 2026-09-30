import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

/** Send a test push to the owner's devices (from the Settings screen). */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const sent = await sendPushToUser(supabase, user.id, {
    title: "JARVIS",
    body: "Test — I can reach your phone, sir.",
    speak: "Test. I can reach your phone, sir.",
    tag: "jarvis-test",
  });
  return NextResponse.json({ ok: true, sent });
}
