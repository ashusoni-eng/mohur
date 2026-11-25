import { beforeEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";

process.env.MOHUR_DB = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
const { run, get, all } = await import("../src/lib/server/db");
const P = await import("../src/lib/server/payments");
const I = await import("../src/lib/server/mail/ingest");
const { qrMatrix } = await import("../src/lib/qr");
const { parseRupees, inr, decimal } = await import("../src/lib/money");
const C = await import("../src/lib/server/crypto");
const W = await import("../src/lib/server/webhooks");

const M = "mer_1";
let n = 0;
const mail = (amount: string, o: { utr?: string; at?: number; note?: string; from?: string; auth?: string; tail?: string; id?: string } = {}) =>
  I.ingest(
    M,
    {
      messageId: o.id ?? `<${++n}@bank>`, source: "test", receivedAt: o.at ?? Date.now(),
      headers: { from: [o.from ?? "alerts@hdfcbank.net"], subject: "View: Account update for your HDFC Bank A/c", authResults: [o.auth ?? "mx.google.com; dmarc=pass header.from=hdfcbank.net"] },
    },
    async () => ({ text: `Dear Customer, Rs.${amount} is successfully credited to your account **${o.tail ?? "4321"} by VPA ravi@okaxis RAVI on 25-11-26. ${o.utr ? `Your UPI transaction reference number is ${o.utr}. ` : ""}${o.note ? `Remarks: ${o.note}` : ""}` }),
  );
const make = (amount = 50000) => P.createPayment({ merchantId: M, source: "qr", title: "t", amount });
const st = (id: string) => P.getPayment(id)!.status;
const set = (k: string, v: string | number) => run(`UPDATE settings SET ${k}=? WHERE merchant_id=?`, v, M);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-25T10:00:00Z"));
  run("DELETE FROM merchants");
  for (const id of [M, "mer_2"]) {
    run("INSERT INTO merchants VALUES (?,?,?,?,?,?)", id, "A", "B", `${id}@x.in`, "h", 0);
    run("INSERT INTO settings (merchant_id, upi_id, account_tail, bank_code) VALUES (?,?,?,?)", id, "shop@hdfcbank", "4321", "hdfc");
  }
});
const tick = (s: number) => { vi.setSystemTime(Date.now() + s * 1000); P.sweep(); };

describe("settling from email", () => {
  it("marks the payment paid and records who paid", async () => {
    const p = make();
    expect(await mail("500.00", { utr: "633000000001" })).toBe("matched");
    expect(P.getPayment(p.id)).toMatchObject({ status: "paid", method: "email", utr: "633000000001", payer_vpa: "ravi@okaxis" });
    expect(P.getEvents(p.id).map((e) => e.type)).toEqual(["created", "paid"]);
  });
  it("gives simultaneous payments different amounts and matches each to its own", async () => {
    const a = make(), b = make(), c = make();
    expect([a, b, c].map((p) => p.payable)).toEqual([50000, 50001, 50002]);
    await mail("500.01");
    expect([a, b, c].map((p) => st(p.id))).toEqual(["pending", "paid", "pending"]);
  });
  it("does not reissue a settled amount inside its window, so a second alert settles nobody", async () => {
    const a = make();
    await mail("500.00");
    const b = make();
    expect(b.payable).toBe(50001);
    expect(await mail("500.00")).toBe("unmatched");
    expect([st(a.id), st(b.id)]).toEqual(["paid", "pending"]);
  });
  it("processes a message once and a UTR once", async () => {
    make();
    await mail("500.00", { id: "<x>", utr: "633000000001" });
    expect(await mail("500.00", { id: "<x>" })).toBe("skipped");
    expect(await mail("500.00", { utr: "633000000001" })).toBe("duplicate");
  });
  it("refuses forged, foreign and wrong-account mail", async () => {
    const p = make();
    expect(await mail("500.00", { auth: "mx.google.com; dmarc=fail header.from=hdfcbank.net" })).toBe("suspicious");
    expect(await mail("500.00", { from: "x@gmail.com" })).toBe("skipped");
    expect(await mail("500.00", { tail: "9999" })).toBe("unmatched");
    expect(await mail("499.00")).toBe("unmatched");
    expect(st(p.id)).toBe("pending");
  });
  it("never downloads the body of a personal mail", async () => {
    const body = vi.fn();
    await I.ingest(M, { messageId: "<p>", source: "t", receivedAt: Date.now(), headers: { from: ["mum@gmail.com"], subject: "Money transfer received?", authResults: [] } }, body);
    expect(body).not.toHaveBeenCalled();
    expect(all("SELECT * FROM mails")).toHaveLength(0);
  });
  it("ignores credits that arrived before the payment existed", async () => {
    const at = Date.now() - 60_000;
    const p = make();
    expect(await mail("500.00", { at })).toBe("unmatched");
    expect(st(p.id)).toBe("pending");
  });
  it("keeps merchants apart", async () => {
    const other = P.createPayment({ merchantId: "mer_2", source: "qr", title: "t", amount: 50000 });
    expect(await mail("500.00")).toBe("unmatched");
    expect(st(other.id)).toBe("pending");
    expect(() => P.approve(M, other.id, "")).toThrow(/No payment/);
  });
  it("sends ambiguous credits to a human when unique amounts are off", async () => {
    set("amount_mode", "off");
    const a = make(), b = make();
    expect(a.payable).toBe(b.payable);
    expect(await mail("500.00")).toBe("ambiguous");
    expect(await mail("500.00", { note: b.id })).toBe("matched");
    expect([st(a.id), st(b.id)]).toEqual(["pending", "paid"]);
  });
  it("strict mode never asks for the round amount, and slots run out safely", () => {
    set("amount_mode", "strict");
    const ps = Array.from({ length: 99 }, () => make());
    expect(new Set(ps.map((p) => p.payable)).size).toBe(99);
    expect(ps.every((p) => p.payable > 50000)).toBe(true);
    expect(make().exclusive).toBe(0);
  });
});

