"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Alert = {
  id: string;
  label: string;
  message: string;
  time_local: string; // "HH:MM:SS"
  days: number[];
  enabled: boolean;
};

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function SettingsPage() {
  const supabase = createClient();
  const [callMe, setCallMe] = useState("sir");
  const [tone, setTone] = useState("dry");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [note, setNote] = useState<string | null>(null);

  // new-alert form
  const [nLabel, setNLabel] = useState("Morning");
  const [nMsg, setNMsg] = useState("Good morning, sir. Time to get to work.");
  const [nTime, setNTime] = useState("07:00");
  const [nDays, setNDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", user.id)
      .single();
    const s = (profile?.settings ?? {}) as { call_me?: string; tone?: string };
    if (s.call_me) setCallMe(s.call_me);
    if (s.tone) setTone(s.tone);
    const { data: rows } = await supabase
      .from("scheduled_alerts")
      .select("id, label, message, time_local, days, enabled")
      .order("time_local");
    setAlerts((rows ?? []) as Alert[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function savePersona() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ settings: { call_me: callMe, tone } })
      .eq("id", user.id);
    setNote("Saved. JARVIS will adjust.");
  }

  async function addAlert() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !nMsg.trim()) return;
    await supabase.from("scheduled_alerts").insert({
      user_id: user.id,
      label: nLabel || "Alert",
      message: nMsg.trim(),
      time_local: nTime.length === 5 ? nTime + ":00" : nTime,
      days: nDays,
    });
    setNMsg("");
    load();
  }

  async function toggle(a: Alert) {
    await supabase
      .from("scheduled_alerts")
      .update({ enabled: !a.enabled })
      .eq("id", a.id);
    load();
  }

  async function remove(id: string) {
    await supabase.from("scheduled_alerts").delete().eq("id", id);
    load();
  }

  async function enableNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setNote("This browser doesn't support push. On iPhone, add JARVIS to your Home Screen first.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setNote("Notification permission was denied.");
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      ),
    });
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    setNote(res.ok ? "Notifications enabled on this device." : "Couldn't save subscription.");
  }

  async function sendTest() {
    const res = await fetch("/api/push/test", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setNote(
      res.ok
        ? j.sent > 0
          ? "Test sent — check your phone."
          : "No devices subscribed yet. Enable notifications first."
        : "Test failed.",
    );
  }

  return (
    <main className="min-h-dvh bg-[#05070d] text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-md space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-[0.3em] text-sky-300">
            SETTINGS
          </h1>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Back
          </Link>
        </div>

        {note && (
          <p className="text-xs text-sky-300/90 bg-sky-500/10 rounded-lg px-3 py-2">
            {note}
          </p>
        )}

        {/* personality */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate-500">
            How JARVIS treats you
          </h2>
          <label className="block text-xs text-slate-400">
            What should he call you?
            <input
              value={callMe}
              onChange={(e) => setCallMe(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-sky-400/40"
            />
          </label>
          <label className="block text-xs text-slate-400">
            Tone
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="mt-1 w-full rounded-lg bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-sky-400/40"
            >
              <option value="dry">Dry &amp; witty</option>
              <option value="warm">Warm &amp; encouraging</option>
              <option value="brief">Brief &amp; all-business</option>
            </select>
          </label>
          <button
            onClick={savePersona}
            className="rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            Save
          </button>
        </section>

        {/* notifications */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate-500">
            Phone notifications
          </h2>
          <div className="flex gap-2">
            <button
              onClick={enableNotifications}
              className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm font-semibold ring-1 ring-white/10"
            >
              Enable on this device
            </button>
            <button
              onClick={sendTest}
              className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm ring-1 ring-white/10"
            >
              Test
            </button>
          </div>
        </section>

        {/* scheduled alerts */}
        <section className="space-y-3">
          <h2 className="text-xs uppercase tracking-widest text-slate-500">
            Scheduled alerts
          </h2>

          {alerts.map((a) => (
            <div
              key={a.id}
              className="rounded-xl bg-slate-900/60 ring-1 ring-white/5 p-3 flex items-start gap-3"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {a.time_local.slice(0, 5)} · {a.label}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{a.message}</div>
                <div className="text-[10px] text-slate-600 mt-1">
                  {a.days.length
                    ? a.days.map((d) => DAY_LABELS[d]).join(" ")
                    : "Every day"}
                </div>
              </div>
              <button
                onClick={() => toggle(a)}
                className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${a.enabled ? "text-sky-300" : "text-slate-600"}`}
              >
                {a.enabled ? "On" : "Off"}
              </button>
              <button
                onClick={() => remove(a.id)}
                className="text-[10px] uppercase tracking-wide text-slate-600 hover:text-rose-400 px-1 py-1"
              >
                Del
              </button>
            </div>
          ))}

          {/* new alert */}
          <div className="rounded-xl bg-slate-900/40 ring-1 ring-white/5 p-3 space-y-2">
            <div className="flex gap-2">
              <input
                value={nLabel}
                onChange={(e) => setNLabel(e.target.value)}
                placeholder="Label"
                className="w-28 rounded-lg bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-sky-400/40"
              />
              <input
                type="time"
                value={nTime}
                onChange={(e) => setNTime(e.target.value)}
                className="flex-1 rounded-lg bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-sky-400/40"
              />
            </div>
            <input
              value={nMsg}
              onChange={(e) => setNMsg(e.target.value)}
              placeholder="What should he say?"
              className="w-full rounded-lg bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-sm outline-none focus:ring-sky-400/40"
            />
            <div className="flex gap-1.5 justify-between">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setNDays((prev) =>
                      prev.includes(i)
                        ? prev.filter((x) => x !== i)
                        : [...prev, i].sort(),
                    )
                  }
                  className={`h-8 w-8 rounded-full text-xs ${
                    nDays.includes(i)
                      ? "bg-sky-500 text-slate-950 font-semibold"
                      : "bg-slate-800 text-slate-400 ring-1 ring-white/10"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={addAlert}
              className="w-full rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Add alert
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
