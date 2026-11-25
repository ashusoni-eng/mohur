import { all, get } from "./db";
import { decrypt } from "./crypto";
import { getSettings, upiUri } from "./payments";
import type { Device, Link, Mail, MailAccount, Payment, PaymentStatus } from "../types";
import { qrPath } from "../qr";

/** What a customer holding a payment ID may see. No merchant internals, no other payments. */
export function checkoutView(p: Payment) {
  const s = getSettings(p.merchant_id);
  const biz = get<{ business: string }>("SELECT business FROM merchants WHERE id=?", p.merchant_id)!.business;
  const live = p.status === "pending" || p.status === "verifying";
  const uri = live && s.upi_id ? upiUri(p, s) : null;
  return {
    id: p.id, status: p.status, title: p.title, amount: p.amount, payable: p.payable, business: biz, createdAt: p.created_at,
    qrUntil: p.qr_until, verifyUntil: p.verify_until, verifySeconds: s.verify_seconds, timerStart: s.timer_start, claimed: !!p.claimed_at, hasUtr: !!p.customer_utr,
    settledAt: p.settled_at, utr: p.status === "paid" ? p.utr : null, redirectUrl: p.status === "paid" ? p.redirect_url : null,
    support: s.support_contact, now: Date.now(), upi: uri ? { uri, vpa: s.upi_id!, qr: qrPath(uri) } : null,
    bank: live && s.show_bank && s.account_number_enc ? { holder: s.account_holder, number: decrypt(s.account_number_enc), ifsc: s.ifsc, bank: s.bank_name } : null,
  };
}
export type CheckoutView = ReturnType<typeof checkoutView>;

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;
const istDay = (t: number) => Math.floor((t + IST) / DAY);

export function dashboard(merchantId: string, days: number) {
  const now = Date.now();
  const today = istDay(now);
  const start = (today - days + 1) * DAY - IST;
  const prev = start - days * DAY;
  const rows = all<Payment>("SELECT * FROM payments WHERE merchant_id=? AND created_at>=?", merchantId, prev);
  const cur = rows.filter((p) => p.created_at >= start);
  const before = rows.filter((p) => p.created_at < start);
  const sum = (a: Payment[]) => a.reduce((t, p) => t + p.payable, 0);
  const paid = cur.filter((p) => p.status === "paid");
  const paidBefore = before.filter((p) => p.status === "paid");
  const finished = (a: Payment[]) => a.filter((p) => p.status !== "pending" && p.status !== "verifying");

  // Buckets: hours for a single day, otherwise one per day.
  const hourly = days === 1;
  const n = hourly ? 24 : days;
  const step = hourly ? 3_600_000 : DAY;
  const series = Array.from({ length: n }, (_, i) => ({ t: start + i * step, amount: 0, count: 0 }));
  for (const p of paid) {
    const b = series[Math.floor((p.created_at - start) / step)];
    if (b) { b.amount += p.payable; b.count++; }
  }
  const heat = Array.from({ length: 7 }, () => Array<number>(8).fill(0));
  for (const p of paid) {
    const d = new Date(p.created_at + IST);
    heat[(d.getUTCDay() + 6) % 7][Math.floor(d.getUTCHours() / 3)]++;
  }
  const status = (["paid", "on_hold", "pending", "declined", "expired"] as PaymentStatus[]).map((k) => {
    const m = cur.filter((p) => (k === "pending" ? p.status === "pending" || p.status === "verifying" : p.status === k));
    return { key: k, count: m.length, amount: sum(m) };
  });
  const group = (key: (p: Payment) => string | null) => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const p of paid) {
      const k = key(p);
      if (!k) continue;
      const e = m.get(k) ?? { count: 0, amount: 0 };
      e.count++; e.amount += p.payable;
      m.set(k, e);
    }
    return [...m].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.amount - a.amount);
  };
  const auto = paid.filter((p) => p.method !== "manual");
  const speeds = auto.filter((p) => p.settled_at).map((p) => (p.settled_at! - (p.claimed_at && p.claimed_at < p.settled_at! ? p.claimed_at : p.created_at)) / 1000).sort((a, b) => a - b);
  const hold = all<Payment>("SELECT * FROM payments WHERE merchant_id=? AND status='on_hold' ORDER BY created_at DESC LIMIT 50", merchantId);
  const life = get<{ a: number | null; n: number }>("SELECT SUM(payable) a, COUNT(*) n FROM payments WHERE merchant_id=? AND status='paid'", merchantId)!;

  return {
    days, hourly, series, heat, status,
    collected: sum(paid), collectedBefore: sum(paidBefore), paidCount: paid.length, paidCountBefore: paidBefore.length, created: cur.length, requested: sum(cur),
    today: sum(rows.filter((p) => p.status === "paid" && istDay(p.created_at) === today)),
    average: paid.length ? Math.round(sum(paid) / paid.length) : 0,
    successRate: finished(cur).length ? paid.length / finished(cur).length : null,
    successBefore: finished(before).length ? paidBefore.length / finished(before).length : null,
    feesSaved: Math.round(sum(paid) * 0.02), lifetime: life.a ?? 0, lifetimeCount: life.n, lifetimeSaved: Math.round((life.a ?? 0) * 0.02),
    autoRate: paid.length ? auto.length / paid.length : null, medianSeconds: speeds.length ? speeds[Math.floor(speeds.length / 2)] : null,
    hold: hold.slice(0, 5), holdCount: hold.length, holdAmount: sum(hold),
    links: get<{ n: number; a: number | null; v: number | null }>("SELECT COUNT(*) n, SUM(active) a, SUM(views) v FROM links WHERE merchant_id=?", merchantId)!,
    bySource: group((p) => ({ link: "Payment link", qr: "QR code", api: "API" })[p.source]),
    byHandle: group((p) => (p.payer_vpa ? "@" + p.payer_vpa.split("@")[1] : null)).sort((a, b) => b.count - a.count).slice(0, 5),
    topLinks: group((p) => (p.source === "link" ? p.title : null)).slice(0, 5),
    strays: get<{ n: number; a: number | null }>("SELECT COUNT(*) n, SUM(amount) a FROM mails WHERE merchant_id=? AND outcome IN ('unmatched','ambiguous')", merchantId)!,
    recent: all<Payment>("SELECT * FROM payments WHERE merchant_id=? ORDER BY created_at DESC LIMIT 8", merchantId),
  };
}
export type Dashboard = ReturnType<typeof dashboard>;

