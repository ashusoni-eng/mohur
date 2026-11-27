import crypto from "node:crypto";
import { all, get, run, tx } from "./db";
import { newPaymentId } from "./crypto";
import { publish, topics } from "./bus";
import { queueWebhook } from "./webhooks";
import type { Link, Payment, PaymentEvent, PaymentStatus, Settings, UpiAccount } from "../types";
import { decimal, inr, MAX_PAISE, MIN_PAISE } from "../money";

import { AppError } from "./errors";
import { accountForPayment, pickAccount } from "./accounts";
export { AppError };

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
function allocate(merchantId: string, amount: number, mode: Settings["amount_mode"], now: number, test: number) {
  if (mode === "off") {
    const taken = get("SELECT 1 FROM payments WHERE merchant_id = ? AND test = ? AND payable = ? AND match_until > ?", merchantId, test, amount, now);
    return { payable: amount, exclusive: taken ? 0 : 1 };
  }
  const taken = new Set(
    all<{ payable: number }>(
      "SELECT DISTINCT payable FROM payments WHERE merchant_id = ? AND test = ? AND payable BETWEEN ? AND ? AND match_until > ?",
      merchantId, test, amount, amount + 99, now,
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
  customerName?: string | null; customerContact?: string | null; customerEmail?: string | null; note?: string | null;
  redirectUrl?: string | null; reference?: string | null; idempotencyKey?: string | null;
  /** Created with a test API key: never matched to real money, simulated instead. */
  test?: boolean;
  upiAccountId?: number | null;
}

export function createPayment(n: NewPayment): Payment {
  if (!Number.isSafeInteger(n.amount) || n.amount < MIN_PAISE) throw new AppError(`Amount must be at least ${inr(MIN_PAISE)}`);
  if (n.amount > MAX_PAISE) throw new AppError(`UPI allows up to ${inr(MAX_PAISE)} per payment`);
  const { p, fresh } = tx(() => {
    if (n.idempotencyKey) {
      const prior = get<Payment>("SELECT * FROM payments WHERE merchant_id = ? AND test = ? AND idempotency_key = ?", n.merchantId, n.test ? 1 : 0, n.idempotencyKey);
      if (prior) {
        if (prior.amount !== n.amount) throw new AppError("This idempotency key was already used with a different amount", 409, "idempotency_conflict");
        return { p: prior, fresh: false };
      }
    }
    const s = getSettings(n.merchantId);
    if (n.redirectUrl && n.source === "api") assertRedirect(s, n.redirectUrl);
    const test = n.test ? 1 : 0;
    // Test payments need no real account; they never show a real UPI ID.
    const account = test ? null : pickAccount(n.merchantId, s, n.amount, n.upiAccountId);
    const now = Date.now();
    const slot = allocate(n.merchantId, n.amount, s.amount_mode, now, test);
    const qrUntil = now + (s.timer_start === "qr" ? s.verify_seconds * 1000 : s.qr_minutes * MIN);
    let id = newPaymentId();
    while (get("SELECT 1 FROM payments WHERE id = ?", id)) id = newPaymentId();
    run(
      `INSERT INTO payments (id, merchant_id, link_id, source, title, amount, payable, exclusive, status, customer_name, customer_contact,
        qr_until, match_until, redirect_url, reference, idempotency_key, created_at, upi_account_id, test, customer_email, note)
        VALUES (?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, n.merchantId, n.linkId ?? null, n.source, n.title, n.amount, slot.payable, slot.exclusive, n.customerName ?? null, n.customerContact ?? null,
      qrUntil, qrUntil + s.hold_minutes * MIN, n.redirectUrl ?? null, n.reference ?? null, n.idempotencyKey ?? null, now,
      account?.id ?? null, test, n.customerEmail ?? null, n.note ?? null,
    );
    addEvent(id, "created", test ? `Test payment for ${inr(slot.payable)}` : `QR issued for ${inr(slot.payable)} to ${account!.label}`, now);
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

/**
 * Where a customer may be sent after paying. Once the merchant lists their domains, nothing else is
 * accepted, so a leaked API key cannot turn Mohur's checkout into a redirect to a phishing page.
 */
export function assertRedirect(s: Pick<Settings, "redirect_hosts">, url: string) {
  const hosts = s.redirect_hosts.split(/[\s,]+/).filter(Boolean);
  if (!hosts.length) return;
  const host = URL.canParse(url) ? new URL(url).hostname.toLowerCase() : "";
  if (!hosts.some((h) => host === h || host.endsWith("." + h)))
    throw new AppError(`redirect_url must be on ${hosts.join(", ")}. Add the domain under Developers to allow it.`, 422, "redirect_not_allowed", "redirect_url");
}

export type Simulated = "paid" | "on_hold" | "declined" | "expired";
/** Moves a test payment as if the bank had answered. Real payments can never be moved this way. */
export function simulate(id: string, outcome: Simulated): Payment {
  const { p, event } = tx(() => {
    const cur = getPayment(id);
    if (!cur || !cur.test) throw new AppError("No test payment with that ID", 404, "not_found");
    const now = Date.now();
    if (outcome === "paid") {
      if (!settleInTx(cur, { method: "manual", note: "Simulated in test mode" })) throw new AppError("This payment is already settled", 409, "already_final");
      run("UPDATE payments SET utr=COALESCE(utr, ?), payer_vpa=COALESCE(payer_vpa, 'test@upi'), payer_name=COALESCE(payer_name, 'Test Customer') WHERE id=?", "TEST" + String(now).slice(-8), cur.id);
      return { p: getPayment(cur.id)!, event: undefined };
    }
    const from = outcome === "on_hold" ? ["pending", "verifying"] : outcome === "expired" ? ["pending", "verifying", "on_hold"] : ["pending", "verifying", "on_hold", "expired"];
    const r = run(
      `UPDATE payments SET status=?, held_at=CASE WHEN ?='on_hold' THEN ? ELSE held_at END, settled_at=CASE WHEN ?='on_hold' THEN NULL ELSE ? END,
        method=CASE WHEN ?='declined' THEN 'manual' ELSE method END WHERE id=? AND status IN (${from.map(() => "?").join(",")})`,
      outcome, outcome, now, outcome, now, outcome, cur.id, ...from,
    );
    if (r.changes !== 1) throw new AppError(`A ${cur.status.replace("_", " ")} payment cannot become ${outcome.replace("_", " ")}`, 409, "invalid_state");
    addEvent(cur.id, outcome, `Simulated in test mode: ${outcome.replace("_", " ")}`, now);
    return { p: getPayment(cur.id)!, event: `payment.${outcome}` };
  });
  announce(p, event);
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
/** The UPI request for a real payment, or null for a test one. */
export function upiFor(p: Payment): { uri: string; vpa: string } | null {
  if (p.test) return null;
  const a = accountForPayment(p);
  return a ? { uri: upiUri(p, a), vpa: a.upi_id } : null;
}

export const hasLivePayments = (merchantId: string) =>
  !!get("SELECT 1 FROM payments WHERE merchant_id=? AND (status IN ('pending','verifying') OR (status='on_hold' AND held_at>?)) LIMIT 1", merchantId, Date.now() - 10 * MIN);

export function upiUri(p: Payment, a: Pick<UpiAccount, "upi_id" | "payee_name" | "account_holder">): string {
  // Encode by hand: URLSearchParams writes spaces as "+", which some UPI apps show literally.
  // The payment ID stays in the note so a bank that passes the note through identifies the payment.
  const q: [string, string][] = [
    ["pa", a.upi_id],
    ["pn", (a.payee_name || a.account_holder || "Merchant").slice(0, 60)],
    ["am", decimal(p.payable)],
    ["cu", "INR"],
    ["tn", (p.note ? `${p.note} ${p.id}` : p.id).slice(0, 80)],
  ];
  return "upi://pay?" + q.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%40/g, "@")}`).join("&");
}

export function linkState(l: Link, now = Date.now()): "open" | "off" | "expired" | "used" {
  if (l.expires_at && l.expires_at <= now) return "expired";
  if (!l.active) return !l.reusable && get("SELECT 1 FROM payments WHERE link_id=? AND status='paid'", l.id) ? "used" : "off";
  return "open";
}
