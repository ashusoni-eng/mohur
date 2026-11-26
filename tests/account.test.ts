import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mohur-del-")), "t.db");
process.env.MOHUR_DB = file;
process.env.APP_SECRET = "test-secret-test-secret-test-secret-1234";
const { db, get, run } = await import("../src/lib/server/db");
const A = await import("../src/lib/server/auth");
const P = await import("../src/lib/server/payments");
const L = await import("../src/lib/server/links");
const D = await import("../src/lib/server/devices");
const I = await import("../src/lib/server/mail/ingest");
const C = await import("../src/lib/server/crypto");

const MARK = "ZEBRAQUARTZ";
async function account(tag: string) {
  const id = await A.signUp({ name: `${tag} ${MARK}`, business: `${tag} Shop ${MARK}`, email: `${tag}@example.test`, password: "correct-horse-9" });
  run("UPDATE settings SET upi_id=?, account_number_enc=?, account_tail='4321', bank_code='hdfc' WHERE merchant_id=?", `${tag.toLowerCase()}${MARK.toLowerCase()}@ybl`, C.encrypt("50100000004321"), id);
  run("INSERT INTO mail_accounts (merchant_id, kind, email, secret_enc, connected_at) VALUES (?,?,?,?,?)", id, "imap", `${tag}${MARK}@gmail.test`, C.encrypt("app-password"), Date.now());
  run("INSERT INTO api_keys VALUES (?,?,?,?,?,?,NULL)", `key_${tag}`, id, `key ${MARK}`, "mhr_x", `hash_${tag}`, Date.now());
  run("INSERT INTO webhooks VALUES (?,?,?,?,1,?)", `wh_${tag}`, id, `https://${MARK}.example.test/hook`, C.encrypt("s"), Date.now());
  L.createLink(id, { title: `Link ${MARK}`, amount: 10000 });
  D.startPairing(id, `Phone ${MARK}`);
  const p = P.createPayment({ merchantId: id, source: "qr", title: `Order ${MARK}`, amount: 50000, customerName: `Customer ${MARK}` });
  await I.ingest(id, { messageId: `<${tag}@b>`, source: "gmail", receivedAt: Date.now(), headers: { from: ["alerts@hdfcbank.net"], subject: "View: Account update", authResults: ["mx.google.com; dmarc=pass header.from=hdfcbank.net"] } },
    async () => ({ text: `Rs.500.00 is successfully credited to your account **4321 by VPA payer${MARK.toLowerCase()}@ybl ${MARK} on 26-11-26.` }));
  await A.signIn(`${tag}@example.test`, "correct-horse-9");
  run("INSERT INTO sessions VALUES (?,?,?,?)", `sess_${tag}`, id, Date.now(), Date.now() + 1e9);
  expect(P.getPayment(p.id)!.status).toBe("paid");
  return id;
}
const TABLES = ["merchants:id", "sessions:merchant_id", "settings:merchant_id", "mail_accounts:merchant_id", "links:merchant_id", "payments:merchant_id", "mails:merchant_id", "api_keys:merchant_id", "webhooks:merchant_id", "devices:merchant_id"];
const count = (id: string) => Object.fromEntries(TABLES.map((t) => { const [tb, col] = t.split(":"); return [tb, get<{ n: number }>(`SELECT COUNT(*) n FROM ${tb} WHERE ${col}=?`, id)!.n]; }));

it("deletes an account and everything in it, leaves others alone, and leaves no trace in the file", async () => {
  const a = await account("Asha"), b = await account("Bina");
  expect(Object.values(count(a)).every((n) => n > 0)).toBe(true);
  const before = { events: get<{ n: number }>("SELECT COUNT(*) n FROM payment_events")!.n, deliveries: get<{ n: number }>("SELECT COUNT(*) n FROM deliveries")!.n };
  expect(before.deliveries).toBeGreaterThan(0);

  await expect(A.deleteAccount(a, "wrong-password")).rejects.toThrow(/incorrect/);
  expect(count(a).merchants).toBe(1);

  await A.deleteAccount(a, "correct-horse-9");
  expect(Object.values(count(a)).every((n) => n === 0)).toBe(true);
  expect(Object.values(count(b)).every((n) => n > 0)).toBe(true);
  const orphans = get<{ n: number }>("SELECT (SELECT COUNT(*) FROM payment_events WHERE payment_id NOT IN (SELECT id FROM payments)) + (SELECT COUNT(*) FROM deliveries WHERE webhook_id NOT IN (SELECT id FROM webhooks)) n")!.n;
  expect(orphans).toBe(0);
  await expect(A.signIn("asha@example.test", "correct-horse-9")).rejects.toThrow();

  db().close();
  const raw = Buffer.concat([file, file + "-wal"].filter(fs.existsSync).map((f) => fs.readFileSync(f)));
  expect(raw.includes("Asha Shop " + MARK)).toBe(false);
  expect(raw.includes("asha" + MARK.toLowerCase())).toBe(false);
  expect(raw.includes("Bina Shop " + MARK)).toBe(true);
});
