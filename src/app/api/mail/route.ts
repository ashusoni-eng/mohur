import { body, json, limit, merchantRoute } from "@/lib/server/http";
import { testLogin } from "@/lib/server/mail/imap";
import { encrypt } from "@/lib/server/crypto";
import { run } from "@/lib/server/db";
import { engine } from "@/lib/server/engine";
import { mailStatus } from "@/lib/server/views";
import { AppError } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((_r, m) => json(mailStatus(m.id)));
export const POST = merchantRoute(async (req, m) => {
  limit(`imap:${m.id}`, 10, 10 * 60_000);
  const b = await body(req, S.imap);
  const at = await testLogin(b.email, b.password).catch((e: Error) => { throw new AppError(e.message, 400, "mail_login_failed"); });
  run(
    `INSERT INTO mail_accounts (merchant_id, kind, email, secret_enc, status, last_uid, uid_validity, connected_at) VALUES (?,?,?,?,'connecting',?,?,?)
     ON CONFLICT(merchant_id) DO UPDATE SET kind='imap', email=excluded.email, secret_enc=excluded.secret_enc, status='connecting', last_error=NULL, last_uid=excluded.last_uid, uid_validity=excluded.uid_validity, cursor_ms=NULL, connected_at=excluded.connected_at`,
    m.id, "imap", b.email, encrypt(b.password), at.uidNext - 1, at.uidValidity, Date.now(),
  );
  engine().listen(m.id);
  return json(mailStatus(m.id), 201);
});
export const DELETE = merchantRoute((_r, m) => {
  run("DELETE FROM mail_accounts WHERE merchant_id=?", m.id);
  engine().listen(m.id);
  return json({ ok: true });
});
