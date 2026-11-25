import crypto from "node:crypto";
import { all, get, run, tx } from "./db";
import { newPaymentId } from "./crypto";
import { publish, topics } from "./bus";
import { queueWebhook } from "./webhooks";
import type { Link, Payment, PaymentEvent, PaymentStatus, Settings } from "../types";
import { decimal, inr, MAX_PAISE, MIN_PAISE } from "../money";

export class AppError extends Error {
  constructor(message: string, public status = 400, public code = "invalid_request") { super(message); }
}

const MIN = 60_000;

export const getSettings = (merchantId: string) =>
  get<Settings>("SELECT * FROM settings WHERE merchant_id = ?", merchantId)!;

export const getPayment = (id: string) => get<Payment>("SELECT * FROM payments WHERE id = ?", id.trim().toUpperCase());

export const getEvents = (id: string) =>
  all<PaymentEvent>("SELECT * FROM payment_events WHERE payment_id = ? ORDER BY at, id", id);

export function addEvent(id: string, type: string, detail = "", at = Date.now()) {
  run("INSERT INTO payment_events (payment_id, type, detail, at) VALUES (?,?,?,?)", id, type, detail, at);
}

/** Tell every open screen, and the merchant's webhooks, that a payment moved. */
export function announce(p: Payment, event?: string) {
  publish(topics.payment(p.id));
  publish(topics.merchant(p.merchant_id));
  if (event) queueWebhook(p, event);
}

/**
 * Bank mails rarely carry our reference, so the amount is the reference. While a payment is
 * matchable no other payment of the same merchant may ask for the same paise-exact amount.
 * The amount stays reserved until match_until even after settlement, so a late duplicate
 * alert cannot settle the next customer.
 */
function allocate(merchantId: string, amount: number, mode: Settings["amount_mode"], now: number) {
  if (mode === "off") {
    const taken = get("SELECT 1 FROM payments WHERE merchant_id = ? AND payable = ? AND match_until > ?", merchantId, amount, now);
    return { payable: amount, exclusive: taken ? 0 : 1 };
  }
  const taken = new Set(
    all<{ payable: number }>(
      "SELECT DISTINCT payable FROM payments WHERE merchant_id = ? AND payable BETWEEN ? AND ? AND match_until > ?",
      merchantId, amount, amount + 99, now,
    ).map((r) => r.payable),
  );
  if (mode === "smart") {
    for (let i = 0; i < 100; i++) if (!taken.has(amount + i)) return { payable: amount + i, exclusive: 1 };
  } else {
    const free = Array.from({ length: 99 }, (_, i) => amount + i + 1).filter((a) => !taken.has(a));
    if (free.length) return { payable: free[crypto.randomInt(free.length)], exclusive: 1 };
  }
  // Every slot is in use. Still take the payment, but it will need its UTR or a manual review.
  return { payable: amount, exclusive: 0 };
}

export interface NewPayment {
  merchantId: string; source: Payment["source"]; title: string; amount: number; linkId?: string | null;
  customerName?: string | null; customerContact?: string | null; redirectUrl?: string | null; reference?: string | null; idempotencyKey?: string | null;
}

