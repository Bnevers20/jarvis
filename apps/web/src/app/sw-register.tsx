"use client";

import { useEffect } from "react";

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.98;
    u.pitch = 0.9;
    window.speechSynthesis?.speak(u);
  } catch {
    // speech synthesis unavailable — silent fallback
  }
}

/** Registers the service worker and speaks alerts aloud when JARVIS is opened. */
export default function SWRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "jarvis-speak" && e.data.text) speak(e.data.text);
    };
    navigator.serviceWorker.addEventListener("message", onMsg);

    // Notification tapped while app was closed → ?speak=… in the URL.
    const s = new URLSearchParams(window.location.search).get("speak");
    if (s) {
      speak(s);
      window.history.replaceState({}, "", window.location.pathname);
    }
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  return null;
}
