import { all, get, run, tx } from "../db";
import { announce, AppError, getPayment, getSettings, owned, settleInTx, addEvent } from "../payments";
import { publish, topics } from "../bus";
import { env } from "../env";
import type { Mail, MailOutcome, Payment } from "../../types";
import { inr } from "../../money";
import { screen, type Headers, type Screen } from "./screen";
import { htmlToText, parseCredit, type Credit } from "./parse";
import { screenSms } from "./sms";

export interface Incoming { messageId: string; source: string; receivedAt: number; headers: Headers }
export interface Body { text?: string | null; html?: string | null }

/** Clock difference we tolerate between this machine and the mail server. */
const SKEW = 10_000;

export function policyFor(merchantId: string) {
  const s = getSettings(merchantId);
  return { bankCode: s.bank_code, extraDomains: s.extra_domains.split(/[\s,]+/).filter(Boolean), authServId: env.authServId };
}

export const screenFor = (merchantId: string, h: Headers): Screen => screen(h, policyFor(merchantId));

export const bodyText = (b: Body) => (b.text && b.text.trim().length > 20 ? b.text : b.html ? htmlToText(b.html) : b.text ?? "");

/**
 * Full pipeline for one message. `fetchBody` is only called when headers pass,
 * so personal mail is never downloaded or stored.
 */
/**
 * A bank SMS forwarded by a paired phone. Same parsing and matching as mail, but the sender is
 * judged by its registered SMS header instead of DKIM.
 */
export function ingestSms(merchantId: string, m: { messageId: string; sender: string; body: string; receivedAt: number }): { outcome: MailOutcome | "skipped"; amount: number | null; payment_id: string | null } {
  const known = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND message_id=?", merchantId, m.messageId);
  if (known) return { outcome: known.outcome, amount: known.amount, payment_id: known.payment_id };
  const s = getSettings(merchantId);
  const v = screenSms(m.sender, m.body, { bankCode: s.bank_code, extraHeaders: s.extra_headers.split(/[\s,]+/).filter(Boolean) });
  if (v.verdict === "skip") return { outcome: "skipped", amount: null, payment_id: null };
  const inc: Incoming = { messageId: m.messageId, source: "sms", receivedAt: m.receivedAt, headers: { from: [m.sender.slice(0, 40)], subject: v.verdict === "read" ? `SMS from ${v.bank}` : `SMS from ${m.sender.slice(0, 40)}`, authResults: [] } };
  let outcome: MailOutcome;
  if (v.verdict === "suspicious") {
    record(merchantId, inc, { outcome: (outcome = "suspicious"), reason: v.reason });
  } else {
    const parsed = parseCredit("", m.body, { sms: true });
    if (!parsed.ok) record(merchantId, inc, { outcome: (outcome = "ignored"), reason: parsed.reason, bank: v.bank });
    else {
      const r = tx(() => apply(merchantId, inc, v.bank, parsed.credit));
      outcome = r.outcome;
      if (r.settled) announce(r.settled);
    }
  }
  publish(topics.merchant(merchantId));
  const row = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND message_id=?", merchantId, m.messageId);
  return { outcome, amount: row?.amount ?? null, payment_id: outcome === "matched" ? row?.payment_id ?? null : null };
}

export async function ingest(merchantId: string, m: Incoming, fetchBody: () => Promise<Body>): Promise<MailOutcome | "skipped"> {
  if (get("SELECT 1 FROM mails WHERE merchant_id=? AND message_id=?", merchantId, m.messageId)) return "skipped";
  const v = screenFor(merchantId, m.headers);
  run("UPDATE mail_accounts SET screened=screened+1 WHERE merchant_id=?", merchantId);
  if (v.verdict === "skip") {
    if (!v.otherBank) return "skipped";
    // A real alert from a bank other than the chosen one: usually a wrong setting, so leave a trace. Headers only.
    record(merchantId, m, { outcome: "ignored", reason: v.reason });
    publish(topics.merchant(merchantId));
    return "ignored";
  }
  if (v.verdict === "suspicious") {
    record(merchantId, m, { outcome: "suspicious", reason: v.reason });
    publish(topics.merchant(merchantId));
    return "suspicious";
  }
  const text = bodyText(await fetchBody());
  const parsed = parseCredit(m.headers.subject, text);
  if (!parsed.ok) {
    record(merchantId, m, { outcome: "ignored", reason: parsed.reason, bank: v.bank });
    publish(topics.merchant(merchantId));
    return "ignored";
  }
  const { outcome, settled } = tx(() => apply(merchantId, m, v.bank, parsed.credit));
  if (settled) announce(settled);
  publish(topics.merchant(merchantId));
  return outcome;
}

