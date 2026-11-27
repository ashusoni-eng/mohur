import { body, json, merchantRoute } from "@/lib/server/http";
import { all, run } from "@/lib/server/db";
import { encrypt, newSlug, randomToken } from "@/lib/server/crypto";
import { assertSafeUrl } from "@/lib/server/webhooks";
import { AppError } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const GET = merchantRoute((_r, m) =>
  json({
    rows: all("SELECT id, url, active, mode, created_at FROM webhooks WHERE merchant_id=? ORDER BY created_at DESC", m.id),
    deliveries: all("SELECT d.id, d.event, d.payment_id, d.sequence, w.mode, d.status, d.attempts, d.code, d.error, d.next_at, d.created_at FROM deliveries d JOIN webhooks w ON w.id=d.webhook_id WHERE w.merchant_id=? ORDER BY d.created_at DESC LIMIT 30", m.id),
  }),
);
export const POST = merchantRoute(async (req, m) => {
  const { url, mode } = await body(req, S.webhook);
  await assertSafeUrl(url).catch((e: Error) => { throw new AppError(e.message); });
  if (all("SELECT 1 FROM webhooks WHERE merchant_id=?", m.id).length >= 5) throw new AppError("You can have up to 5 webhook endpoints");
  const secret = "whsec_" + randomToken(24);
  run("INSERT INTO webhooks (id, merchant_id, url, secret_enc, created_at, mode) VALUES (?,?,?,?,?,?)", "wh_" + newSlug(12), m.id, url, encrypt(secret), Date.now(), mode);
  return json({ secret }, 201);
});
