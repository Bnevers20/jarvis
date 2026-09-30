"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = "loading" | "enroll" | "challenge";

export default function MfaPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // Already AAL2? straight through.
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        router.replace("/");
        return;
      }

      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setStage("challenge");
        return;
      }

      // Clear any half-finished (unverified) factors, then enroll fresh.
      for (const f of factors?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "JARVIS",
      });
      if (error || !data) {
        setNote(error?.message ?? "Couldn't start 2FA enrollment.");
        setStage("enroll");
        return;
      }
      setFactorId(data.id);
      setSecret(data.totp.secret);
      setStage("enroll");
    })();
  }, [router]);

  async function verify() {
    if (code.length < 6 || busy) return;
    setBusy(true);
    setNote(null);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) {
      setNote(error.message);
      setBusy(false);
      return;
    }
    router.replace("/");
  }

  return (
    <main className="min-h-dvh bg-[#05070d] text-slate-100 grid place-items-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-sm font-semibold tracking-[0.3em] text-sky-300 mb-6">
          {stage === "challenge" ? "TWO-FACTOR" : "SET UP 2FA"}
        </h1>

        {stage === "loading" && (
          <p className="text-sm text-slate-500">One moment…</p>
        )}

        {stage === "enroll" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">
              Add JARVIS to your authenticator app (Google Authenticator, Authy,
              1Password) using this setup key, then enter the 6-digit code.
            </p>
            {secret && (
              <code className="block break-all rounded-lg bg-slate-900/80 ring-1 ring-white/10 px-3 py-2 text-xs tracking-wider text-sky-200">
                {secret}
              </code>
            )}
          </div>
        )}

        {stage === "challenge" && (
          <p className="text-xs text-slate-400 mb-3">
            Enter the 6-digit code from your authenticator.
          </p>
        )}

        {stage !== "loading" && (
          <div className="mt-4 space-y-3">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="000000"
              className="w-full text-center tracking-[0.5em] rounded-xl bg-slate-900/80 ring-1 ring-white/10 px-4 py-3 text-lg outline-none focus:ring-sky-400/40"
            />
            <button
              onClick={verify}
              disabled={busy}
              className="w-full rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 px-4 py-3 text-sm font-semibold text-slate-950"
            >
              {busy ? "…" : "Verify"}
            </button>
            {note && <p className="text-xs text-amber-300/90">{note}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
