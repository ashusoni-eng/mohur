/**
 * Creates a demo merchant with 60 days of invented payments, so the dashboard has something to show.
 *   npm run seed
 * Sign in with demo@mohur.test / demo-password-1. Never run this against real data.
 */
import { get, run, tx } from "../src/lib/server/db";
import { encrypt, hashPassword, newPaymentId, newSlug } from "../src/lib/server/crypto";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
const EMAIL = "demo@mohur.test";
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const NAMES = ["Asha Rao", "Meera Shah", "Ravi Kumar", "Imran Khan", "Divya Nair", "Karan Mehta", "Leela Das", "Joseph P", "Neha Gupta", "Arjun Singh", "Farah Ali", "Tenzin L"];
const HANDLES = ["okaxis", "ybl", "okhdfcbank", "paytm", "oksbi", "ibl", "okicici"];
const LINKS: [string, number | null][] = [["Saturday pottery workshop", 149900], ["Hand-thrown mug, pair", 89900], ["Studio membership", 350000], ["Glaze kit", 64900], ["Contribution to kiln fund", null]];

const hash = await hashPassword("demo-password-1");
tx(() => {
  run("DELETE FROM merchants WHERE email=?", EMAIL);
  const M = "mer_demo" + newSlug(8);
  const now = Date.now();
  run("INSERT INTO merchants VALUES (?,?,?,?,?,?)", M, "Yamini Sen", "Terra Studio", EMAIL, hash, now - 70 * 864e5);
  run("INSERT INTO settings (merchant_id, upi_id, payee_name, account_holder, account_number_enc, account_tail, ifsc, bank_name, branch_name, bank_code, support_contact) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    M, "terrastudio@okhdfcbank", "Terra Studio", "Terra Studio", encrypt("000000004321"), "4321", "HDFC0001234", "HDFC Bank", "Indiranagar", "hdfc", "hello@terrastudio.test");
  const ids = LINKS.map(([title, amount], i) => {
    const id = "lnk_" + newSlug(14);
    run("INSERT INTO links (id, merchant_id, slug, title, amount, min_amount, ask_name, views, created_at) VALUES (?,?,?,?,?,?,1,?,?)", id, M, newSlug(10), title, amount, amount ? null : 10000, 60 + Math.floor(rnd() * 300), now - (60 - i) * 864e5);
    return { id, title, amount };
  });
  const ev = (id: string, type: string, detail: string, at: number) => run("INSERT INTO payment_events (payment_id,type,detail,at) VALUES (?,?,?,?)", id, type, detail, at);
  for (let d = 60; d >= 0; d--) {
    const day = Math.floor((now + 5.5 * 36e5) / 864e5) * 864e5 - 5.5 * 36e5 - d * 864e5;
    const wd = new Date(day + 12 * 36e5).getUTCDay();
    const n = Math.round((2 + (60 - d) / 14) * (wd === 0 || wd === 6 ? 1.9 : 1) * (0.5 + rnd()));
    for (let i = 0; i < n; i++) {
      const at = day + (9 + Math.pow(rnd(), 0.8) * 12.5) * 36e5;
      if (at > now - 9e5) continue;
      const src = pick(["link", "link", "link", "qr", "qr", "api"]);
      const l = pick(ids);
      const amount = src === "link" ? l.amount ?? pick([50000, 100000, 25000]) : pick([45000, 89900, 120000, 25000, 64900, 210000]);
      const r = rnd();
      const st = d < 2 && i === 0 ? "on_hold" : r < 0.84 ? "paid" : r < 0.9 ? "expired" : r < 0.93 ? "declined" : d < 3 ? "on_hold" : "paid";
      const name = pick(NAMES);
      const id = newPaymentId();
      const secs = 6 + rnd() * 40;
      const manual = st === "paid" && rnd() < 0.06;
      const settled = st === "on_hold" ? null : st === "expired" ? at + 39e5 : at + 60e3 + (manual ? 14e5 : secs * 1e3);
      const paise = rnd() < 0.15 ? 1 : 0;
      const utr = st === "paid" ? "6330" + String(Math.floor(rnd() * 1e8)).padStart(8, "0") : null;
      run(
        `INSERT INTO payments (id,merchant_id,link_id,source,title,amount,payable,status,customer_name,qr_until,match_until,claimed_at,held_at,settled_at,method,utr,payer_vpa,payer_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, M, src === "link" ? l.id : null, src, src === "link" ? l.title : src === "qr" ? "Counter sale" : `Order ${1000 + Math.floor(rnd() * 900)}`, amount, amount + paise, st, st === "expired" ? null : name,
        at + 3e5, at + 39e5, st === "expired" ? null : at + 60e3, st === "on_hold" || manual ? at + 12e4 : null, settled, st === "paid" ? (manual ? "manual" : "email") : st === "declined" ? "manual" : null,
        utr, st === "paid" && !manual ? `${name.split(" ")[0].toLowerCase()}${Math.floor(rnd() * 99)}@${pick(HANDLES)}` : null, st === "paid" && !manual ? name.toUpperCase() : null, at,
      );
      ev(id, "created", "QR issued", at);
      if (st !== "expired") ev(id, "claimed", "Customer confirmed they have paid", at + 60e3);
      if (st === "on_hold") ev(id, "on_hold", "No bank email arrived in the verification window", at + 12e4);
      if (st === "paid") ev(id, "paid", manual ? "Approved by you" : "Matched to your bank's email alert", settled!);
      if (st === "declined") ev(id, "declined", "Declined by you", settled!);
      if (st === "expired") ev(id, "expired", "Abandoned by the customer", settled!);
    }
  }
  console.log(`Seeded ${get<{ n: number }>("SELECT COUNT(*) n FROM payments WHERE merchant_id=?", M)!.n} demo payments. Sign in as ${EMAIL} (password is in scripts/seed-demo.ts).`);
});
