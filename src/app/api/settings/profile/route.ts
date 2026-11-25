import { body, json, merchantRoute } from "@/lib/server/http";
import { run } from "@/lib/server/db";
import * as S from "@/lib/schemas";
export const PUT = merchantRoute(async (req, m) => {
  const b = await body(req, S.profile);
  run("UPDATE merchants SET name=?, business=? WHERE id=?", b.name, b.business, m.id);
  return json({ ok: true });
});
