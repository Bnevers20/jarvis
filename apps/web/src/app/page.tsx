"use client";

import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.body) {
        const fallback = await res.text();
        setMessages((m) => patchLast(m, fallback));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => patchLast(m, acc));
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    } catch {
      setMessages((m) => patchLast(m, "[connection lost]"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#05070d] text-slate-100 flex flex-col items-center">
      <div className="w-full max-w-2xl flex flex-col h-dvh px-4">
        {/* header + orb */}
        <header className="flex flex-col items-center pt-10 pb-6 shrink-0">
          <div
            className={`h-20 w-20 rounded-full mb-4 transition-all ${busy ? "animate-pulse" : ""}`}
            style={{
              background:
                "radial-gradient(circle at 50% 45%, #bfefff 0%, #38bdf8 35%, #0ea5e9 55%, #0b1e33 80%)",
              boxShadow:
                "0 0 40px 8px rgba(56,189,248,0.55), inset 0 0 20px rgba(191,239,255,0.6)",
            }}
          />
          <h1 className="text-lg font-semibold tracking-[0.3em] text-sky-300">
            JARVIS
          </h1>
          <p className="text-xs text-slate-500 mt-1">at your service</p>
        </header>

        {/* transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <p className="text-center text-slate-600 text-sm mt-16">
              Say something, sir.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "text-right" : "text-left"}
            >
              <span
                className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/20"
                    : "bg-slate-800/60 text-slate-100 ring-1 ring-white/5"
                }`}
              >
                {m.content || (busy ? "…" : "")}
              </span>
            </div>
          ))}
        </div>

        {/* input */}
        <div className="shrink-0 pb-6 pt-2 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message JARVIS…"
            className="flex-1 rounded-full bg-slate-900/80 ring-1 ring-white/10 px-5 py-3 text-sm outline-none focus:ring-sky-400/40"
          />
          <button
            onClick={send}
            disabled={busy}
            className="rounded-full bg-sky-500 hover:bg-sky-400 disabled:opacity-40 px-5 py-3 text-sm font-semibold text-slate-950"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}

function patchLast(m: Msg[], content: string): Msg[] {
  const copy = [...m];
  copy[copy.length - 1] = { ...copy[copy.length - 1], content };
  return copy;
}