export function createPayment(n: NewPayment): Payment {
  if (!Number.isSafeInteger(n.amount) || n.amount < MIN_PAISE) throw new AppError(`Amount must be at least ${inr(MIN_PAISE)}`);
  if (n.amount > MAX_PAISE) throw new AppError(`UPI allows up to ${inr(MAX_PAISE)} per payment`);
  const { p, fresh } = tx(() => {
    if (n.idempotencyKey) {
      const prior = get<Payment>("SELECT * FROM payments WHERE merchant_id = ? AND idempotency_key = ?", n.merchantId, n.idempotencyKey);
      if (prior) {
        if (prior.amount !== n.amount) throw new AppError("This idempotency key was already used with a different amount", 409, "idempotency_conflict");
        return { p: prior, fresh: false };
      }
    }
    const s = getSettings(n.merchantId);
    if (!s?.upi_id) throw new AppError("Add your UPI ID in Configuration before collecting payments", 409, "not_configured");
    const now = Date.now();
    const slot = allocate(n.merchantId, n.amount, s.amount_mode, now);
    const qrUntil = now + (s.timer_start === "qr" ? s.verify_seconds * 1000 : s.qr_minutes * MIN);
    let id = newPaymentId();
    while (get("SELECT 1 FROM payments WHERE id = ?", id)) id = newPaymentId();
    run(
      `INSERT INTO payments (id, merchant_id, link_id, source, title, amount, payable, exclusive, status, customer_name, customer_contact,
        qr_until, match_until, redirect_url, reference, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?)`,
      id, n.merchantId, n.linkId ?? null, n.source, n.title, n.amount, slot.payable, slot.exclusive, n.customerName ?? null, n.customerContact ?? null,
      qrUntil, qrUntil + s.hold_minutes * MIN, n.redirectUrl ?? null, n.reference ?? null, n.idempotencyKey ?? null, now,
    );
    addEvent(id, "created", `QR issued for ${inr(slot.payable)}`, now);
    return { p: getPayment(id)!, fresh: true };
  });
  if (fresh) {
    announce(p, "payment.created");
    publish(topics.wake);
  }
  return p;
}

/** Customer says "I have paid". Starts the verification clock once. */
export function claim(id: string): Payment {
  const p = tx(() => {
    const cur = getPayment(id);
    if (!cur) throw new AppError("No payment with that ID", 404, "not_found");
    const now = Date.now();
    if (cur.status === "pending") {
      const s = getSettings(cur.merchant_id);
      const until = now + s.verify_seconds * 1000;
      run(
        "UPDATE payments SET status='verifying', claimed_at=?, verify_until=?, match_until=MAX(match_until, ?) WHERE id=? AND status='pending'",
        now, until, until + s.hold_minutes * MIN, cur.id,
      );
      addEvent(cur.id, "claimed", "Customer confirmed they have paid", now);
    } else if (cur.status === "on_hold" && !cur.claimed_at) {
      run("UPDATE payments SET claimed_at=? WHERE id=?", now, cur.id);
      addEvent(cur.id, "claimed", "Customer confirmed they have paid", now);
    } else return cur;
    return getPayment(cur.id)!;
  });
  announce(p);
  publish(topics.wake);
  return p;
}

export type SettleBy = { method: "email" | "sms" | "utr" | "manual"; mailId?: number | null; utr?: string | null; vpa?: string | null; name?: string | null; note?: string };

const PAYABLE_FROM: Record<SettleBy["method"], PaymentStatus[]> = {
  email: ["pending", "verifying", "on_hold"],
  sms: ["pending", "verifying", "on_hold"],
  utr: ["pending", "verifying", "on_hold", "expired"],
  manual: ["pending", "verifying", "on_hold", "expired", "declined"],
};

/** The only way a payment becomes paid. Must run inside a transaction. Returns false if it was already final. */
export function settleInTx(p: Payment, by: SettleBy): boolean {
  const from = PAYABLE_FROM[by.method];
  const now = Date.now();
  const r = run(
    `UPDATE payments SET status='paid', settled_at=?, method=?, mail_id=COALESCE(?, mail_id), utr=COALESCE(?, utr),
      payer_vpa=COALESCE(?, payer_vpa), payer_name=COALESCE(?, payer_name), decision_note=COALESCE(?, decision_note)
     WHERE id=? AND status IN (${from.map(() => "?").join(",")})`,
    now, by.method, by.mailId ?? null, by.utr ?? null, by.vpa ?? null, by.name ?? null, by.note ?? null, p.id, ...from,
  );
  if (r.changes !== 1) return false;
  addEvent(
    p.id, "paid",
    by.method === "email" ? "Matched to your bank's email alert" : by.method === "sms" ? "Matched to your bank's SMS" : by.method === "utr" ? `Matched by UTR ${by.utr}` : by.note ? `Approved by you: ${by.note}` : "Approved by you",
    now,
  );
  if (p.link_id) run("UPDATE links SET active=0 WHERE id=? AND reusable=0", p.link_id);
  // Queued in the same transaction: a crash cannot leave a paid payment nobody was told about.
  queueWebhook(getPayment(p.id)!, "payment.paid");
  return true;
}

