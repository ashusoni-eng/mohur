import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { get, run } from "../db";
import { decrypt } from "../crypto";
import { env } from "../env";
import type { MailAccount } from "../../types";
import { ingest } from "./ingest";
import type { Headers } from "./screen";
import { parseHeaderBlock } from "./headers";

export class AuthFailure extends Error {}

export function imapClient(email: string, pass: string) {
  const c = new ImapFlow({
    host: env.imap.host, port: env.imap.port, secure: env.imap.secure,
    auth: { user: email, pass }, logger: false, emitLogs: false,
    connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 5 * 60_000, maxIdleTime: 4 * 60_000,
  });
  // Without a listener a dropped socket would take the whole process down.
  c.on("error", () => {});
  return c;
}

const isAuth = (e: unknown) => !!(e as { authenticationFailed?: boolean })?.authenticationFailed;
export const friendly = (e: unknown) => {
  if (isAuth(e)) return "Gmail rejected this app password. Create a new one and connect again.";
  const code = (e as { code?: string })?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "Could not reach Gmail. Check this server's internet connection.";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "CONNECT_TIMEOUT") return "Gmail did not answer. Port 993 may be blocked.";
  return e instanceof Error ? e.message : "Connection lost";
};

/** Used by the Configuration form before anything is saved. */
export async function testLogin(email: string, pass: string) {
  const c = imapClient(email, pass);
  try {
    await c.connect();
    const box = await c.mailboxOpen("INBOX", { readOnly: true });
    return { uidNext: Number(box.uidNext), uidValidity: String(box.uidValidity) };
  } catch (e) {
    throw new AuthFailure(friendly(e));
  } finally {
    await c.logout().catch(() => c.close());
  }
}

export interface Found { messageId: string; at: number; headers: Headers; body: () => Promise<{ text?: string | null; html?: string | null }> }

/**
 * Looks back over a stretch of time on a connection of its own. Uses All Mail where the account
 * shows it, so an alert that a filter archived or labelled is found too.
 */
