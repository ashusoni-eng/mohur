import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.MOHUR_DB = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
const { run, get, all } = await import("../src/lib/server/db");
const P = await import("../src/lib/server/payments");
const I = await import("../src/lib/server/mail/ingest");
const W = await import("../src/lib/server/webhooks");
const V = await import("../src/lib/server/views");
const Brand = await import("../src/lib/server/brand");
const S = await import("../src/lib/schemas");
const C = await import("../src/lib/server/crypto");
const api = {
  create: (await import("../src/app/api/v1/payments/route")).POST,
  list: (await import("../src/app/api/v1/payments/route")).GET,
  get: (await import("../src/app/api/v1/payments/[id]/route")).GET,
  simulate: (await import("../src/app/api/v1/payments/[id]/simulate/route")).POST,
  link: (await import("../src/app/api/v1/links/route")).POST,
};

const M = "m1";
const LIVE = "mhr_live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TEST = "mhr_test_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
type Route = (r: Request, c: { params: Promise<Record<string, string>> }) => Promise<Response>;
const call = async (route: unknown, key: string, o: { method?: string; body?: unknown; id?: string; qs?: string } = {}) => {
  const res = await (route as Route)(new Request(`http://x/api/v1/payments${o.qs ?? ""}`, {
    method: o.method ?? (o.body ? "POST" : "GET"), headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined,
  }), { params: Promise.resolve((o.id ? { id: o.id } : {}) as Record<string, string>) });
  return { status: res.status, json: await res.json() };
};
const mail = (amount: string, tail = "1111") =>
  I.ingest(M, { messageId: `<${Math.random()}>`, source: "gmail", receivedAt: Date.now(), headers: { from: ["alerts@hdfcbank.net"], subject: "Account update: credit alert", authResults: ["mx.google.com; dmarc=pass header.from=hdfcbank.net"] } },
    async () => ({ text: `Rs.${amount} is successfully credited to your account **${tail} by VPA a@ybl on 26-11-26.` }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T06:00:00Z"));
  run("DELETE FROM merchants");
  run("INSERT INTO merchants VALUES (?,?,?,?,?,?)", M, "A", "Shop", "a@x.in", "h", 0);
  run("INSERT INTO settings (merchant_id) VALUES (?)", M);
  run("INSERT INTO upi_accounts (merchant_id, label, upi_id, payee_name, account_tail, bank_code, is_default, created_at) VALUES (?,?,?,?,?,?,1,0)", M, "Main", "shop@okhdfcbank", "Shop", "1111", "hdfc");
  run("INSERT INTO api_keys (id, merchant_id, label, prefix, key_hash, created_at, mode) VALUES ('k1',?,?,?,?,0,'live'), ('k2',?,?,?,?,0,'test')", M, "live", "mhr_live_aaaa", C.sha256(LIVE), M, "test", "mhr_test_bbbb", C.sha256(TEST));
  run("INSERT INTO webhooks (id, merchant_id, url, secret_enc, created_at, mode) VALUES ('wh_live01',?,?,?,0,'live'), ('wh_test01',?,?,?,0,'test')", M, "https://a.in/l", C.encrypt("s"), M, "https://a.in/t", C.encrypt("s"));
});

describe("test mode", () => {
  it("creates test payments with no UPI ID, and keeps them apart from live data", async () => {
    const t = await call(api.create, TEST, { body: { amount: 10000, reference: "o-1" } });
    expect(t.status).toBe(201);
    expect(t.json).toMatchObject({ livemode: false, upi_intent: null, status: "pending" });
    expect(V.checkoutView(P.getPayment(t.json.id)!)).toMatchObject({ test: true, upi: null, bank: null });
    const l = await call(api.create, LIVE, { body: { amount: 10000, reference: "o-1" } });
    expect(l.json.upi_intent).toMatch(/^upi:\/\/pay\?pa=shop@okhdfcbank/);
    expect((await call(api.list, TEST)).json.data.map((p: { id: string }) => p.id)).toEqual([t.json.id]);
    expect((await call(api.get, LIVE, { id: t.json.id })).status).toBe(404);
    expect(V.dashboard(M, 1).recent.map((p) => p.id)).toEqual([l.json.id]);
  });
  it("uses its own paise slots, and a real bank alert never settles a test payment", async () => {
    const t = (await call(api.create, TEST, { body: { amount: 10000 } })).json;
    expect(t.amount_payable).toBe(10000);
    await mail("100.00");
    expect(P.getPayment(t.id)!.status).toBe("pending");
  });
  it("simulates each outcome through the API, firing the same webhooks", async () => {
    const t = (await call(api.create, TEST, { body: { amount: 10000 } })).json;
    expect((await call(api.simulate, TEST, { id: t.id, body: { outcome: "on_hold" } })).json.status).toBe("on_hold");
    const paid = await call(api.simulate, TEST, { id: t.id, body: { outcome: "paid" } });
    expect(paid.json).toMatchObject({ status: "paid", livemode: false });
    expect(paid.json.utr).toMatch(/^TEST/);
    expect((await call(api.simulate, TEST, { id: t.id, body: { outcome: "declined" } })).status).toBe(409);
    const d = all<{ event: string; webhook_id: string; sequence: number }>("SELECT event, webhook_id, sequence FROM deliveries ORDER BY sequence");
    expect(d.map((x) => [x.event, x.webhook_id, x.sequence])).toEqual([["payment.created", "wh_test01", 1], ["payment.on_hold", "wh_test01", 2], ["payment.paid", "wh_test01", 3]]);
  });
  it("refuses to simulate with a live key, or on a live payment", async () => {
    const l = (await call(api.create, LIVE, { body: { amount: 10000 } })).json;
    expect((await call(api.simulate, LIVE, { id: l.id, body: { outcome: "paid" } })).json.code).toBe("live_key");
    expect(() => P.simulate(l.id, "paid")).toThrow(/No test payment/);
    expect(P.getPayment(l.id)!.status).toBe("pending");
  });
  it("does not make payment links with a test key", async () => {
    expect((await call(api.link, TEST, { body: { title: "x" } })).json.code).toBe("test_key");
  });
});

