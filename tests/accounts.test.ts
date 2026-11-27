import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.MOHUR_DB = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
const { run, get } = await import("../src/lib/server/db");
const P = await import("../src/lib/server/payments");
const I = await import("../src/lib/server/mail/ingest");
const A = await import("../src/lib/server/accounts");

const M = "m1";
const acct = (label: string, upi: string, tail: string, bank: string, o: { daily?: number; monthly?: number; def?: boolean; active?: boolean } = {}) =>
  Number(run("INSERT INTO upi_accounts (merchant_id, label, upi_id, payee_name, account_tail, bank_code, daily_limit, monthly_limit, is_default, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,0)",
    M, label, upi, "Shop", tail, bank, o.daily ?? null, o.monthly ?? null, o.def ? 1 : 0, o.active === false ? 0 : 1).lastInsertRowid);
const make = (amount: number, extra: Partial<Parameters<typeof P.createPayment>[0]> = {}) => P.createPayment({ merchantId: M, source: "api", title: "t", amount, ...extra });
const mail = (amount: string, from: string, domain: string, tail: string) =>
  I.ingest(M, { messageId: `<${Math.random()}>`, source: "gmail", receivedAt: Date.now(), headers: { from: [from], subject: "Account update: credit alert", authResults: [`mx.google.com; dmarc=pass header.from=${domain}`] } },
    async () => ({ text: `Rs.${amount} is successfully credited to your account **${tail} by VPA a@ybl on 26-11-26.` }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T06:00:00Z"));
  run("DELETE FROM merchants");
  run("INSERT INTO merchants VALUES (?,?,?,?,?,?)", M, "A", "B", "a@x.in", "h", 0);
  run("INSERT INTO settings (merchant_id) VALUES (?)", M);
});

describe("choosing an account", () => {
  it("uses the default account until its daily limit, then the next", () => {
    const a = acct("Shop 1", "one@okhdfcbank", "1111", "hdfc", { daily: 100000, def: true });
    const b = acct("Shop 2", "two@okicici", "2222", "icici");
    expect(make(60000).upi_account_id).toBe(a);
    expect(make(60000).upi_account_id).toBe(b); // 600 + 600 would pass Shop 1's ₹1,000 a day
    expect(make(30000).upi_account_id).toBe(a);
  });
  it("counts open and paid payments, and frees the limit when a payment expires", () => {
    const a = acct("Shop 1", "one@okhdfcbank", "1111", "hdfc", { daily: 100000 });
    make(90000);
    expect(() => make(20000)).toThrow(/limit/);
    run("UPDATE payments SET status='expired'");
    expect(make(20000).upi_account_id).toBe(a);
  });
  it("keeps a monthly ceiling, for example NPCI's small-merchant ₹1 lakh", () => {
    acct("Small", "s@okhdfcbank", "1111", "hdfc", { monthly: 1_00_000_00 });
    const p = make(99_000_00);
    run("UPDATE payments SET status='paid', settled_at=? WHERE id=?", Date.now(), p.id);
    expect(() => make(2_000_00)).toThrow(/limit/);
  });
  it("rotates at random among accounts with room when asked", () => {
    acct("1", "one@okhdfcbank", "1111", "hdfc"); acct("2", "two@okicici", "2222", "icici");
    run("UPDATE settings SET rotation='random' WHERE merchant_id=?", M);
    const seen = new Set(Array.from({ length: 30 }, () => make(10000).upi_account_id));
    expect(seen.size).toBe(2);
  });
  it("honours an account asked for by the API, and never uses an inactive one", () => {
    acct("1", "one@okhdfcbank", "1111", "hdfc", { def: true });
    const off = acct("off", "off@okicici", "9999", "icici", { active: false });
    const b = acct("2", "two@okicici", "2222", "icici");
    expect(make(10000, { upiAccountId: b }).upi_account_id).toBe(b);
    expect(() => make(10000, { upiAccountId: off })).toThrow(/No active UPI account/);
  });
  it("puts each account's own UPI ID in the QR", () => {
    acct("1", "one@okhdfcbank", "1111", "hdfc", { def: true });
    const b = acct("2", "two@okicici", "2222", "icici");
    expect(P.upiFor(make(10000, { upiAccountId: b }))!.vpa).toBe("two@okicici");
  });
});

describe("matching alerts with several accounts", () => {
  it("settles the payment in the account the bank says was credited", async () => {
    const a = acct("HDFC", "one@okhdfcbank", "1111", "hdfc");
    const b = acct("ICICI", "two@okicici", "2222", "icici");
    const pa = make(50000, { upiAccountId: a }), pb = make(50000, { upiAccountId: b });
    expect([pa.payable, pb.payable]).toEqual([50000, 50001]);
    expect(await mail("500.01", "alerts@icicibank.com", "icicibank.com", "2222")).toBe("matched");
    expect([P.getPayment(pa.id)!.status, P.getPayment(pb.id)!.status]).toEqual(["pending", "paid"]);
  });
  it("never settles a payment from a credit to a different account of the same business", async () => {
    acct("HDFC", "one@okhdfcbank", "1111", "hdfc");
    const b = acct("ICICI", "two@okicici", "2222", "icici");
    const p = make(50000, { upiAccountId: b });
    expect(await mail("500.00", "alerts@hdfcbank.net", "hdfcbank.net", "1111")).toBe("unmatched");
    expect(P.getPayment(p.id)!.status).toBe("pending");
  });
  it("trusts alerts from every bank in use, and still flags an account it does not know", async () => {
    acct("HDFC", "one@okhdfcbank", "1111", "hdfc"); acct("ICICI", "two@okicici", "2222", "icici");
    expect(A.bankCodes(M).sort()).toEqual(["hdfc", "icici"]);
    make(70000);
    expect(await mail("700.00", "alerts@icicibank.com", "icicibank.com", "7777")).toBe("unmatched");
    expect(get<{ reason: string }>("SELECT reason FROM mails ORDER BY id DESC")!.reason).toBe("Paid into the account ending 7777, but your UPI accounts end 1111, 2222");
  });
  it("still settles open payments pinned to an account that was later switched off", async () => {
    const a = acct("HDFC", "one@okhdfcbank", "1111", "hdfc");
    const p = make(50000);
    run("UPDATE upi_accounts SET active=0 WHERE id=?", a);
    expect(await mail("500.00", "alerts@hdfcbank.net", "hdfcbank.net", "1111")).toBe("matched");
    expect(P.getPayment(p.id)!.status).toBe("paid");
  });
});