export type LinkRow = Link & { paid_count: number; paid_amount: number; opened: number };
export const listLinks = (merchantId: string) =>
  all<LinkRow>(
    `SELECT l.*, COUNT(p.id) opened, COALESCE(SUM(p.status='paid'),0) paid_count, COALESCE(SUM(CASE WHEN p.status='paid' THEN p.payable END),0) paid_amount
     FROM links l LEFT JOIN payments p ON p.link_id=l.id WHERE l.merchant_id=? GROUP BY l.id ORDER BY l.created_at DESC`, merchantId,
  );

export interface PaymentFilter { status?: string; q?: string; source?: string; page?: number; size?: number }
export function listPayments(merchantId: string, f: PaymentFilter) {
  const where = ["merchant_id=?"];
  const p: (string | number)[] = [merchantId];
  if (f.status === "open") where.push("status IN ('pending','verifying')");
  else if (f.status && f.status !== "all") { where.push("status=?"); p.push(f.status); }
  if (f.source && f.source !== "all") { where.push("source=?"); p.push(f.source); }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(id LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR payer_vpa LIKE ? ESCAPE '\\' OR payer_name LIKE ? ESCAPE '\\' OR utr LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')");
    p.push(...Array(7).fill(like));
  }
  const w = where.join(" AND ");
  const size = f.size ?? 25;
  const page = Math.max(1, f.page ?? 1);
  const total = get<{ n: number; a: number | null }>(`SELECT COUNT(*) n, SUM(CASE WHEN status='paid' THEN payable END) a FROM payments WHERE ${w}`, ...p)!;
  return { rows: all<Payment>(`SELECT * FROM payments WHERE ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...p, size, (page - 1) * size), total: total.n, paid: total.a ?? 0, page, size };
}

export function listMails(merchantId: string, tab: string) {
  const set: Record<string, string> = { review: "'unmatched','ambiguous'", matched: "'matched'", suspicious: "'suspicious'", ignored: "'ignored','duplicate','dismissed'" };
  const only = set[tab] ? `AND outcome IN (${set[tab]})` : "";
  return all<Mail>(`SELECT * FROM mails WHERE merchant_id=? ${only} ORDER BY received_at DESC, id DESC LIMIT 200`, merchantId);
}

/** Likely owners of a stray credit: same amount first, then nearest in time. */
export const candidates = (merchantId: string, mail: Mail) =>
  all<Payment>(
    `SELECT * FROM payments WHERE merchant_id=? AND status!='paid' AND payable=? AND created_at<=? ORDER BY (customer_utr IS ?) DESC, ABS(created_at-?) LIMIT 5`,
    merchantId, mail.amount ?? -1, mail.received_at + 10_000, mail.utr, mail.received_at,
  );

/** Is anything listening for credits? */
export const hasChannel = (merchantId: string) => !!get("SELECT 1 FROM mail_accounts WHERE merchant_id=? UNION SELECT 1 FROM devices WHERE merchant_id=? AND status='active'", merchantId, merchantId);

export const mailStatus = (merchantId: string) =>
  get<Omit<MailAccount, "secret_enc">>("SELECT merchant_id, kind, email, status, last_error, last_checked_at, screened, connected_at FROM mail_accounts WHERE merchant_id=?", merchantId) ?? null;

export type DeviceRow = Omit<Device, "secret_enc">;
export const listDevices = (merchantId: string) =>
  all<DeviceRow>("SELECT id, merchant_id, label, status, pair_until, model, app_version, sms_ok, battery_ok, received, last_seen_at, last_sms_at, created_at FROM devices WHERE merchant_id=? AND (status='active' OR pair_until>?) ORDER BY created_at", merchantId, Date.now());

export function settingsView(merchantId: string) {
  const { account_number_enc, ...s } = getSettings(merchantId);
  return { ...s, has_account: !!account_number_enc };
}
export type SettingsView = ReturnType<typeof settingsView>;
