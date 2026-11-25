import { get } from "../db";
import { AppError, getPayment } from "../payments";
import type { MailAccount, Mail, MailOutcome, Payment } from "../../types";
import { ingest } from "./ingest";
import { lookBackImap } from "./imap";
import { lookBackGoogle } from "./google";

export interface Rescan { from: number; read: number; confirmed: string[]; alerts: { subject: string; at: number; outcome: MailOutcome; reason: string; amount: number | null; paymentId: string | null }[] }

const g = globalThis as unknown as { __mohurRescans?: Map<string, Promise<Rescan>> };
const running = (): Map<string, Promise<Rescan>> => (g.__mohurRescans ??= new Map());
const MAX_BACK = 7 * 86_400_000;

/**
 * Reads the mailbox again from a point in time and judges every bank alert afresh. The rules are the
 * same as for new mail, and each is matched by when it arrived, so re-reading can confirm a payment
 * that was missed but can never confirm the wrong one.
 */
export function rescan(merchantId: string, from: number): Promise<Rescan> {
  const busy = running().get(merchantId);
  if (busy) return busy.then((r: Rescan): Rescan | Promise<Rescan> => (r.from <= from ? r : rescan(merchantId, from)));
  const job = look(merchantId, Math.max(from, Date.now() - MAX_BACK)).finally(() => running().delete(merchantId));
  running().set(merchantId, job);
  return job;
}

async function look(merchantId: string, from: number): Promise<Rescan> {
  const account = get<MailAccount>("SELECT * FROM mail_accounts WHERE merchant_id=?", merchantId);
  if (!account) throw new AppError("Connect Gmail in Configuration first", 409, "no_mail");
  const out: Rescan = { from, read: 0, confirmed: [], alerts: [] };
  const each: Parameters<typeof lookBackImap>[2] = async (m) => {
    const before = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND message_id=?", merchantId, m.messageId);
    const outcome = await ingest(merchantId, { messageId: m.messageId, source: "gmail", receivedAt: m.at, headers: m.headers }, m.body, { again: true });
    if (outcome === "skipped") return;
    const row = get<Mail>("SELECT * FROM mails WHERE merchant_id=? AND message_id=?", merchantId, m.messageId);
    if (!row) return;
    out.alerts.push({ subject: row.subject, at: row.received_at, outcome: row.outcome, reason: row.reason, amount: row.amount, paymentId: row.payment_id });
    if (row.outcome === "matched" && before?.outcome !== "matched" && row.payment_id) out.confirmed.push(row.payment_id);
  };
  try {
    out.read = await (account.kind === "google" ? lookBackGoogle : lookBackImap)(account, from, each);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "Gmail did not answer", 502, "mail_failed");
  }
  out.alerts.reverse();
  return out;
}

/** From just before the QR was shown. */
export const rescanFor = (p: Payment) => rescan(p.merchant_id, p.created_at - 60_000);

/** For the admin button: what the mailbox says about one payment. */
export async function checkPayment(p: Payment) {
  const r = await rescanFor(p);
  return { ...r, alerts: r.alerts.slice(0, 20), payment: getPayment(p.id)! };
}
