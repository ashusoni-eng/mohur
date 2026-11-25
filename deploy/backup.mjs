// Nightly copy of the database, kept for 14 days. Run by cron as the mohur user.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
const home = process.env.HOME;
const dir = path.join(home, "backups");
const file = path.join(dir, `mohur-${new Date().toISOString().slice(0, 10)}.db`);
const db = new Database(path.join(home, "data/mohur.db"), { readonly: true, fileMustExist: true });
await db.backup(file);
fs.chmodSync(file, 0o600);
for (const f of fs.readdirSync(dir).filter((f) => /^mohur-.*\.db$/.test(f)).sort().slice(0, -14)) fs.rmSync(path.join(dir, f));