describe("wrong account saved", () => {
  it("shows the credit for review, never settles it, and recovers when the account is corrected", async () => {
    set("account_tail", "1111");
    const p = make();
    expect(await mail("500.00", { tail: "2222" })).toBe("unmatched");
    expect(st(p.id)).toBe("pending");
    expect(get<{ reason: string }>("SELECT reason FROM mails")!.reason).toBe("Paid into the account ending 2222, but Configuration has 1111");
    expect(I.accountMismatch(M)).toMatchObject({ tail: "2222", saved: "1111" });
    expect(I.recheckAccount(M)).toBe(0);
    expect(st(p.id)).toBe("pending");
    tick(400);
    set("account_tail", "2222");
    expect(I.recheckAccount(M)).toBe(1);
    expect(P.getPayment(p.id)).toMatchObject({ status: "paid", method: "email" });
    expect(I.accountMismatch(M)).toBeNull();
    expect(I.recheckAccount(M)).toBe(0);
  });
  it("recovers credits refused by the older wording too", async () => {
    set("account_tail", "1111");
    const p = make();
    await mail("500.00", { tail: "2222" });
    run("UPDATE mails SET outcome='ignored', reason='For a different account (ending 2222)'");
    set("account_tail", "2222");
    expect(I.recheckAccount(M)).toBe(1);
    expect(st(p.id)).toBe("paid");
  });
  it("leaves unrelated credits to other accounts ignored", async () => {
    expect(await mail("77.00", { tail: "9999" })).toBe("ignored");
  });
  it("says so when the alert is from a different bank than the one chosen", async () => {
    set("bank_code", "kotak");
    const body = vi.fn();
    const go = (auth: string) => I.ingest(M, { messageId: `<${++n}>`, source: "t", receivedAt: Date.now(), headers: { from: ["alerts@hdfcbank.net"], subject: "Transaction alert", authResults: [auth] } }, body);
    expect(await go("mx.google.com; dmarc=pass header.from=hdfcbank.net")).toBe("ignored");
    expect(get<{ reason: string }>("SELECT reason FROM mails")!.reason).toBe("From HDFC Bank, but Configuration is set to Kotak Mahindra Bank");
    expect(await go("mx.google.com; dmarc=fail header.from=hdfcbank.net")).toBe("skipped");
    expect(body).not.toHaveBeenCalled();
  });
  it("refuses an IFSC from another bank", async () => {
    const S = await import("../src/lib/schemas");
    const b = { upi_id: "shop@idfcbank", payee_name: "S", ifsc: "KKBK0001234", bank_code: "idfc" };
    expect(S.bank.safeParse(b).error?.issues[0].message).toMatch(/Kotak.*IDFC/);
    expect(S.bank.safeParse({ ...b, ifsc: "IDFB0001234" }).success).toBe(true);
    expect(S.bank.safeParse({ ...b, bank_code: "any" }).success).toBe(true);
  });
});

describe("clocks", () => {
  it("goes on hold 60 seconds after the customer says they paid, then still settles when mail arrives", async () => {
    const p = make();
    P.claim(p.id);
    tick(59);
    expect(st(p.id)).toBe("verifying");
    tick(1);
    expect(st(p.id)).toBe("on_hold");
    tick(600);
    expect(await mail("500.00")).toBe("matched");
    expect(st(p.id)).toBe("paid");
  });
  it("can start the 60 seconds when the QR appears", () => {
    set("timer_start", "qr");
    const p = make();
    tick(60);
    expect(st(p.id)).toBe("on_hold");
  });
  it("expires abandoned payments but keeps claimed ones for review", () => {
    const a = make(), b = make();
    tick(301);
    P.claim(b.id);
    tick(3601);
    expect([st(a.id), st(b.id)]).toEqual(["expired", "on_hold"]);
  });
  it("leaves very late credits for a human, and frees the amount", async () => {
    const a = make();
    P.claim(a.id);
    tick(2 * 3600);
    expect(await mail("500.00")).toBe("unmatched");
    expect(make().payable).toBe(50000);
  });
});

