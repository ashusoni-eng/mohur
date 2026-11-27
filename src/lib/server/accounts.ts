import crypto from "node:crypto";
import { all, get, run, tx } from "./db";
import { encrypt } from "./crypto";
import { AppError } from "./errors";
import type { Settings, UpiAccount } from "../types";
import { inr } from "../money";

/**
 * A business can collect into several UPI IDs, for example to stay within a bank's daily limit or NPCI's
 * small-merchant ceiling. Each payment is pinned to one account; alerts are matched against that account.
 */

const IST = 5.5 * 3_600_000;
const DAY = 86_400_000;
const startOfDay = (now: number) => Math.floor((now + IST) / DAY) * DAY - IST;
function startOfMonth(now: number) {
  const d = new Date(now + IST);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST;
}

export function listAccounts(merchantId: string, activeOnly = false): UpiAccount[] {
  return all<UpiAccount>(
    `SELECT * FROM upi_accounts WHERE merchant_id=? ${activeOnly ? "AND active=1" : ""} ORDER BY is_default DESC, id`, merchantId,
  );
}

export const getAccount = (merchantId: string, id: number) =>
  get<UpiAccount>("SELECT * FROM upi_accounts WHERE id=? AND merchant_id=?", id, merchantId);

/** The account a payment pays into. Payments made before accounts existed use the default one. */
export function accountForPayment(p: { merchant_id: string; upi_account_id: number | null }): UpiAccount | undefined {
  return (p.upi_account_id ? getAccount(p.merchant_id, p.upi_account_id) : undefined) ?? listAccounts(p.merchant_id)[0];
}

export const hasAccount = (merchantId: string) => !!get("SELECT 1 FROM upi_accounts WHERE merchant_id=? AND active=1", merchantId);

/** Bank codes whose alerts this business trusts: one per account, or "any". */
export function bankCodes(merchantId: string): string[] {
  // Every account, active or not: payments already pinned to a paused account still need its alerts.
  const codes = [...new Set(listAccounts(merchantId).map((a) => a.bank_code))];
  return codes.length ? codes : ["any"];
}

/** Money into an account today and this month, counting paid payments and ones still open. */
export function usage(a: UpiAccount, now = Date.now()) {
  const q = (from: number) =>
    get<{ s: number | null }>(
      `SELECT SUM(payable) s FROM payments WHERE upi_account_id=? AND test=0 AND
        ((status='paid' AND settled_at>=?) OR status IN ('pending','verifying'))`, a.id, from,
    )!.s ?? 0;
  return { today: q(startOfDay(now)), month: q(startOfMonth(now)) };
}

const fits = (a: UpiAccount, amount: number) => {
  const u = usage(a);
  return (a.daily_limit === null || u.today + amount <= a.daily_limit) && (a.monthly_limit === null || u.month + amount <= a.monthly_limit);
};

/** Chooses the account for a new payment: the one asked for, or by the business's rotation rule. */
export function pickAccount(merchantId: string, s: Settings, amount: number, wanted?: number | null): UpiAccount {
  const active = listAccounts(merchantId, true);
  if (!active.length) throw new AppError("Add your UPI ID in Configuration before collecting payments", 409, "not_configured");
  if (wanted) {
    const a = active.find((x) => x.id === wanted);
    if (!a) throw new AppError("No active UPI account with that ID", 422, "invalid_request", "upi_account_id");
    if (!fits(a, amount)) throw new AppError(`${a.label} has reached its limit for ${inr(amount)} more`, 422, "limit_reached", "upi_account_id");
    return a;
  }
  const open = active.filter((a) => fits(a, amount));
  if (!open.length) throw new AppError("Every UPI account has reached its limit. Raise a limit or add an account.", 422, "limit_reached", "amount");
  return s.rotation === "random" ? open[crypto.randomInt(open.length)] : open[0];
}

/* ---- managing accounts ---- */

export interface AccountInput {
  label: string; upi_id: string; payee_name: string; account_holder: string; account_number?: string; ifsc: string;
  bank_name: string; branch_name: string; bank_code: string; daily_limit?: number | ""; monthly_limit?: number | "";
  active: boolean; is_default: boolean;
}

