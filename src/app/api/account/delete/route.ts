import { body, json, limit, merchantRoute } from "@/lib/server/http";
import { deleteAccount, endSession } from "@/lib/server/auth";
import { engine } from "@/lib/server/engine";
import { publish, topics } from "@/lib/server/bus";
import * as S from "@/lib/schemas";
export const POST = merchantRoute(async (req, m) => {
  limit(`delete:${m.id}`, 5, 15 * 60_000);
  const b = await body(req, S.deleteAccount);
  await deleteAccount(m.id, b.password);
  // Stops this account's mailbox listener; it finds no account and does not restart.
  engine().listen(m.id);
  publish(topics.merchant(m.id));
  await endSession();
  return json({ ok: true });
});
