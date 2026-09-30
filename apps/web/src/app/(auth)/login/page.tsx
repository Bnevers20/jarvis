"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(
    params.get("e") === "denied"
      ? "That account isn't authorized."
      : params.get("e") === "confirm"
        ? "Confirmation failed — try again."
        : null,
  );

  async function submit() {
    if (!email || !password || busy) return;
    setBusy(true);
    setNote(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setNote(error.message);
      } else if (data.session) {
        router.replace("/mfa"); // instant session → enroll 2FA
      } else {
        setNote("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
      }
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setNote(error.message);
      setBusy(false);
      return;
    }
    // AAL2 enforcement lives in middleware; /mfa handles enroll or challenge.
    router.replace("/mfa");
  }

  return (
    <main className="min-h-dvh bg-[#05070d] text-slate-100 grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-14 w-14 rounded-full mb-3"
            style={{
              background:
                "radial-gradient(circle at 50% 45%, #bfefff 0%, #38bdf8 40%, #0b1e33 85%)",
              boxShadow: "0 0 30px 6px rgba(56,189,248,0.45)",
            }}
          />
          <h1 className="text-sm font-semibold tracking-[0.3em] text-sky-300">
            JARVIS
          </h1>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl bg-slate-900/80 ring-1 ring-white/10 px-4 py-3 text-sm outline-none focus:ring-sky-400/40"
          />
          <input
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Password"
            className="w-full rounded-xl bg-slate-900/80 ring-1 ring-white/10 px-4 py-3 text-sm outline-none focus:ring-sky-400/40"
          />
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 px-4 py-3 text-sm font-semibold text-slate-950"
          >
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
          {note && <p className="text-xs text-amber-300/90 text-center">{note}</p>}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-300 pt-1"
          >
            {mode === "signin"
              ? "First time? Create your account"
              : "Have an account? Sign in"}
          </button>
        </div>
      </div>
    </main>
  );
}
