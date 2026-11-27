import { beforeEach, expect, it } from "vitest";

process.env.MOHUR_DB = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
const { run, get } = await import("../src/lib/server/db");
const P = await import("../src/lib/server/payments");
const I = await import("../src/lib/server/mail/ingest");
const D = await import("../src/lib/server/devices");
const C = await import("../src/lib/server/crypto");
const { deviceRoute } = await import("../src/lib/server/http");
const S = await import("../src/lib/schemas");
const helloRoute = deviceRoute((d, raw) => D.hello(d, S.deviceHello.parse(JSON.parse(raw))));
const smsRoute = deviceRoute((d, raw) => D.receive(d, S.deviceSms.parse(JSON.parse(raw))));

const M = "mer_1";
beforeEach(() => {
  run("DELETE FROM merchants");
  run("INSERT INTO merchants VALUES (?,?,?,?,?,?)", M, "A", "Terra", "a@x.in", "h", 0);
  run("INSERT INTO settings (merchant_id, upi_id, account_tail, bank_code) VALUES (?,?,?,?)", M, "shop@hdfcbank", "4321", "hdfc");
  run("INSERT INTO upi_accounts (merchant_id, label, upi_id, payee_name, account_tail, bank_code, is_default, created_at) VALUES (?,?,?,?,?,?,1,0)", M, "Main", "shop@hdfcbank", "Merchant", "4321", "hdfc");
});
const pair = () => Object.fromEntries(new URL(D.startPairing(M, "Counter").link).searchParams) as { s: string; d: string; k: string };
const call = (route: typeof helloRoute, path: string, c: { d: string; k: string }, data: unknown, o: { time?: number; tamper?: string } = {}) => {
  const body = JSON.stringify(data), time = String(o.time ?? Date.now());
  return route(new Request("http://x" + path, { method: "POST", body: o.tamper ?? body, headers: { "mohur-device": c.d, "mohur-time": time, "mohur-signature": C.hmac(c.k, `POST\n${path}\n${time}\n${C.sha256(body)}`) } }));
};
const HI = { model: "Pixel", version: "1", sms_ok: true, battery_ok: true };
const sms = (amt: string, o: { utr?: string; sender?: string; age?: number } = {}) => {
  const body = `Credit Alert! Rs.${amt} credited to HDFC Bank A/c XX4321 on 25-11-26 from VPA ravi@okaxis${o.utr ? ` (UPI ${o.utr})` : ""}`;
  return { id: C.sha256(body + (o.sender ?? "") + Math.random()), sender: o.sender ?? "VM-HDFCBK-S", body, age_ms: o.age ?? 0 };
};
const mail = (amt: string, utr?: string) =>
  I.ingest(M, { messageId: `<${Math.random()}>`, source: "gmail", receivedAt: Date.now(), headers: { from: ["alerts@hdfcbank.net"], subject: "View: Account update for your HDFC Bank A/c", authResults: ["mx.google.com; dmarc=pass header.from=hdfcbank.net"] } }, async () => ({ text: `Rs.${amt} is successfully credited to your account **4321 by VPA ravi@okaxis on 25-11-26. ${utr ? `Your UPI transaction reference number is ${utr}.` : ""}` }));
const make = () => P.createPayment({ merchantId: M, source: "qr", title: "t", amount: 50000 });
async function ready() { const c = pair(); await call(helloRoute, "/api/device/hello", c, HI); return c; }
const send = async (c: { d: string; k: string }, ...items: ReturnType<typeof sms>[]) => (await (await call(smsRoute, "/api/device/sms", c, { items })).json()).results as { outcome: string; payment_id: string | null }[];

it("pairs, then settles a payment from SMS", async () => {
  const c = pair();
  const r = await (await call(helloRoute, "/api/device/hello", c, HI)).json();
  expect(r).toMatchObject({ business: "Terra", headers: ["HDFCBK"] });
  expect(get("SELECT status, model FROM devices")).toMatchObject({ status: "active", model: "Pixel" });
  const p = make();
  expect(await send(c, sms("500.00", { utr: "633000000001" }))).toMatchObject([{ outcome: "matched", payment_id: p.id }]);
  expect(P.getPayment(p.id)).toMatchObject({ status: "paid", method: "sms", utr: "633000000001" });
});

it("refuses bad signatures, altered bodies, old clocks, expired codes and removed phones", async () => {
  const c = await ready();
  expect((await call(helloRoute, "/api/device/hello", { ...c, k: "wrong" }, HI)).status).toBe(401);
  expect((await call(helloRoute, "/api/device/hello", c, HI, { tamper: JSON.stringify({ ...HI, model: "x" }) })).status).toBe(401);
  expect((await call(helloRoute, "/api/device/hello", c, HI, { time: Date.now() - 600_000 })).status).toBe(409);
  const late = pair();
  run("UPDATE devices SET pair_until=0 WHERE id=?", late.d);
  expect((await call(helloRoute, "/api/device/hello", late, HI)).status).toBe(401);
  D.removeDevice(M, c.d);
  expect((await call(smsRoute, "/api/device/sms", c, { items: [sms("1.00")] })).status).toBe(401);
});

it("ignores people pretending to be the bank, and repeats", async () => {
  const c = await ready();
  const p = make();
  expect(await send(c, sms("500.00", { sender: "+919812345678" }))).toMatchObject([{ outcome: "suspicious" }]);
  expect(await send(c, sms("500.00", { sender: "VM-ICICIT-S" }))).toMatchObject([{ outcome: "skipped" }]);
  expect(P.getPayment(p.id)!.status).toBe("pending");
  const one = sms("500.00");
  expect((await send(c, one))[0].outcome).toBe("matched");
  expect((await send(c, one))[0].outcome).toBe("matched");
  expect(get("SELECT COUNT(*) n FROM mails WHERE outcome='matched'")).toMatchObject({ n: 1 });
});

it("treats mail and SMS for one credit as one credit", async () => {
  const c = await ready();
  for (const [a, b] of [["633000000001", "633000000001"], ["633000000002", undefined], [undefined, "633000000003"], [undefined, undefined]] as const) {
    run("DELETE FROM payments"); run("DELETE FROM mails");
    let p = make();
    expect(await mail("500.00", a)).toBe("matched");
    expect((await send(c, sms("500.00", { utr: b })))[0].outcome).toBe("duplicate");
    expect(P.getPayment(p.id)!.utr).toBe(a ?? b ?? null);
    run("DELETE FROM payments"); run("DELETE FROM mails");
    p = make();
    expect((await send(c, sms("500.00", { utr: a })))[0].outcome).toBe("matched");
    expect(await mail("500.00", b)).toBe("duplicate");
    expect(P.getPayment(p.id)!.method).toBe("sms");
  }
});

it("does not swallow a genuine second payment", async () => {
  const c = await ready();
  make();
  expect(await mail("500.00", "633000000001")).toBe("matched");
  expect((await send(c, sms("500.00", { utr: "633000000002" })))[0].outcome).toBe("unmatched");
  expect(await mail("500.00")).toBe("unmatched");
});

it("does not let a mail echo settle the next customer", async () => {
  const c = await ready();
  make();
  await send(c, sms("500.00"));
  const next = make();
  expect(next.payable).toBe(50001);
  expect(await mail("500.00")).toBe("duplicate");
  expect(P.getPayment(next.id)!.status).toBe("pending");
});

it("uses when the SMS arrived, not when the phone got online", async () => {
  const c = await ready();
  const p = make();
  expect((await send(c, sms("500.00", { age: 3600_000 })))[0].outcome).toBe("unmatched");
  expect(P.getPayment(p.id)!.status).toBe("pending");
});
