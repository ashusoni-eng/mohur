import { body, json, limit, merchantRoute } from "@/lib/server/http";
import { changePassword, startSession } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const PUT = merchantRoute(async (req, m) => {
  limit(`pw:${m.id}`, 8, 15 * 60_000);
  const b = await body(req, S.passwordChange);
  await changePassword(m.id, b.current, b.next);
  await startSession(m.id);
  return json({ ok: true });
});
