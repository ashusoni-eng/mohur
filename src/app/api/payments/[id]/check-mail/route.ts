import { json, limit, merchantRoute } from "@/lib/server/http";
import { owned } from "@/lib/server/payments";
import { checkPayment } from "@/lib/server/mail/rescan";
export const POST = merchantRoute<{ id: string }>(async (_r, m, { id }) => {
  const p = owned(m.id, id);
  limit(`rescan:${m.id}`, 10, 60_000);
  return json(await checkPayment(p));
});