export function approve(merchantId: string, id: string, note: string): Payment {
  const p = tx(() => {
    const cur = owned(merchantId, id);
    if (!settleInTx(cur, { method: "manual", note: note || undefined })) throw new AppError("This payment is already settled", 409, "already_final");
    return getPayment(cur.id)!;
  });
  announce(p);
  return p;
}

export function decline(merchantId: string, id: string, note: string): Payment {
  const p = tx(() => {
    const cur = owned(merchantId, id);
    const now = Date.now();
    const r = run(
      "UPDATE payments SET status='declined', settled_at=?, method='manual', decision_note=? WHERE id=? AND status IN ('pending','verifying','on_hold','expired')",
      now, note || null, cur.id,
    );
    if (r.changes !== 1) throw new AppError("This payment is already settled", 409, "already_final");
    addEvent(cur.id, "declined", note ? `Declined by you: ${note}` : "Declined by you", now);
    return getPayment(cur.id)!;
  });
  announce(p, "payment.declined");
  return p;
}

export function owned(merchantId: string, id: string): Payment {
  const p = getPayment(id);
  if (!p || p.merchant_id !== merchantId) throw new AppError("No payment with that ID", 404, "not_found");
  return p;
}

/** Moves payments along when their clock runs out. Called every second by the engine. */
export function sweep(now = Date.now()) {
  const hold = all<Payment>(
    "SELECT * FROM payments WHERE (status='verifying' AND verify_until<=?) OR (status='pending' AND qr_until<=?)", now, now,
  );
  for (const p of hold) {
    const r = run("UPDATE payments SET status='on_hold', held_at=? WHERE id=? AND status=?", now, p.id, p.status);
    if (r.changes !== 1) continue;
    addEvent(p.id, "on_hold", p.status === "verifying" ? "No bank alert arrived in the verification window" : "QR time ran out with no bank alert", now);
    announce(getPayment(p.id)!, "payment.on_hold");
  }
  // Nobody ever said they paid and no mail came: it was abandoned. Claimed ones wait for a human.
  const dead = all<Payment>(
    "SELECT * FROM payments WHERE status='on_hold' AND match_until<=? AND claimed_at IS NULL AND customer_utr IS NULL", now,
  );
  for (const p of dead) {
    const r = run("UPDATE payments SET status='expired', settled_at=? WHERE id=? AND status='on_hold'", now, p.id);
    if (r.changes !== 1) continue;
    addEvent(p.id, "expired", "Abandoned by the customer", now);
    announce(getPayment(p.id)!, "payment.expired");
  }
}

/** Someone is paying now, or went on hold in the last ten minutes and is still watching the page. */
export const hasLivePayments = (merchantId: string) =>
  !!get("SELECT 1 FROM payments WHERE merchant_id=? AND (status IN ('pending','verifying') OR (status='on_hold' AND held_at>?)) LIMIT 1", merchantId, Date.now() - 10 * MIN);

export function upiUri(p: Payment, s: Settings): string {
  // Encode by hand: URLSearchParams writes spaces as "+", which some UPI apps show literally.
  const q: [string, string][] = [
    ["pa", s.upi_id!],
    ["pn", (s.payee_name || s.account_holder || "Merchant").slice(0, 60)],
    ["am", decimal(p.payable)],
    ["cu", "INR"],
    ["tn", p.id],
  ];
  return "upi://pay?" + q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%40/g, "@")}`).join("&");
}

export function linkState(l: Link, now = Date.now()): "open" | "off" | "expired" | "used" {
  if (l.expires_at && l.expires_at <= now) return "expired";
  if (!l.active) return !l.reusable && get("SELECT 1 FROM payments WHERE link_id=? AND status='paid'", l.id) ? "used" : "off";
  return "open";
}
