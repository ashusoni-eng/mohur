import { json, merchantRoute } from "@/lib/server/http";
import { run } from "@/lib/server/db";
import { deliveryFor } from "@/lib/server/webhooks";
import { AppError } from "@/lib/server/payments";
export const POST = merchantRoute<{ id: string }>((_r, m, { id }) => {
  if (!deliveryFor(m.id, id)) throw new AppError("No delivery with that ID", 404);
  run("UPDATE deliveries SET status='queued', attempts=0, next_at=? WHERE id=?", Date.now(), id);
  return json({ ok: true });
});