export async function lookBackImap(account: MailAccount, from: number, each: (m: Found) => Promise<void>) {
  const client = imapClient(account.email, decrypt(account.secret_enc));
  try {
    await client.connect();
    const boxes = await client.list().catch(() => []);
    await client.mailboxOpen(boxes.find((b) => b.specialUse === "\\All")?.path ?? "INBOX", { readOnly: true });
    // SINCE works in whole days in the server's timezone, so start a day early and filter by the exact time.
    const uids = (await client.search({ since: new Date(from - 86_400_000) }, { uid: true })) || [];
    const heads: { uid: number; at: number; raw: string }[] = [];
    for (let i = 0; i < uids.length; i += 200)
      for await (const m of client.fetch(uids.slice(i, i + 200).join(","), { uid: true, internalDate: true, headers: ["from", "subject", "message-id", "authentication-results"] }, { uid: true })) {
        const at = new Date(m.internalDate ?? 0).getTime();
        if (at >= from) heads.push({ uid: m.uid, at, raw: (m.headers ?? Buffer.alloc(0)).toString() });
      }
    heads.sort((a, b) => a.at - b.at || a.uid - b.uid);
    for (const h of heads) {
      const { headers, messageId } = parseHeaderBlock(h.raw);
      if (!messageId) continue;
      await each({
        messageId, at: h.at, headers,
        body: async () => {
          const full = await client.fetchOne(String(h.uid), { source: { maxLength: 512 * 1024 } }, { uid: true });
          const mail = await simpleParser(full && full.source ? full.source : Buffer.alloc(0));
          return { text: mail.text, html: mail.html || null };
        },
      });
    }
    return heads.length;
  } catch (e) {
    if (isAuth(e)) throw new AuthFailure(friendly(e));
    throw new Error(friendly(e));
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Holds one connection open until it drops or `signal` fires. Throws on connection loss. */
export async function runImap(account: MailAccount, opts: { signal: AbortSignal; idleMs: () => number; wake: (fn: () => void) => () => void; onLive: () => void }) {
  const id = account.merchant_id;
  const client = imapClient(account.email, decrypt(account.secret_enc));
  let nudge: () => void = () => {};
  let dirty = false;
  let closed = false;
  const poke = () => { dirty = true; nudge(); };
  client.on("exists", poke);
  client.on("close", () => { closed = true; nudge(); });
  const unwake = opts.wake(poke);
  const stop = () => nudge();
  opts.signal.addEventListener("abort", stop);

  try {
    await client.connect();
    // Read-only: Mohur never marks, moves or deletes anything in the mailbox.
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const validity = String(box.uidValidity);
    const row = get<MailAccount>("SELECT * FROM mail_accounts WHERE merchant_id=?", id);
    if (!row) return;
    let last = row.last_uid ?? Number(box.uidNext) - 1;
    if (row.uid_validity !== validity) last = Number(box.uidNext) - 1;
    run("UPDATE mail_accounts SET last_uid=?, uid_validity=? WHERE merchant_id=?", last, validity, id);
    opts.onLive();

    while (!opts.signal.aborted && !closed) {
      dirty = false;
      last = await drain(client, id, last);
      run("UPDATE mail_accounts SET status='live', last_error=NULL, last_checked_at=? WHERE merchant_id=?", Date.now(), id);
      if (dirty || opts.signal.aborted || closed) continue;
      // ImapFlow enters IDLE on its own; a push from Gmail ends this wait at once.
      await new Promise<void>((res) => {
        const t = setTimeout(res, opts.idleMs());
        nudge = () => { clearTimeout(t); res(); };
      });
    }
    if (closed && !opts.signal.aborted) throw new Error("Gmail closed the connection");
  } catch (e) {
    if (isAuth(e)) throw new AuthFailure(friendly(e));
    throw new Error(friendly(e));
  } finally {
    unwake();
    opts.signal.removeEventListener("abort", stop);
    await client.logout().catch(() => client.close());
  }
}

const strikes = new Map<string, number>();

async function drain(client: ImapFlow, merchantId: string, last: number): Promise<number> {
  // "n:*" always returns the newest message even when it is older than n.
  const heads: { uid: number; at: number; raw: string }[] = [];
  for await (const m of client.fetch(`${last + 1}:*`, { uid: true, internalDate: true, headers: ["from", "subject", "message-id", "authentication-results"] }, { uid: true })) {
    if (m.uid > last) heads.push({ uid: m.uid, at: new Date(m.internalDate ?? Date.now()).getTime(), raw: (m.headers ?? Buffer.alloc(0)).toString() });
  }
  heads.sort((a, b) => a.uid - b.uid);
  for (const h of heads) {
    const { headers, messageId } = parseHeaderBlock(h.raw);
    const key = `${merchantId}:${h.uid}`;
    try {
      await ingest(merchantId, { messageId: messageId ?? `uid:${h.uid}`, source: "gmail", receivedAt: h.at, headers }, async () => {
        const full = await client.fetchOne(String(h.uid), { source: { maxLength: 512 * 1024 } }, { uid: true });
        const mail = await simpleParser(full && full.source ? full.source : Buffer.alloc(0));
        return { text: mail.text, html: mail.html || null };
      });
      strikes.delete(key);
    } catch (e) {
      // Retry in order, but one unreadable message must not block every payment behind it.
      const n = (strikes.get(key) ?? 0) + 1;
      strikes.set(key, n);
      if (n < 3 || !client.usable) throw e;
      console.error(`[mohur] skipped unreadable mail uid ${h.uid}`, e);
      strikes.delete(key);
    }
    last = h.uid;
    run("UPDATE mail_accounts SET last_uid=? WHERE merchant_id=?", last, merchantId);
  }
  return last;
}