type Rec = Partial<Pick<Mail, "bank" | "amount" | "utr" | "payer_vpa" | "payer_name" | "account_tail" | "excerpt" | "payment_id">> & { outcome: MailOutcome; reason: string };

function record(merchantId: string, m: Incoming, r: Rec): number {
  return Number(
    run(
      `INSERT INTO mails (merchant_id, message_id, source, from_addr, subject, received_at, outcome, reason, bank, amount, utr, payer_vpa, payer_name, account_tail, excerpt, payment_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      merchantId, m.messageId, m.source, m.headers.from.join(", "), m.headers.subject.slice(0, 300), m.receivedAt, r.outcome, r.reason,
      r.bank ?? null, r.amount ?? null, r.utr ?? null, r.payer_vpa ?? null, r.payer_name ?? null, r.account_tail ?? null, r.excerpt ?? "", r.payment_id ?? null, Date.now(),
    ).lastInsertRowid,
  );
}

function apply(merchantId: string, m: Incoming, bank: string, c: Credit): { outcome: MailOutcome; settled?: Payment } {
  const base = { bank, amount: c.amount, utr: c.utr, payer_vpa: c.payerVpa, payer_name: c.payerName, account_tail: c.accountTail, excerpt: c.sentence };
  // A second poll may have raced us here.
  const seen = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND message_id=?", merchantId, m.messageId);
  if (seen) return { outcome: seen.outcome };

  if (c.utr) {
    const dup = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND utr=? AND outcome IN ('matched','unmatched','ambiguous','dismissed')", merchantId, c.utr);
    const used = get<Payment>("SELECT * FROM payments WHERE merchant_id=? AND utr=? AND status='paid'", merchantId, c.utr);
    if (dup || used) {
      record(merchantId, m, { ...base, outcome: "duplicate", reason: `UTR ${c.utr} was already received`, payment_id: dup?.payment_id ?? used?.id });
      return { outcome: "duplicate" };
    }
  }
  const s = getSettings(merchantId);
  if (c.accountTail && s.account_tail && !tailsAgree(c.accountTail, s.account_tail)) {
    // Someone is waiting for exactly this amount, so the saved account is probably the wrong one. Show it, never settle it.
    const waited = match(merchantId, m.receivedAt, c);
    const outcome = waited.payment || waited.many ? "unmatched" : "ignored";
    record(merchantId, m, { ...base, outcome, reason: `${WRONG_ACCOUNT} ${c.accountTail}, but Configuration has ${s.account_tail}` });
    return { outcome };
  }

  // The same credit often arrives twice, by mail and by SMS, and one of the two may omit the UTR.
  // The amount was reserved for one payment, so the other channel repeating it is an echo, not new money.
  const echo = echoOf(merchantId, m, c);
  if (echo) {
    record(merchantId, m, { ...base, outcome: "duplicate", reason: `Same credit already confirmed ${echo.id}`, payment_id: echo.id });
    // Keep the reference if the first alert did not carry it.
    if (c.utr) run("UPDATE payments SET utr=COALESCE(utr, ?) WHERE id=?", c.utr, echo.id);
    return { outcome: "duplicate" };
  }

  const found = match(merchantId, m.receivedAt, c);
  if (!found.payment) {
    const outcome = found.many ? "ambiguous" : "unmatched";
    record(merchantId, m, { ...base, outcome, reason: found.reason });
    return { outcome };
  }
  const p = found.payment;
  const mailId = record(merchantId, m, { ...base, outcome: "matched", reason: found.reason, payment_id: p.id });
  if (!settleInTx(p, { method: found.byUtr ? "utr" : m.source === "sms" ? "sms" : "email", mailId, utr: c.utr, vpa: c.payerVpa, name: c.payerName }))
    throw new Error(`Payment ${p.id} changed while being matched`);
  return { outcome: "matched", settled: getPayment(p.id)! };
}

const WRONG_ACCOUNT = "Paid into the account ending";

/** The newest credit this week that was refused because it named another account, if the setting still disagrees with it. */
export function accountMismatch(merchantId: string): { tail: string; saved: string; at: number } | null {
  const s = getSettings(merchantId);
  const r = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND account_tail IS NOT NULL AND amount IS NOT NULL AND received_at>? ORDER BY received_at DESC LIMIT 1", merchantId, Date.now() - 7 * 86_400_000);
  if (!s.account_tail || !r?.account_tail || tailsAgree(r.account_tail, s.account_tail)) return null;
  return { tail: r.account_tail, saved: s.account_tail, at: r.received_at };
}

/** After the account is corrected, credits refused for that reason alone get a second chance under the normal rules. */
export function recheckAccount(merchantId: string): number {
  const s = getSettings(merchantId);
  const rows = all<Mail>(
    "SELECT * FROM mails WHERE merchant_id=? AND payment_id IS NULL AND amount IS NOT NULL AND outcome IN ('ignored','unmatched') AND (reason LIKE 'Paid into the account ending%' OR reason LIKE 'For a different account%') AND received_at>? ORDER BY received_at",
    merchantId, Date.now() - 86_400_000,
  );
  let n = 0;
  for (const r of rows) {
    if (!r.account_tail || (s.account_tail && !tailsAgree(r.account_tail, s.account_tail))) continue;
    const c: Credit = { amount: r.amount!, utr: r.utr, payerVpa: r.payer_vpa, payerName: r.payer_name, accountTail: r.account_tail, paymentIds: [], sentence: r.excerpt };
    const settled = tx(() => {
      if (r.utr && get("SELECT 1 FROM mails WHERE merchant_id=? AND utr=? AND id<>? AND outcome IN ('matched','unmatched','ambiguous')", merchantId, r.utr, r.id)) {
        run("UPDATE mails SET outcome='duplicate', reason=? WHERE id=?", `UTR ${r.utr} was already received`, r.id);
        return null;
      }
      const found = match(merchantId, r.received_at, c);
      if (found.payment && settleInTx(found.payment, { method: found.byUtr ? "utr" : r.source === "sms" ? "sms" : "email", mailId: r.id, utr: r.utr, vpa: r.payer_vpa, name: r.payer_name })) {
        run("UPDATE mails SET outcome='matched', reason=?, payment_id=? WHERE id=?", found.reason, found.payment.id, r.id);
        return getPayment(found.payment.id)!;
      }
      run("UPDATE mails SET outcome=?, reason=? WHERE id=?", found.many ? "ambiguous" : "unmatched", found.reason, r.id);
      return null;
    });
    if (settled) { announce(settled); n++; }
  }
  if (rows.length) publish(topics.merchant(merchantId));
  return n;
}

function echoOf(merchantId: string, m: Incoming, c: Credit): Payment | undefined {
  const p = get<Payment & { mail_source: string; mail_at: number }>(
    `SELECT p.*, m.source mail_source, m.received_at mail_at FROM payments p JOIN mails m ON m.id=p.mail_id
     WHERE p.merchant_id=? AND p.payable=? AND p.exclusive=1 AND p.status='paid' AND p.method IN ('email','sms','utr') AND p.match_until>? AND p.created_at<=?
     ORDER BY p.settled_at DESC LIMIT 1`,
    merchantId, c.amount, m.receivedAt, m.receivedAt + SKEW,
  );
  if (!p) return;
  const otherChannel = (p.mail_source === "sms") !== (m.source === "sms");
  const utrsClash = !!c.utr && !!p.utr && c.utr !== p.utr;
  return otherChannel && !utrsClash && Math.abs(m.receivedAt - p.mail_at) < 30 * 60_000 ? p : undefined;
}

const tailsAgree = (a: string, b: string) => {
  const n = Math.min(a.length, b.length);
  return a.slice(-n) === b.slice(-n);
};

function match(merchantId: string, at: number, c: Credit): { payment?: Payment; reason: string; byUtr?: boolean; many?: boolean } {
  const open = all<Payment>(
    "SELECT * FROM payments WHERE merchant_id=? AND payable=? AND status IN ('pending','verifying','on_hold') AND created_at<=? ORDER BY created_at",
    merchantId, c.amount, at + SKEW,
  );
  if (!open.length) {
    const just = get<Payment>("SELECT id FROM payments WHERE merchant_id=? AND payable=? AND status='paid' AND match_until>? AND created_at<=?", merchantId, c.amount, at, at + SKEW);
    return { reason: just ? `May be a second alert for ${just.id}, already paid` : `No open payment is waiting for ${inr(c.amount)}` };
  }

  // 1. The customer already gave us this exact UTR.
  if (c.utr) {
    const by = open.filter((p) => p.customer_utr === c.utr);
    if (by.length === 1) return { payment: by[0], reason: "Amount and UTR match", byUtr: true };
  }
  // 2. The bank passed our payment ID through in the note.
  const byId = open.filter((p) => c.paymentIds.includes(p.id));
  if (byId.length === 1) return { payment: byId[0], reason: "Amount and payment ID match" };

  // 3. The paise-exact amount, inside its reserved window. A customer who gave a different UTR is ruled out.
  const inTime = open.filter((p) => p.match_until > at && (!c.utr || !p.customer_utr || p.customer_utr === c.utr));
  if (inTime.length === 1) return { payment: inTime[0], reason: "Exact amount match" };
  if (inTime.length > 1) return { many: true, reason: `${inTime.length} open payments are waiting for ${inr(c.amount)}` };
  return { reason: "The only payment for this amount is past its matching window" };
}

/** Customer typed the UTR from their UPI app on the hold screen. */
export function submitUtr(id: string, utrRaw: string): Payment {
  const utr = utrRaw.trim().toUpperCase();
  if (!/^(?:\d{12}|[A-Z]{4}[A-Z0-9]{8,18})$/.test(utr)) throw new AppError("Enter the 12-digit UTR shown in your UPI app");
  const { p, paid } = tx(() => {
    const cur = getPayment(id);
    if (!cur) throw new AppError("No payment with that ID", 404, "not_found");
    if (!["pending", "verifying", "on_hold", "expired"].includes(cur.status)) return { p: cur, paid: false };
    if (cur.customer_utr === utr) return { p: cur, paid: false };
    run("UPDATE payments SET customer_utr=?, claimed_at=COALESCE(claimed_at, ?) WHERE id=?", utr, Date.now(), cur.id);
    addEvent(cur.id, "utr", `Customer gave UTR ${utr}`);
    const mail = get<Mail>(
      "SELECT * FROM mails WHERE merchant_id=? AND utr=? AND amount=? AND outcome IN ('unmatched','ambiguous') AND received_at>=?",
      cur.merchant_id, utr, cur.payable, cur.created_at - SKEW,
    );
    if (mail && settleInTx(cur, { method: "utr", mailId: mail.id, utr, vpa: mail.payer_vpa, name: mail.payer_name })) {
      run("UPDATE mails SET outcome='matched', reason='Amount and UTR match', payment_id=? WHERE id=?", cur.id, mail.id);
      return { p: getPayment(cur.id)!, paid: true };
    }
    return { p: getPayment(cur.id)!, paid: false };
  });
  announce(p);
  return p;
}

/** Merchant ties a stray credit to a payment by hand. */
export function linkMail(merchantId: string, mailId: number, paymentId: string): Payment {
  const p = tx(() => {
    const mail = get<Mail>("SELECT * FROM mails WHERE id=? AND merchant_id=?", mailId, merchantId);
    if (!mail) throw new AppError("That alert no longer exists", 404, "not_found");
    if (mail.outcome !== "unmatched" && mail.outcome !== "ambiguous") throw new AppError("This credit is already used", 409);
    const cur = owned(merchantId, paymentId);
    const note = mail.amount === cur.payable ? "Linked to a bank credit" : `Linked to a bank credit of ${inr(mail.amount ?? 0)}`;
    if (!settleInTx(cur, { method: "manual", mailId, utr: mail.utr, vpa: mail.payer_vpa, name: mail.payer_name, note }))
      throw new AppError("This payment is already settled", 409, "already_final");
    run("UPDATE mails SET outcome='matched', reason='Linked by you', payment_id=? WHERE id=?", cur.id, mailId);
    return getPayment(cur.id)!;
  });
  announce(p);
  return p;
}

export function dismissMail(merchantId: string, mailId: number) {
  const r = run("UPDATE mails SET outcome='dismissed', reason='Dismissed by you' WHERE id=? AND merchant_id=? AND outcome IN ('unmatched','ambiguous')", mailId, merchantId);
  if (!r.changes) throw new AppError("This credit is already used", 409);
  publish(topics.merchant(merchantId));
}
