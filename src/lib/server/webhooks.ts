import dns from "node:dns/promises";
import net from "node:net";
import { all, get, run } from "./db";
import { decrypt, hmac, randomToken } from "./crypto";
import { env } from "./env";
import type { Payment } from "../types";

/** What the API and webhooks expose. Amounts in paise. */
export function publicPayment(p: Payment) {
  return {
    id: p.id, object: "payment", status: p.status, amount: p.amount, amount_payable: p.payable, currency: "INR", title: p.title,
    reference: p.reference, source: p.source, link_id: p.link_id, customer: { name: p.customer_name, contact: p.customer_contact },
    utr: p.utr, payer_vpa: p.payer_vpa, payer_name: p.payer_name, verified_by: p.status === "paid" ? p.method : null,
    checkout_url: `${env.appUrl}/checkout/${p.id}`,
    created_at: new Date(p.created_at).toISOString(), settled_at: p.settled_at ? new Date(p.settled_at).toISOString() : null,
  };
}

export function queueWebhook(p: Payment, event: string) {
  const hooks = all<{ id: string }>("SELECT id FROM webhooks WHERE merchant_id=? AND active=1", p.merchant_id);
  for (const h of hooks) {
    const id = "evt_" + randomToken(12);
    const body = JSON.stringify({ id, type: event, created_at: new Date().toISOString(), data: publicPayment(p) });
    run("INSERT INTO deliveries (id, webhook_id, event, payment_id, body, next_at, created_at) VALUES (?,?,?,?,?,?,?)", id, h.id, event, p.id, body, Date.now(), Date.now());
  }
}

const BACKOFF = [30, 120, 600, 3600, 21600].map((s) => s * 1000);

export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (net.isIPv4(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b < 128) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === "::1" || l === "::" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith("::ffff:");
}

/** In production a webhook must not reach into the server's own network. */
export async function assertSafeUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Use an http(s) URL");
  if (!env.isProd) return;
  if (u.protocol !== "https:") throw new Error("Use an https URL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("That address is private");
}

type Row = { id: string; body: string; event: string; attempts: number; url: string; secret_enc: string };

export async function deliverDue() {
  const due = all<Row>(
    `SELECT d.id, d.body, d.event, d.attempts, w.url, w.secret_enc FROM deliveries d JOIN webhooks w ON w.id=d.webhook_id
     WHERE d.status='queued' AND d.next_at<=? AND w.active=1 ORDER BY d.created_at LIMIT 10`, Date.now(),
  );
  await Promise.all(due.map(deliver));
}

async function deliver(d: Row) {
  // Lease first, so an overlapping tick cannot send it twice.
  const lease = run("UPDATE deliveries SET next_at=? WHERE id=? AND status='queued' AND next_at<=?", Date.now() + 30_000, d.id, Date.now());
  if (lease.changes !== 1) return;
  const attempts = d.attempts + 1;
  let code: number | null = null;
  let error: string | null = null;
  try {
    await assertSafeUrl(d.url);
    const t = Math.floor(Date.now() / 1000);
    const res = await fetch(d.url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(10_000), body: d.body,
      headers: { "content-type": "application/json", "user-agent": "Mohur-Webhooks/1", "mohur-event": d.event, "mohur-signature": `t=${t},v1=${hmac(decrypt(d.secret_enc), `${t}.${d.body}`)}` },
    });
    code = res.status;
    await res.body?.cancel().catch(() => {});
    if (!res.ok) error = `Endpoint answered ${res.status}`;
  } catch (e) {
    error = e instanceof Error ? e.message : "Request failed";
  }
  if (!error) run("UPDATE deliveries SET status='delivered', attempts=?, code=?, error=NULL, next_at=NULL WHERE id=?", attempts, code, d.id);
  else if (attempts > BACKOFF.length) run("UPDATE deliveries SET status='failed', attempts=?, code=?, error=?, next_at=NULL WHERE id=?", attempts, code, error, d.id);
  else run("UPDATE deliveries SET attempts=?, code=?, error=?, next_at=? WHERE id=?", attempts, code, error, Date.now() + BACKOFF[attempts - 1], d.id);
}

export const deliveryFor = (merchantId: string, id: string) =>
  get<{ id: string }>("SELECT d.id FROM deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE d.id=? AND w.merchant_id=?", id, merchantId);
