import { beforeEach, describe, expect, it } from "vitest";

process.env.MOHUR_DB = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.TRUST_PROXY = "1";
const { run } = await import("../src/lib/server/db");
const P = await import("../src/lib/server/payments");
const R = {
  get: (await import("../src/app/api/public/payments/[id]/route")).GET,
  stream: (await import("../src/app/api/public/payments/[id]/stream/route")).GET,
  claim: (await import("../src/app/api/public/payments/[id]/claim/route")).POST,
  utr: (await import("../src/app/api/public/payments/[id]/utr/route")).POST,
};

let n = 0;
const from = () => `203.0.113.${++n}`;
const call = (route: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response>, id: string, ip: string, method = "GET") =>
  route(new Request(`http://x/api/public/payments/${id}`, { method, headers: { "x-forwarded-for": ip, origin: "http://x", host: "x", "content-type": "application/json" }, body: method === "POST" ? JSON.stringify({ utr: "633000000001" }) : undefined }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  run("DELETE FROM merchants");
  run("INSERT INTO merchants VALUES ('m','A','B','a@x.in','h',0)");
  run("INSERT INTO settings (merchant_id, upi_id) VALUES ('m','shop@ybl')");
  run("INSERT INTO upi_accounts (merchant_id, label, upi_id, payee_name, account_tail, bank_code, is_default, created_at) VALUES (?,?,?,?,?,?,1,0)", "m", "Main", "shop@ybl", "Merchant", null, "any");
});

describe("guessing payment IDs", () => {
  it.each(Object.keys(R))("is limited on the %s route, and shares one budget across all of them", async (name) => {
    const ip = from();
    const route = R[name as keyof typeof R] as Parameters<typeof call>[0];
    const method = name === "claim" || name === "utr" ? "POST" : "GET";
    const codes = [];
    for (let i = 0; i < 31; i++) codes.push((await call(route, i.toString(16).padStart(10, "A"), ip, method)).status);
    expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true);
    expect(codes[30]).toBe(429);
    expect((await call(R.get as Parameters<typeof call>[0], "ABCDEF0123", ip)).status).toBe(429);
  });
  it("never slows down someone watching a real payment", async () => {
    const p = P.createPayment({ merchantId: "m", source: "qr", title: "t", amount: 10000 });
    const ip = from();
    for (let i = 0; i < 60; i++) expect((await call(R.get as Parameters<typeof call>[0], p.id.toLowerCase(), ip)).status).toBe(200);
  });
  it("keeps visitors apart", async () => {
    const a = from(), b = from();
    for (let i = 0; i < 31; i++) await call(R.get as Parameters<typeof call>[0], "0000000000", a);
    expect((await call(R.get as Parameters<typeof call>[0], "0000000000", b)).status).toBe(404);
  });
});
