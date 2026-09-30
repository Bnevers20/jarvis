import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";

const DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function nowInTz(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return {
    hh: Number(parts.hour) % 24,
    mm: Number(parts.minute),
    dow: DOW[parts.weekday as string] ?? 0,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

type AlertRow = {
  id: string;
  user_id: string;
  label: string;
  message: string;
  time_local: string; // "HH:MM:SS"
  days: number[];
  last_fired_on: string | null;
  profiles: { timezone: string } | null;
};

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const provided =
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    new URL(req.url).searchParams.get("key");
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY not set" },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const { data: alerts } = await admin
    .from("scheduled_alerts")
    .select("id, user_id, label, message, time_local, days, last_fired_on, profiles!inner(timezone)")
    .eq("enabled", true);

  let fired = 0;
  for (const a of (alerts ?? []) as unknown as AlertRow[]) {
    const tz = a.profiles?.timezone || "America/Detroit";
    const now = nowInTz(tz);
    const [th, tm] = a.time_local.split(":").map(Number);
    const dayOk = !a.days?.length || a.days.includes(now.dow);
    if (now.hh === th && now.mm === tm && dayOk && a.last_fired_on !== now.ymd) {
      await sendPushToUser(admin, a.user_id, {
        title: "JARVIS",
        body: a.message,
        speak: a.message,
        tag: `alert-${a.id}`,
      });
      await admin
        .from("scheduled_alerts")
        .update({ last_fired_on: now.ymd })
        .eq("id", a.id);
      await admin.from("alerts").insert({
        user_id: a.user_id,
        kind: "scheduled",
        title: a.label,
        body: a.message,
        sent_via: ["push"],
      });
      fired++;
    }
  }
  return NextResponse.json({ ok: true, fired });
}