function makeDefault(merchantId: string, id: number) {
  run("UPDATE upi_accounts SET is_default=CASE WHEN id=? THEN 1 ELSE 0 END WHERE merchant_id=?", id, merchantId);
}

/** Keeps exactly one default among active accounts, when there are any. */
function settleDefault(merchantId: string) {
  const d = get<{ id: number }>("SELECT id FROM upi_accounts WHERE merchant_id=? AND is_default=1 AND active=1", merchantId);
  if (d) return makeDefault(merchantId, d.id);
  const first = get<{ id: number }>("SELECT id FROM upi_accounts WHERE merchant_id=? AND active=1 ORDER BY id", merchantId);
  if (first) makeDefault(merchantId, first.id);
}

export function saveAccount(merchantId: string, b: AccountInput, id?: number): UpiAccount {
  return tx(() => {
    if (id !== undefined && !getAccount(merchantId, id)) throw new AppError("No UPI account with that ID", 404, "not_found");
    if (id === undefined && get<{ n: number }>("SELECT COUNT(*) n FROM upi_accounts WHERE merchant_id=?", merchantId)!.n >= 20)
      throw new AppError("You can have up to 20 UPI accounts");
    const dupe = get("SELECT 1 FROM upi_accounts WHERE merchant_id=? AND upi_id=? AND id IS NOT ?", merchantId, b.upi_id, id ?? null);
    if (dupe) throw new AppError("This UPI ID is already added", 409, "duplicate", "upi_id");
    const vals = [b.label, b.upi_id, b.payee_name, b.account_holder, b.ifsc, b.bank_name, b.branch_name, b.bank_code, b.daily_limit || null, b.monthly_limit || null, b.active ? 1 : 0] as const;
    let row = id;
    if (id === undefined) {
      row = Number(run(
        `INSERT INTO upi_accounts (label, upi_id, payee_name, account_holder, ifsc, bank_name, branch_name, bank_code, daily_limit, monthly_limit, active, merchant_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...vals, merchantId, Date.now()).lastInsertRowid);
    } else {
      run(`UPDATE upi_accounts SET label=?, upi_id=?, payee_name=?, account_holder=?, ifsc=?, bank_name=?, branch_name=?, bank_code=?, daily_limit=?, monthly_limit=?, active=? WHERE id=? AND merchant_id=?`,
        ...vals, id, merchantId);
    }
    // Left blank means "keep the saved number": it is never sent back to the browser.
    if (b.account_number) run("UPDATE upi_accounts SET account_number_enc=?, account_tail=? WHERE id=?", encrypt(b.account_number), b.account_number.slice(-4), row!);
    if (b.is_default && b.active) makeDefault(merchantId, row!);
    settleDefault(merchantId);
    return getAccount(merchantId, row!)!;
  });
}

/** Deletes an account, or pauses it when payments are still waiting on it. */
export function removeAccount(merchantId: string, id: number): "deleted" | "paused" {
  return tx(() => {
    if (!getAccount(merchantId, id)) throw new AppError("No UPI account with that ID", 404, "not_found");
    const open = get("SELECT 1 FROM payments WHERE upi_account_id=? AND status IN ('pending','verifying','on_hold')", id);
    if (open) {
      run("UPDATE upi_accounts SET active=0, is_default=0 WHERE id=?", id);
      settleDefault(merchantId);
      return "paused";
    }
    run("DELETE FROM upi_accounts WHERE id=?", id);
    settleDefault(merchantId);
    return "deleted";
  });
}

export type AccountView = Omit<UpiAccount, "account_number_enc"> & { has_account: boolean; used_today: number; used_month: number };
export function accountsView(merchantId: string): AccountView[] {
  return listAccounts(merchantId).map(({ account_number_enc, ...a }) => {
    const u = usage({ ...a, account_number_enc });
    return { ...a, has_account: !!account_number_enc, used_today: u.today, used_month: u.month };
  });
}
