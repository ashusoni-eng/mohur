import http from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

process.env.MOHUR_DB = ":memory:";
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
process.env.GOOGLE_CLIENT_ID = "id";
process.env.GOOGLE_CLIENT_SECRET = "secret";
const { run, get } = await import("../src/lib/server/db");
const P = await import("../src/lib/server/payments");
const W = await import("../src/lib/server/webhooks");
const C = await import("../src/lib/server/crypto");
const G = await import("../src/lib/server/mail/google");

const M = "mer_1";
beforeEach(() => {
  run("DELETE FROM merchants");
  run("INSERT INTO merchants VALUES (?,?,?,?,?,?)", M, "A", "B", "a@x.in", "h", 0);
  run("INSERT INTO settings (merchant_id, upi_id, bank_code) VALUES (?,?,?)", M, "shop@hdfcbank", "hdfc");
  run("INSERT INTO upi_accounts (merchant_id, label, upi_id, payee_name, account_tail, bank_code, is_default, created_at) VALUES (?,?,?,?,?,?,1,0)", M, "Main", "shop@hdfcbank", "Merchant", null, "hdfc");
});
afterEach(() => vi.unstubAllGlobals());

it("signs webhooks, retries a failing endpoint, and never sends twice", async () => {
  let code = 500;
  const got: { sig: string; body: string }[] = [];
  const srv = http.createServer((q, r) => { let b = ""; q.on("data", (d) => (b += d)).on("end", () => { got.push({ sig: String(q.headers["mohur-signature"]), body: b }); r.statusCode = code; r.end(); }); });
  await new Promise<void>((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/`;
  run("INSERT INTO webhooks (id, merchant_id, url, secret_enc, active, created_at) VALUES ('w',?,?,?,1,0)", M, url, C.encrypt("whsec"));
  P.createPayment({ merchantId: M, source: "qr", title: "t", amount: 10000 });
  await Promise.all([W.deliverDue(), W.deliverDue()]);
  expect(got).toHaveLength(1);
  expect(get("SELECT status, attempts, code FROM deliveries")).toMatchObject({ status: "queued", attempts: 1, code: 500 });
  code = 200;
  run("UPDATE deliveries SET next_at=0");
  await W.deliverDue();
  await W.deliverDue();
  expect(got).toHaveLength(2);
  expect(get("SELECT status, attempts FROM deliveries")).toMatchObject({ status: "delivered", attempts: 2 });
  const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(got[1].sig)!;
  expect(C.hmac("whsec", `${t}.${got[1].body}`)).toBe(v1);
  srv.close();
});

it("settles through the Gmail API, opening only the bank mail", async () => {
  const p = P.createPayment({ merchantId: M, source: "qr", title: "t", amount: 50000 });
  const now = Date.now();
  run("INSERT INTO mail_accounts (merchant_id, kind, email, secret_enc, cursor_ms, connected_at) VALUES (?,'google','a@gmail.com',?,?,?)", M, C.encrypt("refresh"), now, now - 1000);
  const head = (from: string, subject: string, auth: string) => ({ internalDate: String(Date.now()), payload: { headers: [{ name: "From", value: from }, { name: "Subject", value: subject }, { name: "Message-ID", value: `<${from}>` }, { name: "Authentication-Results", value: auth }] } });
  const bank = head("HDFC <alerts@hdfcbank.net>", "View: Account update for your HDFC Bank A/c", "mx.google.com; dkim=pass header.i=@hdfcbank.net");
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (u: string | URL) => {
    const url = String(u);
    calls.push(url);
    const body = Buffer.from("Rs.500.00 is successfully credited to your account **4321 by VPA a@ybl on 25-11-26. UPI Ref No 633012345678.").toString("base64url");
    const data = url.includes("/token") ? { access_token: "x", expires_in: 3600 }
      : url.includes("/messages?") ? { messages: [{ id: "bank" }, { id: "mum" }] }
      : url.includes("/messages/mum") ? head("mum@gmail.com", "Payment for school", "mx.google.com; dkim=pass header.i=@gmail.com")
      : url.includes("format=full") ? { ...bank, payload: { ...bank.payload, parts: [{ mimeType: "text/plain", body: { data: body } }] } } : bank;
    return new Response(JSON.stringify(data));
  });
  const ac = new AbortController();
  const acc = get<Parameters<typeof G.runGoogle>[0]>("SELECT * FROM mail_accounts")!;
  await G.runGoogle(acc, { signal: ac.signal, idleMs: () => 5, wake: () => () => {}, onLive: () => ac.abort() });
  expect(P.getPayment(p.id)).toMatchObject({ status: "paid", utr: "633012345678" });
  expect(calls.filter((c) => c.includes("format=full"))).toHaveLength(1);
  expect(calls.some((c) => c.includes("/messages/mum?format=full"))).toBe(false);
});

it("only accepts an OAuth state it signed", () => {
  const s = G.signState("mer_1");
  expect(G.readState(s)).toBe("mer_1");
  expect(G.readState(s.replace("mer_1", "mer_2"))).toBeNull();
  expect(G.readState("x")).toBeNull();
});
