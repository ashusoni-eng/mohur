import { body, ip, json, limit, publicRoute } from "@/lib/server/http";
import { signIn, startSession } from "@/lib/server/auth";
import * as S from "@/lib/schemas";
export const POST = publicRoute(async (req) => {
  const b = await body(req, S.signIn);
  limit(`login:${b.email}`, 8, 15 * 60_000);
  limit(`login-ip:${ip(req)}`, 60, 15 * 60_000);
  await startSession(await signIn(b.email, b.password));
  return json({ ok: true });
});
