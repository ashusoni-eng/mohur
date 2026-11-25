export class ApiError extends Error {
  constructor(message: string, public code: string, public field?: string) { super(message); }
}
export async function api<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: data !== undefined ? { "content-type": "application/json" } : undefined, body: data !== undefined ? JSON.stringify(data) : undefined });
  } catch {
    throw new ApiError("No connection. Check your internet and try again.", "offline");
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && location.pathname.startsWith("/app")) location.href = "/login";
    throw new ApiError(out.error ?? "Something went wrong", out.code ?? "unknown", out.field);
  }
  return out as T;
}
export const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

const IN = "en-IN";
const tz = "Asia/Kolkata";
export const fmtTime = (t: number) => new Intl.DateTimeFormat(IN, { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(t);
export const fmtFull = (t: number) => new Intl.DateTimeFormat(IN, { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).format(t);
export const fmtDay = (t: number) => new Intl.DateTimeFormat(IN, { timeZone: tz, day: "numeric", month: "short" }).format(t);
export const fmtHour = (t: number) => new Intl.DateTimeFormat(IN, { timeZone: tz, hour: "numeric", hour12: true }).format(t);
export function ago(t: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return fmtDay(t);
}
