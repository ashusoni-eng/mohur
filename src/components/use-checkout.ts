"use client";
import { useEffect, useRef, useState } from "react";
import type { CheckoutView } from "@/lib/server/views";
import { api, message } from "@/lib/client";

const FINAL = new Set(["paid", "declined"]);

/** Live view of one payment: pushed over SSE, with a 5-second poll in case the stream is blocked. */
export function useCheckout(initial: CheckoutView) {
  const [v, set] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const done = FINAL.has(v.status);
  const id = initial.id;

  useEffect(() => {
    if (done) return;
    const es = new EventSource(`/api/public/payments/${id}/stream`);
    es.onmessage = (e) => { set(JSON.parse(e.data)); setOffline(false); };
    const poll = setInterval(async () => {
      try { set(await api<CheckoutView>(`/api/public/payments/${id}`)); setOffline(false); } catch { setOffline(true); }
    }, 5000);
    return () => { es.close(); clearInterval(poll); };
  }, [id, done]);

  const act = async (what: "claim" | "utr", data: unknown = {}) => {
    setBusy(true);
    setError(null);
    try { set(await api<CheckoutView>(`/api/public/payments/${id}/${what}`, "POST", data)); return true; } catch (e) { setError(message(e)); return false; } finally { setBusy(false); }
  };
  return { v, act, busy, error, offline };
}

/** Server time, ticking. Uses the offset from each snapshot so a wrong phone clock cannot break the countdown. */
export function useNow(v: CheckoutView) {
  const [now, setNow] = useState(v.now);
  const off = useRef(0);
  useEffect(() => { off.current = v.now - Date.now(); }, [v.now]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + off.current), 500);
    return () => clearInterval(t);
  }, []);
  return now;
}
