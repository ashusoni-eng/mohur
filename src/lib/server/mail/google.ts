import { get, run } from "../db";
import { decrypt, randomToken, seal } from "../crypto";
import { env } from "../env";
import type { MailAccount } from "../../types";
import { ingest } from "./ingest";
import { buildHeaders } from "./headers";
import { AuthFailure } from "./imap";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const redirectUri = () => `${env.appUrl}/api/mail/google/callback`;

export function signState(merchantId: string) {
  const payload = `${merchantId}.${Date.now() + 600_000}.${randomToken(9)}`;
  return `${payload}.${seal(payload)}`;
}
export function readState(state: string): string | null {
  const i = state.lastIndexOf(".");
  const payload = state.slice(0, i);
  if (i < 0 || seal(payload) !== state.slice(i + 1)) return null;
  const [id, exp] = payload.split(".");
  return Number(exp) > Date.now() ? id : null;
}

export function consentUrl(merchantId: string) {
  const g = env.google;
  if (!g) return null;
  const q = new URLSearchParams({
    client_id: g.id, redirect_uri: redirectUri(), response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", state: signState(merchantId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(params: Record<string, string>) {
  const g = env.google;
  if (!g) throw new AuthFailure("Google sign-in is not set up on this server");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ client_id: g.id, client_secret: g.secret, ...params }), signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (data.error === "invalid_grant") throw new AuthFailure("Google access was revoked or expired. Connect again.");
  if (!res.ok || !data.access_token) throw new Error(`Google token request failed (${res.status})`);
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function exchangeCode(code: string) {
  const t = await token({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new AuthFailure("Google did not grant offline access. Try again.");
  const me = await call<{ emailAddress: string }>(t.access_token, "/profile");
  return { email: me.emailAddress, refresh: t.refresh_token };
}

async function call<T>(access: string, path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401) throw new Error("Google session expired");
  if (res.status === 403) throw new AuthFailure("Gmail access was refused. Check that the Gmail API is enabled for this project.");
  if (!res.ok) throw new Error(`Gmail answered ${res.status}`);
  return (await res.json()) as T;
}

interface Part { mimeType?: string; body?: { data?: string }; parts?: Part[] }
interface Msg { id: string; internalDate: string; payload?: Part & { headers?: { name: string; value: string }[] } }

function bodyOf(p: Part | undefined, want: string): string | null {
  if (!p) return null;
  if (p.mimeType === want && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const c of p.parts ?? []) { const t = bodyOf(c, want); if (t) return t; }
  return null;
}

export async function runGoogle(account: MailAccount, opts: { signal: AbortSignal; idleMs: () => number; wake: (fn: () => void) => () => void; onLive: () => void }) {
  const id = account.merchant_id;
  const refresh = decrypt(account.secret_enc);
  let access = "";
  let exp = 0;
  let nudge: () => void = () => {};
  const unwake = opts.wake(() => nudge());
  const stop = () => nudge();
  opts.signal.addEventListener("abort", stop);
  const seen = new Map<string, number>();
  let cursor = get<MailAccount>("SELECT * FROM mail_accounts WHERE merchant_id=?", id)?.cursor_ms ?? Date.now();
  try {
    while (!opts.signal.aborted) {
      if (Date.now() > exp - 60_000) {
        const t = await token({ grant_type: "refresh_token", refresh_token: refresh });
        access = t.access_token;
        exp = Date.now() + t.expires_in * 1000;
      }
      // Look back two minutes past the cursor: Gmail's search index can lag behind delivery.
      const floor = Math.floor((cursor - 120_000) / 1000);
      const ids: string[] = [];
      let page = "";
      do {
        const r = await call<{ messages?: { id: string }[]; nextPageToken?: string }>(access, `/messages?maxResults=100&q=${encodeURIComponent(`in:inbox after:${floor}`)}${page && `&pageToken=${page}`}`);
        ids.push(...(r.messages ?? []).map((m) => m.id));
        page = r.nextPageToken ?? "";
      } while (page && ids.length < 1000);

      let high = cursor;
      for (const mid of ids.reverse()) {
        if (seen.has(mid)) continue;
        const h = ["From", "Subject", "Message-ID", "Authentication-Results"].map((x) => `metadataHeaders=${x}`).join("&");
        const meta = await call<Msg>(access, `/messages/${mid}?format=metadata&${h}`);
        const at = Number(meta.internalDate);
        if (at >= account.connected_at) {
          const { headers, messageId } = buildHeaders(meta.payload?.headers ?? []);
          await ingest(id, { messageId: messageId ?? `gmail:${mid}`, source: "gmail", receivedAt: at, headers }, async () => {
            const full = await call<Msg>(access, `/messages/${mid}?format=full`);
            return { text: bodyOf(full.payload, "text/plain"), html: bodyOf(full.payload, "text/html") };
          });
        }
        seen.set(mid, at);
        high = Math.max(high, at);
      }
      for (const [k, at] of seen) if (at < high - 600_000) seen.delete(k);
      cursor = high;
      run("UPDATE mail_accounts SET status='live', last_error=NULL, last_checked_at=?, cursor_ms=? WHERE merchant_id=?", Date.now(), cursor, id);
      opts.onLive();
      if (opts.signal.aborted) break;
      await new Promise<void>((res) => {
        const t = setTimeout(res, opts.idleMs());
        nudge = () => { clearTimeout(t); res(); };
      });
    }
  } finally {
    unwake();
    opts.signal.removeEventListener("abort", stop);
  }
}