describe("API conveniences", () => {
  it("finds a payment by your own reference, newest first, within the key's mode", async () => {
    await call(api.create, LIVE, { body: { amount: 10000, reference: "order 7" } });
    vi.setSystemTime(Date.now() + 1000);
    const b = (await call(api.create, LIVE, { body: { amount: 20000, reference: "order 7" } })).json;
    expect((await call(api.get, LIVE, { id: encodeURIComponent("order 7") })).json.id).toBe(b.id);
    expect((await call(api.get, TEST, { id: "order 7" })).status).toBe(404);
    expect((await call(api.list, LIVE, { qs: "?reference=order%207" })).json.total).toBe(2);
  });
  it("stores customer email, phone and a note that goes into the UPI request", async () => {
    const r = (await call(api.create, LIVE, { body: { amount: 10000, note: "Invoice 9", customer: { email: "A@X.IN", phone: "+919800000000" } } })).json;
    expect(r.customer).toMatchObject({ email: "a@x.in", contact: "+919800000000" });
    expect(r.upi_intent).toContain(`tn=Invoice%209%20${r.id}`);
    expect((await call(api.create, LIVE, { body: { amount: 10000, note: "x".repeat(51) } })).json.field).toBe("note");
    expect((await call(api.create, LIVE, { body: { amount: 10000, note: "a&b=c" } })).status).toBe(400);
  });
});

describe("safe redirects", () => {
  it("allows any URL until domains are listed, then only those and their subdomains", async () => {
    expect((await call(api.create, LIVE, { body: { amount: 10000, redirect_url: "https://evil.example/x" } })).status).toBe(201);
    run("UPDATE settings SET redirect_hosts='shop.in' WHERE merchant_id=?", M);
    expect((await call(api.create, LIVE, { body: { amount: 10000, redirect_url: "https://pay.shop.in/ok" } })).status).toBe(201);
    const bad = await call(api.create, LIVE, { body: { amount: 10000, redirect_url: "https://shop.in.evil.example/" } });
    expect(bad).toMatchObject({ status: 422, json: { code: "redirect_not_allowed", field: "redirect_url" } });
    expect((await call(api.create, LIVE, { body: { amount: 10000, redirect_url: "https://evilshop.in/" } })).status).toBe(422);
  });
  it("cleans the list it is given", () => {
    expect(S.redirectHosts.parse({ redirect_hosts: "https://Shop.in/path, pay.shop.in shop.in" }).redirect_hosts).toBe("shop.in, pay.shop.in");
    expect(() => S.redirectHosts.parse({ redirect_hosts: "not a domain" })).toThrow();
  });
});

describe("webhook extras", () => {
  it("sends the event ID and sequence as headers, the same ID in every endpoint and retry", async () => {
    run("UPDATE webhooks SET mode='live'");
    const p = P.createPayment({ merchantId: M, source: "api", title: "t", amount: 10000 });
    const rows = all<{ body: string; sequence: number }>("SELECT body, sequence FROM deliveries");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => JSON.parse(r.body).id)).size).toBe(1);
    expect(JSON.parse(rows[0].body)).toMatchObject({ sequence: 1, livemode: true, data: { id: p.id } });
    const sent: Headers[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => { sent.push(new Headers(init.headers)); return new Response("ok"); });
    await W.deliverDue();
    vi.unstubAllGlobals();
    expect(sent.map((h) => h.get("mohur-event-id"))).toEqual([JSON.parse(rows[0].body).id, JSON.parse(rows[0].body).id]);
    expect(sent[0].get("mohur-sequence")).toBe("1");
    expect(get<{ event_seq: number }>("SELECT event_seq FROM payments WHERE id=?", p.id)!.event_seq).toBe(1);
  });
});

describe("checkout branding", () => {
  const png = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]).toString("base64");
  it("accepts real PNG, JPEG or WebP bytes and nothing else", () => {
    expect(Brand.parseLogo(png)).toMatch(/^image\/png;/);
    expect(() => Brand.parseLogo("data:image/svg+xml;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64"))).toThrow(/PNG, JPEG or WebP/);
    expect(() => Brand.parseLogo("data:image/png;base64," + Buffer.from("<script>").toString("base64"))).toThrow(/PNG, JPEG or WebP/);
    expect(() => Brand.parseLogo("data:image/png;base64," + Buffer.concat([Buffer.from(Brand.parseLogo(png).split(";")[1], "base64"), Buffer.alloc(Brand.MAX_LOGO)]).toString("base64"))).toThrow(/200 KB/);
  });
  it("refuses colours too light for white text, and shows the brand on checkout", () => {
    expect(() => Brand.assertReadable("#f5f0e1")).toThrow(/too light/);
    expect(() => Brand.assertReadable("#0f3d2e")).not.toThrow();
    run("UPDATE settings SET brand_color='#1b2a4a', brand_logo=? WHERE merchant_id=?", Brand.parseLogo(png), M);
    const v = V.checkoutView(P.createPayment({ merchantId: M, source: "qr", title: "t", amount: 10000 }));
    expect(v.brand.color).toBe("#1b2a4a");
    expect(v.brand.logo).toMatch(new RegExp(`^/api/public/brand/${M}\\?v=[0-9a-f]{10}$`));
    expect(JSON.stringify(V.settingsView(M))).not.toContain("base64");
  });
});
