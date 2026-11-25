import { body, ip, json, limit, publicRoute } from "@/lib/server/http";
import { signUp, startSession } from "@/lib/server/auth";
import { env } from "@/lib/server/env";
import { AppError } from "@/lib/server/payments";
import * as S from "@/lib/schemas";
export const POST = publicRoute(async (req) => {
  if (!env.signups) throw new AppError("New accounts are closed on this server", 403, "signups_closed");
  limit(`signup:${ip(req)}`, 20, 3600_000);
  const id = await signUp(await body(req, S.signUp));
  await startSession(id);
  return json({ ok: true });
});
