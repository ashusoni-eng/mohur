import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";

/* All money is integer paise. All times are epoch milliseconds. */

const migrations: string[] = [
  `
  CREATE TABLE merchants (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, business TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE TABLE settings (
    merchant_id TEXT PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    upi_id TEXT, payee_name TEXT, account_holder TEXT, account_number_enc TEXT, account_tail TEXT,
    ifsc TEXT, bank_name TEXT, branch_name TEXT, bank_code TEXT NOT NULL DEFAULT 'any',
    extra_domains TEXT NOT NULL DEFAULT '',
    verify_seconds INTEGER NOT NULL DEFAULT 60, qr_minutes INTEGER NOT NULL DEFAULT 5,
    hold_minutes INTEGER NOT NULL DEFAULT 60, timer_start TEXT NOT NULL DEFAULT 'claim',
    amount_mode TEXT NOT NULL DEFAULT 'smart', show_bank INTEGER NOT NULL DEFAULT 0,
    support_contact TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE mail_accounts (
    merchant_id TEXT PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, email TEXT NOT NULL, secret_enc TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'connecting', last_error TEXT, last_checked_at INTEGER,
    last_uid INTEGER, uid_validity TEXT, cursor_ms INTEGER,
    screened INTEGER NOT NULL DEFAULT 0, connected_at INTEGER NOT NULL
  );
  CREATE TABLE links (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    amount INTEGER, min_amount INTEGER, reusable INTEGER NOT NULL DEFAULT 1,
    ask_name INTEGER NOT NULL DEFAULT 0, ask_contact INTEGER NOT NULL DEFAULT 0,
    redirect_url TEXT, expires_at INTEGER, active INTEGER NOT NULL DEFAULT 1,
    views INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE INDEX links_m ON links(merchant_id, created_at);
  CREATE TABLE payments (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    link_id TEXT REFERENCES links(id) ON DELETE SET NULL, source TEXT NOT NULL, title TEXT NOT NULL,
    amount INTEGER NOT NULL, payable INTEGER NOT NULL, exclusive INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    customer_name TEXT, customer_contact TEXT,
    qr_until INTEGER NOT NULL, verify_until INTEGER, match_until INTEGER NOT NULL,
    claimed_at INTEGER, customer_utr TEXT, held_at INTEGER, settled_at INTEGER,
    method TEXT, utr TEXT, payer_vpa TEXT, payer_name TEXT, mail_id INTEGER, decision_note TEXT,
    redirect_url TEXT, reference TEXT, idempotency_key TEXT, created_at INTEGER NOT NULL
  );
  CREATE INDEX pay_m ON payments(merchant_id, created_at);
  CREATE INDEX pay_s ON payments(merchant_id, status);
  CREATE INDEX pay_amt ON payments(merchant_id, payable, match_until);
  CREATE UNIQUE INDEX pay_idem ON payments(merchant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
  CREATE TABLE payment_events (
    id INTEGER PRIMARY KEY, payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL
  );
  CREATE INDEX ev_p ON payment_events(payment_id, at);
  CREATE TABLE mails (
    id INTEGER PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL, source TEXT NOT NULL, from_addr TEXT NOT NULL, subject TEXT NOT NULL,
    received_at INTEGER NOT NULL, outcome TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    bank TEXT, amount INTEGER, utr TEXT, payer_vpa TEXT, payer_name TEXT, account_tail TEXT, excerpt TEXT NOT NULL DEFAULT '',
    payment_id TEXT, created_at INTEGER NOT NULL,
    UNIQUE(merchant_id, message_id)
  );
  CREATE INDEX mail_m ON mails(merchant_id, received_at);
  CREATE UNIQUE INDEX mail_utr ON mails(merchant_id, utr) WHERE utr IS NOT NULL AND outcome IN ('matched','unmatched','ambiguous');
  CREATE TABLE api_keys (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    label TEXT NOT NULL, prefix TEXT NOT NULL, key_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_used_at INTEGER
  );
  CREATE TABLE webhooks (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    url TEXT NOT NULL, secret_enc TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
  );
  CREATE TABLE deliveries (
    id TEXT PRIMARY KEY, webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event TEXT NOT NULL, payment_id TEXT, body TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued', code INTEGER, error TEXT, next_at INTEGER, created_at INTEGER NOT NULL
  );
  CREATE INDEX del_q ON deliveries(status, next_at);
  `,
  `
  CREATE TABLE devices (
    id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    label TEXT NOT NULL, secret_enc TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pairing', pair_until INTEGER NOT NULL,
    model TEXT, app_version TEXT, sms_ok INTEGER NOT NULL DEFAULT 0, battery_ok INTEGER NOT NULL DEFAULT 0,
    received INTEGER NOT NULL DEFAULT 0, last_seen_at INTEGER, last_sms_at INTEGER, created_at INTEGER NOT NULL
  );
  CREATE INDEX dev_m ON devices(merchant_id);
  ALTER TABLE settings ADD COLUMN extra_headers TEXT NOT NULL DEFAULT '';
  `,
];

function open() {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const db = new Database(process.env.MOHUR_DB || path.join(env.dataDir, "mohur.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  return db;
}

function migrate(db: Database.Database) {
  db.transaction(() => {
    const v = db.pragma("user_version", { simple: true }) as number;
    for (let i = v; i < migrations.length; i++) db.exec(migrations[i]);
    if (v < migrations.length) db.pragma(`user_version = ${migrations.length}`);
  }).immediate();
}

// One connection per process, shared between route bundles and the mail engine.
const g = globalThis as unknown as { __mohurDb?: Database.Database };
let checked = false;
export function db() {
  const d = (g.__mohurDb ??= open());
  // Checked once per bundle, so a hot reload that adds a migration applies it to the open connection.
  if (!checked) { migrate(d); checked = true; }
  return d;
}

type P = string | number | null;
export const get = <T>(sql: string, ...p: P[]) => db().prepare(sql).get(...p) as T | undefined;
export const all = <T>(sql: string, ...p: P[]) => db().prepare(sql).all(...p) as T[];
export const run = (sql: string, ...p: P[]) => db().prepare(sql).run(...p);
/** IMMEDIATE so a read-then-write inside cannot interleave with another writer. */
export const tx = <T>(fn: () => T): T => db().transaction(fn).immediate();
