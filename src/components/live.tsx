"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DeviceRow } from "@/lib/server/views";
import { api, ApiError, message } from "@/lib/client";

export interface MailInfo { kind: string; email: string; status: "connecting" | "live" | "retrying" | "error"; last_error: string | null; last_checked_at: number | null; screened: number; connected_at: number }
interface Live { v: number; hold: number; strays: number; mail: MailInfo | null; devices: DeviceRow[] }
const Ctx = createContext<Live | null>(null);
export const useLive = () => useContext(Ctx);

export function LiveProvider({ initial, children }: { initial: Live; children: ReactNode }) {
  const [live, set] = useState<Live>(initial);
  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onmessage = (e) => set(JSON.parse(e.data));
    return () => es.close();
  }, []);
  return <Ctx.Provider value={live}>{children}</Ctx.Provider>;
}

/** Fetches, keeps the previous data on screen while refreshing, and refetches whenever the merchant's stream fires. */
export function useApi<T>(url: string) {
  const v = useLive()?.v;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>(url);
      if (mine === seq.current) { setData(d); setError(null); }
    } catch (e) {
      if (mine === seq.current) setError(message(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => { void reload(); }, [reload, v]);
  return { data, error, loading, reload };
}

/** Submit state for a form: busy flag, per-field errors from the server, and a general error. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setErrors({});
    try { await fn(); return true; } catch (e) {
      setErrors({ [(e instanceof ApiError && e.field) || "form"]: message(e) });
      return false;
    } finally { setBusy(false); }
  }, []);
  return { busy, errors, submit };
}