describe("UTR", () => {
  it("resolves a late or ambiguous credit", async () => {
    set("amount_mode", "off");
    const a = make(), b = make();
    await mail("500.00", { utr: "633000000001" });
    expect(I.submitUtr(a.id, "633000000001").status).toBe("paid");
    expect(I.submitUtr(b.id, "633000000001").status).toBe("pending");
  });
  it("needs the right amount and a fresh credit", async () => {
    await mail("500.00", { utr: "633000000001" });
    tick(60);
    const p = make();
    expect(I.submitUtr(p.id, "633000000001").status).toBe("pending");
    expect(() => I.submitUtr(p.id, "12")).toThrow(/UTR/);
  });
});

describe("manual decisions", () => {
  it("approves once, and paid is final", () => {
    const p = make();
    expect(P.approve(M, p.id, "cash").status).toBe("paid");
    expect(() => P.approve(M, p.id, "")).toThrow(/already/);
    expect(() => P.decline(M, p.id, "")).toThrow(/already/);
  });
  it("a declined payment is not settled by a later email, but can be approved", async () => {
    const p = make();
    P.decline(M, p.id, "");
    expect(await mail("500.00")).toBe("unmatched");
    expect(st(p.id)).toBe("declined");
    const m = get<{ id: number }>("SELECT id FROM mails WHERE outcome='unmatched'")!;
    expect(I.linkMail(M, m.id, p.id).status).toBe("paid");
    expect(() => I.linkMail(M, m.id, make().id)).toThrow(/already used/);
  });
});

describe("plumbing", () => {
  it("is idempotent per key", () => {
    const n = { merchantId: M, source: "api" as const, title: "t", amount: 10000, idempotencyKey: "k" };
    expect(P.createPayment(n).id).toBe(P.createPayment(n).id);
    expect(() => P.createPayment({ ...n, amount: 20000 })).toThrow(/idempotency/i);
  });
  it("needs a UPI ID and a sane amount", () => {
    expect(() => make(99)).toThrow(); expect(() => make(1_00_000_01)).toThrow(); expect(() => make(100.5)).toThrow();
    set("upi_id", ""); expect(() => make()).toThrow(/UPI ID/);
  });
  it("queues a webhook in the same breath as settlement", () => {
    run("INSERT INTO webhooks VALUES ('w',?,?,?,1,0)", M, "https://x.in", "s");
    const p = make();
    P.approve(M, p.id, "");
    expect(all<{ event: string }>("SELECT event FROM deliveries ORDER BY created_at, rowid").map((d) => d.event)).toEqual(["payment.created", "payment.paid"]);
  });
  it("draws a QR that scans back to the same UPI request", () => {
    const uri = P.upiUri(make(50007), P.getSettings(M));
    expect(uri).toMatch(/^upi:\/\/pay\?pa=shop@hdfcbank&pn=Merchant&am=500\.07&cu=INR&tn=[0-9A-F]{10}$/);
    const { size, on } = qrMatrix(uri);
    const k = 6, q = 4, w = (size + q * 2) * k;
    const px = new Uint8ClampedArray(w * w * 4);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const v = on(Math.floor(y / k) - q, Math.floor(x / k) - q) ? 20 : 255;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
    expect(jsQR(px, w, w)?.data).toBe(uri);
  });
  it("handles money without floats", () => {
    expect([parseRupees("1,499.5"), parseRupees("₹ 10"), parseRupees("0.29"), parseRupees("1.999"), parseRupees("-5"), parseRupees("")]).toEqual([149950, 1000, 29, null, null, null]);
    expect(inr(12345600)).toBe("₹1,23,456"); expect(inr(50007)).toBe("₹500.07"); expect(decimal(50007)).toBe("500.07"); expect(decimal(5)).toBe("0.05");
  });
  it("encrypts secrets and hashes passwords", async () => {
    const e = C.encrypt("pass");
    expect(e).not.toContain("pass"); expect(C.decrypt(e)).toBe("pass");
    const h = await C.hashPassword("hunter22");
    expect([await C.verifyPassword("hunter22", h), await C.verifyPassword("x", h)]).toEqual([true, false]);
  });
  it("knows private addresses", () => {
    for (const a of ["127.0.0.1", "10.1.1.1", "169.254.169.254", "192.168.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(W.isPrivateAddress(a)).toBe(true);
    expect(W.isPrivateAddress("8.8.8.8")).toBe(false);
  });
});
